/**
 * Prueba de humo de las 50 tools de la tanda 2026-09-03, CONTRA LA BASE.
 * Lecturas reales + escrituras sólo en dry_run. No modifica nada.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-new-tools-2026-09-03.mts
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { executeSalesOpsTool } from '@/lib/plugins/grok-connector/server/sales-ops-actions';
import { executeChatTool } from '@/lib/plugins/grok-connector/server/chat-actions';
import { executeSettingsTool } from '@/lib/plugins/grok-connector/server/settings-actions';
import { executeFinanceTool } from '@/lib/plugins/grok-connector/server/finance-actions';
import { executeMembershipsTool } from '@/lib/plugins/grok-connector/server/memberships-actions';
import { executeDesktopTool } from '@/lib/plugins/grok-connector/server/desktop-actions';
import { executeTasksTool } from '@/lib/plugins/grok-connector/server/tasks-actions';
import { executeContentTool } from '@/lib/plugins/grok-connector/server/content-actions';

const TEAM = 2;
const [m] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, TEAM)).limit(1);
const ctx = { teamId: TEAM, userId: m!.userId };
let ok = 0, fail = 0;
async function run(label: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    const t = JSON.stringify(out) ?? '';
    ok++; console.log(`  ✓ ${label.padEnd(38)} ${t.slice(0, 110)}${t.length > 110 ? '…' : ''}`);
  } catch (e) { fail++; console.log(`  ✗ ${label.padEnd(38)} ${(e as Error).message.slice(0, 140)}`); }
}
const s = (n: string, i: Record<string, unknown> = {}) => () => executeSalesOpsTool(`whatspro_${n}`, i, ctx);
const c = (n: string, i: Record<string, unknown> = {}) => () => executeChatTool(`whatspro_${n}`, i, ctx);
const st = (n: string, i: Record<string, unknown> = {}) => () => executeSettingsTool(`whatspro_${n}`, i, ctx);
const f = (n: string, i: Record<string, unknown> = {}) => () => executeFinanceTool(`whatspro_${n}`, i, ctx);
const mb = (n: string, i: Record<string, unknown> = {}) => () => executeMembershipsTool(`whatspro_${n}`, i, ctx);
const d = (n: string, i: Record<string, unknown> = {}) => () => executeDesktopTool(`whatspro_${n}`, i, ctx);
const tk = (n: string, i: Record<string, unknown> = {}) => () => executeTasksTool(`whatspro_${n}`, i, ctx);
const co = (n: string, i: Record<string, unknown> = {}) => () => executeContentTool(`whatspro_${n}`, i, ctx);

console.log('\n── Comercial (lecturas + dry_run) ──');
await run('sales_overview', s('sales_overview'));
await run('sales_metrics', s('sales_metrics'));
await run('sales_settings get', s('sales_settings', { action: 'get' }));
await run('sales_exclusions dry_run', s('sales_exclusions', { action: 'exclude', chat_ids: [1], kind: 'manual', dry_run: true }));
await run('sales_signal_mark dry_run', s('sales_signal_mark', { signal_ids: [1], status: 'seen', dry_run: true }));

console.log('\n── Ajustes y conversaciones ──');
await run('quick_replies_list', st('quick_replies_list'));
await run('instances_status', st('instances_status'));
await run('ai_config get', st('ai_config', { action: 'get' }));
await run('ai_builtin_tools list', st('ai_builtin_tools', { action: 'list' }));
await run('notification_prefs get', st('notification_prefs', { action: 'get' }));
await run('chat_mark_read (id inexistente)', c('chat_mark_read', { chat_ids: [999999999] }));

console.log('\n── Finanzas y membresías ──');
await run('finance_os_resumen', f('finance_os_resumen'));
await run('finance_budgets_list', f('finance_budgets_list'));
await run('manage_budget dry_run', f('manage_budget', { action: 'create', name: 'SMOKE', amount: 1, currency: 'ARS', period: 'monthly', idempotency_key: 'smoke-budget-0001', dry_run: true }));
await run('membership_cancel dry_run', mb('membership_cancel', { subscription_id: 105, reason: 'prueba de humo', confirm: true, dry_run: true }));

console.log('\n── Escritorio y tareas ──');
await run('desktop_search', d('desktop_search', { query: 'martin' }));
await run('desktop_activity', d('desktop_activity', { limit: 3 }));
await run('revenue_trend', d('revenue_trend', { months: 3 }));
await run('crm_stats', d('crm_stats'));

console.log('\n── Contenido ──');
await run('manage_draft dry (delete inexistente)', co('manage_draft', { action: 'delete', draft_id: 999999999, confirm: true }));

console.log(`\n${ok} ok · ${fail} con error`);
process.exit(0);
