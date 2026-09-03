import type {
  AutomationFlowEdge,
  AutomationFlowNode,
} from "./flow-schema";

export type NavigatorAutomationLike = {
  id: number;
  name: string;
  isActive?: boolean;
  nodes: unknown;
  edges?: unknown;
};

export type AutomationNodeReference = {
  automationId: number;
  nodeId: string;
};

export type AutomationNavigatorNode = AutomationNodeReference & {
  automation: NavigatorAutomationLike;
  node: AutomationFlowNode;
};

export type AutomationNavigatorConnection = {
  id: string;
  source: AutomationNodeReference;
  target: AutomationNodeReference;
  kind: "edge" | "jump";
  sourceHandle?: string | null;
};

export type AutomationNavigatorGraph = {
  nodes: Map<string, AutomationNavigatorNode>;
  incoming: Map<string, AutomationNavigatorConnection[]>;
  outgoing: Map<string, AutomationNavigatorConnection[]>;
};

export function getAutomationNodeKey(reference: AutomationNodeReference) {
  return `${reference.automationId}:${reference.nodeId}`;
}

export function getAutomationNodes(automation: NavigatorAutomationLike) {
  return Array.isArray(automation.nodes)
    ? (automation.nodes as AutomationFlowNode[])
    : [];
}

export function getAutomationEdges(automation: NavigatorAutomationLike) {
  return Array.isArray(automation.edges)
    ? (automation.edges as AutomationFlowEdge[])
    : [];
}

export function getAutomationStartReference(
  automation: NavigatorAutomationLike,
): AutomationNodeReference | null {
  const nodes = getAutomationNodes(automation);
  const start = nodes.find((node) => node.type === "start") ?? nodes[0];
  return start ? { automationId: automation.id, nodeId: start.id } : null;
}

export function resolveGoToNodeDestination(
  reference: AutomationNodeReference,
  automations: NavigatorAutomationLike[],
): AutomationNodeReference | null {
  const automation = automations.find((item) => item.id === reference.automationId);
  const node = getAutomationNodes(automation ?? { id: -1, name: "", nodes: [] }).find(
    (item) => item.id === reference.nodeId,
  );
  if (!automation || !node || node.type !== "go_to_node") return null;
  if (node.data.mode === "previous_node") return null;

  const targetAutomation =
    node.data.mode === "other_flow"
      ? automations.find(
          (item) => item.id === Number(node.data.targetAutomationId),
        )
      : automation;
  if (!targetAutomation) return null;

  const targetNodes = getAutomationNodes(targetAutomation);
  const explicitTarget = node.data.targetNodeId
    ? targetNodes.find((item) => item.id === node.data.targetNodeId)
    : undefined;
  const target =
    explicitTarget ??
    targetNodes.find((item) => item.type === "start") ??
    targetNodes[0];
  return target
    ? { automationId: targetAutomation.id, nodeId: target.id }
    : null;
}

export function buildAutomationNavigatorGraph(
  automations: NavigatorAutomationLike[],
): AutomationNavigatorGraph {
  const nodes = new Map<string, AutomationNavigatorNode>();
  const incoming = new Map<string, AutomationNavigatorConnection[]>();
  const outgoing = new Map<string, AutomationNavigatorConnection[]>();

  for (const automation of automations) {
    for (const node of getAutomationNodes(automation)) {
      const reference = { automationId: automation.id, nodeId: node.id };
      const key = getAutomationNodeKey(reference);
      nodes.set(key, { ...reference, automation, node });
      incoming.set(key, []);
      outgoing.set(key, []);
    }
  }

  const addConnection = (connection: AutomationNavigatorConnection) => {
    const sourceKey = getAutomationNodeKey(connection.source);
    const targetKey = getAutomationNodeKey(connection.target);
    if (!nodes.has(sourceKey) || !nodes.has(targetKey)) return;
    outgoing.get(sourceKey)?.push(connection);
    incoming.get(targetKey)?.push(connection);
  };

  for (const automation of automations) {
    const automationNodes = getAutomationNodes(automation);
    const nodeById = new Map(automationNodes.map((node) => [node.id, node]));

    for (const edge of getAutomationEdges(automation)) {
      const sourceNode = nodeById.get(edge.source);
      const sourceReference = {
        automationId: automation.id,
        nodeId: edge.source,
      };
      // A configured jump replaces the visual continuation of the local edge.
      if (
        sourceNode?.type === "go_to_node" &&
        resolveGoToNodeDestination(sourceReference, automations)
      ) {
        continue;
      }
      addConnection({
        id: `${automation.id}:edge:${edge.id}`,
        source: sourceReference,
        target: { automationId: automation.id, nodeId: edge.target },
        kind: "edge",
        sourceHandle: edge.sourceHandle,
      });
    }

    for (const node of automationNodes) {
      if (node.type !== "go_to_node") continue;
      const source = { automationId: automation.id, nodeId: node.id };
      const target = resolveGoToNodeDestination(source, automations);
      if (!target) continue;
      addConnection({
        id: `${automation.id}:jump:${node.id}`,
        source,
        target,
        kind: "jump",
      });
    }
  }

  return { nodes, incoming, outgoing };
}

export function getDefaultNavigatorFocus(
  scopedAutomations: NavigatorAutomationLike[],
): AutomationNodeReference | null {
  const ordered = [...scopedAutomations].sort(
    (a, b) =>
      Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) ||
      a.name.localeCompare(b.name),
  );
  for (const automation of ordered) {
    const reference = getAutomationStartReference(automation);
    if (reference) return reference;
  }
  return null;
}

export function getNavigatorNeighborhood(
  graph: AutomationNavigatorGraph,
  focus: AutomationNodeReference,
) {
  const focusKey = getAutomationNodeKey(focus);
  const previous = graph.incoming.get(focusKey) ?? [];
  const next = graph.outgoing.get(focusKey) ?? [];
  const directKeys = new Set(next.map((connection) => getAutomationNodeKey(connection.target)));
  const afterNext = new Map<string, AutomationNavigatorConnection>();

  for (const connection of next) {
    const targetKey = getAutomationNodeKey(connection.target);
    for (const following of graph.outgoing.get(targetKey) ?? []) {
      const followingKey = getAutomationNodeKey(following.target);
      if (followingKey === focusKey || directKeys.has(followingKey)) continue;
      // Preserve each concrete edge. Two different branches may intentionally
      // reach the same node and must remain visible in Navigate.
      if (!afterNext.has(following.id)) afterNext.set(following.id, following);
    }
  }

  return {
    focus: graph.nodes.get(focusKey) ?? null,
    previous,
    next,
    afterNext: [...afterNext.values()],
  };
}
