import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from '@xyflow/react';
import {
  automationFlowEdgeSchema,
  type AutomationCanvasNodeData,
  type AutomationFlowEdge,
  type AutomationFlowNode,
  type AutomationFlowNodeType,
  validateAutomationFlow,
} from '@/lib/automation/flow-schema';
import {
  getAutomationNodeDefaults,
  mergeAutomationNodeDataWithDefaults,
} from '@/lib/automation/node-catalog';

type FlowLikeNode = Partial<ReactFlowNode<AutomationCanvasNodeData, AutomationFlowNodeType>> & {
  id?: string;
  type?: AutomationFlowNodeType;
  position?: { x?: number; y?: number };
  data?: Partial<AutomationCanvasNodeData>;
};

type FlowLikeEdge = Partial<ReactFlowEdge> & {
  id?: string;
  source?: string;
  target?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type AutomationFlowNormalizationWarningCode =
  | 'buttons_truncated'
  | 'list_items_truncated'
  | 'node_id_generated'
  | 'button_id_generated'
  | 'list_item_id_generated'
  | 'list_item_row_id_generated'
  | 'condition_id_generated'
  | 'node_defaults_applied'
  | 'start_edge_created'
  | 'condition_fallback_created';

export type AutomationFlowNormalizationWarning = {
  code: AutomationFlowNormalizationWarningCode;
  message: string;
  nodeId?: string;
};

export type NormalizeAutomationFlowResult = {
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
  warnings: AutomationFlowNormalizationWarning[];
};

export type PrepareAutomationFlowResult =
  | {
      success: true;
      nodes: AutomationFlowNode[];
      edges: AutomationFlowEdge[];
      warnings: AutomationFlowNormalizationWarning[];
      preview: {
        nodeCount: number;
        edgeCount: number;
      };
    }
  | {
      success: false;
      warnings: AutomationFlowNormalizationWarning[];
      errors: string[];
    };

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'item';
}

function createUniqueId(base: string, usedIds: Set<string>) {
  let candidate = base;
  let counter = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function buildStableNodeId(node: FlowLikeNode, index: number) {
  const preferredId = normalizeText(node.id);
  if (preferredId) return preferredId;
  return `${node.type ?? 'node'}-${index + 1}`;
}

function buildStableEdgeId(edge: FlowLikeEdge, index: number) {
  const preferredId = normalizeText(edge.id);
  if (preferredId) return preferredId;

  const source = normalizeText(edge.source) || 'source';
  const target = normalizeText(edge.target) || 'target';
  const handle = normalizeText(edge.sourceHandle ?? '') || 'default';
  return `edge-${slugify(source)}-${slugify(handle)}-${slugify(target)}-${index + 1}`;
}

function ensurePosition(node: FlowLikeNode, index: number) {
  const x = Number.isFinite(node.position?.x) ? Number(node.position?.x) : index * 320;
  const y = Number.isFinite(node.position?.y) ? Number(node.position?.y) : 0;
  return { x, y };
}

function requiredString(value: unknown, fallback: string) {
  return normalizeText(value) || fallback;
}

function trimString(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function normalizeNodeData(node: AutomationFlowNode): AutomationFlowNode['data'] {
  const defaults = getAutomationNodeDefaults(node.type);
  const merged = mergeAutomationNodeDataWithDefaults(node.type, node.data);
  switch (node.type) {
    case 'start': {
      const defaultData = defaults as { label?: string; triggerType?: 'exact_match' | 'contains' | 'first_message' | 'fallback'; keywords?: string[]; conditions?: Record<string, string> };
      const triggerType = merged.triggerType ?? defaultData.triggerType ?? 'first_message';
      const keywords = Array.isArray(merged.keywords)
        ? merged.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 0)
        : (defaultData.keywords ?? []);


      return {
        label: trimString(merged.label) ?? defaultData.label,
        triggerType,
        keywords,
        conditions: typeof merged.conditions === 'object' && merged.conditions !== null ? merged.conditions : (defaultData.conditions ?? {}),
      };
    }
    case 'message': {
      const fallback = requiredString(defaults.label, 'Hello!');
      const label = requiredString(merged.label, fallback);
      return { label };
    }
    case 'media': {
      return {
        mediaType: merged.mediaType ?? (defaults.mediaType as 'image'),
        mediaUrl: trimString(merged.mediaUrl) ?? '',
        caption: trimString(merged.caption) ?? '',
        fileName: trimString(merged.fileName) ?? '',
        mediaMimetype: trimString(merged.mediaMimetype),
      };
    }
    case 'options': {
      const fallbackLabel = requiredString(defaults.label, 'Choose an option:');
      const fallbackOptions = Array.isArray(defaults.options) && defaults.options.length > 0 ? defaults.options : ['Option 1'];
      const options = Array.isArray(merged.options)
        ? merged.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
        : fallbackOptions;
      return {
        label: requiredString(merged.label, fallbackLabel),
        options: options.length > 0 ? options : fallbackOptions,
      };
    }
    case 'delay': {
      const fallbackSeconds = typeof defaults.seconds === 'number' ? defaults.seconds : 2;
      const seconds = Number.isInteger(merged.seconds) && Number(merged.seconds) > 0 ? Number(merged.seconds) : fallbackSeconds;
      return {
        label: trimString(merged.label) ?? (defaults.label as string | undefined),
        seconds,
      };
    }
    case 'collect': {
      const fallbackLabel = requiredString(defaults.label, 'What is your name?');
      const fallbackVariable = requiredString(defaults.variable, 'user_name');
      const label = requiredString(merged.label, fallbackLabel);
      const variable = requiredString(merged.variable, fallbackVariable);
      return { label, variable };
    }
    case 'save_contact': {
      return {
        nameVariable: trimString(merged.nameVariable) ?? (defaults.nameVariable as string | undefined),
        agentId: trimString(merged.agentId) ?? (defaults.agentId as string | undefined),
        departmentId: trimString(merged.departmentId) ?? (defaults.departmentId as string | undefined),
        tagId: trimString(merged.tagId) ?? (defaults.tagId as string | undefined),
        funnelStageId: trimString(merged.funnelStageId) ?? (defaults.funnelStageId as string | undefined),
        customFields: typeof merged.customFields === 'object' && merged.customFields !== null ? merged.customFields : {},
      };
    }
    case 'end': {
      return {};
    }
    case 'button_message': {
      const fallbackBodyText = requiredString(defaults.bodyText, 'Choose one of the options below.');
      const baseButtons = Array.isArray(merged.buttons) ? merged.buttons : (Array.isArray(defaults.buttons) ? defaults.buttons : []);
      const trimmedButtons = baseButtons.slice(0, 3).map((button, index) => ({
        id: requiredString(button?.id, `${node.id}-button-${index + 1}`),
        text: requiredString(button?.text, `Option ${index + 1}`),
        value: requiredString(button?.value, `option_${index + 1}`),
      }));


      return {
        title: trimString(merged.title),
        bodyText: requiredString(merged.bodyText, fallbackBodyText),
        footerText: trimString(merged.footerText),
        buttonText: trimString(merged.buttonText),
        buttons: trimmedButtons.length > 0 ? trimmedButtons : [{ id: `${node.id}-button-1`, text: 'Option 1', value: 'option_1' }],
      };
    }
    case 'list_message': {
      const fallbackBodyText = requiredString(defaults.bodyText, 'Please choose one item from the list.');
      const fallbackButtonText = requiredString(defaults.buttonText, 'Open list');
      const baseItems = Array.isArray(merged.items) ? merged.items : (Array.isArray(defaults.items) ? defaults.items : []);
      const trimmedItems = baseItems.slice(0, 10).map((item, index) => ({
        id: requiredString(item?.id, `${node.id}-item-${index + 1}`),
        title: requiredString(item?.title, `Option ${index + 1}`),
        description: trimString(item?.description),
        rowId: requiredString(item?.rowId, `${slugify(node.id)}-row-${index + 1}`),
      }));


      return {
        title: trimString(merged.title),
        bodyText: requiredString(merged.bodyText, fallbackBodyText),
        footerText: trimString(merged.footerText),
        buttonText: requiredString(merged.buttonText, fallbackButtonText),
        items: trimmedItems.length > 0 ? trimmedItems : [{ id: `${node.id}-item-1`, title: 'Option 1', rowId: `${slugify(node.id)}-row-1` }],
      };
    }
    case 'call_to_action': {
      const fallbackBodyText = requiredString(defaults.bodyText, 'Open the secure link to continue.');
      const fallbackButtonText = requiredString(defaults.buttonText, 'Open link');
      const fallbackUrl = requiredString(defaults.url, 'https://example.com');
      const bodyText = requiredString(merged.bodyText, fallbackBodyText);
      const buttonText = requiredString(merged.buttonText, fallbackButtonText);
      const url = requiredString(merged.url, fallbackUrl);
      return {
        title: trimString(merged.title),
        bodyText,
        footerText: trimString(merged.footerText),
        buttonText,
        url,
      };
    }
    case 'ai_control': {
      return {
        action: merged.action ?? ((defaults.action as 'active' | 'paused' | undefined) ?? 'active'),
      };
    }
    case 'condition': {
      const baseConditions = Array.isArray(merged.conditions) ? merged.conditions : [];
      const conditions = (baseConditions.length > 0 ? baseConditions : [{ id: `${node.id}-condition-1`, type: 'text', operator: 'equals', value: 'value' }]).map((condition, index) => ({
        id: requiredString(condition?.id, `${node.id}-condition-${index + 1}`),
        type: requiredString(condition?.type, 'text'),
        operator: requiredString(condition?.operator, 'equals'),
        value: requiredString(condition?.value, `value_${index + 1}`),
        value2: trimString(condition?.value2),
      }));


      return {
        label: trimString(merged.label),
        conditions,
      };
    }
    default: {
      return merged;
    }
  }

  return merged;
}

function appendDefaultsWarningIfNeeded(nodeId: string, before: unknown, after: unknown, warnings: AutomationFlowNormalizationWarning[]) {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

  warnings.push({
    code: 'node_defaults_applied',
    nodeId,
    message: `Se completaron campos faltantes con valores por defecto en ${nodeId}.`,
  });
}

export function normalizeAutomationFlow(input: { nodes: FlowLikeNode[]; edges: FlowLikeEdge[] }): NormalizeAutomationFlowResult {
  const warnings: AutomationFlowNormalizationWarning[] = [];
  const usedNodeIds = new Set<string>();
  const idMap = new Map<string, string>();

  const normalizedNodes = input.nodes
    .filter((node): node is FlowLikeNode & { type: AutomationFlowNodeType } => typeof node?.type === 'string')
    .map((node, index) => {
      const normalizedId = createUniqueId(buildStableNodeId(node, index), usedNodeIds);
      if (normalizedId !== node.id) {
        warnings.push({
          code: 'node_id_generated',
          nodeId: normalizedId,
          message: `Se generó un id estable para el nodo ${normalizedId}.`,
        });
      }

      if (node.id) {
        idMap.set(node.id, normalizedId);
      }

      const normalizedNode: AutomationFlowNode = {
        id: normalizedId,
        type: node.type,
        position: ensurePosition(node, index),
        data: mergeAutomationNodeDataWithDefaults(node.type, node.data),
      } as AutomationFlowNode;

      const beforeData = normalizedNode.data;
      const afterData = normalizeNodeData(normalizedNode);
      normalizedNode.data = afterData;
      appendDefaultsWarningIfNeeded(normalizedId, beforeData, afterData, warnings);

      if (normalizedNode.type === 'button_message') {
        const originalButtons = Array.isArray(node.data?.buttons) ? node.data.buttons : [];
        const buttons = normalizedNode.data.buttons ?? [];

        if (originalButtons.length > 3) {
          warnings.push({
            code: 'buttons_truncated',
            nodeId: normalizedId,
            message: `Se recortaron ${originalButtons.length - 3} botones en ${normalizedId}.`,
          });
        }

        const usedButtonIds = new Set<string>();
        normalizedNode.data.buttons = buttons.map((button, buttonIndex) => {
          const nextId = createUniqueId(requiredString(button.id, `${normalizedId}-button-${buttonIndex + 1}`), usedButtonIds);
          if (nextId !== button.id) {
            warnings.push({
              code: 'button_id_generated',
              nodeId: normalizedId,
              message: `Se generaron ids estables para botones en ${normalizedId}.`,
            });
          }

          return {
            ...button,
            id: nextId,
          };
        });
      }

      if (normalizedNode.type === 'list_message') {
        const originalItems = Array.isArray(node.data?.items) ? node.data.items : [];
        const items = normalizedNode.data.items ?? [];

        if (originalItems.length > 10) {
          warnings.push({
            code: 'list_items_truncated',
            nodeId: normalizedId,
            message: `Se recortaron ${originalItems.length - 10} items de lista en ${normalizedId}.`,
          });
        }

        const usedItemIds = new Set<string>();
        const usedRowIds = new Set<string>();
        normalizedNode.data.items = items.map((item, itemIndex) => {
          const nextId = createUniqueId(requiredString(item.id, `${normalizedId}-item-${itemIndex + 1}`), usedItemIds);
          const nextRowId = createUniqueId(requiredString(item.rowId, `${slugify(normalizedId)}-row-${itemIndex + 1}`), usedRowIds);

          if (nextId !== item.id) {
            warnings.push({
              code: 'list_item_id_generated',
              nodeId: normalizedId,
              message: `Se generaron ids estables para rows en ${normalizedId}.`,
            });
          }

          if (nextRowId !== item.rowId) {
            warnings.push({
              code: 'list_item_row_id_generated',
              nodeId: normalizedId,
              message: `Se generaron row ids estables en ${normalizedId}.`,
            });
          }

          return {
            ...item,
            id: nextId,
            rowId: nextRowId,
          };
        });
      }

      if (normalizedNode.type === 'condition') {
        const usedConditionIds = new Set<string>();
        normalizedNode.data.conditions = (normalizedNode.data.conditions ?? []).map((condition, conditionIndex) => {
          const nextId = createUniqueId(requiredString(condition.id, `${normalizedId}-condition-${conditionIndex + 1}`), usedConditionIds);
          if (nextId !== condition.id) {
            warnings.push({
              code: 'condition_id_generated',
              nodeId: normalizedId,
              message: `Se generaron ids estables para condiciones en ${normalizedId}.`,
            });
          }

          return {
            ...condition,
            id: nextId,
          };
        });
      }

      return normalizedNode;
    });

  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  const usedEdgeIds = new Set<string>();

  const normalizedEdges = input.edges
    .filter((edge) => typeof edge?.source === 'string' && typeof edge?.target === 'string')
    .map((edge, index) => {
      const normalizedSource = idMap.get(edge.source ?? '') ?? normalizeText(edge.source);
      const normalizedTarget = idMap.get(edge.target ?? '') ?? normalizeText(edge.target);
      return {
        id: createUniqueId(buildStableEdgeId({ ...edge, source: normalizedSource, target: normalizedTarget }, index), usedEdgeIds),
        source: normalizedSource,
        target: normalizedTarget,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
      } satisfies AutomationFlowEdge;
    })
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  const usedIdsForAutoNodes = new Set(normalizedNodes.map((node) => node.id));
  const usedIdsForAutoEdges = new Set(normalizedEdges.map((edge) => edge.id));

  const createAutoEndNode = (sourceNode: AutomationFlowNode, suffix: string) => {
    const nodeId = createUniqueId(`${sourceNode.id}-${suffix}-end`, usedIdsForAutoNodes);
    const node = {
      id: nodeId,
      type: 'end',
      position: {
        x: sourceNode.position.x + 320,
        y: sourceNode.position.y,
      },
      data: {},
    } satisfies AutomationFlowNode;
    normalizedNodes.push(node);
    nodeIds.add(node.id);
    return node;
  };

  const createAutoEdge = (edge: Omit<AutomationFlowEdge, 'id'>) => {
    const nextEdge = {
      ...edge,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      id: createUniqueId(`edge-${slugify(edge.source)}-${slugify(edge.sourceHandle ?? 'default')}-${slugify(edge.target)}`, usedIdsForAutoEdges),
    } satisfies AutomationFlowEdge;
    normalizedEdges.push(nextEdge);
  };

  const startNode = normalizedNodes.find((node) => node.type === 'start');
  if (startNode && !normalizedEdges.some((edge) => edge.source === startNode.id)) {
    const endNode = createAutoEndNode(startNode, 'start');
    createAutoEdge({ source: startNode.id, target: endNode.id, sourceHandle: null, targetHandle: null });
    warnings.push({
      code: 'start_edge_created',
      nodeId: startNode.id,
      message: 'Se agregó una salida automática desde start.',
    });
  }

  for (const conditionNode of normalizedNodes.filter((node) => node.type === 'condition')) {
    const hasFallback = normalizedEdges.some((edge) => edge.source === conditionNode.id && edge.sourceHandle === 'fallback');
    if (!hasFallback) {
      const endNode = createAutoEndNode(conditionNode, 'fallback');
      createAutoEdge({ source: conditionNode.id, target: endNode.id, sourceHandle: 'fallback', targetHandle: null });
      warnings.push({
        code: 'condition_fallback_created',
        nodeId: conditionNode.id,
        message: `Se agregó fallback automático en ${conditionNode.id}.`,
      });
    }
  }

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges.map((edge) => automationFlowEdgeSchema.parse(edge)),
    warnings,
  };
}

export function prepareAutomationFlowForSave(input: { nodes: FlowLikeNode[]; edges: FlowLikeEdge[] }) : PrepareAutomationFlowResult {
  const normalized = normalizeAutomationFlow(input);
  const validation = validateAutomationFlow({
    nodes: normalized.nodes,
    edges: normalized.edges,
  }, { requireSingleStart: true });

  if (!validation.success) {
    return {
      success: false,
      warnings: normalized.warnings,
      errors: validation.errors,
    };
  }

  return {
    success: true,
    nodes: validation.data.nodes,
    edges: validation.data.edges,
    warnings: normalized.warnings,
    preview: {
      nodeCount: validation.data.nodes.length,
      edgeCount: validation.data.edges.length,
    },
  };
}
