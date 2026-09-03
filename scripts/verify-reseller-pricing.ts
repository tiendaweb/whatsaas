/**
 * Verifica el re-preciado y el guard anti-fallback de cobro.
 *
 * El caso peligroso: si un reseller no ha sincronizado sus precios con su cuenta de
 * Stripe, el checkout NO debe caer al price de la plataforma (cobraría el dinero de
 * su cliente en la cuenta equivocada).
 *
 * Uso: npx tsx scripts/verify-reseller-pricing.ts
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { plans, resellerPlanPrices, resellers } from '../lib/db/schema';
import { getPublishedPlansForTenant } from '../lib/db/queries';
import { resolveWholesaleAmount } from '../lib/resellers/pricing';

if (!/(_test|test)(\?|$)/i.test(process.env.POSTGRES_URL ?? '')) {
  throw new Error('verify-reseller-pricing solo puede ejecutarse contra una base de datos de pruebas.');
}

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? '  OK  ' : ' FALLA'} | ${label} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const reseller = await db.query.resellers.findFirst({
    where: eq(resellers.slug, 'chatpro'),
  });
  if (!reseller) throw new Error('falta el reseller chatpro');

  let paidPlan = await db.query.plans.findFirst({ where: eq(plans.isHidden, false) });
  if (!paidPlan) throw new Error('no hay planes');

  // El plan de la plataforma tiene un price de la CUENTA DE LA PLATAFORMA. Es
  // justo el valor al que el checkout del reseller no debe caer nunca.
  const originalPriceId = paidPlan.stripePriceId;
  const PLATFORM_PRICE = 'price_PLATAFORMA_no_usar_en_reseller';
  await db
    .update(plans)
    .set({ stripePriceId: PLATFORM_PRICE })
    .where(eq(plans.id, paidPlan.id));
  paidPlan = { ...paidPlan, stripePriceId: PLATFORM_PRICE };

  console.log(`\nPlan de la plataforma: "${paidPlan.name}" a ${paidPlan.amount / 100}`);
  console.log(`Descuento del reseller: ${reseller.wholesaleDiscountBps / 100}%`);

  const wholesale = resolveWholesaleAmount(reseller, paidPlan, null);
  console.log(`Le cuesta al reseller: ${wholesale / 100}`);

  // El reseller le pone su propio precio de venta
  const RETAIL = paidPlan.amount + 5000; // +50.00 de ganancia
  await db
    .delete(resellerPlanPrices)
    .where(eq(resellerPlanPrices.resellerId, reseller.id));
  await db.insert(resellerPlanPrices).values({
    resellerId: reseller.id,
    planId: paidPlan.id,
    retailAmount: RETAIL,
    currency: paidPlan.currency,
    isPublished: true,
    // externalPriceRef a propósito NULL: no ha sincronizado con su Stripe todavía.
  });

  console.log('\n--- 1. Precios que ve cada dominio ---');
  const platformPlans = await getPublishedPlansForTenant(null);
  const resellerPlans = await getPublishedPlansForTenant(reseller.id);

  const platformPlan = platformPlans.find((p) => p.id === paidPlan.id);
  const resellerPlan = resellerPlans.find((p) => p.id === paidPlan.id);

  check(
    'la plataforma ve su precio',
    platformPlan?.amount === paidPlan.amount,
    `${(platformPlan?.amount ?? 0) / 100}`,
  );
  check(
    'el reseller ve SU precio de venta',
    resellerPlan?.amount === RETAIL,
    `${(resellerPlan?.amount ?? 0) / 100} (esperado ${RETAIL / 100})`,
  );
  check(
    'la ganancia del reseller es la diferencia',
    (resellerPlan?.amount ?? 0) - wholesale === RETAIL - wholesale,
    `${(RETAIL - wholesale) / 100}`,
  );

  console.log('\n--- 2. GUARD: sin precio sincronizado, el priceId NO cae al de la plataforma ---');
  check(
    'stripePriceId del reseller NO es el de la plataforma',
    resellerPlan?.stripePriceId !== paidPlan.stripePriceId,
    `reseller="${resellerPlan?.stripePriceId}" vs plataforma="${paidPlan.stripePriceId}"`,
  );
  check(
    'stripePriceId viene vacío (fuerza el error en el checkout)',
    resellerPlan?.stripePriceId === '',
    `"${resellerPlan?.stripePriceId}"`,
  );

  console.log('\n--- 3. Plan despublicado por el reseller desaparece de su web ---');
  await db
    .update(resellerPlanPrices)
    .set({ isPublished: false })
    .where(
      and(
        eq(resellerPlanPrices.resellerId, reseller.id),
        eq(resellerPlanPrices.planId, paidPlan.id),
      ),
    );

  const afterHide = await getPublishedPlansForTenant(reseller.id);
  check(
    'el plan oculto no se ofrece',
    !afterHide.some((p) => p.id === paidPlan.id),
    `planes visibles=${afterHide.length}`,
  );
  const platformStill = await getPublishedPlansForTenant(null);
  check(
    'pero sigue visible en la plataforma',
    platformStill.some((p) => p.id === paidPlan.id),
    'ok',
  );

  await db.delete(resellerPlanPrices).where(eq(resellerPlanPrices.resellerId, reseller.id));
  await db
    .update(plans)
    .set({ stripePriceId: originalPriceId })
    .where(eq(plans.id, paidPlan.id));

  console.log(process.exitCode === 1 ? '\nHAY FALLOS\n' : '\nTODO OK\n');
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
