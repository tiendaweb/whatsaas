'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import {
  branding,
  resellerDomains,
  resellerPlanPrices,
  resellerTopups,
  resellerWallets,
  resellers,
  users,
  walletTransactions,
  paymentProviderSettings,
  resellerAuditEvents,
} from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/session';
import { creditWallet } from '@/lib/resellers/wallet';
import { invalidateTenantCache, normalizeHost } from '@/lib/tenant/resolve';
import { verifyResellerDomain } from '@/lib/resellers/domain-verification';
import { randomUUID } from 'node:crypto';

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return user;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Crea o asigna el acceso administrativo de un reseller. La cuenta queda con
 * role=reseller y no obtiene permisos de administrador global.
 */
export async function transferResellerOwner(formData: FormData) {
  const admin = await assertAdmin();

  const resellerId = Number(formData.get('resellerId'));
  const email = String(formData.get('ownerEmail') ?? '').trim().toLowerCase();
  const password = String(formData.get('ownerPassword') ?? '');

  if (!Number.isInteger(resellerId) || resellerId <= 0) {
    return { error: 'Revendedor inválido.' };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: 'El email del administrador no es válido.' };
  }

  try {
    const existingUser = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });

    if (!existingUser && password.length < 12) {
      return { error: 'La contraseña inicial debe tener al menos 12 caracteres.' };
    }
    if (existingUser && existingUser.role !== 'reseller') {
      return {
        error: 'Ese email ya pertenece a una cuenta que no es reseller. Usa otro email.',
      };
    }

    const passwordHash = existingUser ? null : await hashPassword(password);

    await db.transaction(async (tx) => {
      const [reseller] = await tx
        .select()
        .from(resellers)
        .where(eq(resellers.id, resellerId))
        .for('update');
      if (!reseller) throw new Error('RESELLER_NOT_FOUND');

      let nextOwner = existingUser;
      if (!nextOwner) {
        [nextOwner] = await tx
          .insert(users)
          .values({
            email,
            passwordHash: passwordHash!,
            role: 'reseller',
            resellerId,
          })
          .returning();
      } else {
        const [otherOwnership] = await tx
          .select({ id: resellers.id })
          .from(resellers)
          .where(eq(resellers.ownerUserId, nextOwner.id))
          .limit(1);
        if (otherOwnership && otherOwnership.id !== reseller.id) {
          throw new Error('OWNER_ALREADY_ASSIGNED');
        }

        await tx
          .update(users)
          .set({ role: 'reseller', resellerId, updatedAt: new Date() })
          .where(eq(users.id, nextOwner.id));
      }

      if (reseller.ownerUserId !== nextOwner.id) {
        await tx
          .update(resellers)
          .set({ ownerUserId: nextOwner.id, updatedAt: new Date() })
          .where(eq(resellers.id, reseller.id));

        await tx
          .update(users)
          .set({ resellerId: null, updatedAt: new Date() })
          .where(and(
            eq(users.id, reseller.ownerUserId),
            eq(users.resellerId, reseller.id),
          ));
      }

      await tx.insert(resellerAuditEvents).values({
        resellerId: reseller.id,
        action:
          reseller.ownerUserId === nextOwner.id
            ? 'owner_access_reconciled'
            : 'owner_transferred',
        actorUserId: admin.id,
        previousOwnerUserId: reseller.ownerUserId,
        nextOwnerUserId: nextOwner.id,
        metadata: { targetEmail: email },
      });
    });

    await invalidateTenantCache({ resellerId });
    revalidatePath('/admin/resellers');
    return { ok: true };
  } catch (error) {
    console.error('transferResellerOwner', error);
    if (error instanceof Error && error.message === 'RESELLER_NOT_FOUND') {
      return { error: 'Revendedor no encontrado.' };
    }
    if (error instanceof Error && error.message === 'OWNER_ALREADY_ASSIGNED') {
      return { error: 'Ese usuario ya administra otro revendedor.' };
    }
    return { error: 'No se pudo asignar el administrador del revendedor.' };
  }
}

/**
 * Da de alta un reseller completo: su usuario, el reseller, la billetera y su fila
 * de branding. Las cuatro cosas van en una transacción porque un reseller sin
 * billetera no puede cobrar y uno sin branding no tiene marca que servir.
 */
export async function createReseller(formData: FormData) {
  const admin = await assertAdmin();

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const companyName = (formData.get('companyName') as string)?.trim();
  const slug = (formData.get('slug') as string)?.trim().toLowerCase();
  const discountPercent = Number(formData.get('discountPercent') ?? 0);

  if (!email || !password || password.length < 12) {
    return { error: 'Email y contraseña (mínimo 12 caracteres) son obligatorios.' };
  }
  if (!companyName) return { error: 'El nombre de la empresa es obligatorio.' };
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return { error: 'Identificador inválido. Usa minúsculas, números y guiones.' };
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: 'El descuento debe estar entre 0 y 100.' };
  }

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingUser) {
      return { error: 'Ya existe un usuario con ese email.' };
    }

    const existingSlug = await db.query.resellers.findFirst({
      where: eq(resellers.slug, slug),
    });
    if (existingSlug) {
      return { error: 'Ese identificador ya está en uso.' };
    }

    const passwordHash = await hashPassword(password);

    await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({ email, passwordHash, role: 'reseller' })
        .returning();

      const [createdReseller] = await tx
        .insert(resellers)
        .values({
          ownerUserId: createdUser.id,
          slug,
          companyName,
          // El descuento se guarda en basis points para no arrastrar decimales.
          wholesaleDiscountBps: Math.round(discountPercent * 100),
        })
        .returning();

      // Mantiene las dos relaciones de ownership sincronizadas. El panel resuelve
      // por ownerUserId, mientras que la atribución y las verificaciones de
      // integridad usan users.resellerId.
      await tx
        .update(users)
        .set({ resellerId: createdReseller.id, updatedAt: new Date() })
        .where(eq(users.id, createdUser.id));

      await tx.insert(resellerWallets).values({ resellerId: createdReseller.id });

      await tx.insert(branding).values({
        resellerId: createdReseller.id,
        name: companyName,
      });

      await tx.insert(resellerAuditEvents).values({
        resellerId: createdReseller.id,
        action: 'reseller_created',
        actorUserId: admin.id,
        nextOwnerUserId: createdUser.id,
        metadata: { email, slug, companyName },
      });
    });

    revalidatePath('/admin/resellers');
    return { ok: true };
  } catch (error) {
    console.error('createReseller', error);
    return { error: 'No se pudo crear el revendedor.' };
  }
}

export async function updateResellerSettings(formData: FormData) {
  await assertAdmin();

  const resellerId = Number(formData.get('resellerId'));
  const discountPercent = Number(formData.get('discountPercent'));
  const creditLimit = Number(formData.get('creditLimit') ?? 0);
  const paymentsEnabled = formData.get('paymentsEnabled') === 'on';
  const status = formData.get('status') as string;

  if (!Number.isFinite(resellerId)) return { error: 'Revendedor inválido.' };
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: 'El descuento debe estar entre 0 y 100.' };
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    return { error: 'El límite de crédito debe ser un número positivo.' };
  }
  if (!['active', 'past_due', 'suspended'].includes(status)) {
    return { error: 'Estado inválido.' };
  }

  try {
    if (paymentsEnabled) {
      const [activeDomain, publishedPlan, enabledProvider] = await Promise.all([
        db.query.resellerDomains.findFirst({
          where: and(
            eq(resellerDomains.resellerId, resellerId),
            eq(resellerDomains.status, 'active'),
          ),
        }),
        db.query.resellerPlanPrices.findFirst({
          where: and(
            eq(resellerPlanPrices.resellerId, resellerId),
            eq(resellerPlanPrices.isPublished, true),
          ),
        }),
        db.query.paymentProviderSettings.findFirst({
          where: and(
            eq(paymentProviderSettings.resellerId, resellerId),
            eq(paymentProviderSettings.enabled, true),
          ),
        }),
      ]);
      if (!activeDomain?.verifiedAt || !publishedPlan || !enabledProvider) {
        return {
          error: 'Antes de habilitar cobros verifica el dominio, publica un plan y habilita un proveedor.',
        };
      }
    }

    await db
      .update(resellers)
      .set({
        wholesaleDiscountBps: Math.round(discountPercent * 100),
        status,
        paymentsEnabled,
        updatedAt: new Date(),
      })
      .where(eq(resellers.id, resellerId));

    await db
      .update(resellerWallets)
      .set({ creditLimit: Math.round(creditLimit * 100), updatedAt: new Date() })
      .where(eq(resellerWallets.resellerId, resellerId));

    // Suspender debe dejar de servir su marca de inmediato.
    await invalidateTenantCache({ resellerId });
    revalidatePath('/admin/resellers');
    return { ok: true };
  } catch (error) {
    console.error('updateResellerSettings', error);
    return { error: 'No se pudo actualizar el revendedor.' };
  }
}

/** Ajuste manual de saldo (regalo, corrección, compensación). */
export async function adjustResellerBalance(formData: FormData) {
  const admin = await assertAdmin();

  const resellerId = Number(formData.get('resellerId'));
  const amount = Number(formData.get('amount'));
  const description = (formData.get('description') as string)?.trim() || 'Ajuste manual';

  if (!Number.isFinite(resellerId) || !Number.isFinite(amount) || amount === 0) {
    return { error: 'Importe inválido.' };
  }

  const cents = Math.round(amount * 100);

  try {
    await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(resellerWallets)
        .where(eq(resellerWallets.resellerId, resellerId))
        .for('update');

      if (!wallet) throw new Error('El revendedor no tiene billetera.');

      const nextBalance = wallet.balance + cents;

      await tx.insert(walletTransactions).values({
        walletId: wallet.id,
        resellerId,
        type: 'adjustment',
        amount: cents,
        balanceAfter: nextBalance,
        currency: wallet.currency,
        idempotencyKey: `adjustment:${Date.now()}:${admin.id}`,
        description,
        createdBy: admin.id,
      });

      await tx
        .update(resellerWallets)
        .set({ balance: nextBalance, updatedAt: new Date() })
        .where(eq(resellerWallets.id, wallet.id));
    });

    revalidatePath('/admin/resellers');
    return { ok: true };
  } catch (error) {
    console.error('adjustResellerBalance', error);
    return {
      error:
        error instanceof Error && error.message.includes('reseller_wallets_balance_chk')
          ? 'El ajuste dejaría el saldo por debajo del límite de crédito.'
          : 'No se pudo ajustar el saldo.',
    };
  }
}

/** Aprueba una recarga pendiente y acredita el saldo. */
export async function approveTopup(formData: FormData) {
  const admin = await assertAdmin();

  const topupId = Number(formData.get('topupId'));
  if (!Number.isFinite(topupId)) return { error: 'Recarga inválida.' };

  const topup = await db.query.resellerTopups.findFirst({
    where: eq(resellerTopups.id, topupId),
  });

  if (!topup) return { error: 'Recarga no encontrada.' };
  if (topup.status !== 'pending_manual_review') {
    return { error: 'Esa recarga ya fue procesada.' };
  }

  // La clave es el id de la recarga: aunque el admin haga doble clic, solo acredita
  // una vez.
  const result = await creditWallet({
    resellerId: topup.resellerId,
    amount: topup.amount,
    type: 'topup',
    idempotencyKey: `topup:${topup.id}`,
    provider: topup.provider,
    providerRef: topup.providerRef,
    description: 'Recarga de saldo',
    createdBy: admin.id,
  });

  if (!result.ok) {
    return { error: 'No se pudo acreditar la recarga.' };
  }

  await db
    .update(resellerTopups)
    .set({
      status: 'paid',
      reviewedBy: admin.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(resellerTopups.id, topup.id));

  // Recargar saca al reseller de la deuda y lo devuelve a activo.
  const wallet = await db.query.resellerWallets.findFirst({
    where: eq(resellerWallets.resellerId, topup.resellerId),
  });

  if (wallet && wallet.balance >= 0) {
    await db
      .update(resellers)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(resellers.id, topup.resellerId), eq(resellers.status, 'past_due')));
  }

  revalidatePath('/admin/resellers');
  return { ok: true };
}

export async function rejectTopup(formData: FormData) {
  const admin = await assertAdmin();

  const topupId = Number(formData.get('topupId'));
  if (!Number.isFinite(topupId)) return { error: 'Recarga inválida.' };

  await db
    .update(resellerTopups)
    .set({
      status: 'rejected',
      reviewedBy: admin.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(resellerTopups.id, topupId),
      eq(resellerTopups.status, 'pending_manual_review'),
    ));

  revalidatePath('/admin/resellers');
  return { ok: true };
}

/**
 * Activa el dominio. Es el paso que debe hacerse DESPUÉS de agregar el Host() en
 * docker-compose.yml y recrear el contenedor: si se activa antes, el dominio
 * resuelve tenant en la app pero Traefik responde 404.
 */
export async function activateResellerDomain(formData: FormData) {
  await assertAdmin();

  const domainId = Number(formData.get('domainId'));
  const intent = formData.get('intent');
  if (!Number.isFinite(domainId)) return { error: 'Dominio inválido.' };

  try {
    const domain = await db.query.resellerDomains.findFirst({
      where: eq(resellerDomains.id, domainId),
    });
    if (!domain) return { error: 'Dominio no encontrado.' };

    if (domain.status === 'active' && intent === 'deactivate') {
      await db
        .update(resellerDomains)
        .set({ status: 'disabled', verifiedAt: null, updatedAt: new Date() })
        .where(eq(resellerDomains.id, domainId));
      await db
        .update(resellers)
        .set({ paymentsEnabled: false, updatedAt: new Date() })
        .where(eq(resellers.id, domain.resellerId));
      await invalidateTenantCache({ host: domain.hostname, resellerId: domain.resellerId });
      revalidatePath('/admin/resellers');
      return { ok: true };
    }

    const verificationToken = domain.verificationToken || randomUUID().replaceAll('-', '');
    if (!domain.verificationToken) {
      await db
        .update(resellerDomains)
        .set({ verificationToken, updatedAt: new Date() })
        .where(eq(resellerDomains.id, domainId));
    }

    const verification = await verifyResellerDomain({
      hostname: domain.hostname,
      verificationToken,
    });
    if (!verification.ok) {
      if (domain.status === 'active') {
        await db
          .update(resellerDomains)
          .set({ status: 'pending', verifiedAt: null, updatedAt: new Date() })
          .where(eq(resellerDomains.id, domainId));
        await db
          .update(resellers)
          .set({ paymentsEnabled: false, updatedAt: new Date() })
          .where(eq(resellers.id, domain.resellerId));
        await invalidateTenantCache({ host: domain.hostname, resellerId: domain.resellerId });
        revalidatePath('/admin/resellers');
      }
      return { error: verification.message };
    }

    await db
      .update(resellerDomains)
      .set({
        status: 'active',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(resellerDomains.id, domainId));

    await invalidateTenantCache({
      host: normalizeHost(domain.hostname),
      resellerId: domain.resellerId,
    });
    revalidatePath('/admin/resellers');
    return { ok: true };
  } catch (error) {
    console.error('activateResellerDomain', error);
    return { error: 'No se pudo cambiar el estado del dominio.' };
  }
}
