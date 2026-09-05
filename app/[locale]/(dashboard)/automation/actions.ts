"use server";

import { db } from "@/lib/db/drizzle";
import { aiConfigs, automationFolders, automations } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
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
import {
  extractAutomationSubflow,
  type AutomationFlowSnapshot,
} from "@/lib/automation/subflow-extraction";
import { assertTeamInstance } from '@/lib/instances/ownership';

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

export async function getAutomationFolders() {
  const team = await getTeamForUser();
  if (!team) return [];

  return db.query.automationFolders.findMany({
    where: eq(automationFolders.teamId, team.id),
    orderBy: [
      asc(automationFolders.parentId),
      asc(automationFolders.position),
      asc(automationFolders.name),
    ],
  });
}

const AUTOMATION_FOLDER_COLORS = new Set([
  "#8B9D83",
  "#B08B6E",
  "#C66B3D",
  "#606C38",
  "#6B7C85",
  "#9B6A6C",
  "#111827",
  "#374151",
  "#6B7280",
  "#9CA3AF",
  "#D1D5DB",
  "#F3F4F6",
]);

function normalizeAutomationFolderName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Folder name required.");
  if (normalized.length > 120) throw new Error("Folder name is too long.");
  return normalized;
}

async function getOwnedFolderOrThrow(teamId: number, folderId: number) {
  const folder = await db.query.automationFolders.findFirst({
    where: and(
      eq(automationFolders.id, folderId),
      eq(automationFolders.teamId, teamId),
    ),
  });
  if (!folder) throw new Error("Folder not found.");
  return folder;
}

export async function createAutomationFolder(input: {
  name: string;
  parentId?: number | null;
  color?: string;
}) {
  const team = await getTeamForUser();
  if (!team) throw new Error("Unauthorized");

  const name = normalizeAutomationFolderName(input.name);
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    await getOwnedFolderOrThrow(team.id, parentId);
  }

  const siblings = await db.query.automationFolders.findMany({
    where: and(
      eq(automationFolders.teamId, team.id),
      parentId === null
        ? isNull(automationFolders.parentId)
        : eq(automationFolders.parentId, parentId),
    ),
  });
  if (siblings.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error("A folder with this name already exists here.");
  }

  const color = AUTOMATION_FOLDER_COLORS.has(input.color ?? "")
    ? input.color!
    : "#6B7280";
  const [folder] = await db
    .insert(automationFolders)
    .values({
      teamId: team.id,
      parentId,
      name,
      color,
      position: siblings.length,
    })
    .returning();

  revalidatePath("/automation");
  return folder;
}

export async function renameAutomationFolder(folderId: number, name: string) {
  const team = await getTeamForUser();
  if (!team) throw new Error("Unauthorized");
  const folder = await getOwnedFolderOrThrow(team.id, folderId);
  const normalizedName = normalizeAutomationFolderName(name);

  const siblings = await db.query.automationFolders.findMany({
    where: eq(automationFolders.teamId, team.id),
  });
  if (
    siblings.some(
      (item) =>
        item.id !== folder.id &&
        item.parentId === folder.parentId &&
        item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
    )
  ) {
    throw new Error("A folder with this name already exists here.");
  }

  await db
    .update(automationFolders)
    .set({ name: normalizedName, updatedAt: new Date() })
    .where(
      and(
        eq(automationFolders.id, folder.id),
        eq(automationFolders.teamId, team.id),
      ),
    );
  revalidatePath("/automation");
}

export async function deleteAutomationFolder(folderId: number) {
  const team = await getTeamForUser();
  if (!team) throw new Error("Unauthorized");
  const folder = await getOwnedFolderOrThrow(team.id, folderId);

  await db.transaction(async (tx) => {
    await tx
      .update(automations)
      .set({ folderId: folder.parentId })
      .where(
        and(
          eq(automations.teamId, team.id),
          eq(automations.folderId, folder.id),
        ),
      );
    await tx
      .update(automationFolders)
      .set({ parentId: folder.parentId, updatedAt: new Date() })
      .where(
        and(
          eq(automationFolders.teamId, team.id),
          eq(automationFolders.parentId, folder.id),
        ),
      );
    await tx
      .delete(automationFolders)
      .where(
        and(
          eq(automationFolders.id, folder.id),
          eq(automationFolders.teamId, team.id),
        ),
      );
  });

  revalidatePath("/automation");
}

export async function moveAutomationToFolder(
  automationId: number,
  folderId: number | null,
) {
  const { team } = await getOwnedAutomationOrThrow(automationId);
  if (folderId !== null) {
    await getOwnedFolderOrThrow(team.id, folderId);
  }

  await db
    .update(automations)
    .set({ folderId })
    .where(
      and(eq(automations.id, automationId), eq(automations.teamId, team.id)),
    );
  revalidatePath("/automation");
  revalidatePath(`/automation/${automationId}`);
}

async function getAutomationForTeam(teamId: number, id: number) {
  return db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.teamId, teamId)),
    with: { instance: true },
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

export async function createAutomation(
  name: string,
  instanceId: number,
  folderId?: number | null,
) {
  const team = await getTeamForUser();
  if (!team) throw new Error("Unauthorized");
  if (folderId != null) {
    await getOwnedFolderOrThrow(team.id, folderId);
  }
  // La instancia venía sin validar. `triggerAutomationManually` se defiende
  // exigiendo que la automatización coincida en equipo E instancia, pero esa
  // defensa se caía si acá se podía crear una automatización propia apuntando a
  // la instancia de otro equipo: el motor después mandaba con ese token.
  const ownedInstance = await assertTeamInstance(team.id, instanceId);

  const [newBot] = await db
    .insert(automations)
    .values({
      teamId: team.id,
      folderId: folderId ?? null,
      instanceId: ownedInstance.id,
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
  expectedUpdatedAt?: string,
) {
  const { team, automation } = await getOwnedAutomationOrThrow(id);

  const preparedFlow = prepareAutomationFlowForSave({ nodes, edges });
  if (!preparedFlow.success) {
    throw new Error(preparedFlow.errors[0] || "Invalid automation flow.");
  }

  const updatedAt = new Date();
  const expectedVersion = expectedUpdatedAt
    ? new Date(expectedUpdatedAt)
    : undefined;
  if (expectedVersion && Number.isNaN(expectedVersion.getTime())) {
    throw new Error("Invalid automation version.");
  }

  const updatedAutomations = await db
    .update(automations)
    .set({
      nodes: preparedFlow.nodes,
      edges: preparedFlow.edges,
      isActive: automationRequiresManualReview(preparedFlow.nodes)
        ? false
        : automation.isActive,
      updatedAt,
    })
    .where(
      and(
        eq(automations.id, id),
        eq(automations.teamId, team.id),
        ...(expectedVersion ? [eq(automations.updatedAt, expectedVersion)] : []),
      ),
    )
    .returning({ id: automations.id, updatedAt: automations.updatedAt });

  if (updatedAutomations.length === 0) {
    throw new Error(expectedVersion ? "AUTOMATION_VERSION_CONFLICT" : "Automation not found.");
  }

  revalidatePath(`/automation/${id}`);
  revalidatePath("/automation");
  return {
    success: true,
    warnings: preparedFlow.warnings.map((warning) => warning.message),
    updatedAt: updatedAutomations[0].updatedAt.toISOString(),
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
    .returning({ id: automations.id, updatedAt: automations.updatedAt });

  if (updatedAutomations.length === 0) {
    throw new Error("Automation not found.");
  }

  revalidatePath(`/automation/${id}`);
  revalidatePath("/automation");
  return {
    success: true,
    updatedAt: updatedAutomations[0].updatedAt.toISOString(),
  };
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

export async function updateAutomationName(id: number, name: string) {
  const { team } = await getOwnedAutomationOrThrow(id);
  if (!name || name.trim().length < 1) throw new Error("Name required");
  await db
    .update(automations)
    .set({ name: name.trim() })
    .where(and(eq(automations.id, id), eq(automations.teamId, team.id)));
  revalidatePath("/automation");
  revalidatePath(`/automation/${id}`);
}

export async function updateAutomationNote(id: number, note: string) {
  const { team } = await getOwnedAutomationOrThrow(id);
  await db
    .update(automations)
    .set({
      note: note.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, id), eq(automations.teamId, team.id)));
  revalidatePath("/automation");
  revalidatePath(`/automation/${id}`);
}

type SaveSelectionAsAutomationInput = {
  sourceAutomationId: number;
  currentNodes: unknown[];
  currentEdges: unknown[];
  selectedNodeIds: string[];
  expectedUpdatedAt: string;
  name?: string;
};

type SaveSelectionAsAutomationResult = {
  success: true;
  newAutomationId: number;
  sourceNodes: AutomationFlowNode[];
  sourceEdges: AutomationFlowEdge[];
  updatedAt: string;
  remappedReferenceCount: number;
};

export async function saveSelectionAsAutomation(
  input: SaveSelectionAsAutomationInput,
): Promise<SaveSelectionAsAutomationResult> {
  const { team } = await getOwnedAutomationOrThrow(
    input.sourceAutomationId,
  );

  const currentNodes: AutomationFlowNode[] = [];
  for (const node of input.currentNodes) {
    const parsed = automationFlowNodeSchema.safeParse(node);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid automation node payload.",
      );
    }
    currentNodes.push(parsed.data);
  }

  const currentEdges: AutomationFlowEdge[] = [];
  for (const edge of input.currentEdges) {
    const parsed = automationFlowEdgeSchema.safeParse(edge);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid automation edge payload.",
      );
    }
    currentEdges.push(parsed.data);
  }

  if (input.selectedNodeIds.length === 0) {
    throw new Error("No nodes selected.");
  }

  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new Error("Invalid automation version.");
  }

  const transactionResult = await db.transaction(async (tx) => {
    const lockedAutomations = await tx
      .select()
      .from(automations)
      .where(eq(automations.teamId, team.id))
      .for("update");
    const sourceAutomation = lockedAutomations.find(
      (item) => item.id === input.sourceAutomationId,
    );
    if (!sourceAutomation) {
      throw new Error("Automation not found.");
    }
    if (sourceAutomation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new Error("AUTOMATION_VERSION_CONFLICT");
    }

    const teamFlows: AutomationFlowSnapshot[] = lockedAutomations.map((item) => {
      const nodes = (Array.isArray(item.nodes) ? item.nodes : []).map((node) => {
        const parsed = automationFlowNodeSchema.safeParse(node);
        if (!parsed.success) {
          throw new Error(`Automation ${item.id} contains an invalid node.`);
        }
        return parsed.data;
      });
      const edges = (Array.isArray(item.edges) ? item.edges : []).map((edge) => {
        const parsed = automationFlowEdgeSchema.safeParse(edge);
        if (!parsed.success) {
          throw new Error(`Automation ${item.id} contains an invalid edge.`);
        }
        return parsed.data;
      });
      return {
        id: item.id,
        nodes: item.id === input.sourceAutomationId ? currentNodes : nodes,
        edges: item.id === input.sourceAutomationId ? currentEdges : edges,
      };
    });

    const [newAutomation] = await tx
      .insert(automations)
      .values({
        teamId: team.id,
        folderId: sourceAutomation.folderId,
        instanceId: sourceAutomation.instanceId,
        name:
          input.name && input.name.trim()
            ? input.name.trim()
            : `${sourceAutomation.name} · Subflow`,
        nodes: [],
        edges: [],
        isActive: false,
      })
      .returning({ id: automations.id });

    const extracted = extractAutomationSubflow({
      sourceAutomationId: input.sourceAutomationId,
      newAutomationId: newAutomation.id,
      sourceNodes: currentNodes,
      sourceEdges: currentEdges,
      selectedNodeIds: input.selectedNodeIds,
      teamFlows,
    });
    const preparedSource = prepareAutomationFlowForSave({
      nodes: extracted.sourceNodes,
      edges: extracted.sourceEdges,
    });
    const preparedNew = prepareAutomationFlowForSave({
      nodes: extracted.newNodes,
      edges: extracted.newEdges,
    });
    if (!preparedSource.success) {
      throw new Error(preparedSource.errors[0] ?? "Invalid source flow after extraction.");
    }
    if (!preparedNew.success) {
      throw new Error(preparedNew.errors[0] ?? "Invalid extracted subflow.");
    }

    const preparedExternalFlows = extracted.updatedExternalFlows.map((flow) => {
      const prepared = prepareAutomationFlowForSave(flow);
      if (!prepared.success) {
        throw new Error(
          prepared.errors[0] ?? `Invalid referenced automation ${flow.id}.`,
        );
      }
      return { id: flow.id, nodes: prepared.nodes, edges: prepared.edges };
    });

    const updatedAt = new Date();
    await tx
      .update(automations)
      .set({
        nodes: preparedSource.nodes,
        edges: preparedSource.edges,
        isActive: automationRequiresManualReview(preparedSource.nodes)
          ? false
          : sourceAutomation.isActive,
        updatedAt,
      })
      .where(
        and(
          eq(automations.id, input.sourceAutomationId),
          eq(automations.teamId, team.id),
        ),
      );
    await tx
      .update(automations)
      .set({
        nodes: preparedNew.nodes,
        edges: preparedNew.edges,
        updatedAt,
      })
      .where(
        and(
          eq(automations.id, newAutomation.id),
          eq(automations.teamId, team.id),
        ),
      );
    for (const flow of preparedExternalFlows) {
      await tx
        .update(automations)
        .set({ nodes: flow.nodes, edges: flow.edges, updatedAt })
        .where(
          and(
            eq(automations.id, flow.id),
            eq(automations.teamId, team.id),
          ),
        );
    }

    return {
      newAutomationId: newAutomation.id,
      sourceNodes: preparedSource.nodes,
      sourceEdges: preparedSource.edges,
      updatedAt,
      remappedReferenceCount: extracted.remappedReferenceCount,
    };
  });

  revalidatePath(`/automation/${input.sourceAutomationId}`);
  revalidatePath(`/automation/${transactionResult.newAutomationId}`);
  revalidatePath("/automation");

  return {
    success: true,
    newAutomationId: transactionResult.newAutomationId,
    sourceNodes: transactionResult.sourceNodes,
    sourceEdges: transactionResult.sourceEdges,
    updatedAt: transactionResult.updatedAt.toISOString(),
    remappedReferenceCount: transactionResult.remappedReferenceCount,
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
