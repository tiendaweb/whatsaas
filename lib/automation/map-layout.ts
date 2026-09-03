import type { AutomationFlowNode } from "./flow-schema";

export type AutomationMapLike = {
  id: number;
  name: string;
  nodes: unknown;
  isActive?: boolean;
};

export type AutomationMapPosition = { x: number; y: number };

export type AutomationMapConnection = {
  id: string;
  sourceId: number;
  targetId: number;
};

export type AutomationConnectionKind = "forward" | "same-level" | "back" | "self";

export type ClassifiedAutomationConnection = AutomationMapConnection & {
  kind: AutomationConnectionKind;
  laneIndex: number;
};

export const AUTOMATION_CARD_WIDTH = 268;
export const AUTOMATION_CARD_HEIGHT = 132;
export const AUTOMATION_COLUMN_GAP = 184;
export const AUTOMATION_ROW_GAP = 72;
export const AUTOMATION_CANVAS_TOP_SPACE = 180;
export const AUTOMATION_CANVAS_SIDE_SPACE = 180;
export const AUTOMATION_CANVAS_BOTTOM_SPACE = 240;

export function getAutomationMapConnections(
  automations: AutomationMapLike[],
): AutomationMapConnection[] {
  const automationIds = new Set(automations.map((automation) => automation.id));
  const connections: AutomationMapConnection[] = [];
  const seen = new Set<string>();

  for (const automation of automations) {
    const nodes = Array.isArray(automation.nodes)
      ? (automation.nodes as AutomationFlowNode[])
      : [];
    for (const node of nodes) {
      if (node.type !== "go_to_node" || node.data?.mode !== "other_flow") continue;
      const targetId = Number(node.data?.targetAutomationId);
      if (!Number.isFinite(targetId) || !automationIds.has(targetId)) continue;
      const id = `${automation.id}-${targetId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      connections.push({ id, sourceId: automation.id, targetId });
    }
  }
  return connections;
}

export function getAutomationMapLevels(
  automations: AutomationMapLike[],
  connections: AutomationMapConnection[],
) {
  const automationOrder = new Map(
    [...automations]
      .sort(
        (a, b) =>
          Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) ||
          a.name.localeCompare(b.name),
      )
      .map((automation, index) => [automation.id, index]),
  );
  const ids = automations.map((automation) => automation.id);
  const outgoing = new Map(ids.map((id) => [id, [] as number[]]));

  for (const connection of connections) {
    if (connection.sourceId === connection.targetId) continue;
    outgoing.get(connection.sourceId)?.push(connection.targetId);
  }

  const sortIds = (ids: number[]) =>
    ids.sort(
      (a, b) =>
        (automationOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (automationOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
  for (const targets of outgoing.values()) sortIds(targets);

  // Collapse cycles into strongly connected components first. The resulting
  // component graph is a DAG, so every forward connection can receive a
  // stable left-to-right level without active targets being mistaken for roots.
  let nextIndex = 0;
  const indexById = new Map<number, number>();
  const lowLinkById = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  const components: number[][] = [];

  const visit = (id: number) => {
    indexById.set(id, nextIndex);
    lowLinkById.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const targetId of outgoing.get(id) ?? []) {
      if (!indexById.has(targetId)) {
        visit(targetId);
        lowLinkById.set(
          id,
          Math.min(lowLinkById.get(id)!, lowLinkById.get(targetId)!),
        );
      } else if (onStack.has(targetId)) {
        lowLinkById.set(
          id,
          Math.min(lowLinkById.get(id)!, indexById.get(targetId)!),
        );
      }
    }

    if (lowLinkById.get(id) !== indexById.get(id)) return;
    const component: number[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === id) break;
    }
    sortIds(component);
    components.push(component);
  };

  sortIds([...ids]).forEach((id) => {
    if (!indexById.has(id)) visit(id);
  });

  const componentById = new Map<number, number>();
  components.forEach((component, componentIndex) =>
    component.forEach((id) => componentById.set(id, componentIndex)),
  );
  const componentOutgoing = new Map<number, Set<number>>(
    components.map((_, index) => [index, new Set<number>()]),
  );
  const componentIncomingCount = new Map<number, number>(
    components.map((_, index) => [index, 0]),
  );

  for (const connection of connections) {
    const sourceComponent = componentById.get(connection.sourceId);
    const targetComponent = componentById.get(connection.targetId);
    if (
      sourceComponent === undefined ||
      targetComponent === undefined ||
      sourceComponent === targetComponent ||
      componentOutgoing.get(sourceComponent)?.has(targetComponent)
    ) {
      continue;
    }
    componentOutgoing.get(sourceComponent)?.add(targetComponent);
    componentIncomingCount.set(
      targetComponent,
      (componentIncomingCount.get(targetComponent) ?? 0) + 1,
    );
  }

  const componentOrder = (componentIndex: number) =>
    Math.min(
      ...components[componentIndex].map(
        (id) => automationOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
      ),
    );
  const queue = components
    .map((_, index) => index)
    .filter((index) => (componentIncomingCount.get(index) ?? 0) === 0)
    .sort((a, b) => componentOrder(a) - componentOrder(b));
  const componentLevels = new Map(queue.map((index) => [index, 0]));

  while (queue.length > 0) {
    const sourceComponent = queue.shift()!;
    const sourceLevel = componentLevels.get(sourceComponent) ?? 0;
    const targets = [...(componentOutgoing.get(sourceComponent) ?? [])].sort(
      (a, b) => componentOrder(a) - componentOrder(b),
    );
    for (const targetComponent of targets) {
      componentLevels.set(
        targetComponent,
        Math.max(componentLevels.get(targetComponent) ?? 0, sourceLevel + 1),
      );
      const remaining = (componentIncomingCount.get(targetComponent) ?? 0) - 1;
      componentIncomingCount.set(targetComponent, remaining);
      if (remaining === 0) queue.push(targetComponent);
    }
    queue.sort((a, b) => componentOrder(a) - componentOrder(b));
  }

  return new Map(
    ids.map((id) => [id, componentLevels.get(componentById.get(id) ?? -1) ?? 0]),
  );
}

export function classifyAutomationMapConnections(
  connections: AutomationMapConnection[],
  levels: Map<number, number>,
): ClassifiedAutomationConnection[] {
  const laneCounters = new Map<string, number>();

  return connections.map((connection) => {
    const sourceLevel = levels.get(connection.sourceId) ?? 0;
    const targetLevel = levels.get(connection.targetId) ?? 0;
    let kind: AutomationConnectionKind = "forward";
    if (connection.sourceId === connection.targetId) kind = "self";
    else if (sourceLevel === targetLevel) kind = "same-level";
    else if (targetLevel < sourceLevel) kind = "back";

    if (kind === "forward") return { ...connection, kind, laneIndex: 0 };
    const laneKey =
      kind === "self"
        ? `${kind}:${connection.sourceId}`
        : `${kind}:${Math.min(sourceLevel, targetLevel)}:${Math.max(sourceLevel, targetLevel)}`;
    const laneIndex = laneCounters.get(laneKey) ?? 0;
    laneCounters.set(laneKey, laneIndex + 1);
    return { ...connection, kind, laneIndex };
  });
}

export function getAutomaticAutomationMapPositions(
  automations: AutomationMapLike[],
  connections: AutomationMapConnection[],
) {
  const levels = getAutomationMapLevels(automations, connections);
  const groups = new Map<number, AutomationMapLike[]>();
  for (const automation of automations) {
    const level = levels.get(automation.id) ?? 0;
    const group = groups.get(level) ?? [];
    group.push(automation);
    groups.set(level, group);
  }

  const stableOrder = new Map<number, number>();
  [...automations]
    .sort(
      (a, b) =>
        Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) ||
        a.name.localeCompare(b.name),
    )
    .forEach((automation, index) => stableOrder.set(automation.id, index));
  const incoming = new Map<number, number[]>();
  const outgoing = new Map<number, number[]>();
  for (const connection of connections) {
    if (connection.sourceId === connection.targetId) continue;
    const sources = incoming.get(connection.targetId) ?? [];
    sources.push(connection.sourceId);
    incoming.set(connection.targetId, sources);
    const targets = outgoing.get(connection.sourceId) ?? [];
    targets.push(connection.targetId);
    outgoing.set(connection.sourceId, targets);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        (stableOrder.get(a.id) ?? 0) - (stableOrder.get(b.id) ?? 0),
    );
  }

  // A few barycentric sweeps keep branches near their parent and reduce edge
  // crossings without making the layout depend on saved browser positions.
  const levelNumbers = [...groups.keys()].sort((a, b) => a - b);
  const currentOrder = () => {
    const result = new Map<number, number>();
    for (const level of levelNumbers) {
      groups.get(level)?.forEach((automation, index) => result.set(automation.id, index));
    }
    return result;
  };
  const reorder = (level: number, neighbors: Map<number, number[]>) => {
    const group = groups.get(level);
    if (!group || group.length < 2) return;
    const order = currentOrder();
    const score = (id: number) => {
      const ids = (neighbors.get(id) ?? []).filter((neighborId) => order.has(neighborId));
      if (ids.length === 0) return stableOrder.get(id) ?? 0;
      return ids.reduce((sum, neighborId) => sum + (order.get(neighborId) ?? 0), 0) / ids.length;
    };
    group.sort(
      (a, b) =>
        score(a.id) - score(b.id) ||
        (stableOrder.get(a.id) ?? 0) - (stableOrder.get(b.id) ?? 0),
    );
  };
  for (let pass = 0; pass < 8; pass += 1) {
    for (const level of levelNumbers.slice(1)) reorder(level, incoming);
    for (const level of [...levelNumbers].reverse().slice(1)) reorder(level, outgoing);
  }

  const columnHeight = (count: number) =>
    count * AUTOMATION_CARD_HEIGHT + Math.max(0, count - 1) * AUTOMATION_ROW_GAP;
  const maxHeight = Math.max(0, ...[...groups.values()].map((group) => columnHeight(group.length)));
  const positions: Record<number, AutomationMapPosition> = {};

  for (const [level, group] of groups) {
    const top =
      AUTOMATION_CANVAS_TOP_SPACE + (maxHeight - columnHeight(group.length)) / 2;
    group.forEach((automation, index) => {
      positions[automation.id] = {
        x:
          AUTOMATION_CANVAS_SIDE_SPACE +
          level * (AUTOMATION_CARD_WIDTH + AUTOMATION_COLUMN_GAP),
        y: top + index * (AUTOMATION_CARD_HEIGHT + AUTOMATION_ROW_GAP),
      };
    });
  }
  return positions;
}

export function getForwardAutomationPath(
  source: AutomationMapPosition,
  target: AutomationMapPosition,
) {
  const startX = source.x + AUTOMATION_CARD_WIDTH;
  const startY = source.y + AUTOMATION_CARD_HEIGHT / 2;
  const endX = target.x;
  const endY = target.y + AUTOMATION_CARD_HEIGHT / 2;
  const curve = Math.max(54, Math.min(118, Math.abs(endX - startX) * 0.48));
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}

export function getSameLevelAutomationPath(
  source: AutomationMapPosition,
  target: AutomationMapPosition,
  laneIndex: number,
) {
  const startX = source.x + AUTOMATION_CARD_WIDTH;
  const endX = target.x + AUTOMATION_CARD_WIDTH;
  const startY = source.y + AUTOMATION_CARD_HEIGHT / 2;
  const endY = target.y + AUTOMATION_CARD_HEIGHT / 2;
  const railX =
    Math.max(source.x, target.x) +
    AUTOMATION_CARD_WIDTH +
    64 +
    (laneIndex % 5) * 22;
  const middleY = (startY + endY) / 2;
  return [
    `M ${startX} ${startY}`,
    `C ${railX} ${startY}, ${railX} ${middleY}, ${railX} ${middleY}`,
    `C ${railX} ${middleY}, ${railX} ${endY}, ${endX} ${endY}`,
  ].join(" ");
}

export function getBackAutomationPath(
  source: AutomationMapPosition,
  target: AutomationMapPosition,
  laneIndex: number,
) {
  const startX = source.x + AUTOMATION_CARD_WIDTH / 2;
  const endX = target.x + AUTOMATION_CARD_WIDTH / 2;
  const startY = source.y + AUTOMATION_CARD_HEIGHT;
  const endY = target.y + AUTOMATION_CARD_HEIGHT;
  const dropY = Math.max(startY, endY) + 74 + laneIndex * 24;
  return `M ${startX} ${startY} C ${startX} ${dropY}, ${endX} ${dropY}, ${endX} ${endY}`;
}

export function getSelfAutomationPath(
  position: AutomationMapPosition,
  laneIndex: number,
) {
  const x = position.x + AUTOMATION_CARD_WIDTH;
  const startY = position.y + AUTOMATION_CARD_HEIGHT / 2 + 22;
  const endY = position.y + AUTOMATION_CARD_HEIGHT / 2 - 22;
  const reach = 76 + laneIndex * 22;
  return `M ${x} ${startY} C ${x + reach} ${startY + 42}, ${x + reach} ${endY - 42}, ${x} ${endY}`;
}
