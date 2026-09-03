/**
 * Prueba de humo de la cola unificada y de las acciones nuevas del Centro de
 * comandos, CONTRA LA BASE. No escribe nada: todo va en dry_run.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-work-queue.mts
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { buildPermissionContext } from '@/lib/auth/permissions-guard';
import { listUnifiedWorkQueue } from '@/lib/work-queue/service';
import { executeDesktopTool } from '@/lib/plugins/grok-connector/server/desktop-actions';

const TEAM = 2;
const [m] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, TEAM)).limit(1);
const ctx = (await buildPermissionContext(TEAM, m!.userId))!;
const actionCtx = { teamId: TEAM, userId: m!.userId };

const q = await listUnifiedWorkQueue(ctx, { limit: 60 });
console.log(`\n=== COLA UNIFICADA — ${q.total} ítems ===`);
console.log('por fuente :', JSON.stringify(q.counts.bySource));
console.log('por aprob. :', JSON.stringify(q.counts.byApproval));
console.log('por tipo   :', JSON.stringify(q.counts.byKind));
for (const s of q.sources) console.log(`  ${s.source.padEnd(6)} disponible=${s.available} items=${s.count}${s.skipped ? ' · ' + s.skipped : ''}`);
console.log('\ntop 8 por prioridad:');
for (const it of q.items.slice(0, 8)) {
  console.log(`  ${String(it.priority).padStart(4)} [${it.source}/${it.kind}] ${it.approval.padEnd(11)} ${it.title.slice(0, 46)}`);
}

console.log('\n=== FILTROS ===');
for (const ap of ['ready', 'needs_human'] as const) {
  const f = await listUnifiedWorkQueue(ctx, { approval: ap, limit: 5 });
  console.log(`  approval=${ap.padEnd(11)} → total=${f.total} devueltos=${f.returned} truncado=${f.truncated}`);
}
for (const src of ['sales', 'tasks', 'inbox'] as const) {
  const f = await listUnifiedWorkQueue(ctx, { sources: [src], limit: 5 });
  console.log(`  source=${src.padEnd(6)}      → total=${f.total} devueltos=${f.returned} truncado=${f.truncated}`);
}

console.log('\n=== ACCIONES NUEVAS (dry_run, no escribe) ===');
const inbox: any = await executeDesktopTool('whatspro_command_center_inbox', { kinds: ['chat'], limit: 1 }, actionCtx);
const chatItem = inbox.items?.[0];
if (!chatItem?.reply) {
  console.log('  (no hay ítem de chat en la bandeja para probar)');
} else {
  const chatId = chatItem.reply.chatId;
  const pruebas: Array<[string, any]> = [
    ['set-crm-stage', { type: 'set-crm-stage', chatId, funnelStageId: null }],
    ['change-contact-tags', { type: 'change-contact-tags', chatId, add: [1] }],
    ['assign-contact', { type: 'assign-contact', chatId, assignedUserId: m!.userId }],
    ['add-internal-note', { type: 'add-internal-note', chatId, text: 'prueba de humo', source: 'custom' }],
    ['create-task', { type: 'create-task', chatId, title: 'Prueba de humo' }],
  ];
  for (const [label, action] of pruebas) {
    const r: any = await executeDesktopTool('whatspro_command_center_execute', {
      actions: [{ item_id: chatItem.id, action }],
      batch_id: 'smoke-work-queue-0001',
      dry_run: true,
    }, actionCtx);
    const row = r.results[0];
    console.log(`  ${label.padEnd(20)} ok=${row.ok}${row.error ? ' error=' + row.error : ''}${row.message ? ' · ' + row.message : ''}`);
  }
}
process.exit(0);
