/**
 * Smoke del equipo B (UI lectura) contra el equipo 2. Si no hay análisis en la
 * base, inserta 3 filas temporales (marcadas con model='smoke-b') y las borra
 * al final. Uso: npx tsx scripts/smoke-sales-ops-ui.mts
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCommercialAnalysis, teamCommercialAnalysisVersions, teamCommercialSignals } from '@/lib/db/schema';
import { listAnalyses, getAnalysisDetail } from '@/lib/plugins/sales-ops/server/queries';
import { getOverview } from '@/lib/plugins/sales-ops/server/overview';
import { getMetrics } from '@/lib/plugins/sales-ops/server/metrics';

const teamId = 2;
const existing = await db.select({ n: sql<number>`count(*)::int` }).from(teamCommercialAnalysis).where(eq(teamCommercialAnalysis.teamId, teamId));
let seeded = false;
const seededIds: number[] = [];

if ((existing[0]?.n ?? 0) === 0) {
  // Tres chats reales con más mensajes del cliente, para tener evidencia y timeline.
  const cand = await db.execute(sql`
    select c.id, ct.id as contact_id, m.mid, m.last_at, m.first_at from chats c
    join lateral (
      select max(id) filter (where not from_me) mid, max(timestamp) filter (where not from_me) last_at, min(timestamp) first_at
      from messages where chat_id = c.id
    ) m on true
    left join contacts ct on ct.chat_id = c.id
    where c.team_id = ${teamId} and c.remote_jid like '%@s.whatsapp.net'
      and (select count(*) from messages where chat_id = c.id and not from_me) between 5 and 40
    order by c.last_message_timestamp desc nulls last limit 3`) as unknown as Array<{ id: number; contact_id: number | null; mid: string; last_at: Date; first_at: Date }>;
  const specs = [
    { gate: 'G10', status: 'cobro', prio: 187, owner: 'carlos', action: 'Pasar alias y confirmar tienda profesional', conf: 91 },
    { gate: 'G6', status: 'recuperado', prio: 33, owner: 'noelia', action: 'Objeción presupuesto: ofrecer plan en 2 pagos', conf: 48 },
    { gate: 'G1', status: 'pre_descarte', prio: 4, owner: 'nadie', action: 'Último intento', conf: 70 },
  ];
  for (let i = 0; i < cand.length; i++) {
    const c = cand[i];
    const s = specs[i];
    const contactId = c.contact_id ? Number(c.contact_id) : null;
    const [row] = await db.insert(teamCommercialAnalysis).values({
      teamId, chatId: Number(c.id), contactId, version: 1, currentGate: s.gate, maxGate: s.gate, dropGate: s.gate,
      dropReason: 'desconocido', confidence: s.conf, evidence: { gate: [String(c.mid)], price: [String(c.mid)] },
      priorityScore: s.prio, recommendedAction: s.action, recommendedOwner: s.owner, status: s.status,
      lastCustomerMessageAt: new Date(c.last_at), firstContactAt: new Date(c.first_at), analyzedAt: new Date(), analyzedBy: 'server',
      model: 'smoke-b', temperature: i === 0 ? 'hot' : 'cold', need: 'tienda_profesional', potentialValueUsd: 220,
      proposalSummary: i === 0 ? 'Aceptó tienda profesional, espera alias.' : null,
    }).returning({ id: teamCommercialAnalysis.id });
    seededIds.push(row.id);
    await db.insert(teamCommercialAnalysisVersions).values({
      teamId, analysisId: row.id, chatId: Number(c.id), version: 1, reason: 'initial',
      snapshot: { current_gate: s.gate, confidence: s.conf }, evidence: {}, diff: { current_gate: { from: null, to: s.gate } }, analyzedBy: 'server',
    });
    if (i === 0) {
      await db.insert(teamCommercialSignals).values({ teamId, chatId: Number(c.id), contactId, messageId: String(c.mid), kind: 'pago', confidence: 90, excerpt: 'pasame el alias', status: 'new' });
    }
  }
  seeded = true;
  console.log('[seed] %d análisis temporales insertados (model=smoke-b)', seededIds.length);
}

try {
  const t0 = Date.now();
  const list = await listAnalyses(teamId, { vista: 'todos', limit: 2 });
  console.log('listAnalyses todos: total=%d rows=%d nextCursor=%s (%dms)', list.total, list.rows.length, Boolean(list.nextCursor), Date.now() - t0);
  for (const r of list.rows) console.log('  row: %s | %s | %s | prio %d | %s | daysSilent=%s | %s', r.name, r.phoneMasked, r.currentGate, r.priorityScore, r.recommendedOwner, r.daysSilent, r.recommendedAction);
  for (const v of ['dinero', 'oportunidades', 'barrido', 'limpieza'] as const) {
    const r = await listAnalyses(teamId, { vista: v, limit: 1 });
    console.log('  vista %s: total=%d first=%s', v, r.total, r.rows[0]?.name ?? '—');
  }
  if (list.nextCursor) {
    const p2 = await listAnalyses(teamId, { vista: 'todos', limit: 2, cursor: list.nextCursor });
    console.log('  página 2 (cursor): rows=%d first=%s prio=%d', p2.rows.length, p2.rows[0]?.name, p2.rows[0]?.priorityScore);
  }
  const first = list.rows[0];
  if (first) {
    const digits = first.phoneMasked.replace(/\D/g, '').slice(-4);
    const q = await listAnalyses(teamId, { q: digits, limit: 3 });
    console.log('  búsqueda por últimos dígitos "%s": total=%d', digits, q.total);
    const byName = await listAnalyses(teamId, { q: first.name.split(' ')[0], sort: 'name', limit: 3 });
    console.log('  búsqueda por nombre "%s": total=%d', first.name.split(' ')[0], byName.total);
    const rev = await listAnalyses(teamId, { toReview: true, limit: 5 });
    console.log('  toReview (<55): total=%d', rev.total);
    const age = await listAnalyses(teamId, { ageBucket: 'gt180', sort: 'age', limit: 5 });
    console.log('  ageBucket gt180 sort age: total=%d', age.total);

    const d = await getAnalysisDetail(teamId, first.chatId);
    console.log('getAnalysisDetail CON análisis chat=%d gate=%s conf=%d timeline=%d versions=%d actions=%d signals=%d href=%s',
      first.chatId, d?.analysis?.currentGate, d?.analysis?.confidence, d?.timeline.length, d?.versions.length, d?.actions.length, d?.signals.length, d?.chatHref);
    const withEv = d?.timeline.filter((t) => 'evidenceOf' in t && t.evidenceOf.length) ?? [];
    const flagged = d?.timeline.filter((t) => 'flags' in t && t.flags.length) ?? [];
    const gaps = d?.timeline.filter((t) => 'kind' in t) ?? [];
    console.log('  hitos con evidencia=%d, con flags=%d, gaps=%d', withEv.length, flagged.length, gaps.length);
    console.log('  muestra:', JSON.stringify(d?.timeline.slice(0, 3)).slice(0, 500));
  }
  const sin = await db.execute(sql`select c.id from chats c left join team_commercial_analysis a on a.chat_id=c.id where c.team_id=${teamId} and a.id is null and c.remote_jid like '%@s.whatsapp.net' order by c.last_message_timestamp desc nulls last limit 1`) as unknown as Array<{ id: number }>;
  const sinId = Number(sin[0]?.id);
  const t1 = Date.now();
  const d2 = await getAnalysisDetail(teamId, sinId);
  console.log('getAnalysisDetail SIN análisis chat=%d analysis=%s header=%s timeline=%d (%dms)', sinId, d2?.analysis, d2?.header.name, d2?.timeline.length, Date.now() - t1);
  console.log('  otro equipo → %s', await getAnalysisDetail(999999, sinId));

  const t2 = Date.now();
  const ov = await getOverview(teamId);
  console.log('getOverview (%dms):', Date.now() - t2, JSON.stringify({ cash: ov.cash, counters: ov.counters, audit: ov.audit, distribution: ov.distribution }));
  console.log('  nextBest:', JSON.stringify(ov.nextBest.map((n) => ({ name: n.name, gate: n.gate, reason: n.reason, signalKind: n.signalKind, prio: n.priorityScore, owner: n.owner }))));
  const t3 = Date.now();
  const m = await getMetrics(teamId);
  console.log('getMetrics (%dms): cashByWeek=%s audit=%s', Date.now() - t3, JSON.stringify(m.cashByWeek), JSON.stringify(m.audit));
  console.log('  byGate no vacíos:', JSON.stringify(Object.fromEntries(Object.entries(m.byGate).filter(([, v]) => v.total > 0))));
  console.log('  byAge:', JSON.stringify(Object.fromEntries(Object.entries(m.byAge).filter(([, v]) => v.total > 0))), 'byObjection:', JSON.stringify(m.byObjection), 'bySource:', JSON.stringify(m.bySource));
} finally {
  if (seeded) {
    for (const id of seededIds) await db.delete(teamCommercialAnalysis).where(and(eq(teamCommercialAnalysis.id, id), eq(teamCommercialAnalysis.teamId, teamId)));
    await db.delete(teamCommercialSignals).where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.excerpt, 'pasame el alias')));
    const left = await db.select({ n: sql<number>`count(*)::int` }).from(teamCommercialAnalysis).where(eq(teamCommercialAnalysis.teamId, teamId));
    console.log('[seed] limpiado; quedan %d análisis', left[0]?.n);
  }
}
process.exit(0);
