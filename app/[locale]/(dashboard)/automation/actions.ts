"use server";

import { db } from "@/lib/db/drizzle";
import { aiConfigs, automations } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTeamForUser } from "@/lib/db/queries";
import { automationRequiresManualReview } from "@/lib/automation/ai-draft";
import { getAIProviderForConfig } from "@/lib/plugins/ai-chat/service";
import type { AIMessage } from "@/lib/plugins/ai-chat/types";
import {
  automationAIGenerationRequestSchema,
  buildAutomationFlowGeneratorPrompt,
  extractJsonObject,
  validateGeneratedAutomationFlow,
} from "@/lib/automation/ai-flow";
import {
  type AutomationFlowEdge,
  type AutomationFlowNode,
  automationFlowEdgeSchema,
  automationFlowNodeSchema,
} from "@/lib/automation/flow-schema";
import { prepareAutomationFlowForSave } from "@/lib/automation/flow-normalizer";

export async function getAutomations() {
  const team = await getTeamForUser();
  if (!team) return [];

  return await db.query.automations.findMany({
    where: eq(automations.teamId, team.id),
    orderBy: [desc(automations.updatedAt)],
    with: {
      instance: true,
    },
  });
}

async function getAutomationForTeam(teamId: number, id: number) {
  return db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.teamId, teamId)),
  });
}

// Reuse this guard for any future action/endpoint that mutates an automation
// (including AI-assisted node/edge overwrites) to keep ownership validation centralized.
async function getOwnedAutomationOrThrow(id: number) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error("Unauthorized");
  }

  const automation = await getAutomationForTeam(team.id, id);
  if (!automation) {
    throw new Error("Automation not found.");
  }

  return { team, automation };
}

export async function getAutomation(id: number) {
  const team = await getTeamForUser();
  if (!team) return null;

  return getAutomationForTeam(team.id, id);
}

export async function createAutomation(name: string, instanceId: number) {
  const team = await getTeamForUser();
  if (!team) throw new Error("Unauthorized");

  const [newBot] = await db
    .insert(automations)
    .values({
      teamId: team.id,
      instanceId: instanceId,
      name: name,
      nodes: [],
      edges: [],
      isActive: false,
    })
    .returning();

  return { success: true, id: newBot.id };
}

export async function saveAutomation(
  id: number,
  nodes: AutomationFlowNode[],
  edges: AutomationFlowEdge[],
) {
  const { team, automation } = await getOwnedAutomationOrThrow(id);

  const preparedFlow = prepareAutomationFlowForSave({ nodes, edges });
  if (!preparedFlow.success) {
    throw new Error(preparedFlow.errors[0] || "Invalid automation flow.");
  }

  const updatedAutomations = await db
    .update(automations)
    .set({
      nodes: preparedFlow.nodes,
      edges: preparedFlow.edges,
      isActive: automationRequiresManualReview(preparedFlow.nodes)
        ? false
        : automation.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, id), eq(automations.teamId, team.id)))
    .returning({ id: automations.id });

  if (updatedAutomations.length === 0) {
    throw new Error("Automation not found.");
  }

  revalidatePath(`/automation/${id}`);
  revalidatePath("/automation");
  return {
    success: true,
    warnings: preparedFlow.warnings.map((warning) => warning.message),
  };
}

export async function toggleAutomationStatus(id: number, isActive: boolean) {
  const { team, automation } = await getOwnedAutomationOrThrow(id);

  if (
    isActive &&
    automationRequiresManualReview(automation.nodes as AutomationFlowNode[])
  ) {
    throw new Error("Automation requires manual review before activation.");
  }

  const updatedAutomations = await db
    .update(automations)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.teamId, team.id)))
    .returning({ id: automations.id });

  if (updatedAutomations.length === 0) {
    throw new Error("Automation not found.");
  }

  revalidatePath(`/automation/${id}`);
  revalidatePath("/automation");
  return { success: true };
}

export async function deleteAutomation(id: number) {
  const { team } = await getOwnedAutomationOrThrow(id);

  const deletedAutomations = await db
    .delete(automations)
    .where(and(eq(automations.id, id), eq(automations.teamId, team.id)))
    .returning({ id: automations.id });

  if (deletedAutomations.length === 0) {
    throw new Error("Automation not found.");
  }

  revalidatePath("/automation");
}

type SaveSelectionAsAutomationInput = {
  sourceAutomationId: number;
  selectedNodes: unknown[];
  selectedEdges: unknown[];
};

type SaveSelectionAsAutomationResult = {
  success: true;
  newAutomationId: number;
  startNodeId: string;
};

function generateFlowId(prefix: "node" | "edge") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function saveSelectionAsAutomation(
  input: SaveSelectionAsAutomationInput,
): Promise<SaveSelectionAsAutomationResult> {
  const { team, automation } = await getOwnedAutomationOrThrow(
    input.sourceAutomationId,
  );

  const parsedNodes: AutomationFlowNode[] = [];
  for (const node of input.selectedNodes) {
    const parsed = automationFlowNodeSchema.safeParse(node);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid selected node payload.",
      );
    }
    parsedNodes.push(parsed.data);
  }

  const parsedEdges: AutomationFlowEdge[] = [];
  for (const edge of input.selectedEdges) {
    const parsed = automationFlowEdgeSchema.safeParse(edge);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid selected edge payload.",
      );
    }
    parsedEdges.push(parsed.data);
  }

  if (parsedNodes.length === 0) {
    throw new Error("No nodes selected.");
  }

  if (parsedNodes.some((node) => node.type === "start")) {
    throw new Error("Start node cannot be moved into a new automation.");
  }

  const selectedNodeIds = new Set(parsedNodes.map((node) => node.id));
  const internalEdges = parsedEdges.filter(
    (edge) =>
      selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
  );
  const nodesWithIncoming = new Set(
    internalEdges.map((edge) => edge.target).filter(Boolean),
  );
  const entryNodes = parsedNodes.filter((node) => !nodesWithIncoming.has(node.id));

  const startNodeId = generateFlowId("node");
  const startNode: AutomationFlowNode = {
    id: startNodeId,
    type: "start",
    position: { x: 0, y: 0 },
    data: {
      label: "Start",
      triggerType: "fallback",
      keywords: [],
      conditions: {},
    },
  };

  const startEdges: AutomationFlowEdge[] = (entryNodes.length > 0
    ? entryNodes
    : [parsedNodes[0]]
  ).map((entryNode) => ({
    id: generateFlowId("edge"),
    source: startNodeId,
    target: entryNode.id,
    sourceHandle: null,
    targetHandle: null,
  }));

  const preparedFlow = prepareAutomationFlowForSave({
    nodes: [startNode, ...parsedNodes],
    edges: [...internalEdges, ...startEdges],
  });

  if (!preparedFlow.success) {
    throw new Error(preparedFlow.errors[0] ?? "Invalid selected subflow.");
  }

  const [newAutomation] = await db
    .insert(automations)
    .values({
      teamId: team.id,
      instanceId: automation.instanceId,
      name: `${automation.name} · Subflow`,
      nodes: preparedFlow.nodes,
      edges: preparedFlow.edges,
      isActive: false,
      updatedAt: new Date(),
    })
    .returning({ id: automations.id });

  revalidatePath(`/automation/${input.sourceAutomationId}`);
  revalidatePath(`/automation/${newAutomation.id}`);
  revalidatePath("/automation");

  return {
    success: true,
    newAutomationId: newAutomation.id,
    startNodeId,
  };
}

export type GenerateAutomationFlowResult = {
  success: boolean;
  error?: string;
  rawResponse?: string;
  validationErrors?: string[];
  flow?: {
    suggestedName: string;
    warnings: string[];
    nodes: AutomationFlowNode[];
    edges: AutomationFlowEdge[];
  };
};

export async function generateAutomationFlow(
  input: unknown,
): Promise<GenerateAutomationFlowResult> {
  const team = await getTeamForUser();
  if (!team) {
    return { success: false, error: "Unauthorized" };
  }

  const parsedInput = automationAIGenerationRequestSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message || "Invalid request.",
      validationErrors: parsedInput.error.issues.map((issue) => issue.message),
    };
  }

  const config = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.teamId, team.id),
  });

  if (!config) {
    return {
      success: false,
      error: "AI provider is not configured for this team.",
    };
  }

  if (!config.isActive) {
    return {
      success: false,
      error: "AI is configured but currently disabled for this team.",
    };
  }

  const provider = await getAIProviderForConfig({
    ...config,
    systemPrompt: [
      config.systemPrompt?.trim(),
      buildAutomationFlowGeneratorPrompt(parsedInput.data),
    ]
      .filter(Boolean)
      .join("\n\n"),
    temperature: String(
      parsedInput.data.temperature ?? (Number(config.temperature) || 0.7),
    ),
    maxOutputTokens:
      parsedInput.data.maxOutputTokens ?? config.maxOutputTokens ?? 1400,
  });

  const messages: AIMessage[] = [
    {
      role: "user",
      content: [
        `Generate an automation flow in locale ${parsedInput.data.locale}.`,
        `Channel: ${parsedInput.data.channel}.`,
        `User request: ${parsedInput.data.prompt}`,
      ].join("\n"),
    },
  ];

  try {
    const response = await provider.generateResponse(messages);
    const rawResponse = response.content?.trim();

    if (!rawResponse) {
      return {
        success: false,
        error: "The AI provider returned an empty response.",
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonObject(rawResponse));
    } catch (error) {
      return {
        success: false,
        error: "Unable to parse the AI response as JSON.",
        rawResponse,
        validationErrors: ["The model returned text that is not valid JSON."],
      };
    }

    const validatedFlow = validateGeneratedAutomationFlow(parsedJson, {
      allowedNodeTypes: parsedInput.data.allowedNodeTypes,
      channel: parsedInput.data.channel,
      requireSingleStart: true,
    });

    if (!validatedFlow.success) {
      return {
        success: false,
        error: "The generated flow did not pass validation.",
        rawResponse,
        validationErrors: validatedFlow.errors,
      };
    }

    return {
      success: true,
      rawResponse,
      flow: validatedFlow.data,
    };
  } catch (error) {
    console.error("Failed to generate automation flow:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error generating the automation flow.",
    };
  }
}
