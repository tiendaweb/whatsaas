import type {
  AutomationFlowEdge,
  AutomationFlowNodeType,
} from "./flow-schema";

export type SimulatorNodeBehavior =
  | "automatic"
  | "choice"
  | "input"
  | "terminal";

/**
 * This record is intentionally exhaustive. Adding a node to flow-schema without
 * deciding how the simulator must treat it becomes a TypeScript error.
 */
export const SIMULATOR_NODE_BEHAVIORS: Record<
  AutomationFlowNodeType,
  SimulatorNodeBehavior
> = {
  start: "automatic",
  message: "automatic",
  media: "automatic",
  options: "choice",
  delay: "automatic",
  collect: "input",
  form: "input",
  save_contact: "automatic",
  end: "terminal",
  button_message: "choice",
  list_message: "choice",
  call_to_action: "automatic",
  ai_control: "automatic",
  condition: "automatic",
  go_to_node: "automatic",
  sticky_note: "automatic",
  menu_simple: "input",
};

export function getSimulatorNodeTypes(): AutomationFlowNodeType[] {
  return Object.keys(SIMULATOR_NODE_BEHAVIORS) as AutomationFlowNodeType[];
}

/**
 * Linear nodes may only have one meaningful exit. Prefer the canonical
 * sourceHandle-less edge, while keeping compatibility with older saved flows.
 */
export function getSimulatorLinearTarget(
  nodeId: string,
  edges: AutomationFlowEdge[],
): string | null {
  return (
    edges.find(
      (edge) =>
        edge.source === nodeId &&
        (edge.sourceHandle === null || edge.sourceHandle === undefined),
    )?.target ??
    edges.find((edge) => edge.source === nodeId)?.target ??
    null
  );
}

/**
 * Interactive nodes must follow the exact selected handle. Falling back to the
 * first edge can silently execute another option and skip input nodes.
 */
export function getSimulatorBranchTarget(
  nodeId: string,
  handle: string,
  edges: AutomationFlowEdge[],
): string | null {
  return (
    edges.find(
      (edge) => edge.source === nodeId && edge.sourceHandle === handle,
    )?.target ?? null
  );
}

export function replaceSimulatorVariables(
  text: string,
  variables: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export type SimulatorChoiceMatch = {
  label: string;
  aliases?: string[];
};

export function findSimulatorChoiceIndex(
  choices: SimulatorChoiceMatch[],
  reply: string,
): number {
  const normalizedReply = reply.trim().toLocaleLowerCase();
  if (!normalizedReply) return -1;

  const numericIndex = Number(normalizedReply);
  if (
    Number.isInteger(numericIndex) &&
    numericIndex >= 1 &&
    numericIndex <= choices.length
  ) {
    return numericIndex - 1;
  }

  return choices.findIndex((choice) =>
    [choice.label, ...(choice.aliases ?? [])].some(
      (candidate) =>
        candidate.trim().toLocaleLowerCase() === normalizedReply,
    ),
  );
}
