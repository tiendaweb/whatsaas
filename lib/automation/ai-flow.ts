import { z } from 'zod';
import {
  AUTOMATION_FLOW_CHANNELS,
  AUTOMATION_FLOW_NODE_TYPES,
  AUTOMATION_TEXT_LIMITS,
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
      ? `Plain text only. Use label with the exact message content. Keep text within ${AUTOMATION_TEXT_LIMITS.qr.text} characters.`
      : 'Forbidden in API flows.',
    media: channel === 'qr'
      ? `Use mediaType plus optional caption. Caption must stay within ${AUTOMATION_TEXT_LIMITS.qr.mediaCaption} characters.`
      : 'Forbidden in API flows.',
    options: `Use label for the question and data.options for the numbered options. Maximum 10 options and ${AUTOMATION_TEXT_LIMITS.qr.option} characters per option.`,
    delay: 'Use data.seconds as a positive integer. Keep delays practical (usually between 1 and 300 seconds).',
    collect: `Use label for the prompt and data.variable for the variable name in snake_case. Keep prompt within ${AUTOMATION_TEXT_LIMITS.qr.text} characters.`,
    save_contact: 'Only set fields that are truly needed. Prefer variables over hard-coded assignments when possible.',
    end: 'Use this when the automation should stop cleanly.',
    button_message: `API only. Use bodyText plus up to 3 buttons with id, text, and value. Button text max ${AUTOMATION_TEXT_LIMITS.api.buttonText} chars.`,
    list_message: `API only. Use bodyText, buttonText, and up to 10 items with id, title, description, and rowId. Titles max ${AUTOMATION_TEXT_LIMITS.api.listItemTitle} chars and descriptions max ${AUTOMATION_TEXT_LIMITS.api.listItemDescription} chars.`,
    call_to_action: `API only. Use bodyText, buttonText, and a valid https URL. Button text max ${AUTOMATION_TEXT_LIMITS.api.buttonText} chars.`,
    ai_control: 'Use action="active" to enable AI or action="paused" to pause AI.',
    condition: 'Use 1 or more conditions. Each outgoing edge must use the matching condition id as sourceHandle or use fallback.',
  };
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
