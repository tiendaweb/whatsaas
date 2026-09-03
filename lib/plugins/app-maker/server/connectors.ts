import 'server-only';

import {
  assertPermission,
  executeGrokAction,
  grokActionTools,
  type ActionPermission,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  executeGrokExtendedAction,
  grokExtendedActionTools,
} from '@/lib/plugins/grok-connector/server/extended-actions';
import {
  dealsActionTools,
  executeDealsAction,
} from '@/lib/plugins/grok-connector/server/deals-actions';
import type { AppActionDefinition } from '../shared/contract';
import type { AppMakerRecord, ApplicationDefinition } from '../shared/contract';
import {
  APP_MAKER_ACTION_POLICIES,
  APP_MAKER_ACTION_POLICY_MAP,
} from '../shared/connector-policies';
import { resolveAppMakerActionValues, type AppMakerBindingContext } from './bindings';
import {
  createAppMakerEntityRecord,
  deleteAppMakerEntityRecord,
  getAppMakerEntityRecord,
  linkAppMakerRecords,
  unlinkAppMakerRecords,
  updateAppMakerEntityRecord,
  type AppMakerDataContext,
} from './data-model';

type ConnectorContext = AppMakerDataContext;

const INTERNAL_ACTIONS = [
  {
    operation: 'appmaker_create_record',
    label: 'Crear registro de la aplicación',
    description: 'Crea un registro validado en una entidad propia de App Maker.',
    category: 'data',
    destructive: false,
  },
  {
    operation: 'appmaker_update_record',
    label: 'Actualizar registro de la aplicación',
    description: 'Actualiza campos editables usando control de versión opcional.',
    category: 'data',
    destructive: false,
  },
  {
    operation: 'appmaker_delete_record',
    label: 'Eliminar registro de la aplicación',
    description: 'Elimina un registro respetando las reglas de sus relaciones.',
    category: 'data',
    destructive: true,
  },
  {
    operation: 'appmaker_link_record',
    label: 'Vincular registros',
    description: 'Crea un vínculo validado entre un registro y otra entidad o recurso.',
    category: 'relations',
    destructive: false,
  },
  {
    operation: 'appmaker_unlink_record',
    label: 'Desvincular registros',
    description: 'Quita un vínculo sin eliminar los registros relacionados.',
    category: 'relations',
    destructive: true,
  },
] as const;

type AppMakerCatalogAction = {
  connector: string;
  operation: string;
  label: string;
  description: string;
  category: string;
  permissions: readonly string[];
  requiredPlugin: string | null;
  destructive: boolean;
  inputSchema: unknown;
};

type AppMakerConnectorCatalogItem = {
  key: string;
  label: string;
  capabilities: string[];
  operations: string[];
  actions: AppMakerCatalogAction[];
};

const actionToolMap = new Map(
  [...grokActionTools, ...grokExtendedActionTools, ...dealsActionTools].map((tool) => [tool.name, tool]),
);

function validateConnectorRegistry() {
  const missing = APP_MAKER_ACTION_POLICIES
    .map((policy) => policy.operation)
    .filter((operation) => !actionToolMap.has(operation));
  if (missing.length) throw new Error(`APP MAKER connector registry is out of sync: ${missing.join(', ')}`);
}

validateConnectorRegistry();

/**
 * Connector boundary used by the generic runtime. The renderer never imports
 * MCP implementations. New connectors register an executor here instead of
 * adding provider-specific branches to UI components.
 */
export async function executeAppMakerAction(input: {
  action: AppActionDefinition;
  values: Record<string, unknown>;
  context: ConnectorContext;
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  bindingContext?: Partial<AppMakerBindingContext>;
  runWorkflows?: boolean;
}) {
  const bindingContext: AppMakerBindingContext = {
    currentUser: { id: input.context.userId },
    team: { id: input.context.teamId },
    form: input.values,
    ...input.bindingContext,
  };
  const values = resolveAppMakerActionValues({
    defaults: input.action.inputDefaults,
    bindings: input.action.inputBindings,
    values: input.values,
    context: bindingContext,
  });

  if (input.action.connector === 'app-maker') {
    const entityKey = String(input.action.inputDefaults?.entityKey ?? input.action.inputDefaults?.entity ?? values.entityKey ?? values.entity ?? '');
    const recordId = Number(values.recordId ?? values.id);
    const reserved = new Set(['entityKey', 'entity', 'recordId', 'id', 'expectedVersion', 'relationKey', 'targetRecordId', 'metadata', 'data']);
    const data = values.data && typeof values.data === 'object' && !Array.isArray(values.data)
      ? values.data as Record<string, unknown>
      : Object.fromEntries(Object.entries(values).filter(([key]) => !reserved.has(key)));
    if (input.action.operation === 'appmaker_create_record') {
      const result = await createAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey, values: data, context: input.context });
      if (input.runWorkflows !== false) await runAppMakerWorkflows({ trigger: 'record-created', entityKey, app: input.app, definition: input.definition, context: input.context, row: result });
      return result;
    }
    if (!Number.isInteger(recordId) || recordId < 1) throw new Error('record_id_required');
    if (input.action.operation === 'appmaker_update_record') {
      const previous = await getAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey, recordId, context: input.context });
      const result = await updateAppMakerEntityRecord({
        app: input.app,
        definition: input.definition,
        entityKey,
        recordId,
        values: data,
        expectedVersion: values.expectedVersion === undefined ? undefined : Number(values.expectedVersion),
        context: input.context,
      });
      if (input.runWorkflows !== false) await runAppMakerWorkflows({ trigger: 'record-updated', entityKey, app: input.app, definition: input.definition, context: input.context, row: result, previous: previous ?? undefined });
      return result;
    }
    if (input.action.operation === 'appmaker_delete_record') {
      const previous = await getAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey, recordId, context: input.context });
      await deleteAppMakerEntityRecord({ app: input.app, definition: input.definition, entityKey, recordId, context: input.context });
      if (input.runWorkflows !== false) await runAppMakerWorkflows({ trigger: 'record-deleted', entityKey, app: input.app, definition: input.definition, context: input.context, previous: previous ?? undefined });
      return { deleted: true, recordId };
    }
    const relationKey = String(input.action.inputDefaults?.relationKey ?? values.relationKey ?? '');
    const targetRecordId = String(values.targetRecordId ?? '');
    if (!relationKey || !targetRecordId) throw new Error('relation_target_required');
    if (input.action.operation === 'appmaker_link_record') {
      return linkAppMakerRecords({ app: input.app, definition: input.definition, relationKey, sourceRecordId: recordId, targetRecordId, metadata: values.metadata as Record<string, unknown> | undefined, context: input.context });
    }
    if (input.action.operation === 'appmaker_unlink_record') {
      return { unlinked: await unlinkAppMakerRecords({ app: input.app, definition: input.definition, relationKey, sourceRecordId: recordId, targetRecordId, context: input.context }) };
    }
    throw new Error('operation_not_allowed');
  }

  if (input.action.connector !== 'whatspro') throw new Error('connector_not_available');
  const policy = APP_MAKER_ACTION_POLICY_MAP.get(input.action.operation);
  if (!policy) throw new Error('operation_not_allowed');

  // delete_record chooses the exact permission from the validated target
  // resource. Every fixed-permission operation is checked here as well as in
  // the underlying executor so permission drift fails closed at both layers.
  if (!policy.destructive) {
    for (const permission of policy.permissions) {
      await assertPermission(input.context, permission as ActionPermission, policy.pluginId);
    }
  }

  if (policy.executor === 'core') {
    return executeGrokAction(input.action.operation, values, input.context);
  }
  if (policy.executor === 'extended') {
    return executeGrokExtendedAction(input.action.operation, values, input.context);
  }
  if (policy.executor === 'deals') {
    return executeDealsAction(input.action.operation, values, input.context);
  }
  throw new Error('operation_not_allowed');
}

export async function runAppMakerWorkflows(input: {
  trigger: 'manual' | 'record-created' | 'record-updated' | 'record-deleted';
  entityKey?: string;
  app: AppMakerRecord;
  definition: ApplicationDefinition;
  context: ConnectorContext;
  row?: Record<string, unknown>;
  previous?: Record<string, unknown>;
  workflowKey?: string;
}) {
  const workflows = input.definition.workflows.filter((workflow) => workflow.enabled
    && workflow.trigger.type === input.trigger
    && (!input.workflowKey || workflow.key === input.workflowKey)
    && (input.trigger === 'manual' || workflow.trigger.entity === input.entityKey));
  const results: Array<{ workflow: string; steps: Array<{ action: string; success: boolean; result?: unknown; error?: string }> }> = [];
  for (const workflow of workflows) {
    const steps: Array<{ action: string; success: boolean; result?: unknown; error?: string }> = [];
    let actionResult: Record<string, unknown> | undefined;
    for (const step of workflow.steps) {
      const action = input.definition.actions.find((candidate) => candidate.key === step.action);
      if (!action) continue;
      try {
        const result = await executeAppMakerAction({
          action: { ...action, inputBindings: { ...(action.inputBindings ?? {}), ...(step.inputBindings ?? {}) } },
          values: {},
          app: input.app,
          definition: input.definition,
          context: input.context,
          bindingContext: { row: input.row, selected: input.previous, actionResult },
          runWorkflows: false,
        });
        actionResult = result && typeof result === 'object' ? result as Record<string, unknown> : { value: result };
        steps.push({ action: action.key, success: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'workflow_step_failed';
        steps.push({ action: action.key, success: false, error: message });
        if (!step.continueOnError) break;
      }
    }
    results.push({ workflow: workflow.key, steps });
  }
  return results;
}

export function appMakerConnectorCatalog(): AppMakerConnectorCatalogItem[] {
  const actions: AppMakerCatalogAction[] = APP_MAKER_ACTION_POLICIES.map((policy) => {
    const tool = actionToolMap.get(policy.operation)!;
    return {
      connector: 'whatspro',
      operation: policy.operation,
      label: tool.description.split('.')[0] || policy.operation,
      description: tool.description,
      category: policy.category,
      permissions: policy.permissions,
      requiredPlugin: policy.pluginId ?? null,
      destructive: policy.destructive ?? false,
      inputSchema: tool.inputSchema,
    };
  });
  return [{
    key: 'whatspro',
    label: 'WhatsPro',
    capabilities: [...new Set(APP_MAKER_ACTION_POLICIES.map((policy) => policy.category))] as string[],
    operations: actions.map((action) => action.operation),
    actions,
  }, {
    key: 'app-maker',
    label: 'Datos de la aplicación',
    capabilities: ['data', 'relations', 'attachments', 'workflows', 'audit'],
    operations: INTERNAL_ACTIONS.map((action) => action.operation),
    actions: INTERNAL_ACTIONS.map((action) => ({
      connector: 'app-maker',
      ...action,
      permissions: ['miniAppsWrite'],
      requiredPlugin: null,
      inputSchema: { type: 'object', additionalProperties: true },
    })),
  }];
}

export function appMakerActionCatalog() {
  return appMakerConnectorCatalog().flatMap((connector): AppMakerCatalogAction[] => connector.actions);
}
