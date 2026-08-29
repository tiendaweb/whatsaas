/**
 * Smoke del motor del Command Center Comercial contra la base real.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-sales-ops-motor.mts
 *
 * Existe porque ni el build ni `tsc` ven lo que importa acá: SQL con Date,
 * regex de Postgres, el ON CONFLICT del versionado, el parseo Zod del dossier.
 * Escribe SÓLO en team_commercial_* / team_prompt_runs (3 chats de prueba).
 */
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { buildChatDossierFull, buildChatDossier, DossierError } from '@/lib/plugins/sales-ops/server/dossier';
import { computePriority } from '@/lib/plugins/sales-ops/server/priority';
import { classifyChat, getLatestVersion, listPendingChats, ClassificationInputError } from '@/lib/plugins/sales-ops/server/classifier';
import { chatFingerprint } from '@/lib/plugins/sales-ops/server/fingerprint';
import { getActivePrompt, SALES_OPS_PROMPT_KEYS } from '@/lib/plugins/sales-ops/server/prompts';
import type { Classification } from '@/lib/plugins/sales-ops/shared/contract';

const TEAM = Number(process.env.SMOKE_TEAM ?? 2);
const USER = Number(process.env.SMOKE_USER ?? 23);
const EXCLUDED_CHAT_MIN_MESSAGES = 5000; // el chat interno de 10.731 mensajes se excluye por lista

function ok(label: string, value?: unknown) {
  console.log(`✓ ${label}${value === undefined ? '' : `: ${typeof value === 'object' ? JSON.stringify(value).slice(0, 600) : value}`}`);
}
function fail(label: string, error: unknown): never {
  console.error(`✗ ${label}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
function count<T extends string>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}

type ChatRow = { id: number; n: number };

// 1. Dossier: los 20 chats más largos (sin el interno) y 5 con audios sin transcribir.
const longest = (await db.execute(sql`
  select c.id, count(m.id)::int as n from chats c join messages m on m.chat_id = c.id
  where c.team_id = ${TEAM} and c.remote_jid not like '%@g.us'
  group by c.id having count(m.id) < ${EXCLUDED_CHAT_MIN_MESSAGES} order by n desc limit 20
`)) as unknown as ChatRow[];
const withAudios = (await db.execute(sql`
  select c.id, count(m.id)::int as n from chats c join messages m on m.chat_id = c.id
  left join message_audio_insights i on i.message_id = m.id
  where c.team_id = ${TEAM} and c.remote_jid not like '%@g.us'
    and (m.message_type = 'audioMessage' or m.media_is_ptt = true) and coalesce(i.status,'') <> 'done'
  group by c.id order by n desc limit 5
`)) as unknown as ChatRow[];

const t0 = Date.now();
const dossierStats: Array<{ chatId: number; total: number; timeline: number; omitted: number; auto: number; forced: string | null; gap: boolean; fp: string }> = [];
for (const row of [...longest, ...withAudios]) {
  try {
    const { dossier } = await buildChatDossierFull(TEAM, row.id);
    const fp = await chatFingerprint(TEAM, row.id);
    if (fp !== dossier.fingerprint) fail(`fingerprint distinto entre dossier y chatFingerprint (chat ${row.id})`, { fp, d: dossier.fingerprint });
    if (dossier.chat.phoneMasked.replace(/\D/g, '').length > 8) fail('teléfono sin enmascarar', dossier.chat.phoneMasked);
    const approxTokens = Math.round(JSON.stringify(dossier.timeline).length / 4);
    dossierStats.push({
      chatId: row.id,
      total: dossier.counts.total,
      timeline: dossier.timeline.length,
      omitted: dossier.omitted.reduce((s, o) => s + o.count, 0),
      auto: dossier.timeline.filter((e) => e.flags.includes('auto')).length,
      forced: dossier.facts.forced_gate,
      gap: dossier.facts.evidence_gap,
      fp: `${approxTokens}tok`,
    });
  } catch (error) {
    if (error instanceof DossierError) {
      ok(`chat ${row.id} excluido (${error.code})`);
      continue;
    }
    fail(`dossier chat ${row.id}`, error);
  }
}
ok(`dossiers armados (${dossierStats.length}) en ${Date.now() - t0} ms`);
console.table(dossierStats);

// 1b. Grupo: tiene que rechazarse.
const [group] = (await db.execute(sql`select id from chats where team_id = ${TEAM} and remote_jid like '%@g.us' limit 1`)) as unknown as Array<{ id: number }>;
if (group) {
  try {
    await buildChatDossier(TEAM, group.id);
    fail('grupo aceptado', group.id);
  } catch (error) {
    if (!(error instanceof DossierError) || error.code !== 'group') fail('grupo: error inesperado', error);
    ok(`grupo ${group.id} rechazado con code=group`);
  }
}

// 2. Reglas sobre 50 chats al azar.
const random = (await db.execute(sql`
  select id from chats where team_id = ${TEAM} and remote_jid not like '%@g.us' order by random() limit 50
`)) as unknown as Array<{ id: number }>;
const forced: string[] = [];
const evidence: string[] = [];
const sources: string[] = [];
const who: string[] = [];
let pending = 0;
let auto = 0;
let paymentPending = 0;
let automationActive = 0;
let neverAnswered = 0;
let gap = 0;
for (const r of random) {
  try {
    const { dossier } = await buildChatDossierFull(TEAM, r.id);
    const f = dossier.facts;
    forced.push(f.forced_gate ?? 'ninguno');
    evidence.push(f.customer_evidence);
    sources.push(f.source);
    who.push(f.who_spoke_last);
    if (f.min_gate) pending += 1;
    if (f.auto_reply_detected) auto += 1;
    if (f.payment_pending) paymentPending += 1;
    if (f.automation_active) automationActive += 1;
    if (f.never_answered_by_us) neverAnswered += 1;
    if (f.evidence_gap) gap += 1;
  } catch (error) {
    if (error instanceof DossierError) continue;
    fail(`reglas chat ${r.id}`, error);
  }
}
ok('reglas sobre 50 chats al azar');
console.log('  gates forzados:', count(forced));
console.log('  evidencia cliente:', count(evidence));
console.log('  origen:', count(sources));
console.log('  habló último:', count(who));
console.log(`  min_gate G9: ${pending} · pago pendiente: ${paymentPending} · auto-reply: ${auto} · automatización activa: ${automationActive} · nunca contestados: ${neverAnswered} · evidence_gap: ${gap}`);

// 3. Prioridad: los tres ejemplos del doc 04 §9.
const oscar = computePriority({ gate: 'G10', daysSilent: 0, followupsTotal: 0, objection: 'ninguna', collectionSpeed: 'inmediata', potentialValueUsd: 220, evidenceGap: false, autoReply: false, confidence: 90 });
const carina = computePriority({ gate: 'G9', daysSilent: 20, followupsTotal: 1, objection: 'ninguna', collectionSpeed: 'meses', potentialValueUsd: 130, evidenceGap: false, autoReply: false, confidence: 80 });
const g0 = computePriority({ gate: 'G0', daysSilent: 120, followupsTotal: 2, objection: 'ninguna', collectionSpeed: 'indefinida', potentialValueUsd: 45, evidenceGap: false, autoReply: false, confidence: 90 });
ok('prioridad Oscar (esperado ≈187)', oscar);
ok('prioridad Carina (esperado ≈15)', carina);
ok('prioridad G0 (esperado ≈0)', g0);
if (Math.abs(oscar.priorityScore - 187) > 1) fail('Oscar fuera de rango', oscar.priorityScore);
if (Math.abs(carina.priorityScore - 15) > 1) fail('Carina fuera de rango', carina.priorityScore);
if (g0.priorityScore > 1) fail('G0 fuera de rango', g0.priorityScore);
const gx = computePriority({ gate: 'GX', daysSilent: 1, followupsTotal: 0, objection: 'ninguna', collectionSpeed: 'inmediata', potentialValueUsd: 500, evidenceGap: false, autoReply: false, confidence: 100 });
if (gx.priorityScore !== 0 || gx.recoveryProbability !== 0) fail('GX debería ser 0', gx);
ok('GX = 0');

// 4. Prompt activo y pendientes.
const prompt = await getActivePrompt(TEAM, SALES_OPS_PROMPT_KEYS.classify);
ok('prompt activo', { key: prompt.key, version: prompt.version, source: prompt.source, systemChars: prompt.systemPrompt.length });
const tp = Date.now();
const prefiltro = await listPendingChats(TEAM, { source: 'prefiltro', limit: 500 });
const stale = await listPendingChats(TEAM, { source: 'stale', limit: 500 });
const all = await listPendingChats(TEAM, { source: 'all', limit: 2000 });
ok(`pendientes en ${Date.now() - tp} ms`, { prefiltro: prefiltro.length, stale: stale.length, all: all.length });
console.log('  prefiltro por señal:', count(prefiltro.flatMap((p) => p.signals)));
console.log('  prefiltro por motivo:', count(prefiltro.map((p) => p.pendingReason)));
console.log('  primeros 3:', prefiltro.slice(0, 3).map((p) => ({ chatId: p.chatId, name: p.name.slice(0, 20), signals: p.signals, last: p.lastCustomerAt?.slice(0, 10), tel: p.phoneMasked })));
if (prefiltro.length > 1) {
  const firstNoPago = prefiltro.findIndex((p) => !p.signals.includes('pago_nuestro'));
  const lastPago = prefiltro.map((p) => p.signals.includes('pago_nuestro')).lastIndexOf(true);
  if (firstNoPago !== -1 && lastPago > firstNoPago) fail('orden del prefiltro: pago_nuestro no va primero', { firstNoPago, lastPago });
  ok('orden del prefiltro correcto (pago_nuestro primero)');
}

// 5. Clasificación con motor connector: 3 chats con JSON válido, 1 inválido, versionado.
// Sólo chats SIN análisis previo: al final se borra lo que escribió el smoke y no hay nada que restaurar.
const candidates = prefiltro.filter((p) => !p.automationActive && p.pendingReason === 'sin_analisis').slice(0, 3);
if (candidates.length < 3) fail('faltan candidatos del prefiltro sin análisis', candidates.length);

const sample = (gate: Classification['current_gate'], msgId: string): Classification => ({
  current_gate: gate,
  max_gate: gate,
  drop_gate: gate,
  drop_reason: 'evaluando_sin_cierre',
  confidence: 72,
  evidence: { gate: [msgId], price: [], objection: [], intent: [], payment: [] },
  source: 'ads_meta',
  business_type: 'Smoke test',
  need: 'combo_full',
  need_detail: 'Prueba de humo del motor',
  quoted_price: { amount: 60000, currency: 'ARS' },
  proposal_summary: 'Combo Full 60k',
  objection_type: 'ninguna',
  objection_detail: null,
  intent: 'evaluando',
  intent_score: 55,
  temperature: 'warm',
  is_existing_customer_by_chat: false,
  payment_pending_by_chat: false,
  last_prospect_action: 'Preguntó por el combo',
  last_team_action: 'Se le mandó el precio',
  collection_speed: 'semanas',
  recommended_action: 'Retomar desde el precio del Combo Full y ofrecer arrancar con seña',
  recommended_owner: 'noelia',
  suggested_status: 'en_proceso',
  next_action_at: null,
  notes_for_human: 'Generado por smoke-sales-ops-motor',
  crm_to_fix: null,
});

const results: Array<Record<string, unknown>> = [];
for (const c of candidates) {
  const { dossier } = await buildChatDossierFull(TEAM, c.chatId);
  const msgId = dossier.timeline.find((e) => e.who === 'cliente')?.id ?? dossier.timeline[0]?.id ?? 'x';
  const before = await getLatestVersion(TEAM, c.chatId);
  const r1 = await classifyChat(TEAM, c.chatId, { engine: 'connector', classification: sample('G5', msgId), connector: 'claude', userId: USER });
  results.push({ chatId: c.chatId, v: r1.version, reason: r1.reason, gate: r1.gate, status: r1.status, prio: r1.priorityScore, usd: r1.potentialValueUsd, forced: r1.facts.forced_gate, min: r1.facts.min_gate, warnings: r1.warnings.length, prevVersion: before?.version ?? null });
  if (r1.potentialValueUsd !== 60) fail('valor USD desde quoted_price (60000 ARS / 1000)', r1.potentialValueUsd);
}
ok('clasificación connector (3 chats)');
console.table(results);

// Versionado: segunda clasificación con otro gate → versión +1 con diff.
const target = candidates[0];
const { dossier: d0 } = await buildChatDossierFull(TEAM, target.chatId);
const msg0 = d0.timeline.find((e) => e.who === 'cliente')?.id ?? d0.timeline[0]?.id ?? 'x';
const first = await getLatestVersion(TEAM, target.chatId);
const r2 = await classifyChat(TEAM, target.chatId, { engine: 'connector', classification: { ...sample('G7', msg0), intent: 'fuerte', intent_score: 80, recommended_action: 'Pedir seña y confirmar el plan' }, connector: 'chatgpt', userId: USER });
const second = await getLatestVersion(TEAM, target.chatId);
if (!first || !second || second.version !== first.version + 1) fail('versionado: la versión no subió', { first: first?.version, second: second?.version });
if (r2.reason !== 'prompt_changed' && r2.reason !== 'chat_changed') fail('reason inesperado', r2.reason);
const diffKeys = Object.keys(second.diff ?? {});
ok(`versionado: v${first.version} → v${second.version} (${r2.reason}), diff en ${diffKeys.length} campos`, diffKeys.slice(0, 12));
if (!r2.facts.forced_gate && !r2.humanOverrideKept && !diffKeys.includes('currentGate') && r2.gate === 'G5') fail('el diff no registró el cambio de gate', second.diff);
const [runs] = (await db.execute(sql`select count(*)::int as n from team_prompt_runs where team_id = ${TEAM} and target_id = ${String(target.chatId)}`)) as unknown as Array<{ n: number }>;
ok('team_prompt_runs del chat', runs.n);
const [logs] = (await db.execute(sql`select count(*)::int as n from activity_logs where team_id = ${TEAM} and action = 'SALES_OPS_CLASSIFY' and (metadata->>'chatId')::int = ${target.chatId}`)) as unknown as Array<{ n: number }>;
ok('activity_logs SALES_OPS_CLASSIFY del chat', logs.n);

// Inválido: debe fallar con mensaje claro y sin tocar la base.
const beforeInvalid = await getLatestVersion(TEAM, target.chatId);
try {
  await classifyChat(TEAM, target.chatId, { engine: 'connector', classification: { current_gate: 'G99', confidence: 'alta' }, connector: 'grok', userId: USER });
  fail('la clasificación inválida no falló', null);
} catch (error) {
  if (!(error instanceof ClassificationInputError)) fail('inválida: error de otro tipo', error);
  ok('clasificación inválida rechazada', (error as Error).message.slice(0, 200));
}
const afterInvalid = await getLatestVersion(TEAM, target.chatId);
if (afterInvalid?.version !== beforeInvalid?.version) fail('la inválida escribió una versión', afterInvalid?.version);

// Dry run: no escribe.
const dry = await classifyChat(TEAM, target.chatId, { engine: 'connector', classification: sample('G4', msg0), connector: 'grok', userId: USER, dryRun: true });
const afterDry = await getLatestVersion(TEAM, target.chatId);
if (afterDry?.version !== afterInvalid?.version) fail('dry_run escribió', afterDry?.version);
ok('dry_run no escribe', { gate: dry.gate, version: dry.version, diffKeys: Object.keys(dry.diff ?? {}).length });

// 6. Motor servidor en dry_run sobre 1 chat (usa la IA del equipo si existe).
const ts = Date.now();
const server = await classifyChat(TEAM, target.chatId, { engine: 'server', userId: USER, dryRun: true });
ok(`motor servidor (dry_run) en ${Date.now() - ts} ms`, { aiUsed: server.aiUsed, provider: server.provider, model: server.model, gate: server.gate, confidence: server.confidence, status: server.status, prio: server.priorityScore, aiError: server.aiError?.slice(0, 160) ?? null, warnings: server.warnings });

// 7. Limpieza: el smoke no deja clasificaciones de mentira en la base.
const touched = candidates.map((c) => c.chatId);
await db.execute(sql`delete from team_commercial_analysis where team_id = ${TEAM} and chat_id in ${touched}`);
await db.execute(sql`delete from team_prompt_runs where team_id = ${TEAM} and target_kind = 'chat' and target_id in ${touched.map(String)}`);
await db.execute(sql`delete from activity_logs where team_id = ${TEAM} and action = 'SALES_OPS_CLASSIFY' and (metadata->>'chatId')::int in ${touched}`);
const [left] = (await db.execute(sql`select count(*)::int as n from team_commercial_analysis_versions where team_id = ${TEAM} and chat_id in ${touched}`)) as unknown as Array<{ n: number }>;
if (left.n !== 0) fail('quedaron versiones del smoke', left.n);
ok('limpieza: análisis, versiones, prompt runs y logs del smoke borrados', touched);

console.log('\nSMOKE OK');
process.exit(0);
