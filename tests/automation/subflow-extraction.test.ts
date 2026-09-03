import assert from "node:assert/strict";
import test from "node:test";
import type {
  AutomationFlowEdge,
  AutomationFlowNode,
} from "../../lib/automation/flow-schema";
import {
  extractAutomationSubflow,
  normalizeFlowStartReferences,
} from "../../lib/automation/subflow-extraction";

function node(
  id: string,
  type: AutomationFlowNode["type"],
  data: Record<string, unknown> = {},
  x = 0,
  y = 0,
) {
  return { id, type, position: { x, y }, data } as AutomationFlowNode;
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = null,
) {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle: null,
  } as AutomationFlowEdge;
}

function deterministicIds() {
  let index = 0;
  return (prefix: "node" | "edge") => `${prefix}-generated-${++index}`;
}

test("extracts a subflow and preserves incoming, outgoing and external references", () => {
  const sourceNodes = [
    node("start", "start", { label: "Start", triggerType: "fallback", keywords: [], conditions: {} }, 0, 0),
    node("a", "message", { label: "A" }, 100, 0),
    node("b", "message", { label: "B" }, 200, 0),
    node("out", "end", { label: "End" }, 300, 0),
    node("local-ref", "go_to_node", {
      mode: "specific_node",
      targetNodeId: "b",
      fallbackAction: "stop",
    }, 100, 100),
  ];
  const sourceEdges = [
    edge("e-start-a", "start", "a"),
    edge("e-a-b", "a", "b"),
    edge("e-b-out", "b", "out", "success"),
  ];
  const externalNodes = [
    node("external-start", "start", { label: "Start", triggerType: "fallback", keywords: [], conditions: {} }),
    node("external-ref", "go_to_node", {
      mode: "other_flow",
      targetAutomationId: 1,
      targetNodeId: "b",
      fallbackAction: "stop",
    }),
  ];

  const result = extractAutomationSubflow({
    sourceAutomationId: 1,
    newAutomationId: 2,
    sourceNodes,
    sourceEdges,
    selectedNodeIds: ["a", "b"],
    teamFlows: [
      { id: 1, nodes: sourceNodes, edges: sourceEdges },
      { id: 3, nodes: externalNodes, edges: [] },
    ],
    createId: deterministicIds(),
  });

  const sourceBridge = result.sourceNodes.find(
    (item) =>
      item.type === "go_to_node" &&
      Number((item.data as Record<string, unknown>).targetAutomationId) === 2 &&
      !(item.data as Record<string, unknown>).targetNodeId,
  );
  assert.ok(sourceBridge, "the single entry must use semantic flow start");
  assert.equal(
    result.sourceEdges.find((item) => item.id === "e-start-a")?.target,
    sourceBridge.id,
  );
  assert.ok(
    !result.sourceEdges.some((item) => item.source === sourceBridge.id),
    "go-to bridges must not receive dead outgoing edges",
  );

  const returnNode = result.newNodes.find(
    (item) =>
      item.type === "go_to_node" &&
      Number((item.data as Record<string, unknown>).targetAutomationId) === 1 &&
      (item.data as Record<string, unknown>).targetNodeId === "out",
  );
  assert.ok(returnNode);
  const redirectedExit = result.newEdges.find((item) => item.id === "e-b-out");
  assert.equal(redirectedExit?.source, "b");
  assert.equal(redirectedExit?.sourceHandle, "success");
  assert.equal(redirectedExit?.target, returnNode.id);

  const localReference = result.sourceNodes.find((item) => item.id === "local-ref");
  assert.equal((localReference?.data as Record<string, unknown>).mode, "other_flow");
  assert.equal((localReference?.data as Record<string, unknown>).targetAutomationId, 2);

  const externalReference = result.updatedExternalFlows[0].nodes.find(
    (item) => item.id === "external-ref",
  );
  assert.equal(
    (externalReference?.data as Record<string, unknown>).targetAutomationId,
    2,
  );
});

test("preserves multiple incoming branches with one explicit bridge per entry", () => {
  const sourceNodes = [
    node("start", "start", { label: "Start", triggerType: "fallback", keywords: [], conditions: {} }),
    node("menu", "options", { label: "Choose", options: ["A", "B"] }),
    node("a", "message", { label: "A" }, 200, 0),
    node("b", "message", { label: "B" }, 200, 150),
  ];
  const sourceEdges = [
    edge("e-start-menu", "start", "menu"),
    edge("e-menu-a", "menu", "a", "option-0"),
    edge("e-menu-b", "menu", "b", "option-1"),
  ];
  const result = extractAutomationSubflow({
    sourceAutomationId: 10,
    newAutomationId: 11,
    sourceNodes,
    sourceEdges,
    selectedNodeIds: ["a", "b"],
    teamFlows: [{ id: 10, nodes: sourceNodes, edges: sourceEdges }],
    createId: deterministicIds(),
  });

  const bridges = result.sourceNodes.filter(
    (item) =>
      item.type === "go_to_node" &&
      Number((item.data as Record<string, unknown>).targetAutomationId) === 11,
  );
  assert.equal(bridges.length, 2);
  assert.deepEqual(
    new Set(
      bridges.map(
        (item) => (item.data as Record<string, unknown>).targetNodeId,
      ),
    ),
    new Set(["a", "b"]),
  );
  assert.equal(
    result.sourceEdges.find((item) => item.id === "e-menu-a")?.sourceHandle,
    "option-0",
  );
  assert.equal(
    result.sourceEdges.find((item) => item.id === "e-menu-b")?.sourceHandle,
    "option-1",
  );
});

test("normalizes physical start-node references without changing explicit destinations", () => {
  const flowOneNodes = [
    node("start-1", "start", { label: "Start", triggerType: "fallback", keywords: [], conditions: {} }),
    node("message-1", "message", { label: "Hello" }),
  ];
  const flowTwoNodes = [
    node("start-2", "start", { label: "Start", triggerType: "fallback", keywords: [], conditions: {} }),
    node("to-start", "go_to_node", {
      mode: "other_flow",
      targetAutomationId: 1,
      targetNodeId: "start-1",
      fallbackAction: "stop",
    }),
    node("to-message", "go_to_node", {
      mode: "other_flow",
      targetAutomationId: 1,
      targetNodeId: "message-1",
      fallbackAction: "stop",
    }),
  ];

  const normalized = normalizeFlowStartReferences([
    { id: 1, nodes: flowOneNodes, edges: [] },
    { id: 2, nodes: flowTwoNodes, edges: [] },
  ]);

  assert.equal(normalized.changedReferences, 1);
  const flowTwo = normalized.flows.find((flow) => flow.id === 2)!;
  assert.equal(
    (flowTwo.nodes.find((item) => item.id === "to-start")?.data as Record<string, unknown>)
      .targetNodeId,
    undefined,
  );
  assert.equal(
    (flowTwo.nodes.find((item) => item.id === "to-message")?.data as Record<string, unknown>)
      .targetNodeId,
    "message-1",
  );
});
