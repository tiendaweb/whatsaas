import {
  automationAIDraftMetadataSchema,
  type AutomationAIDraftMetadata,
  type AutomationFlowNode,
} from "@/lib/automation/flow-schema";

export function getAutomationAIDraftMetadata(
  nodes: AutomationFlowNode[] | null | undefined,
): AutomationAIDraftMetadata | null {
  if (!nodes?.length) {
    return null;
  }

  const startNode = nodes.find((node) => node.type === "start");
  const parsed = automationAIDraftMetadataSchema.safeParse(
    startNode?.data?.aiDraft,
  );
  return parsed.success ? parsed.data : null;
}

export function automationRequiresManualReview(
  nodes: AutomationFlowNode[] | null | undefined,
) {
  const metadata = getAutomationAIDraftMetadata(nodes);
  return Boolean(metadata && !metadata.reviewedManually);
}

export function applyAutomationAIDraftMetadata(
  nodes: AutomationFlowNode[],
  metadata: AutomationAIDraftMetadata,
): AutomationFlowNode[] {
  let startNodeSeen = false;

  return nodes.map((node) => {
    if (node.type !== "start" || startNodeSeen) {
      return node;
    }

    startNodeSeen = true;

    return {
      ...node,
      data: {
        ...node.data,
        aiDraft: metadata,
      },
    };
  });
}

export function markAutomationAIDraftAsReviewed(
  nodes: AutomationFlowNode[],
  reviewedAt = new Date().toISOString(),
): AutomationFlowNode[] {
  const currentMetadata = getAutomationAIDraftMetadata(nodes);
  if (!currentMetadata) {
    return nodes;
  }

  return applyAutomationAIDraftMetadata(nodes, {
    ...currentMetadata,
    reviewedManually: true,
    reviewedAt,
  });
}
