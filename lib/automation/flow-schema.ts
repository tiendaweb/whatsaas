import type {
  Edge as ReactFlowEdge,
  Node as ReactFlowNode,
} from "@xyflow/react";
import { z } from "zod";

export const AUTOMATION_FLOW_CHANNELS = ["qr", "api"] as const;
export type AutomationFlowChannel = (typeof AUTOMATION_FLOW_CHANNELS)[number];

export const AUTOMATION_FLOW_NODE_TYPES = [
  "start",
  "message",
  "media",
  "options",
  "delay",
  "collect",
  "save_contact",
  "end",
  "button_message",
  "list_message",
  "call_to_action",
  "ai_control",
  "condition",
  "go_to_node",
] as const;

export type AutomationFlowNodeType =
  (typeof AUTOMATION_FLOW_NODE_TYPES)[number];

export const AUTOMATION_TEXT_LIMITS = {
  qr: {
    text: 4096,
    option: 160,
    mediaCaption: 1024,
  },
  api: {
    title: 60,
    body: 1024,
    footer: 60,
    buttonText: 20,
    buttonValue: 256,
    listItemTitle: 24,
    listItemDescription: 72,
    listItemRowId: 200,
    ctaUrl: 2048,
  },
} as const;

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const startConditionsSchema = z
  .object({
    funnelStageId: z.string().min(1).optional(),
    tagId: z.string().min(1).optional(),
    assignedUserId: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
  })
  .partial();

export const automationAIDraftMetadataSchema = z.object({
  source: z.literal("ai"),
  status: z.literal("draft_generated"),
  originalPrompt: z.string().min(1),
  generatedAt: z.string().datetime(),
  reviewedManually: z.boolean(),
  reviewedAt: z.string().datetime().nullable().optional(),
});

export const startNodeDataSchema = z.object({
  label: z.string().optional(),
  triggerType: z
    .enum(["exact_match", "contains", "first_message", "fallback"])
    .optional(),
  keywords: z.array(z.string().min(1)).optional(),
  conditions: startConditionsSchema.optional(),
  aiDraft: automationAIDraftMetadataSchema.optional(),
});

export const messageNodeDataSchema = z.object({
  label: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.qr.text),
});

export const mediaNodeDataSchema = z.object({
  mediaUrl: z.string().optional(),
  mediaType: z.enum(["image", "video", "audio", "document"]).optional(),
  caption: z.string().max(AUTOMATION_TEXT_LIMITS.qr.mediaCaption).optional(),
  fileName: z.string().optional(),
  mediaMimetype: z.string().optional(),
});

export const optionsNodeDataSchema = z.object({
  label: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.qr.text),
  options: z
    .array(z.string().min(1).max(AUTOMATION_TEXT_LIMITS.qr.option))
    .min(1)
    .max(10),
});

export const delayNodeDataSchema = z.object({
  seconds: z.number().int().positive().max(86400),
  label: z.string().optional(),
});

export const collectNodeDataSchema = z.object({
  label: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.qr.text),
  variable: z.string().min(1),
});

export const saveContactNodeDataSchema = z.object({
  nameVariable: z.string().optional(),
  agentId: z.string().optional(),
  departmentId: z.string().optional(),
  tagId: z.string().optional(),
  funnelStageId: z.string().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

export const endNodeDataSchema = z.object({}).passthrough();

export const buttonMessageButtonSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.buttonText),
  value: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.buttonValue),
});

export const buttonMessageNodeDataSchema = z.object({
  title: z.string().max(AUTOMATION_TEXT_LIMITS.api.title).optional(),
  bodyText: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.body),
  footerText: z.string().max(AUTOMATION_TEXT_LIMITS.api.footer).optional(),
  buttonText: z.string().max(AUTOMATION_TEXT_LIMITS.api.buttonText).optional(),
  buttons: z.array(buttonMessageButtonSchema).min(1).max(3),
});

export const listMessageItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.listItemTitle),
  description: z
    .string()
    .max(AUTOMATION_TEXT_LIMITS.api.listItemDescription)
    .optional(),
  rowId: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.listItemRowId),
});

export const listMessageNodeDataSchema = z.object({
  title: z.string().max(AUTOMATION_TEXT_LIMITS.api.title).optional(),
  bodyText: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.body),
  footerText: z.string().max(AUTOMATION_TEXT_LIMITS.api.footer).optional(),
  buttonText: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.buttonText),
  items: z.array(listMessageItemSchema).min(1).max(10),
});

export const callToActionNodeDataSchema = z.object({
  title: z.string().max(AUTOMATION_TEXT_LIMITS.api.title).optional(),
  bodyText: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.body),
  footerText: z.string().max(AUTOMATION_TEXT_LIMITS.api.footer).optional(),
  buttonText: z.string().min(1).max(AUTOMATION_TEXT_LIMITS.api.buttonText),
  url: z.string().url().max(AUTOMATION_TEXT_LIMITS.api.ctaUrl),
});

export const aiControlNodeDataSchema = z.object({
  action: z.enum(["active", "paused"]),
});

export const conditionEntrySchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  operator: z.string().min(1),
  value: z.string().min(1),
  value2: z.string().optional(),
});

export const conditionNodeDataSchema = z.object({
  conditions: z.array(conditionEntrySchema).min(1),
  label: z.string().optional(),
});

export const goToNodeDataSchema = z
  .object({
    mode: z.enum(["previous_node", "specific_node", "other_flow"]),
    targetNodeId: z.string().min(1).optional(),
    targetAutomationId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    fallbackNodeId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "specific_node" && !data.targetNodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetNodeId is required when mode is specific_node.",
        path: ["targetNodeId"],
      });
    }

    if (data.mode === "other_flow") {
      if (!data.targetAutomationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "targetAutomationId is required when mode is other_flow.",
          path: ["targetAutomationId"],
        });
      }
    }
  });

export const automationNodeDataSchemaByType = {
  start: startNodeDataSchema,
  message: messageNodeDataSchema,
  media: mediaNodeDataSchema,
  options: optionsNodeDataSchema,
  delay: delayNodeDataSchema,
  collect: collectNodeDataSchema,
  save_contact: saveContactNodeDataSchema,
  end: endNodeDataSchema,
  button_message: buttonMessageNodeDataSchema,
  list_message: listMessageNodeDataSchema,
  call_to_action: callToActionNodeDataSchema,
  ai_control: aiControlNodeDataSchema,
  condition: conditionNodeDataSchema,
  go_to_node: goToNodeDataSchema,
} as const;

const createNodeSchema = <TType extends AutomationFlowNodeType>(
  type: TType,
  dataSchema: (typeof automationNodeDataSchemaByType)[TType],
) =>
  z.object({
    id: z.string().min(1),
    type: z.literal(type),
    position: positionSchema,
    data: dataSchema,
  });

export const automationFlowNodeSchema = z.discriminatedUnion("type", [
  createNodeSchema("start", startNodeDataSchema),
  createNodeSchema("message", messageNodeDataSchema),
  createNodeSchema("media", mediaNodeDataSchema),
  createNodeSchema("options", optionsNodeDataSchema),
  createNodeSchema("delay", delayNodeDataSchema),
  createNodeSchema("collect", collectNodeDataSchema),
  createNodeSchema("save_contact", saveContactNodeDataSchema),
  createNodeSchema("end", endNodeDataSchema),
  createNodeSchema("button_message", buttonMessageNodeDataSchema),
  createNodeSchema("list_message", listMessageNodeDataSchema),
  createNodeSchema("call_to_action", callToActionNodeDataSchema),
  createNodeSchema("ai_control", aiControlNodeDataSchema),
  createNodeSchema("condition", conditionNodeDataSchema),
  createNodeSchema("go_to_node", goToNodeDataSchema),
]);

export const automationFlowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export type AutomationFlowNode = z.infer<typeof automationFlowNodeSchema>;
export type AutomationFlowEdge = z.infer<typeof automationFlowEdgeSchema>;
export type AutomationFlowNodeData = AutomationFlowNode["data"];
export type AutomationAIDraftMetadata = z.infer<
  typeof automationAIDraftMetadataSchema
>;
export type StartNodeData = z.infer<typeof startNodeDataSchema>;
export type ConditionEntry = z.infer<typeof conditionEntrySchema>;
export type ButtonMessageButton = z.infer<typeof buttonMessageButtonSchema>;
export type ListMessageItem = z.infer<typeof listMessageItemSchema>;

export type MessageNodeData = z.infer<typeof messageNodeDataSchema>;
export type MediaNodeData = z.infer<typeof mediaNodeDataSchema>;
export type OptionsNodeData = z.infer<typeof optionsNodeDataSchema>;
export type DelayNodeData = z.infer<typeof delayNodeDataSchema>;
export type CollectNodeData = z.infer<typeof collectNodeDataSchema>;
export type SaveContactNodeData = z.infer<typeof saveContactNodeDataSchema>;
export type CallToActionNodeData = z.infer<typeof callToActionNodeDataSchema>;
export type AIControlNodeData = z.infer<typeof aiControlNodeDataSchema>;
export type ConditionNodeData = z.infer<typeof conditionNodeDataSchema>;
export type GoToNodeData = z.infer<typeof goToNodeDataSchema>;

export type AutomationCanvasNodeData = {
  label?:
    | StartNodeData["label"]
    | MessageNodeData["label"]
    | OptionsNodeData["label"]
    | DelayNodeData["label"]
    | CollectNodeData["label"]
    | ConditionNodeData["label"];
  triggerType?: StartNodeData["triggerType"];
  keywords?: StartNodeData["keywords"];
  conditions?: StartNodeData["conditions"] | ConditionEntry[];
  aiDraft?: StartNodeData["aiDraft"];
  mediaUrl?: MediaNodeData["mediaUrl"];
  mediaType?: MediaNodeData["mediaType"];
  caption?: MediaNodeData["caption"];
  fileName?: MediaNodeData["fileName"];
  mediaMimetype?: MediaNodeData["mediaMimetype"];
  options?: OptionsNodeData["options"];
  seconds?: DelayNodeData["seconds"];
  variable?: CollectNodeData["variable"];
  nameVariable?: SaveContactNodeData["nameVariable"];
  agentId?: SaveContactNodeData["agentId"];
  departmentId?: SaveContactNodeData["departmentId"];
  tagId?: SaveContactNodeData["tagId"];
  funnelStageId?: SaveContactNodeData["funnelStageId"];
  customFields?: SaveContactNodeData["customFields"];
  title?:
    | z.infer<typeof buttonMessageNodeDataSchema>["title"]
    | z.infer<typeof listMessageNodeDataSchema>["title"]
    | CallToActionNodeData["title"];
  bodyText?:
    | z.infer<typeof buttonMessageNodeDataSchema>["bodyText"]
    | z.infer<typeof listMessageNodeDataSchema>["bodyText"]
    | CallToActionNodeData["bodyText"];
  footerText?:
    | z.infer<typeof buttonMessageNodeDataSchema>["footerText"]
    | z.infer<typeof listMessageNodeDataSchema>["footerText"]
    | CallToActionNodeData["footerText"];
  buttonText?:
    | z.infer<typeof buttonMessageNodeDataSchema>["buttonText"]
    | z.infer<typeof listMessageNodeDataSchema>["buttonText"]
    | CallToActionNodeData["buttonText"];
  buttons?: ButtonMessageButton[];
  items?: ListMessageItem[];
  url?: CallToActionNodeData["url"];
  action?: AIControlNodeData["action"];
  mode?: GoToNodeData["mode"];
  targetNodeId?: GoToNodeData["targetNodeId"];
  targetAutomationId?: GoToNodeData["targetAutomationId"];
  fallbackNodeId?: GoToNodeData["fallbackNodeId"];
};

export type AutomationCanvasNode = ReactFlowNode<
  AutomationCanvasNodeData,
  AutomationFlowNodeType
>;

export type AutomationCanvasEdge = ReactFlowEdge;

const handleValidators: Partial<
  Record<AutomationFlowNodeType, (node: AutomationFlowNode) => Set<string>>
> = {
  options: (node) =>
    new Set(
      (
        node as Extract<AutomationFlowNode, { type: "options" }>
      ).data.options.map((_, index: number) => `option-${index}`),
    ),
  button_message: (node) =>
    new Set(
      (
        node as Extract<AutomationFlowNode, { type: "button_message" }>
      ).data.buttons.map((button) => `btn-${button.id}`),
    ),
  list_message: (node) =>
    new Set(
      (
        node as Extract<AutomationFlowNode, { type: "list_message" }>
      ).data.items.map((item) => `list-${item.id}`),
    ),
  condition: (node) =>
    new Set([
      ...(
        node as Extract<AutomationFlowNode, { type: "condition" }>
      ).data.conditions.map((condition) => condition.id),
      "fallback",
    ]),
};

export type ValidateAutomationFlowOptions = {
  allowedNodeTypes?: AutomationFlowNodeType[];
  channel?: AutomationFlowChannel;
  requireSingleStart?: boolean;
};

export const automationFlowCanvasSchema = z
  .object({
    nodes: z.array(automationFlowNodeSchema).min(1),
    edges: z.array(automationFlowEdgeSchema).default([]),
  })
  .superRefine((flow, ctx) => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const startNodes = flow.nodes.filter((node) => node.type === "start");

    for (const node of flow.nodes) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id: ${node.id}`,
          path: ["nodes"],
        });
      }
      nodeIds.add(node.id);
    }

    if (startNodes.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The flow must include exactly one start node.",
        path: ["nodes"],
      });
    }

    const nodeMap = new Map(flow.nodes.map((node) => [node.id, node] as const));

    for (const edge of flow.edges) {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate edge id: ${edge.id}`,
          path: ["edges"],
        });
      }
      edgeIds.add(edge.id);

      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references unknown source node ${edge.source}.`,
          path: ["edges"],
        });
      }

      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references unknown target node ${edge.target}.`,
          path: ["edges"],
        });
      }

      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) {
        continue;
      }

      const allowedHandles = handleValidators[sourceNode.type]?.(sourceNode);
      if (allowedHandles) {
        if (!edge.sourceHandle || !allowedHandles.has(edge.sourceHandle)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Edge ${edge.id} must use a valid sourceHandle for node ${sourceNode.id}.`,
            path: ["edges"],
          });
        }
      }
    }
  });

export type AutomationFlowCanvas = z.infer<typeof automationFlowCanvasSchema>;

export function validateAutomationFlow(
  input: unknown,
  options?: ValidateAutomationFlowOptions,
):
  | { success: true; data: AutomationFlowCanvas }
  | { success: false; errors: string[] } {
  const parsed = automationFlowCanvasSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const errors: string[] = [];
  const allowedNodeTypes = new Set(
    options?.allowedNodeTypes ?? AUTOMATION_FLOW_NODE_TYPES,
  );

  for (const node of parsed.data.nodes) {
    if (!allowedNodeTypes.has(node.type)) {
      errors.push(`Node type not allowed: ${node.type}`);
    }

    if (
      options?.channel === "api" &&
      (node.type === "message" || node.type === "media")
    ) {
      errors.push(`Node type ${node.type} is not allowed for API flows.`);
    }

    if (
      options?.channel === "qr" &&
      ["button_message", "list_message", "call_to_action"].includes(node.type)
    ) {
      errors.push(`Node type ${node.type} is not allowed for QR flows.`);
    }
  }

  if (options?.requireSingleStart === false) {
    const startCount = parsed.data.nodes.filter(
      (node) => node.type === "start",
    ).length;
    if (startCount === 0) {
      errors.push("The flow must include at least one start node.");
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: parsed.data };
}
