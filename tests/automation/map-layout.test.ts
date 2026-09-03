import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATION_CANVAS_BOTTOM_SPACE,
  AUTOMATION_CANVAS_TOP_SPACE,
  AUTOMATION_CARD_HEIGHT,
  AUTOMATION_ROW_GAP,
  classifyAutomationMapConnections,
  getAutomaticAutomationMapPositions,
  getAutomationMapLevels,
  getSameLevelAutomationPath,
  type AutomationMapConnection,
} from "../../lib/automation/map-layout";

test("active targets keep their downstream level instead of becoming roots", () => {
  const automations = [
    { id: 1, name: "Entry", nodes: [], isActive: false },
    { id: 2, name: "Active target", nodes: [], isActive: true },
  ];
  const levels = getAutomationMapLevels(automations, [
    { id: "1-2", sourceId: 1, targetId: 2 },
  ]);

  assert.equal(levels.get(1), 0);
  assert.equal(levels.get(2), 1);
});

test("cycles share one stable level after their incoming branch", () => {
  const automations = [
    { id: 1, name: "Entry", nodes: [] },
    { id: 2, name: "Cycle A", nodes: [] },
    { id: 3, name: "Cycle B", nodes: [] },
  ];
  const levels = getAutomationMapLevels(automations, [
    { id: "1-2", sourceId: 1, targetId: 2 },
    { id: "2-3", sourceId: 2, targetId: 3 },
    { id: "3-2", sourceId: 3, targetId: 2 },
  ]);

  assert.equal(levels.get(1), 0);
  assert.equal(levels.get(2), 1);
  assert.equal(levels.get(3), 1);
});

test("same-level connections use their own organic route instead of a back edge", () => {
  const connections: AutomationMapConnection[] = [
    { id: "10-11", sourceId: 10, targetId: 11 },
  ];
  const classified = classifyAutomationMapConnections(
    connections,
    new Map([
      [10, 2],
      [11, 2],
    ]),
  );

  assert.equal(classified[0].kind, "same-level");
  const path = getSameLevelAutomationPath(
    { x: 100, y: 100 },
    { x: 100, y: 420 },
    classified[0].laneIndex,
  );
  assert.match(path, /^M /);
  assert.match(path, / C /);
  assert.ok(!path.includes("NaN"));
  assert.ok(
    path.startsWith(`M ${100 + 268} ${100 + 132 / 2}`),
    "same-level connections must leave from the right port",
  );
  assert.ok(
    path.endsWith(`${100 + 268} ${420 + 132 / 2}`),
    "same-level connections must enter through a side port",
  );
});

test("automatic layout leaves breathing room above, below and between cards", () => {
  const automations = [
    { id: 1, name: "A", nodes: [] },
    { id: 2, name: "B", nodes: [] },
    { id: 3, name: "C", nodes: [] },
  ];
  const positions = getAutomaticAutomationMapPositions(automations, []);
  const orderedY = Object.values(positions)
    .map((position) => position.y)
    .sort((a, b) => a - b);

  assert.ok(orderedY[0] >= AUTOMATION_CANVAS_TOP_SPACE);
  assert.ok(
    orderedY[1] - orderedY[0] >= AUTOMATION_CARD_HEIGHT + AUTOMATION_ROW_GAP,
  );
  assert.ok(AUTOMATION_CANVAS_BOTTOM_SPACE >= AUTOMATION_CARD_HEIGHT);
});
