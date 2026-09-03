import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutomationNavigatorGraph,
  getAutomationNodeKey,
  getDefaultNavigatorFocus,
  getNavigatorNeighborhood,
  resolveGoToNodeDestination,
} from "../../lib/automation/flow-navigator";

const automations = [
  {
    id: 40,
    name: "COMIENZO",
    isActive: true,
    nodes: [
      { id: "start-a", type: "start", position: { x: 0, y: 0 }, data: {} },
      {
        id: "jump-a",
        type: "go_to_node",
        position: { x: 200, y: 0 },
        data: {
          mode: "other_flow",
          targetAutomationId: 41,
          targetNodeId: "menu-b",
        },
      },
      { id: "local-fallback", type: "end", position: { x: 400, y: 0 }, data: {} },
    ],
    edges: [
      { id: "a-1", source: "start-a", target: "jump-a" },
      { id: "a-2", source: "jump-a", target: "local-fallback" },
    ],
  },
  {
    id: 41,
    name: "PRIMER MENU",
    isActive: false,
    nodes: [
      { id: "start-b", type: "start", position: { x: 0, y: 0 }, data: {} },
      {
        id: "menu-b",
        type: "menu_simple",
        position: { x: 200, y: 0 },
        data: {
          label: "Elige una opción",
          markerStyle: "number_dot",
          menuOptions: [{ id: "sales", text: "Ventas" }],
        },
      },
      { id: "message-b", type: "message", position: { x: 400, y: 0 }, data: { label: "Ventas" } },
    ],
    edges: [
      { id: "b-1", source: "start-b", target: "menu-b" },
      { id: "b-2", source: "menu-b", target: "message-b", sourceHandle: "menu-sales" },
    ],
  },
];

test("navigator begins at the start node of the active automation", () => {
  assert.deepEqual(getDefaultNavigatorFocus(automations), {
    automationId: 40,
    nodeId: "start-a",
  });
});

test("go-to nodes replace their local continuation with the configured cross-flow target", () => {
  const destination = resolveGoToNodeDestination(
    { automationId: 40, nodeId: "jump-a" },
    automations,
  );
  assert.deepEqual(destination, { automationId: 41, nodeId: "menu-b" });

  const graph = buildAutomationNavigatorGraph(automations);
  const outgoing = graph.outgoing.get(
    getAutomationNodeKey({ automationId: 40, nodeId: "jump-a" }),
  );
  assert.equal(outgoing?.length, 1);
  assert.equal(outgoing?.[0].kind, "jump");
  assert.deepEqual(outgoing?.[0].target, destination);
});

test("navigator exposes the previous node and only the next two coherent depths", () => {
  const graph = buildAutomationNavigatorGraph(automations);
  const neighborhood = getNavigatorNeighborhood(graph, {
    automationId: 40,
    nodeId: "jump-a",
  });

  assert.equal(neighborhood.previous[0]?.source.nodeId, "start-a");
  assert.equal(neighborhood.next[0]?.target.nodeId, "menu-b");
  assert.equal(neighborhood.afterNext[0]?.target.nodeId, "message-b");
});

test("navigator keeps every intermediate node in a sequential route", () => {
  const sequential = [
    {
      id: 42,
      name: "FLUJO ACTUAL",
      isActive: true,
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 0 }, data: {} },
        {
          id: "message",
          type: "message",
          position: { x: 200, y: 0 },
          data: { label: "Mensaje completo" },
        },
        {
          id: "save",
          type: "save_contact",
          position: { x: 400, y: 0 },
          data: { nameVariable: "nombre" },
        },
        {
          id: "menu",
          type: "menu_simple",
          position: { x: 600, y: 0 },
          data: {
            label: "Selecciona",
            markerStyle: "number_dot",
            menuOptions: [{ id: "one", text: "Primera opción" }],
          },
        },
        {
          id: "end",
          type: "end",
          position: { x: 800, y: 0 },
          data: {},
        },
      ],
      edges: [
        { id: "edge-start", source: "start", target: "message" },
        { id: "edge-message", source: "message", target: "save" },
        { id: "edge-save", source: "save", target: "menu" },
        {
          id: "edge-menu",
          source: "menu",
          target: "end",
          sourceHandle: "menu-one",
        },
      ],
    },
  ];

  const graph = buildAutomationNavigatorGraph(sequential);
  const messageView = getNavigatorNeighborhood(graph, {
    automationId: 42,
    nodeId: "message",
  });
  assert.equal(messageView.previous[0]?.source.nodeId, "start");
  assert.equal(messageView.next[0]?.target.nodeId, "save");
  assert.equal(messageView.afterNext[0]?.target.nodeId, "menu");

  const saveView = getNavigatorNeighborhood(graph, {
    automationId: 42,
    nodeId: "save",
  });
  assert.equal(saveView.previous[0]?.source.nodeId, "message");
  assert.equal(saveView.next[0]?.target.nodeId, "menu");
  assert.equal(saveView.afterNext[0]?.target.nodeId, "end");
});

test("navigator preserves separate menu connectors even when they share a destination", () => {
  const branched = [
    {
      id: 43,
      name: "MENU",
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 0 }, data: {} },
        {
          id: "menu",
          type: "menu_simple",
          position: { x: 200, y: 0 },
          data: {
            label: "Elige",
            markerStyle: "number_dot",
            menuOptions: [
              { id: "one", text: "Uno" },
              { id: "two", text: "Dos" },
            ],
          },
        },
        { id: "shared", type: "message", position: { x: 400, y: 0 }, data: { label: "Destino" } },
      ],
      edges: [
        { id: "start-menu", source: "start", target: "menu" },
        { id: "one-shared", source: "menu", target: "shared", sourceHandle: "menu-one" },
        { id: "two-shared", source: "menu", target: "shared", sourceHandle: "menu-two" },
      ],
    },
  ];

  const graph = buildAutomationNavigatorGraph(branched);
  const neighborhood = getNavigatorNeighborhood(graph, {
    automationId: 43,
    nodeId: "menu",
  });

  assert.equal(neighborhood.next.length, 2);
  assert.deepEqual(
    neighborhood.next.map((connection) => connection.sourceHandle),
    ["menu-one", "menu-two"],
  );
});
