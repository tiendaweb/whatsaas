import { z } from 'zod';

export const AUTOMATION_AI_CHANNELS = ['qr', 'api'] as const;
export type AutomationAIChannel = (typeof AUTOMATION_AI_CHANNELS)[number];

export const AUTOMATION_AI_NODE_TYPES = [
  'start',
  'message',
  'media',
  'options',
  'delay',
  'collect',
  'save_contact',
  'end',
  'button_message',
  'list_message',
  'call_to_action',
  'ai_control',
  'condition',
] as const;

export type AutomationAINodeType = (typeof AUTOMATION_AI_NODE_TYPES)[number];

export type AutomationFlowNode = {
  id: string;
  type: AutomationAINodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type AutomationFlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type AutomationGeneratedFlow = {
  suggestedName: string;
  warnings: string[];
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
};

export const AUTOMATION_AI_NODE_CATALOG: Array<{
  type: AutomationAINodeType;
  label: string;
  channels: AutomationAIChannel[];
  description: string;
}> = [
  { type: 'start', label: 'Start Trigger', channels: ['qr', 'api'], description: 'Required entry node for the automation flow.' },
  { type: 'message', label: 'Message', channels: ['qr'], description: 'Plain text WhatsApp message. Only available in QR flows.' },
  { type: 'media', label: 'Media', channels: ['qr'], description: 'Send image, video, audio, or document with optional caption. Only available in QR flows.' },
  { type: 'options', label: 'Options', channels: ['qr', 'api'], description: 'Menu of numbered text options.' },
  { type: 'delay', label: 'Delay', channels: ['qr', 'api'], description: 'Wait some seconds before the next node.' },
  { type: 'collect', label: 'Collect Input', channels: ['qr', 'api'], description: 'Ask a question and store the reply in a variable.' },
  { type: 'save_contact', label: 'Save Contact', channels: ['qr', 'api'], description: 'Update contact attributes, owner, tags, or stage.' },
  { type: 'end', label: 'End', channels: ['qr', 'api'], description: 'Immediately ends the automation session.' },
  { type: 'button_message', label: 'Button Message', channels: ['api'], description: 'Interactive button message for API flows.' },
  { type: 'list_message', label: 'List Message', channels: ['api'], description: 'Interactive list message for API flows.' },
  { type: 'call_to_action', label: 'Call To Action', channels: ['api'], description: 'CTA message with URL button for API flows.' },
  { type: 'ai_control', label: 'AI Control', channels: ['qr', 'api'], description: 'Enable or pause the AI assistant.' },
  { type: 'condition', label: 'Condition', channels: ['qr', 'api'], description: 'Conditional split with dedicated branches and fallback.' },
];

export function getAllowedNodeTypesForChannel(channel: AutomationAIChannel): AutomationAINodeType[] {
  return AUTOMATION_AI_NODE_CATALOG.filter((node) => node.channels.includes(channel)).map((node) => node.type);
}

export function getDefaultNodeContentConstraints(channel: AutomationAIChannel): Record<string, string> {
  return {
    start: 'Exactly one start node. Use triggerType="first_message" unless the prompt clearly asks for keywords or fallback behavior.',
    message: channel === 'qr'
      ? 'Plain text only. Use label with the exact message content. Do not use this node in API flows.'
      : 'Forbidden in API flows.',
    media: channel === 'qr'
      ? 'Use mediaType plus optional caption. mediaUrl is optional only when the asset must be attached later by a human.'
      : 'Forbidden in API flows.',
    options: 'Use label for the question and data.options for the numbered options.',
    delay: 'Use data.seconds as a positive integer. Keep delays practical (usually between 1 and 300 seconds).',
    collect: 'Use label for the prompt and data.variable for the variable name in snake_case.',
    save_contact: 'Only set fields that are truly needed. Prefer variables over hard-coded assignments when possible.',
    end: 'Use this when the automation should stop cleanly.',
    button_message: 'API only. Use bodyText plus up to 3 buttons with id, text, and value.',
    list_message: 'API only. Use bodyText, buttonText, and up to 10 items with id, title, description, and rowId.',
    call_to_action: 'API only. Use bodyText, buttonText, and a valid https URL.',
    ai_control: 'Use action="active" to enable AI or action="paused" to pause AI.',
    condition: 'Use 1 or more conditions. Each outgoing edge must use the matching condition id as sourceHandle or use fallback.',
  };
}

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const startDataSchema = z.object({
  label: z.string().optional(),
  triggerType: z.enum(['exact_match', 'contains', 'first_message', 'fallback']).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  conditions: z.object({
    funnelStageId: z.string().optional(),
    tagId: z.string().optional(),
    assignedUserId: z.string().optional(),
    departmentId: z.string().optional(),
  }).partial().optional(),
});

const messageDataSchema = z.object({
  label: z.string().min(1),
});

const mediaDataSchema = z.object({
  mediaUrl: z.string().optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'document']).optional(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
});

const optionsDataSchema = z.object({
  label: z.string().min(1),
  options: z.array(z.string().min(1)).min(1).max(10),
});

const delayDataSchema = z.object({
  seconds: z.number().int().positive().max(86400),
  label: z.string().optional(),
});

const collectDataSchema = z.object({
  label: z.string().min(1),
  variable: z.string().min(1),
});

const saveContactDataSchema = z.object({
  nameVariable: z.string().optional(),
  agentId: z.string().optional(),
  departmentId: z.string().optional(),
  tagId: z.string().optional(),
  funnelStageId: z.string().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

const endDataSchema = z.object({}).passthrough();

const buttonMessageDataSchema = z.object({
  title: z.string().optional(),
  bodyText: z.string().min(1),
  footerText: z.string().optional(),
  buttonText: z.string().optional(),
  buttons: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    value: z.string().min(1),
  })).min(1).max(3),
});

const listMessageDataSchema = z.object({
  title: z.string().optional(),
  bodyText: z.string().min(1),
  footerText: z.string().optional(),
  buttonText: z.string().min(1),
  items: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    rowId: z.string().min(1),
  })).min(1).max(10),
});

const callToActionDataSchema = z.object({
  title: z.string().optional(),
  bodyText: z.string().min(1),
  footerText: z.string().optional(),
  buttonText: z.string().min(1),
  url: z.string().url(),
});

const aiControlDataSchema = z.object({
  action: z.enum(['active', 'paused']),
});

const conditionDataSchema = z.object({
  conditions: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    operator: z.string().min(1),
    value: z.string().min(1),
    value2: z.string().optional(),
  })).min(1),
  label: z.string().optional(),
});

const nodeDataSchemaByType = {
  start: startDataSchema,
  message: messageDataSchema,
  media: mediaDataSchema,
  options: optionsDataSchema,
  delay: delayDataSchema,
  collect: collectDataSchema,
  save_contact: saveContactDataSchema,
  end: endDataSchema,
  button_message: buttonMessageDataSchema,
  list_message: listMessageDataSchema,
  call_to_action: callToActionDataSchema,
  ai_control: aiControlDataSchema,
  condition: conditionDataSchema,
} as const;

const automationFlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(AUTOMATION_AI_NODE_TYPES),
  position: positionSchema,
  data: z.record(z.string(), z.unknown()),
}).superRefine((node, ctx) => {
  const dataSchema = nodeDataSchemaByType[node.type];
  const result = dataSchema.safeParse(node.data);

  if (!result.success) {
    result.error.issues.forEach((issue) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid data for node "${node.id}" (${node.type}): ${issue.message}`,
        path: ['data', ...(issue.path ?? [])],
      });
    });
  }
});

const automationFlowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export const automationAIGenerationRequestSchema = z.object({
  prompt: z.string().min(10),
  locale: z.string().min(2).max(10),
  channel: z.enum(AUTOMATION_AI_CHANNELS),
  allowedNodeTypes: z.array(z.enum(AUTOMATION_AI_NODE_TYPES)).min(1),
  nodeContentConstraints: z.record(z.string(), z.string()).default({}),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(128).max(4096).optional(),
});

export const automationAIGeneratedFlowSchema = z.object({
  suggestedName: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  nodes: z.array(automationFlowNodeSchema).min(1),
  edges: z.array(automationFlowEdgeSchema).default([]),
});

export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function validateGeneratedAutomationFlow(
  input: unknown,
  options?: { allowedNodeTypes?: AutomationAINodeType[]; channel?: AutomationAIChannel; requireSingleStart?: boolean }
):
  | { success: true; data: AutomationGeneratedFlow }
  | { success: false; errors: string[] } {
  const parsed = automationAIGeneratedFlowSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const data = parsed.data as AutomationGeneratedFlow;
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const startNodes = data.nodes.filter((node) => node.type === 'start');
  const allowedNodeTypes = new Set(options?.allowedNodeTypes ?? AUTOMATION_AI_NODE_TYPES);

  for (const node of data.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (!allowedNodeTypes.has(node.type)) {
      errors.push(`Node type not allowed: ${node.type}`);
    }

    if (options?.channel === 'api' && (node.type === 'message' || node.type === 'media')) {
      errors.push(`Node type ${node.type} is not allowed for API flows.`);
    }
  }

  if (options?.requireSingleStart !== false) {
    if (startNodes.length === 0) {
      errors.push('The flow must include exactly one start node.');
    }
    if (startNodes.length > 1) {
      errors.push('The flow cannot include more than one start node.');
    }
  }

  for (const edge of data.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge id: ${edge.id}`);
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id} references unknown source node ${edge.source}.`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id} references unknown target node ${edge.target}.`);
    }
  }

  for (const node of data.nodes.filter((node) => node.type === 'condition')) {
    const conditions = Array.isArray(node.data.conditions) ? node.data.conditions as Array<{ id: string }> : [];
    const validHandles = new Set(conditions.map((condition) => condition.id));
    validHandles.add('fallback');

    for (const edge of data.edges.filter((edge) => edge.source === node.id)) {
      if (edge.sourceHandle && !validHandles.has(edge.sourceHandle)) {
        errors.push(`Condition node ${node.id} has edge ${edge.id} with unknown sourceHandle ${edge.sourceHandle}.`);
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data };
}

export function validateAutomationCanvas(nodes: unknown[], edges: unknown[]) {
  return validateGeneratedAutomationFlow(
    {
      suggestedName: 'Current automation',
      warnings: [],
      nodes,
      edges,
    },
    { requireSingleStart: true }
  );
}

function uniqueId(prefix: string, existingIds: Set<string>) {
  let counter = 1;
  let candidate = `${prefix}-${counter}`;

  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `${prefix}-${counter}`;
  }

  existingIds.add(candidate);
  return candidate;
}

export function insertGeneratedSubflow(params: {
  currentNodes: AutomationFlowNode[];
  currentEdges: AutomationFlowEdge[];
  generatedNodes: AutomationFlowNode[];
  generatedEdges: AutomationFlowEdge[];
  selectedNodeId: string;
}) {
  const selectedNode = params.currentNodes.find((node) => node.id === params.selectedNodeId);
  if (!selectedNode) {
    return { success: false as const, error: 'Please select a node in the canvas before inserting a subflow.' };
  }

  if (['button_message', 'list_message', 'condition', 'end'].includes(selectedNode.type)) {
    return { success: false as const, error: `The selected node type (${selectedNode.type}) cannot be used as a subflow insertion anchor.` };
  }

  const existingIds = new Set([
    ...params.currentNodes.map((node) => node.id),
    ...params.currentEdges.map((edge) => edge.id),
  ]);

  const idMap = new Map<string, string>();
  params.generatedNodes.forEach((node) => {
    idMap.set(node.id, uniqueId(node.type, existingIds));
  });

  const remappedNodes = params.generatedNodes.map((node) => ({
    ...node,
    id: idMap.get(node.id) ?? node.id,
  }));

  const remappedEdges = params.generatedEdges.map((edge) => ({
    ...edge,
    id: uniqueId('edge', existingIds),
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
  }));

  const startNode = remappedNodes.find((node) => node.type === 'start');
  const nodesWithoutStart = remappedNodes.filter((node) => node.id !== startNode?.id);
  const edgesWithoutStart = remappedEdges.filter((edge) => edge.source !== startNode?.id && edge.target !== startNode?.id);

  if (nodesWithoutStart.length === 0) {
    return { success: false as const, error: 'The generated subflow does not contain insertable nodes.' };
  }

  const minX = Math.min(...nodesWithoutStart.map((node) => node.position.x));
  const minY = Math.min(...nodesWithoutStart.map((node) => node.position.y));
  const offsetX = selectedNode.position.x + 360 - minX;
  const offsetY = selectedNode.position.y - minY;

  const positionedNodes = nodesWithoutStart.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));

  const entryTargets = startNode
    ? remappedEdges.filter((edge) => edge.source === startNode.id).map((edge) => edge.target)
    : [positionedNodes[0].id];

  const connectorEdges: AutomationFlowEdge[] = Array.from(new Set(entryTargets)).map((target) => ({
    id: uniqueId('edge', existingIds),
    source: selectedNode.id,
    target,
  }));

  return {
    success: true as const,
    nodes: [...params.currentNodes, ...positionedNodes],
    edges: [...params.currentEdges, ...edgesWithoutStart, ...connectorEdges],
  };
}

export function buildAutomationFlowGeneratorPrompt(input: z.infer<typeof automationAIGenerationRequestSchema>) {
  const allowedCatalog = AUTOMATION_AI_NODE_CATALOG.filter((node) => input.allowedNodeTypes.includes(node.type));

  return [
    'You are generating JSON for a WhatsApp automation flow builder.',
    `Target locale for node copy: ${input.locale}.`,
    `Channel: ${input.channel}.`,
    input.channel === 'qr'
      ? 'In QR mode you may use plain Message and Media nodes.'
      : 'In API mode do not use Message or Media nodes. Prefer button_message, list_message, or call_to_action when suitable.',
    'Return ONLY a valid JSON object with this exact top-level shape: {"suggestedName": string, "warnings": string[], "nodes": Node[], "edges": Edge[] }.',
    'Rules:',
    '- Include exactly one start node.',
    '- Use only the allowed node types listed below.',
    '- Every edge source and target must reference an existing node id.',
    '- Keep positions readable on a left-to-right canvas. Start near x=0, and advance by about 320-420 px horizontally.',
    '- Use concise warnings when assumptions or placeholders are needed.',
    '- Never include markdown, commentary, or prose outside the JSON object.',
    'Allowed node types:',
    ...allowedCatalog.map((node) => `- ${node.type}: ${node.description}`),
    'Node content constraints:',
    ...Object.entries(input.nodeContentConstraints).map(([nodeType, constraint]) => `- ${nodeType}: ${constraint}`),
    'User prompt:',
    input.prompt,
  ].join('\n');
}
