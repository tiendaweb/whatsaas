import { listAccounts, getAccountDetail, setVisibility } from '../lib/plugins/sales-ops/server/accounts';
import { getSalesOpsSettings } from '../lib/plugins/sales-ops/server/settings';

const TEAM = 2;
const USER = 23;
const short = (r: any) => `${r.id} ${r.name} [${r.visibility}] act=${r.subscriptions.active} exp=${r.subscriptions.expired} pend=${r.subscriptions.pending} usd/mes=${r.subscriptions.totalMonthlyUsd} tiendas=${r.links.stores} dom=${r.links.domains} contactos=${r.contacts.map((c: any) => `${c.name}(${c.gate ?? '-'})`).join(',')}`;

async function main() {
  const t0 = Date.now();
  const venta = await listAccounts(TEAM, { kind: 'customers', tab: 'en_venta', limit: 5 });
  console.log(`en_venta: total=${venta.total} counts=${JSON.stringify(venta.counts)} (${Date.now() - t0} ms)`);
  venta.rows.forEach((r) => console.log('  ', short(r)));
  const vencidas = await listAccounts(TEAM, { kind: 'customers', tab: 'vencidas', limit: 3 });
  console.log(`vencidas: total=${vencidas.total}`);
  vencidas.rows.forEach((r) => console.log('  ', short(r)));
  const empresas = await listAccounts(TEAM, { kind: 'companies', tab: 'todas' });
  console.log(`empresas/todas: total=${empresas.total} counts=${JSON.stringify(empresas.counts)}`);
  empresas.rows.forEach((r) => console.log('  ', short(r)));
  const busca = await listAccounts(TEAM, { kind: 'customers', tab: 'todas', q: venta.rows[0].name.split(' ')[0] });
  console.log(`búsqueda "${venta.rows[0].name.split(' ')[0]}": total=${busca.total}`);

  // Cliente con más suscripciones (en_venta, sin paginar)
  const all = await listAccounts(TEAM, { kind: 'customers', tab: 'en_venta', limit: 200 });
  const top = [...all.rows].sort((a, b) => b.subscriptions.active + b.subscriptions.expired - (a.subscriptions.active + a.subscriptions.expired))[0];
  const detail = await getAccountDetail(TEAM, { kind: 'customers', id: top.id });
  if (!detail) throw new Error('sin detalle');
  console.log(`detalle cliente ${top.id} ${top.name}: subs=${detail.subscriptions.length} tiendas=${detail.stores.length} dominios=${detail.domains.length} contactos=${detail.contacts.length} ventas=${detail.sales.length} money=${JSON.stringify(detail.moneyByCurrency)}`);
  detail.subscriptions.forEach((s) => console.log(`   sub#${s.id} ${s.number} ${s.planName} ${s.price / 100} ${s.currency}/${s.billingType} ${s.status}/${s.paymentStatus} vence=${s.endDate} daysLeft=${s.daysLeft} vis=${s.visibility} contacto=${s.contactName}`));
  detail.stores.slice(0, 3).forEach((s) => console.log(`   tienda#${s.id} ${s.cardType} ${s.title} → ${s.url} (${s.status})`));
  detail.domains.slice(0, 3).forEach((d) => console.log(`   dominio#${d.id} ${d.name} ${d.status} vence=${d.expiresAt}`));

  const activas = detail.subscriptions.filter((s) => s.status === 'active' && s.visibility === 'visible');
  if (activas.length === 0) throw new Error('sin sub activa visible');
  const sub = activas[0];
  const before = await getSalesOpsSettings(TEAM);
  console.log(`\n→ marcando ${activas.map((s) => `sub#${s.id}`).join(', ')} como private (settings antes: ${JSON.stringify(before.subscriptionVisibility)})`);
  for (const s of activas) await setVisibility(TEAM, USER, { target: 'subscription', id: s.id, visibility: 'private' });
  try {
    const v2 = await listAccounts(TEAM, { kind: 'customers', tab: 'en_venta', limit: 200 });
    const p2 = await listAccounts(TEAM, { kind: 'customers', tab: 'privadas', limit: 200 });
    const enVenta = v2.rows.some((r) => r.id === top.id);
    const enPriv = p2.rows.some((r) => r.id === top.id);
    console.log(`   en_venta: ${v2.total} (antes ${all.total}) → cliente ${top.id} ${enVenta ? 'SIGUE (MAL)' : 'desapareció (OK)'}`);
    console.log(`   privadas: ${p2.total} → cliente ${top.id} ${enPriv ? 'aparece (OK)' : 'NO aparece (MAL)'}`);
    const d2 = await getAccountDetail(TEAM, { kind: 'customers', id: top.id });
    console.log(`   detalle: sub#${sub.id} vis=${d2?.subscriptions.find((s) => s.id === sub.id)?.visibility} privateCount=${d2?.account.subscriptions.privateCount}`);
    console.log(`\n→ ocultando cliente ${top.id}`);
    await setVisibility(TEAM, USER, { target: 'customer', id: top.id, visibility: 'hidden' });
    const o = await listAccounts(TEAM, { kind: 'customers', tab: 'ocultas', limit: 200 });
    const t = await listAccounts(TEAM, { kind: 'customers', tab: 'todas', limit: 200 });
    console.log(`   ocultas: ${o.rows.some((r) => r.id === top.id) ? 'aparece (OK)' : 'NO aparece (MAL)'} · todas: ${t.rows.some((r) => r.id === top.id) ? 'SIGUE (MAL)' : 'desapareció (OK)'}`);
    try { await setVisibility(TEAM, USER, { target: 'subscription', id: 999999999, visibility: 'hidden' }); console.log('   id ajeno: NO tiró (MAL)'); } catch (e) { console.log(`   id ajeno: rechazado (OK): ${(e as Error).message}`); }
  } finally {
    for (const s of activas) await setVisibility(TEAM, USER, { target: 'subscription', id: s.id, visibility: 'visible' });
    await setVisibility(TEAM, USER, { target: 'customer', id: top.id, visibility: 'visible' });
    const after = await getSalesOpsSettings(TEAM);
    console.log(`\n→ restaurado. settings después: subs=${JSON.stringify(after.subscriptionVisibility)} accounts=${JSON.stringify(after.accountVisibility)}`);
    const v3 = await listAccounts(TEAM, { kind: 'customers', tab: 'en_venta', limit: 200 });
    console.log(`   en_venta otra vez: ${v3.total} (igual al inicio: ${v3.total === all.total})`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
