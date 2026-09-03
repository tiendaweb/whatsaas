import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { resellerWallets, walletTransactions } from '@/lib/db/schema';

export type WalletTxType =
  | 'topup'
  | 'debit_plan'
  | 'refund'
  | 'adjustment'
  | 'chargeback';

export type WalletMoveResult =
  | { ok: true; deduped: boolean; balance: number; pendingDebt?: boolean }
  | { ok: false; reason: 'no_wallet' | 'insufficient_funds'; balance: number };

type MoveInput = {
  resellerId: number;
  amount: number; // siempre positivo; el signo lo pone el tipo de movimiento
  type: WalletTxType;
  /**
   * Clave de deduplicación. Es la única defensa contra el doble cobro: el alta por
   * Stripe pasa por el checkout route y por el webhook, y ambos usan la misma clave.
   */
  idempotencyKey: string;
  teamId?: number | null;
  planId?: number | null;
  provider?: string | null;
  providerRef?: string | null;
  description?: string;
  createdBy?: number | null;
  /**
   * Si el cliente final ya pagó (una renovación), no se puede rechazar el débito:
   * se deja el saldo en negativo y se marca la transacción como deuda.
   */
  allowDebt?: boolean;
};

export async function getOrCreateWallet(resellerId: number) {
  const existing = await db.query.resellerWallets.findFirst({
    where: eq(resellerWallets.resellerId, resellerId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(resellerWallets)
    .values({ resellerId })
    .onConflictDoNothing()
    .returning();

  return (
    created ??
    (await db.query.resellerWallets.findFirst({
      where: eq(resellerWallets.resellerId, resellerId),
    }))
  );
}

async function move(input: MoveInput, signedAmount: number): Promise<WalletMoveResult> {
  return db.transaction(async (tx) => {
    // FOR UPDATE serializa dos cobros simultáneos del mismo reseller; sin esto, dos
    // altas a la vez leerían el mismo saldo y ambas lo darían por suficiente.
    const [wallet] = await tx
      .select()
      .from(resellerWallets)
      .where(eq(resellerWallets.resellerId, input.resellerId))
      .for('update');

    if (!wallet) {
      return { ok: false, reason: 'no_wallet', balance: 0 } as const;
    }

    const nextBalance = wallet.balance + signedAmount;
    const floor = -wallet.creditLimit;
    const wouldOverdraw = nextBalance < floor;

    // Se decide ANTES de insertar y sin lanzar: así un error real de BD no se
    // confunde nunca con "saldo insuficiente".
    if (wouldOverdraw && !input.allowDebt) {
      return {
        ok: false,
        reason: 'insufficient_funds',
        balance: wallet.balance,
      } as const;
    }

    // Si la clave ya existe, este cobro ya se aplicó: salir sin tocar el saldo.
    const inserted = await tx
      .insert(walletTransactions)
      .values({
        walletId: wallet.id,
        resellerId: input.resellerId,
        type: input.type,
        // El cliente final ya pagó, así que el movimiento se registra igual y
        // queda marcado como deuda del reseller con la plataforma.
        status: wouldOverdraw ? 'pending_debt' : 'completed',
        amount: signedAmount,
        balanceAfter: nextBalance,
        currency: wallet.currency,
        teamId: input.teamId ?? null,
        planId: input.planId ?? null,
        idempotencyKey: input.idempotencyKey,
        provider: input.provider ?? null,
        providerRef: input.providerRef ?? null,
        description: input.description,
        createdBy: input.createdBy ?? null,
      })
      .onConflictDoNothing({
        target: [walletTransactions.resellerId, walletTransactions.idempotencyKey],
      })
      .returning();

    if (inserted.length === 0) {
      return { ok: true, deduped: true, balance: wallet.balance } as const;
    }

    await tx
      .update(resellerWallets)
      .set({ balance: nextBalance, updatedAt: new Date() })
      .where(eq(resellerWallets.id, wallet.id));

    return {
      ok: true,
      deduped: false,
      balance: nextBalance,
      pendingDebt: wouldOverdraw,
    } as const;
  });
}

export async function creditWallet(input: MoveInput): Promise<WalletMoveResult> {
  return move(input, Math.abs(input.amount));
}

export async function debitWallet(input: MoveInput): Promise<WalletMoveResult> {
  return move(input, -Math.abs(input.amount));
}

export async function hasBalanceFor(
  resellerId: number,
  amount: number,
): Promise<boolean> {
  const wallet = await db.query.resellerWallets.findFirst({
    where: eq(resellerWallets.resellerId, resellerId),
  });
  if (!wallet) return false;

  return wallet.balance - amount >= -wallet.creditLimit;
}
