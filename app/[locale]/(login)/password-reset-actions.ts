'use server';

import { z } from 'zod';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/session';
import { sendPasswordResetEmail } from '@/lib/email';
import { randomUUID } from 'crypto';
import { ActionState } from '@/lib/auth/middleware';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function requestPasswordReset(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { email } = result.data;

  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      await sendPasswordResetEmail(email, token);
    }

    return { success: 'Si existe una cuenta con ese correo, se envió un enlace de restablecimiento.' };
  } catch (error) {
    console.error('Password reset request error:', error);
    return { error: 'Ocurrió un error. Intenta nuevamente.' };
  }
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export async function resetPassword(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { token, password, confirmPassword } = result.data;

  if (password !== confirmPassword) {
    return { error: 'Las contraseñas no coinciden.' };
  }

  try {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!resetToken) {
      return { error: 'El enlace de restablecimiento es inválido o expiró. Solicita uno nuevo.' };
    }

    const passwordHash = await hashPassword(password);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, resetToken.userId)),
      db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id)),
    ]);

    return { success: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.' };
  } catch (error) {
    console.error('Password reset error:', error);
    return { error: 'Ocurrió un error. Intenta nuevamente.' };
  }
}
