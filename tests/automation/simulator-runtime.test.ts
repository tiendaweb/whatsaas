import assert from "node:assert/strict";
import test from "node:test";
import type { AutomationFlowEdge } from "../../lib/automation/flow-schema";
import {
  SIMULATOR_NODE_BEHAVIORS,
  findSimulatorChoiceIndex,
  getSimulatorBranchTarget,
  getSimulatorLinearTarget,
  getSimulatorNodeTypes,
  replaceSimulatorVariables,
} from "../../lib/automation/simulator-runtime";

const edges: AutomationFlowEdge[] = [
  {
    id: "edge-wrong",
    source: "menu",
    sourceHandle: "option-0",
    target: "end",
  },
  {
    id: "edge-collect",
    source: "menu",
    sourceHandle: "option-1",
    target: "collect",
  },
  {
    id: "edge-after-collect",
    source: "collect",
    sourceHandle: null,
    target: "save",
  },
];

test("declares simulator behavior for every supported automation node", () => {
  const expectedTypes = [
    "start",
    "message",
    "media",
    "options",
    "delay",
    "collect",
    "form",
    "save_contact",
    "end",
    "button_message",
    "list_message",
    "call_to_action",
    "ai_control",
    "condition",
    "go_to_node",
    "sticky_note",
    "menu_simple",
  ];

  assert.deepEqual(
    getSimulatorNodeTypes().sort(),
    expectedTypes.sort(),
  );
  assert.equal(SIMULATOR_NODE_BEHAVIORS.collect, "input");
  assert.equal(SIMULATOR_NODE_BEHAVIORS.form, "input");
  assert.equal(SIMULATOR_NODE_BEHAVIORS.menu_simple, "input");
});

test("interactive branches never fall through to another connected option", () => {
  assert.equal(getSimulatorBranchTarget("menu", "option-1", edges), "collect");
  assert.equal(getSimulatorBranchTarget("menu", "option-missing", edges), null);
});

test("collect continues only through its linear exit after receiving input", () => {
  assert.equal(getSimulatorLinearTarget("collect", edges), "save");
});

test("matches button and list replies by number, visible text or payload alias", () => {
  const choices = [
    { label: "Ventas", aliases: ["sales", "row-sales"] },
    { label: "Soporte", aliases: ["support", "row-support"] },
  ];

  assert.equal(findSimulatorChoiceIndex(choices, "2"), 1);
  assert.equal(findSimulatorChoiceIndex(choices, "ventas"), 0);
  assert.equal(findSimulatorChoiceIndex(choices, "row-support"), 1);
  assert.equal(findSimulatorChoiceIndex(choices, "desconocido"), -1);
});

test("renders collected variables in later simulator messages", () => {
  assert.equal(
    replaceSimulatorVariables("Hola {{name}}, tu negocio es {{business}}.", {
      name: "Noelia",
      business: "AAPP",
    }),
    "Hola Noelia, tu negocio es AAPP.",
  );
});
