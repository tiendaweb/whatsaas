import type { MemberPermissions } from '@/lib/permissions';

/**
 * Qué permiso hace falta para LEER cada recurso del catálogo de sólo lectura.
 *
 * Este mapa nació dentro de App Maker y era el único lugar del repo donde la
 * pregunta "¿quién puede leer este recurso?" estaba contestada. El conector MCP
 * no lo consultaba: leía los 131 recursos —contabilidad, conversaciones,
 * permisos del equipo— con sólo tener el token. Escribir un segundo mapa para el
 * conector habría creado dos respuestas distintas a la misma pregunta, que es
 * exactamente cómo nace un agujero de permisos que nadie encuentra.
 *
 * Así que el mapa es uno solo y vive acá. App Maker y el conector lo comparten.
 *
 * Es FAIL-CLOSED: un recurso sin política no se lee. Cuando agregues un recurso
 * al catálogo, agregalo también acá — `scripts/verify-connector-tools.mts` falla
 * si te lo olvidás, para que el olvido no se manifieste como datos de más.
 */
export type ReadOnlyResourcePolicy = {
  permission: keyof Omit<MemberPermissions, 'chatVisibility'>;
  pluginId?: string;
};

const SETTINGS_RESOURCES = new Set([
  'team-members', 'users', 'activity-logs', 'invitations', 'legacy-api-keys',
  'read-only-api-tokens', 'webhook-events', 'menu-items',
]);
const CONTACT_RESOURCES = new Set([
  'instances', 'chats', 'messages', 'message-reactions', 'audio-insights',
  'chat-ai-summaries', 'contacts', 'tags',
  'contact-tags', 'departments', 'department-members', 'funnel-groups',
  'funnel-stages', 'funnel-group-members', 'custom-fields', 'bookmark-groups', 'bookmarks',
]);
const DRAFT_RESOURCES = new Set(['draft-categories', 'draft-tags', 'drafts', 'draft-tag-links']);
const TEMPLATE_RESOURCES = new Set(['quick-replies', 'waba-templates']);
const CAMPAIGN_RESOURCES = new Set(['campaigns', 'campaign-leads']);
const AUTOMATION_RESOURCES = new Set(['automation-folders', 'automations', 'automation-sessions', 'automation-templates']);
const AI_RESOURCES = new Set(['ai-config', 'ai-sessions', 'ai-tools']);

const PLUGIN_RESOURCE_POLICIES: Array<{
  keys: readonly string[];
  permission: keyof Omit<MemberPermissions, 'chatVisibility'>;
  pluginId?: string;
}> = [
  { keys: ['notes'], permission: 'notesRead', pluginId: 'notes' },
  { keys: ['calendar-events', 'event-participants'], permission: 'calendarRead', pluginId: 'calendar' },
  { keys: ['financial-entries', 'financial-accounts', 'financial-entry-payments', 'financial-receipts', 'cost-centers', 'budgets', 'exchange-rates', 'manual-payments', 'payment-audit-events'], permission: 'financeRead', pluginId: 'finance' },
  { keys: ['domains'], permission: 'domainsRead', pluginId: 'domains' },
  { keys: ['hostinger-accounts'], permission: 'hostingerRead', pluginId: 'hostinger' },
  { keys: ['sites', 'site-files'], permission: 'sitesRead', pluginId: 'sites' },
  { keys: ['article-types', 'article-custom-fields', 'article-attributes', 'articles', 'article-variations', 'article-plans'], permission: 'articlesRead', pluginId: 'articles' },
  { keys: ['sales'], permission: 'salesRead', pluginId: 'sales' },
  { keys: ['deals'], permission: 'dealsRead', pluginId: 'deals' },
  { keys: ['customers', 'customer-contacts', 'customer-stores', 'customer-transactions'], permission: 'customersRead', pluginId: 'customers' },
  { keys: ['membership-companies', 'membership-plans', 'membership-subscriptions', 'membership-reminder-rules'], permission: 'membershipsRead', pluginId: 'memberships' },
  { keys: ['aapp-connection', 'aapp-renewal-config', 'aapp-renewal-candidates'], permission: 'aappSpaceRead', pluginId: 'aapp-space' },
  { keys: ['task-workspaces', 'task-projects', 'task-columns', 'tasks', 'task-locations', 'task-relations', 'task-dependencies', 'task-media', 'task-templates', 'task-comments'], permission: 'tasksRead', pluginId: 'tasks' },
  { keys: ['scheduled-messages'], permission: 'scheduledMessagesRead', pluginId: 'scheduled-messages' },
  { keys: ['mini-app-installs', 'mini-app-records'], permission: 'miniAppsRead', pluginId: 'mini-apps' },
  { keys: ['forms', 'form-submissions'], permission: 'formBuilderRead', pluginId: 'form-builder' },
  { keys: ['social-accounts', 'social-posts', 'social-post-targets'], permission: 'socialPublisherRead', pluginId: 'social-publisher' },
  { keys: ['meta-token-status', 'meta-ad-accounts', 'meta-campaigns', 'meta-campaign-insights', 'meta-sync-runs'], permission: 'metaAdsRead', pluginId: 'meta-ads' },
  { keys: ['document-folders', 'documents', 'document-links', 'document-media'], permission: 'documentsRead', pluginId: 'documents' },
  // Agregados al catálogo después de que este mapa se escribiera. Sin política
  // quedaban invisibles para App Maker (fail-closed) y, a la vez, legibles sin
  // ningún permiso desde el conector: los dos extremos del mismo olvido.
  { keys: ['customer-notes'], permission: 'customersRead', pluginId: 'customers' },
  { keys: ['support-tickets', 'support-ticket-comments'], permission: 'supportRead', pluginId: 'support' },
  { keys: ['contracts'], permission: 'contractsRead', pluginId: 'contracts' },
  { keys: ['vendors', 'purchase-orders', 'purchase-order-items'], permission: 'purchasesRead', pluginId: 'purchases' },
  { keys: ['employee-profiles', 'commission-rules', 'sale-commissions'], permission: 'hrRead', pluginId: 'hr' },
  { keys: ['radar-widgets', 'radar-reports', 'radar-insights'], permission: 'intelligenceRead', pluginId: 'radar' },
  { keys: ['task-ai-runs'], permission: 'tasksRead', pluginId: 'tasks' },
  // Las apps de App Maker y sus registros: mismo permiso que las mini-apps, sin
  // exigir un plugin activo, porque el propio App Maker las lee para resolverse.
  { keys: ['app-maker-apps', 'app-maker-records', 'app-maker-record-links', 'app-maker-attachments'], permission: 'miniAppsRead' },
];

const policyMap = new Map<string, ReadOnlyResourcePolicy>();
for (const group of PLUGIN_RESOURCE_POLICIES) {
  for (const key of group.keys) policyMap.set(key, { permission: group.permission, pluginId: group.pluginId });
}
for (const key of SETTINGS_RESOURCES) policyMap.set(key, { permission: 'settings' });
for (const key of CONTACT_RESOURCES) policyMap.set(key, { permission: 'contacts' });
for (const key of DRAFT_RESOURCES) policyMap.set(key, { permission: 'drafts' });
for (const key of TEMPLATE_RESOURCES) policyMap.set(key, { permission: 'templates' });
for (const key of CAMPAIGN_RESOURCES) policyMap.set(key, { permission: 'campaigns' });
for (const key of AUTOMATION_RESOURCES) policyMap.set(key, { permission: 'automation' });
for (const key of AI_RESOURCES) policyMap.set(key, { permission: 'aiAgent' });

// Metadatos operativos: los puede leer cualquier miembro que tenga alguna app.
// Todo el resto tiene que estar asignado arriba; el fallback fail-closed evita
// que un recurso nuevo del catálogo se cuele sin el permiso de su producto.
for (const key of [
  'team', 'installed-plugins', 'member-plugins', 'feature-requests',
  'feature-request-votes', 'notifications', 'desktop-preferences',
  'marketplace-entitlements', 'marketplace-orders', 'marketplace-order-lines',
  'marketplace-order-events',
]) policyMap.set(key, { permission: 'miniAppsRead' });

export function readOnlyResourcePolicy(resource: string): ReadOnlyResourcePolicy | null {
  return policyMap.get(resource) ?? null;
}

/** Para el verificador: qué recursos tienen política declarada. */
export function policiedResourceKeys(): string[] {
  return [...policyMap.keys()];
}

