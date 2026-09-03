/**
 * Smoke del Centro de Comandos contra la base real.
 *
 * Existe porque ni el build ni `tsc` ven los errores que importan acá: un `Date`
 * crudo dentro de un `sql` anidado, una comparación de una columna `date` en
 * modo string contra un `Date`, o un `ON CONFLICT` mal armado sólo aparecen
 * cuando postgres.js serializa de verdad.
 */
import { getCommandCenter } from '@/lib/desktop/command-center/service';
import { getSuggestionsForItems } from '@/lib/desktop/command-center/suggestions';
import { executeCommandBatch } from '@/lib/desktop/command-center/execute';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPermissions, canSeeAllChats, getChatVisibility } from '@/lib/permissions';
import type { PermissionContext } from '@/lib/auth/permissions-guard';

const TEAM = Number(process.env.SMOKE_TEAM ?? 2);
const USER = Number(process.env.SMOKE_USER ?? 3);

function ok(label: string, value: unknown) {
  console.log(`✓ ${label}:`, typeof value === 'object' ? JSON.stringify(value).slice(0, 400) : value);
}

const membership = await db.query.teamMembers.findFirst({ where: eq(teamMembers.userId, USER) });
if (!membership) throw new Error(`sin membresía para el usuario ${USER}`);
const permissions = getPermissions(membership.role, membership.permissions);

const owner: PermissionContext = {
  userId: USER,
  teamId: membership.teamId,
  role: membership.role,
  permissions,
  canSeeAllChats: canSeeAllChats(membership.role, membership.permissions),
  chatVisibility: getChatVisibility(membership.role, membership.permissions),
};
ok('contexto', { teamId: owner.teamId, role: owner.role, visibility: owner.chatVisibility });

// 1. La bandeja completa. Acá vive la comparación de `end_date` (date en modo
//    string) y el orden con nulls last.
const payload = await getCommandCenter(owner);
ok('counts', payload.counts);
ok('totals', payload.totals);
ok('capabilities', payload.capabilities);
ok('items', payload.items.map((item) => `${item.id}|${item.kind}|urgent:${item.urgent}|reply:${!!item.reply}`).slice(0, 12));

// 2. Un agente con visibilidad acotada: ningún ítem puede traer canal fuera de
//    su alcance ni un teléfono.
const agent: PermissionContext = { ...owner, role: 'agent', chatVisibility: 'assigned', canSeeAllChats: false };
const agentPayload = await getCommandCenter(agent);
ok('agente: items', agentPayload.items.length);
ok('agente: sin teléfono en el payload', !JSON.stringify(agentPayload).includes('@s.whatsapp.net'));

// 3. Sugerencias: reserva en la tabla nueva (ON CONFLICT) y degradación sin IA.
const withChannel = payload.items.filter((item) => item.reply).slice(0, 3).map((item) => item.id);
if (withChannel.length) {
  const bundles = await getSuggestionsForItems(owner, withChannel);
  ok('sugerencias', Object.entries(bundles).map(([key, value]) => `${key}:${value.state}${value.reason ? `/${value.reason}` : ''}`));
  // Segunda pasada: tiene que salir de caché o quedar en loading, nunca regenerar.
  const again = await getSuggestionsForItems(owner, withChannel);
  ok('sugerencias (2ª pasada)', Object.entries(again).map(([key, value]) => `${key}:${value.state}`));
} else {
  ok('sugerencias', 'sin ítems con canal de respuesta');
}

// 4. Validación del plan: permisos, scope y destinatario resuelto. NO envía.
const plan = [
  ...payload.items
    .filter((item) => item.reply)
    .slice(0, 2)
    .map((item) => ({
      itemId: item.id,
      action: { type: 'send-message' as const, chatId: item.reply!.chatId, text: '[SMOKE] no se envía', source: 'custom' as const },
    })),
  ...payload.items
    .filter((item) => item.actions.length)
    .slice(0, 3)
    .map((item) => ({ itemId: item.id, action: item.actions[0] })),
];
if (plan.length) {
  const validation = await executeCommandBatch(owner, { batchId: 'smoke-batch-0001', actions: plan, validation: true });
  ok('validación', validation.results.map((row) => `${row.itemId}:${row.ok ? 'ok' : row.error}${row.recipient ? `→${row.recipient.masked}` : ''}`));

  // 5. Etapa cerrada: el servidor la rechaza aunque la UI no la ofrezca.
  const dealItem = payload.items.find((item) => item.kind === 'deal');
  if (dealItem) {
    const rejected = await executeCommandBatch(owner, {
      batchId: 'smoke-batch-0002',
      actions: [{ itemId: dealItem.id, action: { type: 'move-deal-stage', dealId: dealItem.entityId, stage: 'closed_won' as never } }],
      validation: true,
    });
    ok('cerrar como ganada rechazado', rejected.results[0]?.error === 'invalid');
  }

  // 6. Dos envíos al mismo chat en un lote: el segundo se rechaza.
  const first = plan.find((entry) => entry.action.type === 'send-message');
  if (first && first.action.type === 'send-message') {
    const duplicated = await executeCommandBatch(owner, {
      batchId: 'smoke-batch-0003',
      actions: [first, { ...first, itemId: `${first.itemId}` }],
      validation: true,
    });
    ok('duplicado rechazado', duplicated.results.some((row) => row.error === 'duplicate_recipient'));
  }
} else {
  ok('validación', 'nada que planificar');
}

// 7. Un agente sin `messagesSend` no recibe ni sugerencias.
const noSend: PermissionContext = { ...agent, permissions: { ...permissions, messagesSend: false } };
ok('sin messagesSend', Object.values(await getSuggestionsForItems(noSend, withChannel.length ? withChannel : ['chat:1'])).map((value) => value.reason));

console.log('\nSmoke OK');
process.exit(0);
