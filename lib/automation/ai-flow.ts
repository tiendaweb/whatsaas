import { z } from 'zod';
import {
  AUTOMATION_FLOW_CHANNELS,
  AUTOMATION_FLOW_NODE_TYPES,
  automationFlowEdgeSchema,
  automationFlowNodeSchema,
  type AutomationCanvasEdge,
  type AutomationCanvasNode,
  type AutomationFlowChannel,
  type AutomationFlowEdge,
  type AutomationFlowNode,
  type AutomationFlowNodeType,
  validateAutomationFlow,
} from '@/lib/automation/flow-schema';
import {
  getAllowedAutomationNodeCatalog,
  getAllowedAutomationNodeTypesForChannel,
  getNodeContentConstraintsForChannel,
} from '@/lib/automation/node-catalog';

export const AUTOMATION_AI_CHANNELS = AUTOMATION_FLOW_CHANNELS;
export type AutomationAIChannel = AutomationFlowChannel;

export const AUTOMATION_AI_NODE_TYPES = AUTOMATION_FLOW_NODE_TYPES;
export type AutomationAINodeType = AutomationFlowNodeType;

export type AutomationGeneratedFlow = {
  suggestedName: string;
  warnings: string[];
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
};

export const AUTOMATION_AI_NODE_CATALOG = getAllowedAutomationNodeCatalog('qr').concat(
  getAllowedAutomationNodeCatalog('api').filter((entry) => !getAllowedAutomationNodeCatalog('qr').some((qrEntry) => qrEntry.type === entry.type)),
).map((entry) => ({
  type: entry.type,
  labelKey: entry.labelKey,
  channels: entry.channels,
  description: entry.aiDescription,
  examples: entry.aiExamples,
  connectionRules: entry.connectionRules.notes,
}));

export function getAllowedNodeTypesForChannel(channel: AutomationAIChannel): AutomationAINodeType[] {
  return getAllowedAutomationNodeTypesForChannel(channel);
}

export function getDefaultNodeContentConstraints(channel: AutomationAIChannel): Record<string, string> {
  return getNodeContentConstraintsForChannel(channel);
}

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
  options?: { allowedNodeTypes?: AutomationAINodeType[]; channel?: AutomationAIChannel; requireSingleStart?: boolean },
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

  const validated = validateAutomationFlow(
    {
      nodes: parsed.data.nodes,
      edges: parsed.data.edges,
    },
    options,
  );

  if (!validated.success) {
    return validated;
  }

  return {
    success: true,
    data: {
      suggestedName: parsed.data.suggestedName,
      warnings: parsed.data.warnings,
      nodes: validated.data.nodes,
      edges: validated.data.edges,
    },
  };
}

export function validateAutomationCanvas(nodes: unknown[], edges: unknown[]) {
  return validateAutomationFlow(
    {
      nodes,
      edges,
    },
    { requireSingleStart: true },
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
  currentNodes: AutomationCanvasNode[];
  currentEdges: AutomationCanvasEdge[];
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
    nodes: [...params.currentNodes, ...(positionedNodes as AutomationCanvasNode[])],
    edges: [...params.currentEdges, ...edgesWithoutStart, ...connectorEdges],
  };
}

export function buildAutomationFlowGeneratorPrompt(input: z.infer<typeof automationAIGenerationRequestSchema>) {
  const allowedCatalog = getAllowedAutomationNodeCatalog(input.channel, input.allowedNodeTypes);

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
    'Allowed node types and semantic guidance:',
    ...allowedCatalog.flatMap((node) => [
      `- ${node.type}: ${node.aiDescription}`,
      `  Category: ${node.category}.`,
      `  Connection rules: ${node.connectionRules.notes.join(' ')}`,
      `  Editable fields: ${node.editableFields.map((field) => `${field.key}${field.required ? ' (required)' : ''}`).join(', ') || 'none'}.`,
      `  Valid examples: ${node.aiExamples.join(' | ')}`,
    ]),
    'Node content constraints:',
    ...Object.entries(input.nodeContentConstraints).map(([nodeType, constraint]) => `- ${nodeType}: ${constraint}`),
    'User prompt:',
    input.prompt,
  ].join('\n');
}
