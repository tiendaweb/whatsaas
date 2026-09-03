import type {
  AutomationFlowEdge,
  AutomationFlowNode,
} from "@/lib/automation/flow-schema";

export type AutomationFlowSnapshot = {
  id: number;
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
};

export type ExtractAutomationSubflowInput = {
  sourceAutomationId: number;
  newAutomationId: number;
  sourceNodes: AutomationFlowNode[];
  sourceEdges: AutomationFlowEdge[];
  selectedNodeIds: string[];
  teamFlows: AutomationFlowSnapshot[];
  createId?: (prefix: "node" | "edge") => string;
};

export type ExtractAutomationSubflowResult = {
  sourceNodes: AutomationFlowNode[];
  sourceEdges: AutomationFlowEdge[];
  newNodes: AutomationFlowNode[];
  newEdges: AutomationFlowEdge[];
  updatedExternalFlows: AutomationFlowSnapshot[];
  remappedReferenceCount: number;
};

type GoToData = {
  mode?: "previous_node" | "specific_node" | "other_flow";
  targetNodeId?: string;
  targetAutomationId?: string | number;
  fallbackAction?: "stop" | "node";
  fallbackNodeId?: string;
  referenceName?: string;
  [key: string]: unknown;
};

type PendingFallbackProxy = {
  ownerAutomationId: number;
  targetAutomationId: number;
  targetNodeId?: string;
  nodeId: string;
};

function defaultCreateId(prefix: "node" | "edge") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sortNodesByPosition(nodes: AutomationFlowNode[]) {
  return [...nodes].sort(
    (a, b) =>
      (a.position?.x ?? 0) - (b.position?.x ?? 0) ||
      (a.position?.y ?? 0) - (b.position?.y ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

function asPositiveAutomationId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function makeGoToNode(params: {
  id: string;
  position: { x: number; y: number };
  targetAutomationId: number;
  targetNodeId?: string;
  referenceName: string;
}): AutomationFlowNode {
  return {
    id: params.id,
    type: "go_to_node",
    position: params.position,
    data: {
      mode: "other_flow",
      targetAutomationId: params.targetAutomationId,
      targetNodeId: params.targetNodeId,
      fallbackAction: "stop",
      referenceName: params.referenceName,
    },
  };
}

/**
 * Extracts nodes from one automation while preserving the logical identity of
 * every explicit node target. The function is intentionally pure so the caller
 * can validate every resulting flow before committing a transaction.
 */
export function extractAutomationSubflow(
  input: ExtractAutomationSubflowInput,
): ExtractAutomationSubflowResult {
  const createId = input.createId ?? defaultCreateId;
  const selectedIds = new Set(input.selectedNodeIds);
  const sourceNodeById = new Map(input.sourceNodes.map((node) => [node.id, node]));
  const selectedNodes = input.sourceNodes.filter((node) => selectedIds.has(node.id));

  if (selectedNodes.length === 0) {
    throw new Error("No nodes selected.");
  }
  if (selectedNodes.some((node) => node.type === "start")) {
    throw new Error("Start node cannot be moved into a new automation.");
  }
  if (selectedNodes.length !== selectedIds.size) {
    throw new Error("The selection contains nodes that do not belong to the source automation.");
  }

  const allOriginalFlows = input.teamFlows.filter(
    (flow) => flow.id !== input.newAutomationId,
  );
  const originalNodeMaps = new Map<number, Map<string, AutomationFlowNode>>();
  for (const flow of allOriginalFlows) {
    originalNodeMaps.set(flow.id, new Map(flow.nodes.map((node) => [node.id, node])));
  }
  originalNodeMaps.set(input.sourceAutomationId, sourceNodeById);

  const internalEdges = input.sourceEdges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );
  const incomingEdges = input.sourceEdges.filter(
    (edge) => !selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );
  const outgoingEdges = input.sourceEdges.filter(
    (edge) => selectedIds.has(edge.source) && !selectedIds.has(edge.target),
  );
  const untouchedSourceEdges = input.sourceEdges.filter(
    (edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target),
  );

  const internalIncomingIds = new Set(internalEdges.map((edge) => edge.target));
  const entryCandidates = sortNodesByPosition(
    selectedNodes.filter((node) => !internalIncomingIds.has(node.id)),
  );
  const distinctIncomingTargets = [...new Set(incomingEdges.map((edge) => edge.target))];
  const primaryEntryId =
    (distinctIncomingTargets.length === 1 ? distinctIncomingTargets[0] : undefined) ??
    entryCandidates[0]?.id ??
    sortNodesByPosition(selectedNodes)[0].id;

  const startNodeId = createId("node");
  const startNode: AutomationFlowNode = {
    id: startNodeId,
    type: "start",
    position: {
      x: Math.min(...selectedNodes.map((node) => node.position.x)) - 260,
      y: sourceNodeById.get(primaryEntryId)?.position.y ?? 0,
    },
    data: {
      label: "Start",
      triggerType: "fallback",
      keywords: [],
      conditions: {},
    },
  };
  const startEdge: AutomationFlowEdge = {
    id: createId("edge"),
    source: startNodeId,
    target: primaryEntryId,
    sourceHandle: null,
    targetHandle: null,
  };

  const sourceBridgeByTarget = new Map<string, AutomationFlowNode>();
  for (const targetId of distinctIncomingTargets) {
    const targetNode = sourceNodeById.get(targetId);
    const useSemanticStart =
      distinctIncomingTargets.length === 1 && targetId === primaryEntryId;
    sourceBridgeByTarget.set(
      targetId,
      makeGoToNode({
        id: createId("node"),
        position: targetNode?.position ?? { x: 0, y: 0 },
        targetAutomationId: input.newAutomationId,
        targetNodeId: useSemanticStart ? undefined : targetId,
        referenceName: useSemanticStart
          ? "Comienzo del subflujo"
          : `Entrada al subflujo · ${targetId}`,
      }),
    );
  }

  if (sourceBridgeByTarget.size === 0) {
    const primaryNode = sourceNodeById.get(primaryEntryId);
    sourceBridgeByTarget.set(
      primaryEntryId,
      makeGoToNode({
        id: createId("node"),
        position: primaryNode?.position ?? { x: 0, y: 0 },
        targetAutomationId: input.newAutomationId,
        referenceName: "Comienzo del subflujo",
      }),
    );
  }

  const redirectedIncomingEdges = incomingEdges.map((edge) => ({
    ...edge,
    target: sourceBridgeByTarget.get(edge.target)!.id,
    targetHandle: null,
  }));

  const returnNodeByTarget = new Map<string, AutomationFlowNode>();
  for (const targetId of new Set(outgoingEdges.map((edge) => edge.target))) {
    const outsideTarget = sourceNodeById.get(targetId);
    returnNodeByTarget.set(
      targetId,
      makeGoToNode({
        id: createId("node"),
        position: outsideTarget?.position ?? { x: 0, y: 0 },
        targetAutomationId: input.sourceAutomationId,
        targetNodeId:
          outsideTarget?.type === "start" ? undefined : targetId,
        referenceName: `Retorno al flujo original · ${targetId}`,
      }),
    );
  }
  const redirectedOutgoingEdges = outgoingEdges.map((edge) => ({
    ...edge,
    target: returnNodeByTarget.get(edge.target)!.id,
    targetHandle: null,
  }));

  const ownerNodes = new Map<number, AutomationFlowNode[]>();
  const ownerEdges = new Map<number, AutomationFlowEdge[]>();
  for (const flow of allOriginalFlows) {
    if (flow.id === input.sourceAutomationId) continue;
    ownerNodes.set(flow.id, [...flow.nodes]);
    ownerEdges.set(flow.id, [...flow.edges]);
  }
  ownerNodes.set(
    input.sourceAutomationId,
    input.sourceNodes.filter((node) => !selectedIds.has(node.id)),
  );
  ownerEdges.set(input.sourceAutomationId, [
    ...untouchedSourceEdges,
    ...redirectedIncomingEdges,
  ]);
  ownerNodes.set(input.newAutomationId, [...selectedNodes]);
  ownerEdges.set(input.newAutomationId, [
    ...internalEdges,
    ...redirectedOutgoingEdges,
  ]);

  const pendingFallbackProxies: PendingFallbackProxy[] = [];
  let remappedReferenceCount = 0;

  const remapNode = (
    node: AutomationFlowNode,
    originalOwnerId: number,
    currentOwnerId: number,
  ): AutomationFlowNode => {
    if (node.type !== "go_to_node") return node;
    const originalData = node.data as GoToData;
    let data: GoToData = { ...originalData };
    let changed = false;

    if (data.mode === "specific_node" && data.targetNodeId) {
      const targetOwnerId =
        originalOwnerId === input.sourceAutomationId &&
        selectedIds.has(data.targetNodeId)
          ? input.newAutomationId
          : originalOwnerId;
      const targetNode = originalNodeMaps
        .get(originalOwnerId)
        ?.get(data.targetNodeId);

      if (targetOwnerId !== currentOwnerId) {
        data = {
          ...data,
          mode: "other_flow",
          targetAutomationId: targetOwnerId,
          targetNodeId: targetNode?.type === "start" ? undefined : data.targetNodeId,
        };
        changed = true;
      }
    } else if (data.mode === "other_flow") {
      const originalTargetOwnerId = asPositiveAutomationId(data.targetAutomationId);
      if (originalTargetOwnerId) {
        const targetNode = data.targetNodeId
          ? originalNodeMaps.get(originalTargetOwnerId)?.get(data.targetNodeId)
          : undefined;
        const targetOwnerId =
          data.targetNodeId &&
          originalTargetOwnerId === input.sourceAutomationId &&
          selectedIds.has(data.targetNodeId)
            ? input.newAutomationId
            : originalTargetOwnerId;

        if (targetNode?.type === "start") {
          data = { ...data, targetNodeId: undefined };
          changed = true;
        }

        if (data.targetNodeId && targetOwnerId === currentOwnerId) {
          data = {
            ...data,
            mode: "specific_node",
            targetAutomationId: undefined,
          };
          changed = true;
        } else if (targetOwnerId !== originalTargetOwnerId) {
          data = { ...data, targetAutomationId: targetOwnerId };
          changed = true;
        }
      }
    }

    if (data.fallbackAction === "node" && data.fallbackNodeId) {
      const fallbackTargetOwnerId =
        originalOwnerId === input.sourceAutomationId &&
        selectedIds.has(data.fallbackNodeId)
          ? input.newAutomationId
          : originalOwnerId;
      if (fallbackTargetOwnerId !== currentOwnerId) {
        const fallbackTarget = originalNodeMaps
          .get(originalOwnerId)
          ?.get(data.fallbackNodeId);
        const proxyNodeId = createId("node");
        pendingFallbackProxies.push({
          ownerAutomationId: currentOwnerId,
          targetAutomationId: fallbackTargetOwnerId,
          targetNodeId:
            fallbackTarget?.type === "start" ? undefined : data.fallbackNodeId,
          nodeId: proxyNodeId,
        });
        data = { ...data, fallbackNodeId: proxyNodeId };
        changed = true;
      }
    }

    if (changed) remappedReferenceCount += 1;
    return changed ? ({ ...node, data } as AutomationFlowNode) : node;
  };

  for (const [ownerId, nodes] of ownerNodes) {
    ownerNodes.set(
      ownerId,
      nodes.map((node) => {
        const originalOwnerId =
          ownerId === input.newAutomationId && selectedIds.has(node.id)
            ? input.sourceAutomationId
            : ownerId;
        return remapNode(node, originalOwnerId, ownerId);
      }),
    );
  }

  for (const proxy of pendingFallbackProxies) {
    const nodes = ownerNodes.get(proxy.ownerAutomationId);
    if (!nodes) continue;
    const target = originalNodeMaps
      .get(proxy.targetAutomationId)
      ?.get(proxy.targetNodeId ?? "");
    nodes.push(
      makeGoToNode({
        id: proxy.nodeId,
        position: {
          x: (target?.position.x ?? 0) + 180,
          y: target?.position.y ?? 0,
        },
        targetAutomationId: proxy.targetAutomationId,
        targetNodeId: proxy.targetNodeId,
        referenceName: "Destino de respaldo remapeado",
      }),
    );
  }

  ownerNodes.get(input.sourceAutomationId)!.push(...sourceBridgeByTarget.values());
  ownerNodes.get(input.newAutomationId)!.unshift(startNode);
  ownerNodes.get(input.newAutomationId)!.push(...returnNodeByTarget.values());
  ownerEdges.get(input.newAutomationId)!.unshift(startEdge);

  const updatedExternalFlows = allOriginalFlows
    .filter(
      (flow) =>
        flow.id !== input.sourceAutomationId &&
        ownerNodes.get(flow.id)?.some(
          (node, index) => node !== flow.nodes[index],
        ),
    )
    .map((flow) => ({
      id: flow.id,
      nodes: ownerNodes.get(flow.id)!,
      edges: ownerEdges.get(flow.id)!,
    }));

  return {
    sourceNodes: ownerNodes.get(input.sourceAutomationId)!,
    sourceEdges: ownerEdges.get(input.sourceAutomationId)!,
    newNodes: ownerNodes.get(input.newAutomationId)!,
    newEdges: ownerEdges.get(input.newAutomationId)!,
    updatedExternalFlows,
    remappedReferenceCount,
  };
}

/**
 * Converts physical references to a target automation's start node into the
 * stable semantic representation (`targetNodeId` omitted).
 */
export function normalizeFlowStartReferences(
  flows: AutomationFlowSnapshot[],
): { flows: AutomationFlowSnapshot[]; changedReferences: number } {
  const startIds = new Map(
    flows.map((flow) => [
      flow.id,
      new Set(flow.nodes.filter((node) => node.type === "start").map((node) => node.id)),
    ]),
  );
  let changedReferences = 0;

  const normalized = flows.map((flow) => {
    let changed = false;
    const nodes = flow.nodes.map((node) => {
      if (node.type !== "go_to_node") return node;
      const data = node.data as GoToData;
      const targetAutomationId = asPositiveAutomationId(data.targetAutomationId);
      if (
        data.mode !== "other_flow" ||
        !targetAutomationId ||
        !data.targetNodeId ||
        !startIds.get(targetAutomationId)?.has(data.targetNodeId)
      ) {
        return node;
      }
      changed = true;
      changedReferences += 1;
      return {
        ...node,
        data: { ...data, targetNodeId: undefined },
      } as AutomationFlowNode;
    });
    return changed ? { ...flow, nodes } : flow;
  });

  return { flows: normalized, changedReferences };
}
