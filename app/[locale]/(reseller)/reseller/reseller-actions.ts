'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db/drizzle';
import {
  branding,
  landingPages,
  manualPayments,
  paymentProviderSettings,
  plans,
  resellerDomains,
  resellerPlanPrices,
  resellerTopups,
  teams,
} from '@/lib/db/schema';
import { requireReseller } from '@/lib/db/queries/resellers';
import { invalidateTenantCache, normalizeHost } from '@/lib/tenant/resolve';
import { chargePlanActivation } from '@/lib/resellers/billing';
import { consolePaymentAuditLogger } from '@/lib/payments/plugins/audit';
import { encryptProviderConfig } from '@/lib/payments/secrets';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.gif'];
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const PROOF_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

async function saveAsset(file: File | null, kind: string, resellerId: number) {
  if (!file || file.size === 0) return '';

  const extension = extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error('Formato de imagen no permitido.');
  }

  // Particionado por reseller: si no, dos marcas que suban "logo.png" se pisan.
  const dir = join(process.cwd(), 'public/uploads/branding', String(resellerId));
  await mkdir(dir, { recursive: true });

  const filename = `${kind}-${Date.now()}${extension}`;
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  return `/uploads/branding/${resellerId}/${filename}`;
}

async function saveTopupProof(file: File | null) {
  if (!file || file.size === 0) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error('El comprobante supera 8 MB.');
  const extension = extname(file.name).toLowerCase();
  if (!PROOF_EXTENSIONS.has(extension)) {
    throw new Error('El comprobante debe ser PDF, PNG, JPG o WEBP.');
  }
  const directory = join(process.cwd(), 'storage', 'topup-proofs');
  await mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  await writeFile(join(directory, filename), Buffer.from(await file.arrayBuffer()));
  return filename;
}

export async function updateResellerBranding(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const { reseller } = ctx;
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { success: false, message: 'El nombre de la marca es obligatorio.' };

  const primaryLight = (formData.get('primaryLight') as string)?.trim() || '';
  const primaryDark = (formData.get('primaryDark') as string)?.trim() || '';

  try {
    const logoUrl = await saveAsset(formData.get('logo') as File, 'logo', reseller.id);
    const faviconUrl = await saveAsset(formData.get('favicon') as File, 'favicon', reseller.id);

    const current = await db.query.branding.findFirst({
      where: eq(branding.resellerId, reseller.id),
    });

    // Los valores se validan de nuevo al renderizar (buildThemeCss), que es lo que
    // impide inyectar CSS por aquí.
    const theme = {
      light: primaryLight ? { primary: primaryLight } : undefined,
      dark: primaryDark ? { primary: primaryDark } : undefined,
    };

    if (current) {
      await db
        .update(branding)
        .set({
          name,
          logoUrl: logoUrl || current.logoUrl,
          faviconUrl: faviconUrl || current.faviconUrl,
          theme,
          updatedAt: new Date(),
        })
        .where(eq(branding.id, current.id));
    } else {
      await db.insert(branding).values({
        resellerId: reseller.id,
        name,
        logoUrl,
        faviconUrl,
        theme,
      });
    }

    await invalidateTenantCache({ resellerId: reseller.id });
    revalidatePath('/reseller/branding');

    return { success: true };
  } catch (error) {
    console.error('updateResellerBranding', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo guardar la marca.',
    };
  }
}

export async function addResellerDomain(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const { reseller } = ctx;
  const hostname = normalizeHost(formData.get('hostname') as string);

  if (!hostname || !HOSTNAME_PATTERN.test(hostname)) {
    return { success: false, message: 'Dominio inválido. Ejemplo: chatpro.uno' };
  }

  try {
    const existing = await db.query.resellerDomains.findFirst({
      where: eq(resellerDomains.hostname, hostname),
    });

    if (existing) {
      return {
        success: false,
        message:
          existing.resellerId === reseller.id
            ? 'Ese dominio ya está en tu cuenta.'
            : 'Ese dominio ya está en uso.',
      };
    }

    const isFirst = !(await db.query.resellerDomains.findFirst({
      where: eq(resellerDomains.resellerId, reseller.id),
    }));

    await db.insert(resellerDomains).values({
      resellerId: reseller.id,
      hostname,
      isPrimary: isFirst,
      verificationToken: randomUUID().replaceAll('-', ''),
      // 'pending' hasta que un admin lo active: el alta en Traefik es manual y,
      // si resolviera antes de existir el router, el dominio daría 404 igualmente.
      status: 'pending',
    });

    await invalidateTenantCache({ host: hostname, resellerId: reseller.id });
    revalidatePath('/reseller/domain');

    return { success: true };
  } catch (error) {
    console.error('addResellerDomain', error);
    return { success: false, message: 'No se pudo agregar el dominio.' };
  }
}

/**
 * Solicita una recarga. NO acredita saldo: crea la solicitud en pending_manual_review
 * para que la apruebe un admin. Acreditar aquí permitiría al reseller darse saldo solo.
 */
export async function requestTopup(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const amount = Number(formData.get('amount'));
  const reference = (formData.get('reference') as string)?.trim() || null;
  const proof = formData.get('proof') as File | null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: 'Importe inválido.' };
  }

  try {
    const proofUrl = await saveTopupProof(proof);
    if (!reference && !proofUrl) {
      return { success: false, message: 'Agrega una referencia o un comprobante.' };
    }
    await db.insert(resellerTopups).values({
      resellerId: ctx.reseller.id,
      amount: Math.round(amount * 100),
      currency: ctx.reseller.currency,
      provider: 'manual',
      providerRef: reference,
      proofUrl,
      status: 'pending_manual_review',
    });

    revalidatePath('/reseller/wallet');
    return { success: true };
  } catch (error) {
    console.error('requestTopup', error);
    return { success: false, message: 'No se pudo solicitar la recarga.' };
  }
}

/**
 * Fija el precio de venta del reseller para un plan. El mayorista NO se acepta desde
 * aquí: se recalcula siempre en el servidor a partir del descuento pactado, o el
 * reseller podría fijarse a sí mismo un coste de cero.
 */
export async function saveResellerPlanPrice(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const { reseller } = ctx;
  const planId = Number(formData.get('planId'));
  const retail = Number(formData.get('retailAmount'));
  const isPublished = formData.get('isPublished') === 'on';

  if (!Number.isFinite(planId)) {
    return { success: false, message: 'Plan inválido.' };
  }
  if (!Number.isFinite(retail) || retail < 0) {
    return { success: false, message: 'Precio inválido.' };
  }

  try {
    const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
    if (!plan) return { success: false, message: 'Plan no encontrado.' };

    const retailAmount = Math.round(retail * 100);

    const existing = await db.query.resellerPlanPrices.findFirst({
      where: and(
        eq(resellerPlanPrices.resellerId, reseller.id),
        eq(resellerPlanPrices.planId, planId),
      ),
    });

    if (existing) {
      await db
        .update(resellerPlanPrices)
        .set({ retailAmount, isPublished, updatedAt: new Date() })
        .where(eq(resellerPlanPrices.id, existing.id));
    } else {
      await db.insert(resellerPlanPrices).values({
        resellerId: reseller.id,
        planId,
        retailAmount,
        isPublished,
        currency: plan.currency,
      });
    }

    revalidatePath('/reseller/plans');
    return { success: true };
  } catch (error) {
    console.error('saveResellerPlanPrice', error);
    return { success: false, message: 'No se pudo guardar el precio.' };
  }
}

/** Credenciales de cobro propias del reseller. El dinero de sus clientes va a su cuenta. */
export async function saveResellerPaymentConfig(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const { reseller } = ctx;
  const provider = formData.get('provider') as string;

  if (!['stripe', 'mercadopago', 'manual', 'lemonsqueezy'].includes(provider)) {
    return { success: false, message: 'Proveedor inválido.' };
  }

  const enabled = formData.get('enabled') === 'on';
  const isDefault = formData.get('isDefault') === 'on';

  try {
    await db.transaction(async (tx) => {
      // Todo acotado al reseller: nunca puede tocar las credenciales de la
      // plataforma ni las de otro revendedor.
      const scope = eq(paymentProviderSettings.resellerId, reseller.id);

      const existing = await tx
        .select()
        .from(paymentProviderSettings)
        .where(and(scope, eq(paymentProviderSettings.provider, provider)));

      const currentConfig = existing[0]?.config ?? {};
      const config: Record<string, string | undefined> = { ...currentConfig };
      const setIfPresent = (key: string) => {
        const value = String(formData.get(key) ?? '').trim();
        if (value) config[key] = value;
      };
      if (provider === 'stripe') {
        setIfPresent('secretKey');
        setIfPresent('publishableKey');
        setIfPresent('webhookSecret');
      }
      if (provider === 'mercadopago') {
        setIfPresent('accessToken');
        setIfPresent('publicKey');
        setIfPresent('webhookSecret');
      }
      if (provider === 'lemonsqueezy') {
        setIfPresent('apiKey');
        setIfPresent('storeId');
        setIfPresent('webhookSecret');
        setIfPresent('successUrl');
      }
      const willBeEnabled = isDefault || enabled;
      if (willBeEnabled && provider === 'stripe' && (!config.secretKey || !config.webhookSecret)) {
        throw new Error('Stripe requiere secret key y webhook secret antes de habilitarse.');
      }
      if (willBeEnabled && provider === 'mercadopago' && (!config.accessToken || !config.webhookSecret)) {
        throw new Error('Mercado Pago requiere access token y webhook secret antes de habilitarse.');
      }
      if (willBeEnabled && provider === 'lemonsqueezy' && (!config.apiKey || !config.storeId || !config.webhookSecret)) {
        throw new Error('Lemon Squeezy requiere API key, Store ID y webhook secret antes de habilitarse.');
      }
      const protectedConfig = encryptProviderConfig(provider, config);

      if (isDefault) {
        await tx
          .update(paymentProviderSettings)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(scope, ne(paymentProviderSettings.provider, provider)));
      }

      if (existing.length > 0) {
        await tx
          .update(paymentProviderSettings)
          .set({ enabled: isDefault ? true : enabled, isDefault, config: protectedConfig, updatedAt: new Date() })
          .where(and(scope, eq(paymentProviderSettings.provider, provider)));
      } else {
        await tx.insert(paymentProviderSettings).values({
          resellerId: reseller.id,
          provider,
          enabled: isDefault ? true : enabled,
          isDefault,
          config: protectedConfig,
        });
      }
    });

    revalidatePath('/reseller/payments');
    return { success: true };
  } catch (error) {
    console.error('saveResellerPaymentConfig', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo guardar la configuración.',
    };
  }
}

export async function approveResellerManualPayment(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };
  const paymentId = Number(formData.get('paymentId'));
  if (!Number.isInteger(paymentId)) return { success: false, message: 'Pago inválido.' };

  const payment = await db.query.manualPayments.findFirst({
    where: and(
      eq(manualPayments.id, paymentId),
      eq(manualPayments.resellerId, ctx.reseller.id),
      eq(manualPayments.status, 'pending_manual_review'),
    ),
  });
  if (!payment?.proofUrl) {
    return { success: false, message: 'El pago no tiene comprobante pendiente de revisión.' };
  }

  const team = await db.query.teams.findFirst({ where: eq(teams.id, payment.teamId) });
  if (!team || team.resellerId !== ctx.reseller.id) {
    return { success: false, message: 'Pago no encontrado.' };
  }

  const charge = await chargePlanActivation({
    teamId: team.id,
    planId: payment.planId,
    idempotencyKey: `manual:${payment.id}`,
    allowDebt: true,
    provider: 'manual',
    providerRef: payment.reference,
  });
  if (!charge.charged && charge.reason !== 'free_plan') {
    return { success: false, message: 'No se pudo registrar el débito mayorista.' };
  }

  const plan = await db.query.plans.findFirst({ where: eq(plans.id, payment.planId) });
  const updated = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(manualPayments)
      .set({
        status: 'paid',
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(manualPayments.id, payment.id),
        eq(manualPayments.resellerId, ctx.reseller.id),
        eq(manualPayments.status, 'pending_manual_review'),
      ))
      .returning({ id: manualPayments.id });
    if (!claimed) return false;
    await tx.update(teams).set({
      planId: payment.planId,
      planName: plan?.name ?? null,
      subscriptionStatus: 'active',
      isCanceled: false,
      updatedAt: new Date(),
    }).where(and(eq(teams.id, team.id), eq(teams.resellerId, ctx.reseller.id)));
    return true;
  });

  if (updated) {
    await consolePaymentAuditLogger.recordStatusChange({
      provider: 'manual',
      paymentReference: payment.reference ?? String(payment.id),
      previousStatus: 'pending_manual_review',
      nextStatus: 'paid',
      actor: 'reseller',
      metadata: { teamId: team.id, resellerId: ctx.reseller.id, planId: payment.planId },
    });
  }
  revalidatePath('/reseller/payments');
  return { success: true };
}

export async function rejectResellerManualPayment(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };
  const paymentId = Number(formData.get('paymentId'));
  if (!Number.isInteger(paymentId)) return { success: false, message: 'Pago inválido.' };

  const [payment] = await db
    .update(manualPayments)
    .set({
      status: 'rejected',
      reviewedBy: ctx.user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(manualPayments.id, paymentId),
      eq(manualPayments.resellerId, ctx.reseller.id),
      eq(manualPayments.status, 'pending_manual_review'),
    ))
    .returning();
  if (!payment) return { success: false, message: 'Pago no encontrado o ya procesado.' };

  await consolePaymentAuditLogger.recordStatusChange({
    provider: 'manual',
    paymentReference: payment.reference ?? String(payment.id),
    previousStatus: 'pending_manual_review',
    nextStatus: 'rejected',
    actor: 'reseller',
    metadata: { teamId: payment.teamId, resellerId: ctx.reseller.id, planId: payment.planId },
  });
  revalidatePath('/reseller/payments');
  return { success: true };
}

/**
 * Guarda la landing HTML del reseller. El HTML se almacena tal cual y se sanea en el
 * render (components/landing/html-page-renderer.tsx): así el reseller conserva lo que
 * escribió y un endurecimiento futuro de las reglas aplica también a lo ya guardado.
 */
export async function saveResellerLanding(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const { reseller } = ctx;
  const content = (formData.get('content') as string) ?? '';
  const customCss = (formData.get('customCss') as string) ?? '';
  const hideChrome = formData.get('hideChrome') === 'on';

  try {
    const existing = await db.query.landingPages.findFirst({
      where: and(
        eq(landingPages.resellerId, reseller.id),
        eq(landingPages.slug, ''),
      ),
    });

    if (existing) {
      await db
        .update(landingPages)
        .set({
          content,
          customCss,
          hideChrome,
          contentMode: 'html',
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existing.id));
    } else {
      await db.insert(landingPages).values({
        resellerId: reseller.id,
        name: `Portada de ${reseller.companyName}`,
        slug: '',
        contentMode: 'html',
        content,
        customCss,
        hideChrome,
      });
    }

    revalidatePath('/reseller/landing');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('saveResellerLanding', error);
    return { success: false, message: 'No se pudo guardar la landing.' };
  }
}

export async function setPrimaryDomain(formData: FormData) {
  const ctx = await requireReseller();
  if (!ctx) return { success: false, message: 'No autorizado.' };

  const { reseller } = ctx;
  const domainId = Number(formData.get('domainId'));
  if (!Number.isFinite(domainId)) {
    return { success: false, message: 'Dominio inválido.' };
  }

  try {
    await db.transaction(async (tx) => {
      // El WHERE por resellerId es lo que impide marcar como principal el dominio
      // de otro reseller pasando un id ajeno.
      const target = await tx.query.resellerDomains.findFirst({
        where: and(
          eq(resellerDomains.id, domainId),
          eq(resellerDomains.resellerId, reseller.id),
        ),
      });
      if (!target) throw new Error('Dominio no encontrado.');

      await tx
        .update(resellerDomains)
        .set({ isPrimary: false })
        .where(
          and(
            eq(resellerDomains.resellerId, reseller.id),
            ne(resellerDomains.id, domainId),
          ),
        );

      await tx
        .update(resellerDomains)
        .set({ isPrimary: true })
        .where(eq(resellerDomains.id, domainId));
    });

    await invalidateTenantCache({ resellerId: reseller.id });
    revalidatePath('/reseller/domain');

    return { success: true };
  } catch (error) {
    console.error('setPrimaryDomain', error);
    return { success: false, message: 'No se pudo actualizar el dominio.' };
  }
}
