import 'server-only';

import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { automationRequiresManualReview } from '@/lib/automation/ai-draft';
import {
  AUTOMATION_EDGE_STYLE_VARIANTS,
  AUTOMATION_FLOW_NODE_TYPES,
  automationNodeDataSchemaByType,
  type AutomationFlowChannel,
  type AutomationFlowEdge,
  type AutomationFlowNode,
  type AutomationFlowNodeType,
  validateAutomationFlow,
} from '@/lib/automation/flow-schema';
import { prepareAutomationFlowForSave } from '@/lib/automation/flow-normalizer';
import {
  AUTOMATION_NODE_CATALOG,
  createAutomationCanvasNode,
  mergeAutomationNodeDataWithDefaults,
} from '@/lib/automation/node-catalog';
import { db } from '@/lib/db/drizzle';
import { automationFolders, automations, evolutionInstances } from '@/lib/db/schema';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

type OwnedAutomation = typeof automations.$inferSelect & {
  instance: Pick<typeof evolutionInstances.$inferSelect, 'id' | 'instanceName' | 'integration'> | null;
};

type FlowAnalysis = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  unreachable_node_ids: string[];
  dead_end_node_ids: string[];
  missing_branch_handles: Array<{ node_id: string; handles: string[] }>;
  contact_variables: {
    produced: string[];
    referenced: string[];
    referenced_before_capture: string[];
  };
};

const automationId = { type: 'integer', minimum: 1, description: 'ID del flujo, obtenido desde automations.' };
const expectedUpdatedAt = {
  type: 'string',
  format: 'date-time',
  description: 'updated_at exacto devuelto por la lectura/inspección más reciente. Evita sobrescribir cambios concurrentes.',
};
const nodeTypeSchema = { type: 'string', enum: [...AUTOMATION_FLOW_NODE_TYPES] };
const positionSchema = {
  type: 'object',
  required: ['x', 'y'],
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  additionalProperties: false,
};
const edgeProperties = {
  edge_id: { type: 'string', minLength: 1, maxLength: 180 },
  source: { type: 'string', minLength: 1, maxLength: 180 },
  target: { type: 'string', minLength: 1, maxLength: 180 },
  source_handle: { type: ['string', 'null'], maxLength: 180 },
  target_handle: { type: ['string', 'null'], maxLength: 180 },
  style_variant: { type: 'string', enum: [...AUTOMATION_EDGE_STYLE_VARIANTS] },
};

export const automationReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_automation_guide',
    description: 'Devuelve el contrato operativo de automatizaciones: carpetas, nodos, propiedades, conexiones, variables y cómo save_contact crea o actualiza contactos. Consúltalo antes de diseñar o modificar un flujo.',
    inputSchema: {
      type: 'object',
      properties: { node_type: nodeTypeSchema },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_inspect_automation',
    description: 'Inspecciona y audita un flujo del equipo. Devuelve versión, canal, grafo, errores, nodos inaccesibles, salidas incompletas y variables de contacto para poder optimizarlo.',
    inputSchema: {
      type: 'object',
      required: ['automation_id'],
      properties: { automation_id: automationId },
      additionalProperties: false,
    },
  },
];

export const automationActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_automation_folder',
    description: 'Crea, edita, mueve o elimina una carpeta de automatizaciones. Al eliminar, mueve de forma segura los flujos y subcarpetas a la carpeta padre.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        folder_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        parent_id: { type: ['integer', 'null'], minimum: 1 },
        color: { type: 'string', minLength: 1, maxLength: 20 },
        position: { type: 'integer', minimum: 0 },
        expected_updated_at: expectedUpdatedAt,
        confirm: { type: 'boolean', description: 'Debe ser true para eliminar.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_automation',
    description: 'Crea, edita, mueve, activa, desactiva o elimina un flujo. Para crear con contenido, envía nodes y edges juntos; para optimizar un grafo existente usa whatspro_replace_automation_flow.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        automation_id: automationId,
        name: { type: 'string', minLength: 1, maxLength: 255 },
        instance_id: { type: ['integer', 'null'], minimum: 1 },
        folder_id: { type: ['integer', 'null'], minimum: 1 },
        trigger_keyword: { type: ['string', 'null'], maxLength: 100 },
        note: { type: ['string', 'null'], maxLength: 20000 },
        is_active: { type: 'boolean' },
        nodes: { type: 'array', maxItems: 500, items: { type: 'object' } },
        edges: { type: 'array', maxItems: 1000, items: { type: 'object' } },
        expected_updated_at: expectedUpdatedAt,
        confirm: { type: 'boolean', description: 'Debe ser true para eliminar.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_replace_automation_flow',
    description: 'Valida o reemplaza de forma atómica todo el grafo de un flujo. Es la herramienta recomendada para crear u optimizar varios nodos y conexiones en una sola operación segura.',
    inputSchema: {
      type: 'object',
      required: ['automation_id', 'mode', 'nodes', 'edges'],
      properties: {
        automation_id: automationId,
        mode: { type: 'string', enum: ['validate', 'save'] },
        nodes: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object' } },
        edges: { type: 'array', maxItems: 1000, items: { type: 'object' } },
        expected_updated_at: expectedUpdatedAt,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_automation_node',
    description: 'Agrega, edita o elimina un nodo dentro de un flujo existente, aplica defaults del catálogo y valida todo el grafo antes de guardar.',
    inputSchema: {
      type: 'object',
      required: ['action', 'automation_id', 'expected_updated_at'],
      properties: {
        action: { type: 'string', enum: ['add', 'update', 'delete'] },
        automation_id: automationId,
        expected_updated_at: expectedUpdatedAt,
        node_id: { type: 'string', minLength: 1, maxLength: 180 },
        node_type: nodeTypeSchema,
        position: positionSchema,
        data: { type: 'object', additionalProperties: true },
        replace_data: { type: 'boolean', default: false },
        confirm: { type: 'boolean', description: 'Debe ser true para eliminar el nodo y sus conexiones.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_automation_edge',
    description: 'Agrega, edita o elimina una conexión entre nodos y valida handles, referencias y compatibilidad antes de guardar.',
    inputSchema: {
      type: 'object',
      required: ['action', 'automation_id', 'expected_updated_at'],
      properties: {
        action: { type: 'string', enum: ['add', 'update', 'delete'] },
        automation_id: automationId,
        expected_updated_at: expectedUpdatedAt,
        ...edgeProperties,
        confirm: { type: 'boolean', description: 'Debe ser true para eliminar.' },
      },
      additionalProperties: false,
    },
  },
];

const guideSchema = z.object({ node_type: z.enum(AUTOMATION_FLOW_NODE_TYPES).optional() }).strict();
const inspectSchema = z.object({ automation_id: z.number().int().positive() }).strict();
const folderSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  folder_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  color: z.string().trim().min(1).max(20).optional(),
  position: z.number().int().min(0).optional(),
  expected_updated_at: z.string().datetime().optional(),
  confirm: z.boolean().optional(),
}).strict();
const flowNodeInputSchema = z.object({
  id: z.string().min(1),
  type: z.enum(AUTOMATION_FLOW_NODE_TYPES),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  data: z.record(z.string(), z.unknown()),
}).passthrough();
const flowEdgeInputSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  styleVariant: z.enum(AUTOMATION_EDGE_STYLE_VARIANTS).optional(),
}).passthrough();
const flowArrays = {
  nodes: z.array(flowNodeInputSchema).max(500),
  edges: z.array(flowEdgeInputSchema).max(1000),
};
const automationSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  automation_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  instance_id: z.number().int().positive().nullable().optional(),
  folder_id: z.number().int().positive().nullable().optional(),
  trigger_keyword: z.string().trim().max(100).nullable().optional(),
  note: z.string().max(20000).nullable().optional(),
  is_active: z.boolean().optional(),
  nodes: flowArrays.nodes.optional(),
  edges: flowArrays.edges.optional(),
  expected_updated_at: z.string().datetime().optional(),
  confirm: z.boolean().optional(),
}).strict();
const replaceFlowSchema = z.object({
  automation_id: z.number().int().positive(),
  mode: z.enum(['validate', 'save']),
  nodes: flowArrays.nodes.min(1),
  edges: flowArrays.edges,
  expected_updated_at: z.string().datetime().optional(),
}).strict();
const nodeSchema = z.object({
  action: z.enum(['add', 'update', 'delete']),
  automation_id: z.number().int().positive(),
  expected_updated_at: z.string().datetime(),
  node_id: z.string().trim().min(1).max(180).optional(),
  node_type: z.enum(AUTOMATION_FLOW_NODE_TYPES).optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  replace_data: z.boolean().default(false),
  confirm: z.boolean().optional(),
}).strict();
const edgeSchema = z.object({
  action: z.enum(['add', 'update', 'delete']),
  automation_id: z.number().int().positive(),
  expected_updated_at: z.string().datetime(),
  edge_id: z.string().trim().min(1).max(180).optional(),
  source: z.string().trim().min(1).max(180).optional(),
  target: z.string().trim().min(1).max(180).optional(),
  source_handle: z.string().trim().max(180).nullable().optional(),
  target_handle: z.string().trim().max(180).nullable().optional(),
  style_variant: z.enum(AUTOMATION_EDGE_STYLE_VARIANTS).optional(),
  confirm: z.boolean().optional(),
}).strict();

function dateVersion(value: string | undefined, required = true) {
  if (!value) {
    if (required) throw new Error('expected_updated_at is required. Inspect the automation immediately before writing.');
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid expected_updated_at.');
  return parsed;
}

function asNodes(value: unknown): AutomationFlowNode[] {
  return Array.isArray(value) ? value as AutomationFlowNode[] : [];
}

function asEdges(value: unknown): AutomationFlowEdge[] {
  return Array.isArray(value) ? value as AutomationFlowEdge[] : [];
}

function channelFromIntegration(integration: string | null | undefined): AutomationFlowChannel {
  return integration === 'WHATSAPP-BUSINESS' ? 'api' : 'qr';
}

async function ownedAutomation(context: GrokActionContext, id: number): Promise<OwnedAutomation> {
  const record = await db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.teamId, context.teamId)),
    with: { instance: { columns: { id: true, instanceName: true, integration: true } } },
  });
  if (!record) throw new Error('Automation not found.');
  return record as OwnedAutomation;
}

async function ownedFolder(context: GrokActionContext, id: number) {
  const folder = await db.query.automationFolders.findFirst({
    where: and(eq(automationFolders.id, id), eq(automationFolders.teamId, context.teamId)),
  });
  if (!folder) throw new Error('Automation folder not found.');
  return folder;
}

async function ownedInstance(context: GrokActionContext, id: number) {
  const instance = await db.query.evolutionInstances.findFirst({
    where: and(eq(evolutionInstances.id, id), eq(evolutionInstances.teamId, context.teamId)),
    columns: { id: true, instanceName: true, integration: true },
  });
  if (!instance) throw new Error('WhatsApp instance not found.');
  return instance;
}

async function folderPath(teamId: number, folderId: number | null) {
  if (!folderId) return [];
  const folders = await db.query.automationFolders.findMany({
    where: eq(automationFolders.teamId, teamId),
    columns: { id: true, parentId: true, name: true },
  });
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: Array<{ id: number; name: string }> = [];
  const seen = new Set<number>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function expectedHandles(node: AutomationFlowNode): string[] {
  if (node.type === 'options') return node.data.options.map((_, index) => `option-${index}`);
  if (node.type === 'button_message') return node.data.buttons.map((button) => `btn-${button.id}`);
  if (node.type === 'list_message') return node.data.items.map((item) => `list-${item.id}`);
  if (node.type === 'condition') return [...node.data.conditions.map((condition) => condition.id), 'fallback'];
  if (node.type === 'menu_simple') return [...node.data.menuOptions.map((option) => `menu-${option.id}`), 'fallback'];
  return [];
}

function templateVariables(value: unknown) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
}

export function analyzeAutomationFlow(
  nodes: AutomationFlowNode[],
  edges: AutomationFlowEdge[],
  channel?: AutomationFlowChannel,
): FlowAnalysis {
  const validation = validateAutomationFlow({ nodes, edges }, { channel, requireSingleStart: true });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, AutomationFlowEdge[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  const start = nodes.find((node) => node.type === 'start');
  const reachable = new Set<string>();
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const edge of outgoing.get(id) ?? []) if (nodeIds.has(edge.target)) queue.push(edge.target);
  }

  const missingBranchHandles = nodes.flatMap((node) => {
    const required = expectedHandles(node);
    if (!required.length) return [];
    const present = new Set((outgoing.get(node.id) ?? []).map((edge) => edge.sourceHandle).filter(Boolean));
    const missing = required.filter((handle) => !present.has(handle));
    return missing.length ? [{ node_id: node.id, handles: missing }] : [];
  });
  const nonTerminal = new Set<AutomationFlowNodeType>([
    'start', 'message', 'media', 'options', 'delay', 'collect', 'form', 'save_contact',
    'button_message', 'list_message', 'call_to_action', 'ai_control', 'condition', 'menu_simple',
  ]);
  const deadEnds = nodes
    .filter((node) => nonTerminal.has(node.type) && !(outgoing.get(node.id)?.length))
    .map((node) => node.id);

  const produced = new Set<string>();
  const referenced = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'collect' && node.data.variable) produced.add(node.data.variable);
    if (node.type === 'form') for (const field of node.data.fields) produced.add(field.variable);
    if (node.type === 'menu_simple' && node.data.variable) produced.add(node.data.variable);
    if (node.type === 'save_contact') {
      for (const variable of templateVariables(node.data.nameVariable)) referenced.add(variable);
      for (const template of Object.values(node.data.customFields ?? {})) {
        for (const variable of templateVariables(template)) referenced.add(variable);
      }
    }
  }
  const warnings: string[] = [];
  if (missingBranchHandles.length) warnings.push('Hay ramas interactivas sin conexión; revisa missing_branch_handles.');
  if (deadEnds.length) warnings.push('Hay nodos ejecutables sin salida; revisa dead_end_node_ids.');
  const missingVariables = [...referenced].filter((variable) => !produced.has(variable));
  if (missingVariables.length) warnings.push('save_contact referencia variables que el flujo no captura.');

  return {
    valid: validation.success,
    errors: validation.success ? [] : validation.errors,
    warnings,
    unreachable_node_ids: nodes.filter((node) => node.type !== 'sticky_note' && !reachable.has(node.id)).map((node) => node.id),
    dead_end_node_ids: deadEnds,
    missing_branch_handles: missingBranchHandles,
    contact_variables: {
      produced: [...produced].sort(),
      referenced: [...referenced].sort(),
      referenced_before_capture: missingVariables.sort(),
    },
  };
}

function guide(nodeType?: AutomationFlowNodeType) {
  const entries = AUTOMATION_NODE_CATALOG.filter((entry) => !nodeType || entry.type === nodeType);
  return {
    object: 'automation_guide',
    storage_model: {
      folders: 'automation_folders: árbol por parent_id; los flujos apuntan a folder_id.',
      flows: 'automations: metadatos + nodes JSON + edges JSON + updated_at para control de concurrencia.',
      nodes: '{ id único, type, position: {x,y}, data: propiedades validadas según type }',
      edges: '{ id único, source, target, sourceHandle?, targetHandle?, styleVariant? }',
      channels: { qr: 'WhatsApp Web/QR', api: 'WhatsApp Business API' },
    },
    safe_workflow: [
      'Lee automation-folders/automations o usa whatspro_inspect_automation.',
      'Conserva el updated_at retornado y úsalo como expected_updated_at.',
      'Consulta esta guía, construye el grafo y ejecuta whatspro_replace_automation_flow en mode=validate.',
      'Corrige errores/advertencias y ejecuta mode=save con la versión más reciente.',
      'Activa el flujo explícitamente con whatspro_manage_automation; nunca se activa por defecto.',
    ],
    runtime: {
      variables: 'collect, form y menu_simple guardan variables; se interpolan con {{variable_name}}.',
      branches: {
        options: 'sourceHandle option-{índice base 0}',
        button_message: 'sourceHandle btn-{button.id}',
        list_message: 'sourceHandle list-{item.id}',
        condition: 'sourceHandle condition.id y fallback',
        menu_simple: 'sourceHandle menu-{option.id} y fallback',
      },
      save_contact: {
        lookup: 'Busca el contacto por chat_id + team_id; si existe actualiza y si no existe crea uno.',
        nameVariable: 'Es una plantilla, por ejemplo {{nombre}}.',
        customFields: 'Mapa { clave_del_campo: plantilla }. La clave debe existir en custom-fields. Fusiona con customData existente; no lo reemplaza.',
        assignments: 'agentId, departmentId, funnelStageId y tagId deben ser IDs del mismo equipo. La etiqueta se agrega de forma idempotente.',
        empty_values: 'Las variables vacías/no disponibles se omiten. Boolean acepta true/1/si/sí/s y false/0/no/n.',
        direct_management: 'Fuera del flujo usa whatspro_save_contact, whatspro_set_custom_fields, whatspro_change_crm_stage y las demás acciones CRM.',
      },
    },
    node_catalog: entries.map((entry) => ({
      type: entry.type,
      category: entry.category,
      channels: entry.channels,
      description: entry.aiDescription,
      defaults: entry.defaults,
      editable_fields: entry.editableFields,
      connection_rules: entry.connectionRules,
      examples: entry.aiExamples,
      data_json_schema: z.toJSONSchema(automationNodeDataSchemaByType[entry.type]),
    })),
  };
}

async function inspect(context: GrokActionContext, id: number) {
  const record = await ownedAutomation(context, id);
  const nodes = asNodes(record.nodes);
  const edges = asEdges(record.edges);
  const channel = record.instance ? channelFromIntegration(record.instance.integration) : null;
  return {
    object: 'automation_inspection',
    data: {
      id: record.id,
      name: record.name,
      folder_id: record.folderId,
      folder_path: await folderPath(context.teamId, record.folderId),
      instance: record.instance ? { id: record.instance.id, name: record.instance.instanceName, channel } : null,
      trigger_keyword: record.triggerKeyword,
      note: record.note,
      is_active: record.isActive,
      updated_at: record.updatedAt.toISOString(),
      nodes,
      edges,
    },
    analysis: analyzeAutomationFlow(nodes, edges, channel ?? undefined),
  };
}

async function assertFolderParent(context: GrokActionContext, folderId: number | undefined, parentId: number | null | undefined) {
  if (parentId == null) return;
  if (folderId === parentId) throw new Error('A folder cannot be its own parent.');
  await ownedFolder(context, parentId);
  if (!folderId) return;
  const folders = await db.query.automationFolders.findMany({
    where: eq(automationFolders.teamId, context.teamId),
    columns: { id: true, parentId: true },
  });
  const byId = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const seen = new Set<number>();
  let cursor: number | null | undefined = parentId;
  while (cursor != null && !seen.has(cursor)) {
    if (cursor === folderId) throw new Error('Moving this folder would create a cycle.');
    seen.add(cursor);
    cursor = byId.get(cursor);
  }
}

async function validateFlowForAutomation(record: OwnedAutomation, nodes: unknown[], edges: unknown[]) {
  const prepared = prepareAutomationFlowForSave({
    nodes: nodes as AutomationFlowNode[],
    edges: edges as AutomationFlowEdge[],
  });
  if (!prepared.success) throw new Error(`Invalid automation flow: ${prepared.errors.join('; ')}`);
  const channel = record.instance ? channelFromIntegration(record.instance.integration) : undefined;
  const channelValidation = validateAutomationFlow(
    { nodes: prepared.nodes, edges: prepared.edges },
    { channel, requireSingleStart: true },
  );
  if (!channelValidation.success) throw new Error(`Invalid automation flow: ${channelValidation.errors.join('; ')}`);
  return {
    nodes: channelValidation.data.nodes,
    edges: channelValidation.data.edges,
    warnings: prepared.warnings.map((warning) => warning.message),
    analysis: analyzeAutomationFlow(channelValidation.data.nodes, channelValidation.data.edges, channel),
  };
}

async function saveFlow(
  context: GrokActionContext,
  record: OwnedAutomation,
  nodes: unknown[],
  edges: unknown[],
  expected: string,
) {
  const validated = await validateFlowForAutomation(record, nodes, edges);
  const expectedVersion = dateVersion(expected)!;
  const updatedAt = new Date();
  const updated = await db.update(automations).set({
    nodes: validated.nodes,
    edges: validated.edges,
    isActive: automationRequiresManualReview(validated.nodes) ? false : record.isActive,
    updatedAt,
  }).where(and(
    eq(automations.id, record.id),
    eq(automations.teamId, context.teamId),
    eq(automations.updatedAt, expectedVersion),
  )).returning({ id: automations.id, updatedAt: automations.updatedAt, isActive: automations.isActive });
  if (!updated.length) throw new Error('AUTOMATION_VERSION_CONFLICT: inspect the automation again before retrying.');
  await audit(context, 'connector.automation.flow.updated', record.id);
  return {
    success: true,
    automation_id: record.id,
    updated_at: updated[0].updatedAt.toISOString(),
    is_active: updated[0].isActive,
    warnings: validated.warnings,
    analysis: validated.analysis,
    nodes: validated.nodes,
    edges: validated.edges,
  };
}

async function manageFolder(input: Record<string, unknown>, context: GrokActionContext) {
  const value = parse(folderSchema, input);
  await assertPermission(context, 'automation');
  if (value.action === 'create') {
    if (!value.name) throw new Error('name is required for create.');
    await assertFolderParent(context, undefined, value.parent_id);
    const [created] = await db.insert(automationFolders).values({
      teamId: context.teamId,
      name: value.name,
      parentId: value.parent_id ?? null,
      color: value.color ?? '#8B9D83',
      position: value.position ?? 0,
    }).returning();
    await audit(context, 'connector.automation_folder.created', created.id);
    return { success: true, data: { ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() } };
  }
  if (!value.folder_id) throw new Error('folder_id is required.');
  const folder = await ownedFolder(context, value.folder_id);
  const expected = dateVersion(value.expected_updated_at);
  if (value.action === 'delete') {
    if (value.confirm !== true) throw new Error('confirm=true is required to delete a folder.');
    await db.transaction(async (tx) => {
      await tx.update(automations).set({ folderId: folder.parentId, updatedAt: new Date() })
        .where(and(eq(automations.teamId, context.teamId), eq(automations.folderId, folder.id)));
      await tx.update(automationFolders).set({ parentId: folder.parentId, updatedAt: new Date() })
        .where(and(eq(automationFolders.teamId, context.teamId), eq(automationFolders.parentId, folder.id)));
      const deleted = await tx.delete(automationFolders).where(and(
        eq(automationFolders.id, folder.id),
        eq(automationFolders.teamId, context.teamId),
        eq(automationFolders.updatedAt, expected!),
      )).returning({ id: automationFolders.id });
      if (!deleted.length) throw new Error('AUTOMATION_FOLDER_VERSION_CONFLICT: inspect folders again before retrying.');
    });
    await audit(context, 'connector.automation_folder.deleted', folder.id);
    return { success: true, deleted_id: folder.id, moved_to_parent_id: folder.parentId };
  }
  await assertFolderParent(context, folder.id, value.parent_id);
  const updated = await db.update(automationFolders).set({
    name: value.name,
    parentId: value.parent_id,
    color: value.color,
    position: value.position,
    updatedAt: new Date(),
  }).where(and(
    eq(automationFolders.id, folder.id),
    eq(automationFolders.teamId, context.teamId),
    eq(automationFolders.updatedAt, expected!),
  )).returning();
  if (!updated.length) throw new Error('AUTOMATION_FOLDER_VERSION_CONFLICT: inspect folders again before retrying.');
  await audit(context, 'connector.automation_folder.updated', folder.id);
  return { success: true, data: { ...updated[0], createdAt: updated[0].createdAt.toISOString(), updatedAt: updated[0].updatedAt.toISOString() } };
}

async function manageAutomation(input: Record<string, unknown>, context: GrokActionContext) {
  const value = parse(automationSchema, input);
  await assertPermission(context, 'automation');
  if (value.action === 'create') {
    if (!value.name) throw new Error('name is required for create.');
    if ((value.nodes && !value.edges) || (!value.nodes && value.edges)) throw new Error('nodes and edges must be provided together.');
    if (value.folder_id) await ownedFolder(context, value.folder_id);
    const instance = value.instance_id ? await ownedInstance(context, value.instance_id) : null;
    let nodes: AutomationFlowNode[] = [];
    let edges: AutomationFlowEdge[] = [];
    let warnings: string[] = [];
    if (value.nodes && value.edges) {
      const synthetic = { instance } as OwnedAutomation;
      const validated = await validateFlowForAutomation(synthetic, value.nodes, value.edges);
      nodes = validated.nodes;
      edges = validated.edges;
      warnings = validated.warnings;
    }
    if (value.is_active && !instance) throw new Error('An active automation requires instance_id.');
    if (value.is_active && !nodes.length) throw new Error('An active automation requires a valid flow.');
    if (value.is_active && automationRequiresManualReview(nodes)) throw new Error('Automation requires manual review before activation.');
    const [created] = await db.insert(automations).values({
      teamId: context.teamId,
      name: value.name,
      instanceId: value.instance_id ?? null,
      folderId: value.folder_id ?? null,
      triggerKeyword: value.trigger_keyword ?? null,
      note: value.note ?? null,
      nodes,
      edges,
      isActive: value.is_active ?? false,
    }).returning();
    await audit(context, 'connector.automation.created', created.id);
    return { success: true, automation_id: created.id, updated_at: created.updatedAt.toISOString(), is_active: created.isActive, warnings };
  }
  if (!value.automation_id) throw new Error('automation_id is required.');
  const record = await ownedAutomation(context, value.automation_id);
  const expected = dateVersion(value.expected_updated_at);
  if (value.action === 'delete') {
    if (value.confirm !== true) throw new Error('confirm=true is required to delete an automation.');
    const deleted = await db.delete(automations).where(and(
      eq(automations.id, record.id),
      eq(automations.teamId, context.teamId),
      eq(automations.updatedAt, expected!),
    )).returning({ id: automations.id });
    if (!deleted.length) throw new Error('AUTOMATION_VERSION_CONFLICT: inspect the automation again before retrying.');
    await audit(context, 'connector.automation.deleted', record.id);
    return { success: true, deleted_id: record.id };
  }
  if (value.folder_id) await ownedFolder(context, value.folder_id);
  const instance = value.instance_id === null
    ? null
    : value.instance_id
      ? await ownedInstance(context, value.instance_id)
      : record.instance;
  const nodes = asNodes(record.nodes);
  const edges = asEdges(record.edges);
  if (instance && (value.instance_id !== undefined || value.is_active === true)) {
    const validation = validateAutomationFlow({ nodes, edges }, { channel: channelFromIntegration(instance.integration) });
    if (!validation.success) throw new Error(`Flow is incompatible with the selected channel: ${validation.errors.join('; ')}`);
  }
  const nextActive = value.is_active ?? record.isActive;
  if (nextActive && !instance) throw new Error('An active automation requires instance_id.');
  if (nextActive && automationRequiresManualReview(nodes)) throw new Error('Automation requires manual review before activation.');
  if (value.is_active === true) {
    const validation = validateAutomationFlow({ nodes, edges }, { channel: channelFromIntegration(instance!.integration) });
    if (!validation.success) throw new Error(`Cannot activate an invalid flow: ${validation.errors.join('; ')}`);
  }
  const updated = await db.update(automations).set({
    name: value.name,
    instanceId: value.instance_id,
    folderId: value.folder_id,
    triggerKeyword: value.trigger_keyword,
    note: value.note,
    isActive: nextActive,
    updatedAt: new Date(),
  }).where(and(
    eq(automations.id, record.id),
    eq(automations.teamId, context.teamId),
    eq(automations.updatedAt, expected!),
  )).returning({ id: automations.id, updatedAt: automations.updatedAt, isActive: automations.isActive });
  if (!updated.length) throw new Error('AUTOMATION_VERSION_CONFLICT: inspect the automation again before retrying.');
  await audit(context, 'connector.automation.updated', record.id);
  return { success: true, automation_id: record.id, updated_at: updated[0].updatedAt.toISOString(), is_active: updated[0].isActive };
}

async function replaceFlow(input: Record<string, unknown>, context: GrokActionContext) {
  const value = parse(replaceFlowSchema, input);
  const record = await ownedAutomation(context, value.automation_id);
  const validated = await validateFlowForAutomation(record, value.nodes, value.edges);
  if (value.mode === 'validate') return { success: true, mode: 'validate', ...validated };
  await assertPermission(context, 'automation');
  if (!value.expected_updated_at) throw new Error('expected_updated_at is required when mode=save.');
  return saveFlow(context, record, value.nodes, value.edges, value.expected_updated_at);
}

async function manageNode(input: Record<string, unknown>, context: GrokActionContext) {
  const value = parse(nodeSchema, input);
  await assertPermission(context, 'automation');
  const record = await ownedAutomation(context, value.automation_id);
  const nodes = asNodes(record.nodes);
  const edges = asEdges(record.edges);
  if (value.action === 'add') {
    if (!value.node_type || !value.position) throw new Error('node_type and position are required for add.');
    const id = value.node_id ?? `${value.node_type}-${crypto.randomUUID()}`;
    if (nodes.some((node) => node.id === id)) throw new Error(`Node already exists: ${id}`);
    nodes.push(createAutomationCanvasNode({
      type: value.node_type,
      position: value.position,
      id,
      data: value.data,
    }) as AutomationFlowNode);
  } else {
    if (!value.node_id) throw new Error('node_id is required.');
    const index = nodes.findIndex((node) => node.id === value.node_id);
    if (index < 0) throw new Error('Node not found.');
    if (value.action === 'delete') {
      if (value.confirm !== true) throw new Error('confirm=true is required to delete a node and its connections.');
      nodes.splice(index, 1);
      for (let i = edges.length - 1; i >= 0; i -= 1) {
        if (edges[i].source === value.node_id || edges[i].target === value.node_id) edges.splice(i, 1);
      }
    } else {
      const current = nodes[index];
      const nextType = value.node_type ?? current.type;
      const nextData = value.replace_data
        ? mergeAutomationNodeDataWithDefaults(nextType, value.data)
        : mergeAutomationNodeDataWithDefaults(nextType, nextType === current.type ? { ...current.data, ...(value.data ?? {}) } : value.data);
      nodes[index] = { id: current.id, type: nextType, position: value.position ?? current.position, data: nextData } as AutomationFlowNode;
    }
  }
  return saveFlow(context, record, nodes, edges, value.expected_updated_at);
}

async function manageEdge(input: Record<string, unknown>, context: GrokActionContext) {
  const value = parse(edgeSchema, input);
  await assertPermission(context, 'automation');
  const record = await ownedAutomation(context, value.automation_id);
  const nodes = asNodes(record.nodes);
  const edges = asEdges(record.edges);
  if (value.action === 'add') {
    if (!value.source || !value.target) throw new Error('source and target are required for add.');
    const id = value.edge_id ?? `edge-${crypto.randomUUID()}`;
    if (edges.some((edge) => edge.id === id)) throw new Error(`Edge already exists: ${id}`);
    edges.push({ id, source: value.source, target: value.target, sourceHandle: value.source_handle, targetHandle: value.target_handle, styleVariant: value.style_variant });
  } else {
    if (!value.edge_id) throw new Error('edge_id is required.');
    const index = edges.findIndex((edge) => edge.id === value.edge_id);
    if (index < 0) throw new Error('Edge not found.');
    if (value.action === 'delete') {
      if (value.confirm !== true) throw new Error('confirm=true is required to delete an edge.');
      edges.splice(index, 1);
    } else {
      const current = edges[index];
      edges[index] = {
        ...current,
        source: value.source ?? current.source,
        target: value.target ?? current.target,
        sourceHandle: value.source_handle === undefined ? current.sourceHandle : value.source_handle,
        targetHandle: value.target_handle === undefined ? current.targetHandle : value.target_handle,
        styleVariant: value.style_variant ?? current.styleVariant,
      };
    }
  }
  return saveFlow(context, record, nodes, edges, value.expected_updated_at);
}

export async function executeAutomationTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  switch (name) {
    case 'whatspro_automation_guide': {
      const value = parse(guideSchema, input);
      return guide(value.node_type);
    }
    case 'whatspro_inspect_automation': {
      const value = parse(inspectSchema, input);
      return inspect(context, value.automation_id);
    }
    case 'whatspro_manage_automation_folder': return manageFolder(input, context);
    case 'whatspro_manage_automation': return manageAutomation(input, context);
    case 'whatspro_replace_automation_flow': return replaceFlow(input, context);
    case 'whatspro_manage_automation_node': return manageNode(input, context);
    case 'whatspro_manage_automation_edge': return manageEdge(input, context);
    default: throw new Error(`Unknown automation tool: ${name}`);
  }
}
