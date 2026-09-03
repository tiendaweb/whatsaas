'use server';

import { db } from '@/lib/db/drizzle';
import { users, teams, plans, teamMembers, activityLogs, invitations, passwordResetTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getStripeClient } from '@/lib/payments/stripe';
import { getSession, hashPassword, setSession } from '@/lib/auth/session';
import { sendPasswordResetEmail } from '@/lib/email';
import { randomUUID } from 'crypto';
import { chargePlanActivation } from '@/lib/resellers/billing';

export type ActionState = {
  error?: string;
  success?: string;
};

const planSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  amount: z.coerce.number().min(0),
  interval: z.enum(['month', 'year']),
  trialDays: z.coerce.number().min(0).default(0),
  maxUsers: z.coerce.number().min(1),
  maxContacts: z.coerce.number().min(0),
  maxInstances: z.coerce.number().min(0),
  isAiEnabled: z.boolean(),
  isFlowBuilderEnabled: z.boolean(),
  isCampaignsEnabled: z.boolean(),
  isTemplatesEnabled: z.boolean(),
  isSocialPublisherEnabled: z.boolean(),
  isHidden: z.boolean().default(false),
  pricingCustomItems: z.array(z.object({
    text: z.string().min(1).max(120),
    included: z.boolean(),
  })).default([]),
});

const createAdminUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(100),
  email: z.string().email('Correo electrónico inválido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  role: z.enum(['admin', 'owner', 'member']),
  planId: z.coerce.number().int().positive('Selecciona un plan válido.'),
});

async function verifyAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('No autorizado');
  }
  return user;
}

function hasStripeCredentials() {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && key.startsWith('sk_') && key.length > 20);
}

const STRIPE_CONFIG_ERROR = 'Stripe no está configurado. Define STRIPE_SECRET_KEY para sincronizar planes con Stripe.';

export async function updateUserRole(userId: number, role: string): Promise<ActionState> {
  try {
    const currentUser = await verifyAdmin();

    if (currentUser.id === userId) {
      return { error: 'No puedes cambiar tu propio rol.' };
    }

    const validRoles = ['admin', 'member', 'owner'];
    if (!validRoles.includes(role)) {
      return { error: 'Rol inválido.' };
    }

    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
    revalidatePath('/admin/users');
    return { success: 'Rol actualizado correctamente' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo actualizar el rol' };
  }
}

export async function createUserFromAdmin(payload: {
  name: string;
  email: string;
  password: string;
  role: string;
  planId: number;
}): Promise<ActionState> {
  try {
    const adminUser = await verifyAdmin();
    const validated = createAdminUserSchema.safeParse(payload);

    if (!validated.success) {
      return { error: validated.error.issues[0]?.message || 'Datos inválidos.' };
    }

    const { name, email, password, role, planId } = validated.data;

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return { error: 'Ya existe un usuario con este correo.' };
    }

    const [selectedPlan] = await db
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    if (!selectedPlan) {
      return { error: 'No se encontró el plan seleccionado.' };
    }

    const passwordHash = await hashPassword(password);

    const { createdUser } = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          name,
          email,
          passwordHash,
          role,
          updatedAt: new Date(),
        })
        .returning({ id: users.id });

      const [createdTeam] = await tx
        .insert(teams)
        .values({
          name: `Equipo de ${name}`,
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          subscriptionStatus: 'active',
          updatedAt: new Date(),
        })
        .returning({ id: teams.id });

      await tx.insert(teamMembers).values({
        userId: createdUser.id,
        teamId: createdTeam.id,
        role: role === 'member' ? 'member' : 'owner',
      });

      await tx.insert(activityLogs).values({
        teamId: createdTeam.id,
        userId: adminUser.id,
        action: `ADMIN_CREATE_USER:${email}`,
      });

      return { createdUser };
    });

    revalidatePath('/admin/users');
    return { success: `Usuario creado correctamente (ID: ${createdUser.id}).` };
  } catch (error: any) {
    return { error: error.message || 'No se pudo crear el usuario.' };
  }
}

/**
 * Asignación manual de un plan por el admin de la plataforma.
 *
 * `debitReseller` está en false a propósito: si el equipo pertenece a un reseller,
 * una asignación hecha a mano desde aquí es una cortesía o una corrección, y cobrarle
 * el mayorista por ella sería una sorpresa. Se pasa true solo para reponer un cobro
 * que debería haber ocurrido.
 */
export async function assignPlanToUserTeam(
  userId: number,
  planId: number,
  debitReseller = false,
): Promise<ActionState> {
  try {
    const adminUser = await verifyAdmin();

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(planId) || planId <= 0) {
      return { error: 'Usuario o plan inválido.' };
    }

    const [selectedPlan] = await db
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    if (!selectedPlan) {
      return { error: 'Plan no encontrado.' };
    }

    const [membership] = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    if (!membership) {
      return { error: 'El usuario no tiene un equipo asignado.' };
    }

    await db
      .update(teams)
      .set({
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, membership.teamId));

    if (debitReseller) {
      await chargePlanActivation({
        teamId: membership.teamId,
        planId: selectedPlan.id,
        idempotencyKey: `admin:${membership.teamId}:${selectedPlan.id}:${Date.now()}`,
        allowDebt: true,
      });
    }

    await db.insert(activityLogs).values({
      teamId: membership.teamId,
      userId: adminUser.id,
      action: `ADMIN_ASSIGN_PLAN:user_${userId}->plan_${selectedPlan.id}`,
    });

    revalidatePath('/admin/users');
    revalidatePath('/admin/teams');
    return { success: 'Plan asignado correctamente.' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo asignar el plan.' };
  }
}

export async function adminSendResetLink(userId: number): Promise<ActionState> {
  try {
    await verifyAdmin();

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return { error: 'Usuario no encontrado.' };

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    await sendPasswordResetEmail(user.email, token);
    return { success: 'Enlace de restablecimiento enviado correctamente.' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo enviar el enlace de restablecimiento.' };
  }
}

export async function adminSetPassword(userId: number, newPassword: string): Promise<ActionState> {
  try {
    const currentUser = await verifyAdmin();

    if (newPassword.length < 8) {
      return { error: 'La contraseña debe tener al menos 8 caracteres.' };
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    return { success: 'Contraseña actualizada correctamente.' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo actualizar la contraseña.' };
  }
}

export async function adminStartImpersonation(userId: number): Promise<ActionState> {
  try {
    const adminUser = await verifyAdmin();

    if (!Number.isInteger(userId) || userId <= 0) {
      return { error: 'Usuario inválido.' };
    }

    if (adminUser.id === userId) {
      return { error: 'No puedes suplantarte a ti mismo.' };
    }

    const [targetUser] = await db
      .select({
        id: users.id,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser || targetUser.deletedAt) {
      return { error: 'Usuario no encontrado.' };
    }

    await setSession({ id: targetUser.id }, adminUser.id);
    return { success: 'Suplantación iniciada.' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo iniciar la suplantación.' };
  }
}

export async function adminStopImpersonation(): Promise<ActionState> {
  try {
    const session = await getSession();
    const impersonatorId = session?.impersonatedBy?.id;

    if (!impersonatorId) {
      return { error: 'No hay una sesión de suplantación activa.' };
    }

    const [adminUser] = await db
      .select({
        id: users.id,
        role: users.role,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, impersonatorId))
      .limit(1);

    if (!adminUser || adminUser.deletedAt || adminUser.role !== 'admin') {
      return { error: 'El usuario admin original no está disponible.' };
    }

    await setSession({ id: adminUser.id });
    return { success: 'Suplantación detenida.' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo detener la suplantación.' };
  }
}

export async function deleteUser(userId: number): Promise<ActionState> {
  try {
    const currentUser = await verifyAdmin();

    if (currentUser.id === userId) {
      return { error: 'No puedes eliminar tu propia cuenta.' };
    }

    await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
    await db.delete(activityLogs).where(eq(activityLogs.userId, userId));
    
    await db.delete(users).where(eq(users.id, userId));
    revalidatePath('/admin/users');
    return { success: 'Usuario eliminado correctamente' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo eliminar el usuario' };
  }
}

export async function deleteTeam(teamId: number): Promise<ActionState> {
  try {
    await verifyAdmin();

    if (teamId === 1) {
      return { error: 'No se puede eliminar el equipo administrador del sistema.' };
    }

    await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
    await db.delete(activityLogs).where(eq(activityLogs.teamId, teamId));
    await db.delete(invitations).where(eq(invitations.teamId, teamId));

    await db.delete(teams).where(eq(teams.id, teamId));
    
    revalidatePath('/admin/teams');
    return { success: 'Equipo eliminado correctamente' };
  } catch (error: any) {
    console.error('Delete team error:', error);
    return { error: error.message || 'No se pudo eliminar el equipo' };
  }
}

export async function upsertPlan(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await verifyAdmin();

    const id = formData.get('id') as string;
    
    const rawAmount = parseFloat(formData.get('amount') as string || '0');
    const amountInCents = Math.round(rawAmount * 100);
    const rawCustomItems = (formData.get('pricingCustomItems') as string | null)?.trim() || '';
    let pricingCustomItems: Array<{ text: string; included: boolean }> = [];
    if (rawCustomItems) {
      try {
        const parsed = JSON.parse(rawCustomItems);
        if (Array.isArray(parsed)) {
          pricingCustomItems = parsed
            .filter((item) => item && typeof item.text === 'string')
            .map((item) => ({
              text: String(item.text).trim(),
              included: Boolean(item.included),
            }))
            .filter((item) => item.text.length > 0);
        }
      } catch {
        return { error: 'pricingCustomItems debe ser un JSON válido.' };
      }
    }

    const rawData = {
      name: formData.get('name'),
      description: formData.get('description'),
      amount: amountInCents,
      interval: formData.get('interval'),
      trialDays: formData.get('trialDays'),
      maxUsers: formData.get('maxUsers'),
      maxContacts: formData.get('maxContacts'),
      maxInstances: formData.get('maxInstances'),
      isAiEnabled: formData.get('isAiEnabled') === 'on',
      isFlowBuilderEnabled: formData.get('isFlowBuilderEnabled') === 'on',
      isCampaignsEnabled: formData.get('isCampaignsEnabled') === 'on',
      isTemplatesEnabled: formData.get('isTemplatesEnabled') === 'on',
      isSocialPublisherEnabled: formData.get('isSocialPublisherEnabled') === 'on',
      isHidden: formData.get('isHidden') === 'on',
      pricingCustomItems,
    };

    const validated = planSchema.safeParse(rawData);

    if (!validated.success) {
      return { error: validated.error.issues[0].message };
    }

    const { name, description, amount, interval } = validated.data;
    let stripeProductId = '';
    let stripePriceId = '';
    const canUseStripe = hasStripeCredentials();

    if (id) {
      const existingPlan = await db.query.plans.findFirst({
        where: eq(plans.id, parseInt(id))
      });

      if (!existingPlan) return { error: 'Plan no encontrado' };

      stripeProductId = existingPlan.stripeProductId || '';

      if (stripeProductId) {
        if (canUseStripe) {
          const stripe = getStripeClient();

          await stripe.products.update(existingPlan.stripeProductId, {
            name: name,
            description: description || undefined,
          });

          if (existingPlan.amount !== amount || existingPlan.interval !== interval) {
            const newPrice = await stripe.prices.create({
              product: stripeProductId,
              unit_amount: amount,
              currency: 'usd',
              recurring: { interval: interval as 'month' | 'year' },
            });
            stripePriceId = newPrice.id;
          } else {
            stripePriceId = existingPlan.stripePriceId || '';
          }
        } else {
          stripePriceId = existingPlan.stripePriceId || '';
        }
      } else {
        stripePriceId = existingPlan.stripePriceId || '';
      }

    } else {
      if (canUseStripe) {
        const stripe = getStripeClient();

        const product = await stripe.products.create({
          name: name,
          description: description || undefined,
        });
        stripeProductId = product.id;

        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: amount,
          currency: 'usd',
          recurring: { interval: interval as 'month' | 'year' },
        });
        stripePriceId = price.id;
      }
    }

    const dataToSave = {
      ...validated.data,
      stripeProductId,
      stripePriceId,
      updatedAt: new Date(),
    };

    if (id) {
      await db.update(plans)
        .set(dataToSave)
        .where(eq(plans.id, parseInt(id)));
    } else {
      await db.insert(plans).values(dataToSave);
    }

  } catch (error: any) {
    return { error: error.message };
  }

  revalidatePath('/admin/plans');
  redirect('/admin/plans');
}

export async function deletePlan(planId: number): Promise<ActionState> {
  try {
    await verifyAdmin();
    
    if (planId === 1) {
      return { error: 'No se puede eliminar el plan predeterminado del sistema.' };
    }

    const teamsUsingPlan = await db.query.teams.findFirst({
      where: eq(teams.planId, planId)
    });

    if (teamsUsingPlan) {
      return { error: 'No se puede eliminar este plan porque está asignado a uno o más equipos.' };
    }

    const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
    if (plan?.stripeProductId) {
      if (!hasStripeCredentials()) {
        return { error: STRIPE_CONFIG_ERROR };
      }

      try {
        const stripe = getStripeClient();
        await stripe.products.update(plan.stripeProductId, { active: false });
      } catch (e) {
        console.error(e);
      }
    }

    await db.delete(plans).where(eq(plans.id, planId));
    revalidatePath('/admin/plans');
    return { success: 'Plan eliminado correctamente' };
  } catch (error: any) {
    return { error: error.message || 'No se pudo eliminar el plan' };
  }
}
