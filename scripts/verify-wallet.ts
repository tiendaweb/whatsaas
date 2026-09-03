/**
 * Verificación de la billetera. Ejercita los tres casos que pueden costar dinero real:
 * el doble cobro por idempotencia, el bloqueo por saldo insuficiente y la deuda
 * cuando el cliente final ya pagó.
 *
 * Uso: npx tsx scripts/verify-wallet.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { resellerWallets, walletTransactions, resellers } from '../lib/db/schema';
import { creditWallet, debitWallet } from '../lib/resellers/wallet';

if (!/(_test|test)(\?|$)/i.test(process.env.POSTGRES_URL ?? '')) {
  throw new Error('verify-wallet solo puede ejecutarse contra una base de datos de pruebas.');
}

const RESELLER_SLUG = 'chatpro';

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? '  OK  ' : ' FALLA'} | ${label} — ${detail}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  const reseller = await db.query.resellers.findFirst({
    where: eq(resellers.slug, RESELLER_SLUG),
  });
  if (!reseller) throw new Error(`No existe el reseller ${RESELLER_SLUG}`);

  const rid = reseller.id;

  // Estado limpio
  await db.delete(walletTransactions).where(eq(walletTransactions.resellerId, rid));
  await db
    .update(resellerWallets)
    .set({ balance: 0, creditLimit: 0 })
    .where(eq(resellerWallets.resellerId, rid));

  console.log('\n--- 1. Recarga de 100.00 ---');
  const topup = await creditWallet({
    resellerId: rid,
    amount: 10000,
    type: 'topup',
    idempotencyKey: 'test:topup:1',
  });
  check('recarga acreditada', topup.ok && topup.balance === 10000, `saldo=${topup.ok ? topup.balance : 'error'}`);

  console.log('\n--- 2. DOBLE COBRO: mismo débito de 30.00 dos veces (checkout + webhook) ---');
  const first = await debitWallet({
    resellerId: rid,
    amount: 3000,
    type: 'debit_plan',
    idempotencyKey: 'stripe:sub_123:1700000000',
  });
  const second = await debitWallet({
    resellerId: rid,
    amount: 3000,
    type: 'debit_plan',
    idempotencyKey: 'stripe:sub_123:1700000000', // misma clave
  });

  check('primer débito cobra', first.ok && !first.deduped && first.balance === 7000, `saldo=${first.ok ? first.balance : 'err'}`);
  check('segundo débito NO cobra', second.ok && second.deduped === true, `deduped=${second.ok ? second.deduped : 'err'}`);

  const [wallet1] = await db.select().from(resellerWallets).where(eq(resellerWallets.resellerId, rid));
  check('saldo cobrado UNA sola vez', wallet1.balance === 7000, `saldo=${wallet1.balance} (esperado 7000)`);

  const txs = await db.select().from(walletTransactions).where(eq(walletTransactions.resellerId, rid));
  const debits = txs.filter((t) => t.type === 'debit_plan');
  check('una sola transacción de débito', debits.length === 1, `transacciones=${debits.length}`);

  console.log('\n--- 3. Renovación siguiente (otro periodo) SÍ cobra ---');
  const renewal = await debitWallet({
    resellerId: rid,
    amount: 3000,
    type: 'debit_plan',
    idempotencyKey: 'stripe:sub_123:1702678400', // periodo distinto
  });
  check('la renovación cobra de nuevo', renewal.ok && !renewal.deduped && renewal.balance === 4000, `saldo=${renewal.ok ? renewal.balance : 'err'}`);

  console.log('\n--- 4. Saldo insuficiente: débito de 99.00 con saldo 40.00 ---');
  const blocked = await debitWallet({
    resellerId: rid,
    amount: 9900,
    type: 'debit_plan',
    idempotencyKey: 'stripe:sub_999:1',
  });
  check('se rechaza el cobro', !blocked.ok && blocked.reason === 'insufficient_funds', `reason=${blocked.ok ? 'cobrado!' : blocked.reason}`);

  const [wallet2] = await db.select().from(resellerWallets).where(eq(resellerWallets.resellerId, rid));
  check('el saldo no se movió', wallet2.balance === 4000, `saldo=${wallet2.balance} (esperado 4000)`);

  console.log('\n--- 5. Cliente YA pagó (allowDebt): se activa aunque sobregire ---');
  const debt = await debitWallet({
    resellerId: rid,
    amount: 9900,
    type: 'debit_plan',
    idempotencyKey: 'stripe:sub_888:1',
    allowDebt: true,
  });
  check('la activación NO se revierte', debt.ok === true, `ok=${debt.ok}`);
  check('queda marcada como deuda', debt.ok && debt.pendingDebt === true, `pendingDebt=${debt.ok ? debt.pendingDebt : 'err'}`);

  const [wallet3] = await db.select().from(resellerWallets).where(eq(resellerWallets.resellerId, rid));
  check('saldo queda negativo', wallet3.balance === -5900, `saldo=${wallet3.balance} (esperado -5900)`);

  const debtTx = (await db.select().from(walletTransactions).where(eq(walletTransactions.resellerId, rid)))
    .find((t) => t.idempotencyKey === 'stripe:sub_888:1');
  check('transacción en pending_debt', debtTx?.status === 'pending_debt', `status=${debtTx?.status}`);

  // Limpieza
  await db.delete(walletTransactions).where(eq(walletTransactions.resellerId, rid));
  await db.update(resellerWallets).set({ balance: 0 }).where(eq(resellerWallets.resellerId, rid));

  console.log(process.exitCode === 1 ? '\nHAY FALLOS\n' : '\nTODO OK\n');
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
