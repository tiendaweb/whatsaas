/**
 * Declarative allow-list for operations that APP MAKER may execute.
 *
 * Keep this file free of server imports: the application schema also uses it
 * to reject definitions that reference an unknown connector operation before
 * they can be saved or published.
 */
// `deals` es su propio ejecutor porque las tools de Oportunidades viven en un
// módulo aparte: sin esto el despacho caería en `extended`, que no las conoce, y
// fallaría recién en runtime.
export type AppMakerActionExecutor = 'core' | 'extended' | 'deals';

export type AppMakerActionPolicy = {
  operation: string;
  executor: AppMakerActionExecutor;
  category: 'crm' | 'customers' | 'memberships' | 'tasks' | 'documents' | 'communication' | 'notes' | 'calendar';
  permissions: readonly string[];
  pluginId?: string;
  destructive?: boolean;
};

const core = (
  operation: string,
  category: AppMakerActionPolicy['category'],
  permissions: readonly string[],
  pluginId?: string,
): AppMakerActionPolicy => ({ operation, executor: 'core', category, permissions, pluginId });

const extended = (
  operation: string,
  category: AppMakerActionPolicy['category'],
  permissions: readonly string[],
  pluginId?: string,
  destructive = false,
): AppMakerActionPolicy => ({ operation, executor: 'extended', category, permissions, pluginId, destructive });

const deals = (
  operation: string,
  permissions: readonly string[],
  destructive = false,
): AppMakerActionPolicy => ({ operation, executor: 'deals', category: 'crm', permissions, pluginId: 'deals', destructive });

export const APP_MAKER_ACTION_POLICIES = [
  core('whatspro_save_contact', 'crm', ['contacts']),
  core('whatspro_change_crm_stage', 'crm', ['contacts']),
  core('whatspro_set_custom_fields', 'crm', ['contacts']),
  core('whatspro_assign_to_agenda', 'crm', ['contacts']),
  core('whatspro_add_internal_note', 'crm', ['contacts']),
  core('whatspro_add_contact_note', 'crm', ['contacts']),
  core('whatspro_create_note', 'notes', ['notesWrite'], 'notes'),
  core('whatspro_register_customer', 'customers', ['customersWrite'], 'customers'),
  core('whatspro_register_membership', 'memberships', ['membershipsWrite'], 'memberships'),

  extended('whatspro_manage_crm_stage_group', 'crm', ['contacts']),
  extended('whatspro_manage_crm_stage', 'crm', ['contacts']),
  extended('whatspro_manage_tag', 'crm', ['contacts']),
  extended('whatspro_manage_department', 'crm', ['contacts']),
  extended('whatspro_manage_department_member', 'crm', ['contacts']),
  extended('whatspro_set_contact_tags', 'crm', ['contacts']),
  extended('whatspro_manage_agenda', 'crm', ['contacts']),
  extended('whatspro_manage_agenda_contact', 'crm', ['contacts']),
  extended('whatspro_manage_custom_field', 'crm', ['contacts']),
  extended('whatspro_manage_membership_plan', 'memberships', ['membershipsWrite'], 'memberships'),
  extended('whatspro_update_membership', 'memberships', ['membershipsWrite'], 'memberships'),
  extended('whatspro_create_task_project', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_manage_task_column', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_manage_task', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_create_contact_task', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_manage_task_workspace', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_manage_task_project', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_manage_task_relation', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_share_task', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_link_customer_task', 'tasks', ['tasksWrite'], 'tasks'),
  extended('whatspro_manage_document_folder', 'documents', ['documentsWrite'], 'documents'),
  extended('whatspro_manage_document', 'documents', ['documentsWrite'], 'documents'),
  extended('whatspro_manage_scheduled_message', 'communication', ['scheduledMessagesWrite'], 'scheduled-messages'),
  extended('whatspro_manage_note', 'notes', ['notesWrite'], 'notes'),
  extended('whatspro_manage_calendar_event', 'calendar', ['calendarWrite'], 'calendar'),
  // Oportunidades. `deals_close` y `convert_lead` piden DOS permisos porque
  // tocan dos apps: una app de App Maker con sólo `dealsWrite` no puede facturar
  // ni crear clientes de rebote.
  deals('whatspro_manage_deal', ['dealsWrite'], true),
  deals('whatspro_deals_move', ['dealsWrite']),
  deals('whatspro_deals_close', ['dealsWrite', 'salesWrite']),
  deals('whatspro_convert_lead', ['dealsWrite', 'customersWrite']),
  deals('whatspro_link_deal_contact', ['dealsWrite']),
  // The target resource determines the exact permission. The extended executor
  // performs that resource-specific check after validating the input.
  extended(
    'whatspro_delete_record',
    'tasks',
    ['contacts', 'membershipsWrite', 'tasksWrite', 'documentsWrite', 'scheduledMessagesWrite', 'notesWrite', 'calendarWrite', 'dealsWrite'],
    undefined,
    true,
  ),
] as const satisfies readonly AppMakerActionPolicy[];

export const APP_MAKER_ACTION_POLICY_MAP = new Map(
  APP_MAKER_ACTION_POLICIES.map((policy) => [policy.operation, policy]),
);

export const APP_MAKER_CONNECTOR_KEYS = ['whatspro', 'app-maker'] as const;
