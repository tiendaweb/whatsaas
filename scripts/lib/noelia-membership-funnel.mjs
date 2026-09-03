import { createHash } from 'node:crypto';

export const TEAM_ID = 2;
export const ACTOR_USER_ID = 3;

export const MEMBERSHIP_TAG_NAMES = [
  'Combo Sitio + Tienda · Membresía anual',
  'Tienda Online · Membresía anual',
  'Sitio Web · Membresía anual',
  'Membresía web/tienda · anual',
];

const TARGET_STAGE_BY_KIND = {
  combo: 'Combo Full',
  sitio: 'Clientes Sitios Web',
  tienda: 'Tienda Online',
};

const TASK4_PROPOSALS = new Map([
  [10, { tag: 'Tienda Online · A medida', confidence: 'conversation_explicit', evidence: 'Pidió una tienda profesional con módulos y pasarelas de pago.' }],
  [11, { tag: 'Sitio Web · Membresía anual', confidence: 'legacy_stage', evidence: 'Sin coincidencia GoBiz ni conversación útil; provenía de “Sitios / trabajos por hacer”.' }],
  [57, { tag: 'Sitio Web · Membresía anual', confidence: 'conversation_explicit', evidence: 'La propuesta final registrada fue crear dos sitios web.' }],
  [61, { tag: 'Sitio Web · A medida', confidence: 'conversation_explicit', evidence: 'Propuesta de sitio personalizado por $120.000/año.' }],
  [81, { tag: 'Sitio Web · Membresía anual', confidence: 'conversation_explicit', evidence: 'La conversación confirma “el sitio web perfecto”.' }],
  [84, { tag: 'Membresía web/tienda · anual', confidence: 'generic_review', evidence: 'Sin coincidencia GoBiz ni elección concluyente; se conserva la ambigüedad sin inventar servicio.' }],
  [125, { tag: 'Tienda Online · Membresía anual', confidence: 'gobiz_exact', evidence: 'GoBiz: Sol Rosa, plan Tienda Online, coincidencia exacta por teléfono.' }],
  [143, { tag: 'Sitio Web · A medida', confidence: 'conversation_explicit', evidence: 'Sitio profesional para cursos + Hotmart y automatizaciones.' }],
  [309, { tag: 'Sitio Web · Membresía anual', confidence: 'conversation_explicit', evidence: 'La propuesta aceptada y el trabajo entregado son un sitio web.' }],
  [494, { tag: 'Tienda Online · Membresía anual', confidence: 'gobiz_exact', evidence: 'GoBiz: Carmen, plan Tienda WhatsApp Básica, coincidencia exacta por teléfono; plan vencido/no renueva.' }],
]);

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLeadStage(name) {
  return /^(nuevo lead|conversando|seguimiento|propuesta|sin contestar|no contesto|perdido|pausado)/.test(normalize(name));
}

export function isCriticalStage(name) {
  return /^(sin contestar|no contesto|perdido)/.test(normalize(name));
}

export function isPendingWorkStage(name) {
  return ['en produccion', 'esperando sena'].includes(normalize(name));
}

export function isCleanupName(name) {
  const raw = String(name ?? '').trim();
  const withoutTrailingPunctuation = normalize(raw).replace(/[.…]+$/g, '').trim();
  if (['martin dev', 'nono', 'aapp.space', 'dc botattendant sys', 'ejecutiva de ventas'].includes(withoutTrailingPunctuation)) return true;
  if (['l', 'e'].includes(normalize(raw))) return true;
  return raw.length > 0 && !/[\p{L}\p{N}]/u.test(raw);
}

function classifyPlan(name) {
  const text = normalize(name);
  if (/sitio\s*web.*tienda|sitio\s*\+\s*tienda|tienda.*sitio\s*web|tarjeta virtual.*tienda/.test(text)) return 'combo';
  if (/tienda/.test(text)) return 'tienda';
  if (/sitio\s*web/.test(text)) return 'sitio';
  return null;
}

function classifyMembership(memberTags, plans) {
  const combo = memberTags.includes('Combo Sitio + Tienda · Membresía anual');
  const store = memberTags.includes('Tienda Online · Membresía anual');
  const site = memberTags.includes('Sitio Web · Membresía anual');
  if (combo || (store && site)) return 'combo';
  if (store) return 'tienda';
  if (site) return 'sitio';
  const planKinds = [...new Set(plans.map(classifyPlan).filter(Boolean))];
  return planKinds.length === 1 ? planKinds[0] : null;
}

export async function buildNoeliaMembershipPlan(sql) {
  const [contacts, subscriptions, links, taxonomy] = await Promise.all([
    sql`
      select c.id, c.chat_id, c.name, c.funnel_stage_id, c.notes, c.custom_data, c.updated_at,
        fs.name as stage_name, fs.group_id, fsg.name as group_name, ch.remote_jid,
        coalesce(array_agg(distinct t.name order by t.name) filter (where t.id is not null), array[]::varchar[]) as tags
      from contacts c
      join chats ch on ch.id = c.chat_id
      left join funnel_stages fs on fs.id = c.funnel_stage_id
      left join funnel_stage_groups fsg on fsg.id = fs.group_id
      left join contact_tags ct on ct.contact_id = c.id
      left join tags t on t.id = ct.tag_id
      where c.team_id = ${TEAM_ID}
      group by c.id, ch.id, fs.id, fsg.id
      order by c.id
    `,
    sql`
      select s.id, s.contact_id, s.customer_id, coalesce(p.name, s.plan_name_snapshot) as plan_name,
        s.status, s.payment_status, s.end_date, tc.source as customer_source
      from team_membership_subscriptions s
      left join team_membership_plans p on p.id = s.plan_id
      left join team_customers tc on tc.id = s.customer_id
      where s.team_id = ${TEAM_ID}
      order by (s.status = 'active') desc, s.end_date desc nulls last, s.id desc
    `,
    sql`select contact_id, customer_id from team_customer_contacts where team_id = ${TEAM_ID}`,
    Promise.all([
      sql`select id, name from tags where team_id = ${TEAM_ID}`,
      sql`select id, name, group_id from funnel_stages where team_id = ${TEAM_ID}`,
    ]),
  ]);

  const [tagRows, stageRows] = taxonomy;
  const tagByName = new Map(tagRows.map((row) => [row.name, Number(row.id)]));
  const stagesByName = new Map();
  for (const row of stageRows) {
    if (!stagesByName.has(row.name)) stagesByName.set(row.name, []);
    stagesByName.get(row.name).push({ id: Number(row.id), groupId: row.group_id == null ? null : Number(row.group_id) });
  }
  for (const name of MEMBERSHIP_TAG_NAMES) {
    if (!tagByName.has(name)) throw new Error(`Falta la etiqueta obligatoria: ${name}`);
  }
  for (const name of Object.values(TARGET_STAGE_BY_KIND)) {
    const stages = stagesByName.get(name) ?? [];
    if (stages.length !== 1) throw new Error(`Se esperaba una única etapa “${name}”; encontradas: ${stages.length}`);
  }

  const subscriptionsByContact = new Map();
  const subscriptionsByCustomer = new Map();
  for (const subscription of subscriptions) {
    if (subscription.contact_id) {
      const id = Number(subscription.contact_id);
      if (!subscriptionsByContact.has(id)) subscriptionsByContact.set(id, []);
      subscriptionsByContact.get(id).push(subscription);
    }
    if (subscription.customer_id) {
      const id = Number(subscription.customer_id);
      if (!subscriptionsByCustomer.has(id)) subscriptionsByCustomer.set(id, []);
      subscriptionsByCustomer.get(id).push(subscription);
    }
  }
  const customersByContact = new Map();
  for (const link of links) {
    const contactId = Number(link.contact_id);
    if (!customersByContact.has(contactId)) customersByContact.set(contactId, new Set());
    customersByContact.get(contactId).add(Number(link.customer_id));
  }

  const rows = contacts.map((contact) => {
    const matchedSubscriptions = new Map();
    for (const subscription of subscriptionsByContact.get(Number(contact.id)) ?? []) matchedSubscriptions.set(Number(subscription.id), subscription);
    for (const customerId of customersByContact.get(Number(contact.id)) ?? []) {
      for (const subscription of subscriptionsByCustomer.get(customerId) ?? []) matchedSubscriptions.set(Number(subscription.id), subscription);
    }
    const planMatches = [...matchedSubscriptions.values()].map((subscription) => ({
      id: Number(subscription.id),
      name: subscription.plan_name,
      status: subscription.status,
      paymentStatus: subscription.payment_status,
      endDate: subscription.end_date,
      source: subscription.customer_source,
    }));
    const memberTags = contact.tags.filter((tag) => MEMBERSHIP_TAG_NAMES.includes(tag));
    const kind = classifyMembership(memberTags, planMatches.map((plan) => plan.name));
    const targetStage = kind ? TARGET_STAGE_BY_KIND[kind] : null;
    return {
      contactId: Number(contact.id),
      chatId: Number(contact.chat_id),
      name: contact.name,
      stageId: contact.funnel_stage_id == null ? null : Number(contact.funnel_stage_id),
      stage: contact.stage_name,
      groupId: contact.group_id == null ? null : Number(contact.group_id),
      group: contact.group_name,
      tags: contact.tags,
      memberTags,
      targetStage,
      targetStageId: targetStage ? stagesByName.get(targetStage)[0].id : null,
      planMatches,
      cleanup: memberTags.length > 0 && isCleanupName(contact.name),
    };
  });

  const task1 = rows.filter((row) => row.memberTags.length > 0 && isLeadStage(row.stage));
  const task5 = rows.filter((row) => row.cleanup);
  const cleanupIds = new Set(task5.map((row) => row.contactId));
  const task2 = task1.map((row) => ({
    ...row,
    action: cleanupIds.has(row.contactId)
      ? 'exclude_cleanup'
      : row.targetStage
        ? `move:${row.targetStage}`
        : 'manual_review',
    reason: cleanupIds.has(row.contactId)
      ? 'La limpieza de internos/basura tiene prioridad.'
      : row.targetStage
        ? 'Destino derivado de la etiqueta de membresía.'
        : 'La etiqueta genérica no tiene un plan GoBiz concluyente.',
  }));
  const task3 = task1.filter((row) => isCriticalStage(row.stage)).map((row) => ({
    ...row,
    action: cleanupIds.has(row.contactId) ? 'exclude_cleanup' : row.targetStage ? `move:${row.targetStage}` : 'manual_review',
  }));

  const clientWorkStages = new Set(['entregado', 'en produccion', 'esperando sena']);
  const task4 = rows
    .filter((row) => clientWorkStages.has(normalize(row.stage)) && row.tags.length === 0)
    .map((row) => ({ ...row, proposal: TASK4_PROPOSALS.get(row.contactId) ?? null }));

  const lostLikeTags = tagRows.filter((row) => /perdido|sin contestar|no contesto/i.test(row.name));
  const moves = task2.filter((row) => row.action.startsWith('move:')).map((row) => ({
    contactId: row.contactId,
    name: row.name,
    fromStageId: row.stageId,
    fromStage: row.stage,
    toStageId: row.targetStageId,
    toStage: row.targetStage,
    critical: isCriticalStage(row.stage),
  }));
  const tagRemovals = task5.flatMap((row) => row.memberTags.map((tag) => ({
    contactId: row.contactId,
    name: row.name,
    tagId: tagByName.get(tag),
    tag,
  })));
  const tagAdditions = task4.filter((row) => row.proposal?.tag).map((row) => {
    const tagId = tagByName.get(row.proposal.tag);
    if (!tagId) throw new Error(`La etiqueta propuesta no existe: ${row.proposal.tag}`);
    return { contactId: row.contactId, name: row.name, tagId, tag: row.proposal.tag, confidence: row.proposal.confidence, evidence: row.proposal.evidence };
  });

  const mutationPlan = { teamId: TEAM_ID, moves, tagRemovals, tagAdditions };
  const fingerprint = createHash('sha256').update(JSON.stringify(mutationPlan)).digest('hex').slice(0, 16);
  return { generatedAt: new Date().toISOString(), task1, task2, task3, task4, task5, lostLikeTags, moves, tagRemovals, tagAdditions, mutationPlan, fingerprint };
}

const md = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';
const tagsMd = (tags) => tags.map((tag) => `“${tag}”`).join(', ') || '—';

export function renderNoeliaMembershipReport(plan) {
  const moveCounts = Object.fromEntries(Object.values(TARGET_STAGE_BY_KIND).map((stage) => [stage, plan.moves.filter((move) => move.toStage === stage).length]));
  const lines = [
    '# Dry-run · Ordenamiento del embudo de membresías · Noelia',
    '',
    `Generado: ${plan.generatedAt}`,
    `Team: ${TEAM_ID}`,
    `Huella de aprobación: \`${plan.fingerprint}\``,
    '',
    'No se aplicó ningún cambio en la base.',
    '',
    '## Resumen',
    '',
    `- Tarea 1: ${plan.task1.length} contactos con membresía en etapa lead/perdido.`,
    `- Tarea 2: ${plan.moves.length} movimientos propuestos (${Object.entries(moveCounts).map(([stage, count]) => `${stage}: ${count}`).join('; ')}).`,
    `- Tarea 3: ${plan.task3.length} críticos detectados; ${plan.task3.filter((row) => row.action.startsWith('move:')).length} movimientos y ${plan.task3.filter((row) => row.action === 'exclude_cleanup').length} exclusión por limpieza.`,
    `- Tarea 4: ${plan.task4.length} contactos sin ninguna etiqueta; ${plan.tagAdditions.length} etiquetas propuestas.`,
    `- Tarea 5: ${plan.task5.length} contactos internos/basura; ${plan.tagRemovals.length} vínculos de membresía a quitar.`,
    `- Etiquetas separadas de perdido/sin contestar existentes: ${plan.lostLikeTags.length}.`,
    '',
    '## 1. Membresía en etapa lead/perdido',
    '',
    '| ID | Nombre | Etapa actual | Etiqueta(s) de membresía |',
    '|---:|---|---|---|',
    ...plan.task1.map((row) => `| ${row.contactId} | ${md(row.name)} | ${md(row.stage)} | ${tagsMd(row.memberTags)} |`),
    '',
    '## 2. Movimientos propuestos',
    '',
    '| ID | Nombre | Desde | Hacia / acción | Motivo |',
    '|---:|---|---|---|---|',
    ...plan.task2.map((row) => `| ${row.contactId} | ${md(row.name)} | ${md(row.stage)} | ${row.action.startsWith('move:') ? md(row.targetStage) : row.action === 'exclude_cleanup' ? 'NO MOVER · limpieza' : 'REVISIÓN MANUAL'} | ${md(row.reason)} |`),
    '',
    '## 3. Críticos',
    '',
    '| ID | Nombre | Desde | Etiqueta(s) | Hacia / acción |',
    '|---:|---|---|---|---|',
    ...plan.task3.map((row) => `| ${row.contactId} | ${md(row.name)} | ${md(row.stage)} | ${tagsMd(row.memberTags)} | ${row.action.startsWith('move:') ? md(row.targetStage) : 'NO MOVER · limpieza'} |`),
    '',
    plan.lostLikeTags.length === 0
      ? 'No existe una etiqueta separada llamada Perdido/Sin contestar/No contesto. “Perdido” es una etapa; salir de ella se logra con el movimiento de etapa.'
      : `Etiquetas separadas detectadas: ${plan.lostLikeTags.map((tag) => `${tag.id} · ${tag.name}`).join(', ')}.`,
    '',
    '## 4. Etapa de cliente/trabajo sin ninguna etiqueta',
    '',
    '| ID | Nombre | Etapa | Etiqueta propuesta | Confianza | Evidencia |',
    '|---:|---|---|---|---|---|',
    ...plan.task4.map((row) => `| ${row.contactId} | ${md(row.name)} | ${md(row.stage)} | ${md(row.proposal?.tag ?? 'REVISIÓN MANUAL')} | ${md(row.proposal?.confidence ?? 'sin propuesta')} | ${md(row.proposal?.evidence ?? 'Sin regla segura.')} |`),
    '',
    '## 5. Limpieza de internos/basura',
    '',
    '| ID | Nombre | Etapa actual | Membresía a quitar |',
    '|---:|---|---|---|',
    ...plan.task5.map((row) => `| ${row.contactId} | ${md(row.name)} | ${md(row.stage)} | ${tagsMd(row.memberTags)} |`),
    '',
    '## Aplicación (no ejecutada)',
    '',
    'El script vuelve a ejecutar el dry-run y exige la misma huella. Antes de tocar la base crea un backup de los contactos afectados y de todos sus contact-tags. La aplicación es transaccional y crea una nota y un activity_log con cada cambio y su estado anterior.',
    '',
    '```bash',
    `node --env-file=.env scripts/apply-noelia-membership-funnel.mjs --apply --approval=${plan.fingerprint}`,
    '```',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

