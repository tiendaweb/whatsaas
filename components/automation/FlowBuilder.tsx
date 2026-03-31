"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeChange,
  OnSelectionChangeFunc,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  ProOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Clock,
  ExternalLink,
  Image,
  List,
  ListChecks,
  Save,
  Loader2,
  MessageSquare,
  MousePointerClick,
  PlayCircle,
  PauseCircle,
  PenLine,
  LayoutGrid,
  Sparkles,
  Split,
  AlertTriangle,
  CheckCircle2,
  Siren,
  Plus,
  XCircle,
  GitBranchPlus,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { StartNode } from "./nodes/StartNode";
import { MessageNode } from "./nodes/MessageNode";
import { OptionsNode } from "./nodes/OptionsNode";
import { DelayNode } from "./nodes/DelayNode";
import { CollectNode } from "./nodes/CollectNode";
import { SaveContactNode } from "./nodes/SaveContactNode";
import { MediaNode } from "./nodes/MediaNode";
import { EndNode } from "./nodes/EndNode";
import { ButtonMessageNode } from "./nodes/ButtonMessageNode";
import { ListMessageNode } from "./nodes/ListMessageNode";
import { CallToActionNode } from "./nodes/CallToActionNode";
import { AiControlNode } from "./nodes/AiControlNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { GoToNode } from "./nodes/GoToNode";
import { Sidebar } from "./Sidebar";
import { PropertiesPanel } from "./PropertiesPanel";
import {
  generateAutomationFlow,
  saveSelectionAsAutomation,
  saveAutomation,
  toggleAutomationStatus,
  type GenerateAutomationFlowResult,
} from "@/app/[locale]/(dashboard)/automation/actions";
import {
  applyAutomationAIDraftMetadata,
  automationRequiresManualReview,
  getAutomationAIDraftMetadata,
  markAutomationAIDraftAsReviewed,
} from "@/lib/automation/ai-draft";
import {
  AUTOMATION_AI_NODE_CATALOG,
  getAllowedNodeTypesForChannel,
  getDefaultNodeContentConstraints,
  insertGeneratedSubflow,
  type AutomationAIChannel,
  type AutomationGeneratedFlow,
} from "@/lib/automation/ai-flow";
import {
  prepareAutomationFlowForSave,
  type PrepareAutomationFlowResult,
} from "@/lib/automation/flow-normalizer";
import {
  AUTOMATION_NODE_CATALOG,
  type AutomationSidebarIconKey,
  createAutomationCanvasNode,
} from "@/lib/automation/node-catalog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  AutomationAIDraftMetadata,
  AutomationCanvasEdge,
  AutomationCanvasNode,
  AutomationCanvasNodeData,
  AutomationFlowEdge,
  AutomationFlowNode,
} from "@/lib/automation/flow-schema";

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  options: OptionsNode,
  delay: DelayNode,
  collect: CollectNode,
  save_contact: SaveContactNode,
  media: MediaNode,
  end: EndNode,
  button_message: ButtonMessageNode,
  list_message: ListMessageNode,
  call_to_action: CallToActionNode,
  ai_control: AiControlNode,
  condition: ConditionNode,
  go_to_node: GoToNode,
};

interface FlowBuilderProps {
  automationId: number;
  initialNodes: AutomationCanvasNode[];
  initialEdges: AutomationCanvasEdge[];
  initialActive: boolean;
  isAIFlowGeneratorEnabled: boolean;
  availableAutomations: Array<{ id: number; name: string; instanceId: number | null }>;
}

const proOptions: ProOptions = { hideAttribution: true };
const CONTROL_STACK_HEIGHT = 116;
const CONTROL_STACK_WIDTH = 44;
const OVERLAY_GAP = 16;
const HORIZONTAL_SPACING = 380;
const VERTICAL_SPACING = 170;
const LIST_VERTICAL_SPACING = 50;
const UNIFORM_VERTICAL_NODE_GAP = 96;
const DEFAULT_NODE_HEIGHT = 120;
const ORTHOGONAL_GRID_SIZE = 80;

type InsertMode = "replace" | "insert";
type ArrangeMode =
  | "hierarchy_ignore_back_edges"
  | "straight_lines"
  | "spaced_tree"
  | "vertical_list"
  | "genealogical_tree"
  | "constellation"
  | "auto_focus";

type PreviewItem = {
  id: string;
  title: string;
  description?: string;
};

type GeneratedFlowSummary = {
  outgoingMessages: PreviewItem[];
  conditions: PreviewItem[];
  savedVariables: PreviewItem[];
  links: PreviewItem[];
};

type AutomationTemplateItem = {
  id: number;
  teamId: number | null;
  instanceId: number | null;
  name: string;
  description: string | null;
  isPublic: boolean;
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
};

const ICONS_BY_KEY: Record<AutomationSidebarIconKey, React.ElementType> = {
  "message-square": MessageSquare,
  image: Image,
  "mouse-pointer-click": MousePointerClick,
  "list-checks": ListChecks,
  "external-link": ExternalLink,
  list: List,
  split: Split,
  clock: Clock,
  "x-circle": XCircle,
  "pen-line": PenLine,
  save: Save,
  bot: Bot,
  "git-branch-plus": GitBranchPlus,
};

const TEMPLATE_INSERT_OFFSET = 48;

const MIN_GENERATOR_TOKENS = 128;
const MAX_GENERATOR_TOKENS = 4096;
const DEFAULT_GENERATOR_TOKENS = 1200;
const GENERATOR_TOKEN_RANGE_HINT = "Rango permitido: 128–4096";
const GENERATOR_TOKEN_PRESETS = [512, 1024, 2048, 4096] as const;

type InfiniteLoopDiagnostics = {
  hasNonTerminatingLoop: boolean;
  problematicEdgeKeys: Set<string>;
};

function getEdgeKey(edge: Pick<AutomationCanvasEdge, "source" | "target" | "sourceHandle">) {
  return `${edge.source}->${edge.target}::${edge.sourceHandle ?? "__default__"}`;
}

function detectNonTerminatingLoops(
  nodes: AutomationCanvasNode[],
  edges: AutomationCanvasEdge[],
): InfiniteLoopDiagnostics {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const adjacency = new Map<string, string[]>();
  const outgoingEdgesBySource = new Map<string, AutomationCanvasEdge[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    outgoingEdgesBySource.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    outgoingEdgesBySource.set(edge.source, [
      ...(outgoingEdgesBySource.get(edge.source) ?? []),
      edge,
    ]);
  }

  const startNode = nodes.find((node) => node.type === "start");
  if (!startNode) {
    return { hasNonTerminatingLoop: false, problematicEdgeKeys: new Set() };
  }

  const reachable = new Set<string>();
  const stack = [startNode.id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }

  const indexByNode = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const tarjanStack: string[] = [];
  const problematicEdgeKeys = new Set<string>();
  let currentIndex = 0;

  const visit = (nodeId: string) => {
    indexByNode.set(nodeId, currentIndex);
    lowLink.set(nodeId, currentIndex);
    currentIndex += 1;
    tarjanStack.push(nodeId);
    onStack.add(nodeId);

    for (const next of adjacency.get(nodeId) ?? []) {
      if (!reachable.has(next)) continue;
      if (!indexByNode.has(next)) {
        visit(next);
        lowLink.set(
          nodeId,
          Math.min(lowLink.get(nodeId) ?? 0, lowLink.get(next) ?? 0),
        );
      } else if (onStack.has(next)) {
        lowLink.set(
          nodeId,
          Math.min(lowLink.get(nodeId) ?? 0, indexByNode.get(next) ?? 0),
        );
      }
    }

    if (lowLink.get(nodeId) !== indexByNode.get(nodeId)) return;

    const component: string[] = [];
    while (tarjanStack.length > 0) {
      const member = tarjanStack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
      if (member === nodeId) break;
    }

    const componentSet = new Set(component);
    let hasCycle = component.length > 1;
    if (!hasCycle && component.length === 1) {
      const onlyNode = component[0];
      hasCycle = (adjacency.get(onlyNode) ?? []).includes(onlyNode);
    }
    if (!hasCycle) return;

    let closedComponent = true;
    for (const member of component) {
      const outgoing = outgoingEdgesBySource.get(member) ?? [];
      if (outgoing.length === 0) {
        closedComponent = false;
        break;
      }
      const hasEscape = outgoing.some((edge) => !componentSet.has(edge.target));
      if (hasEscape) {
        closedComponent = false;
        break;
      }
    }

    if (!closedComponent) return;

    for (const member of component) {
      for (const edge of outgoingEdgesBySource.get(member) ?? []) {
        if (componentSet.has(edge.target)) {
          problematicEdgeKeys.add(getEdgeKey(edge));
        }
      }
    }
  };

  for (const nodeId of reachable) {
    if (!indexByNode.has(nodeId)) {
      visit(nodeId);
    }
  }

  return {
    hasNonTerminatingLoop: problematicEdgeKeys.size > 0,
    problematicEdgeKeys,
  };
}

function clampGeneratorMaxTokens(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_GENERATOR_TOKENS;
  }

  return Math.min(MAX_GENERATOR_TOKENS, Math.max(MIN_GENERATOR_TOKENS, Math.round(value)));
}

function isGeneratorTokenPreset(
  value: number,
): value is (typeof GENERATOR_TOKEN_PRESETS)[number] {
  return GENERATOR_TOKEN_PRESETS.includes(
    value as (typeof GENERATOR_TOKEN_PRESETS)[number],
  );
}

function normalizeGeneratorMaxTokens(value: number | string) {
  return clampGeneratorMaxTokens(
    typeof value === "number" ? value : Number(value),
  );
}

function generateCanvasId(prefix: "node" | "edge") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTemplatePreviewItems(template: AutomationTemplateItem) {
  return template.nodes.slice(0, 6).map((node) => {
    const catalogEntry = AUTOMATION_NODE_CATALOG.find((item) => item.type === node.type);
    return {
      id: node.id,
      labelKey: catalogEntry?.labelKey ?? "nodes.message",
      icon: catalogEntry?.sidebar?.icon,
      colorClass: catalogEntry?.sidebar?.colorClass ?? "bg-muted",
      iconColorClass: catalogEntry?.sidebar?.iconColorClass ?? "text-foreground",
      fallbackName:
        typeof node.data === "object" && node.data !== null && "label" in node.data
          ? String((node.data as { label?: string }).label ?? node.type)
          : node.type,
    };
  });
}

function buildGeneratedFlowSummary(
  flow: AutomationGeneratedFlow,
): GeneratedFlowSummary {
  return flow.nodes.reduce<GeneratedFlowSummary>(
    (summary, node) => {
      switch (node.type) {
        case "message":
          summary.outgoingMessages.push({
            id: node.id,
            title: node.data.label,
            description: node.type,
          });
          break;
        case "media":
          summary.outgoingMessages.push({
            id: node.id,
            title: node.data.caption || node.type,
            description: `Media: ${node.data.mediaType || "image"}`,
          });
          break;
        case "options":
          summary.outgoingMessages.push({
            id: node.id,
            title: node.data.label,
            description: node.data.options.join(", "),
          });
          break;
        case "button_message":
          summary.outgoingMessages.push({
            id: node.id,
            title: node.data.bodyText,
            description: node.data.buttons
              .map((button) => button.text)
              .join(", "),
          });
          break;
        case "list_message":
          summary.outgoingMessages.push({
            id: node.id,
            title: node.data.bodyText,
            description: node.data.items.map((item) => item.title).join(", "),
          });
          break;
        case "call_to_action":
          summary.outgoingMessages.push({
            id: node.id,
            title: node.data.bodyText,
            description: node.data.buttonText,
          });
          summary.links.push({
            id: node.id,
            title: node.data.buttonText,
            description: node.data.url,
          });
          break;
        case "condition":
          node.data.conditions.forEach((condition, index) => {
            summary.conditions.push({
              id: `${node.id}-${condition.id}`,
              title: `${condition.type} ${condition.operator} ${condition.value}`,
              description: condition.value2
                ? condition.value2
                : `#${index + 1}`,
            });
          });
          break;
        case "collect":
          summary.savedVariables.push({
            id: node.id,
            title: node.data.variable,
            description: node.data.label,
          });
          break;
        case "save_contact": {
          const mappings = [
            node.data.nameVariable ? `name=${node.data.nameVariable}` : null,
            node.data.agentId ? `agent=${node.data.agentId}` : null,
            node.data.departmentId
              ? `department=${node.data.departmentId}`
              : null,
            node.data.tagId ? `tag=${node.data.tagId}` : null,
            node.data.funnelStageId ? `stage=${node.data.funnelStageId}` : null,
            ...(node.data.customFields
              ? Object.entries(node.data.customFields).map(
                  ([field, value]) => `${field}=${value}`,
                )
              : []),
          ].filter(Boolean);

          if (mappings.length > 0) {
            summary.savedVariables.push({
              id: node.id,
              title: node.type,
              description: mappings.join(" · "),
            });
          }
          break;
        }
      }

      return summary;
    },
    {
      outgoingMessages: [],
      conditions: [],
      savedVariables: [],
      links: [],
    },
  );
}

function getArrangementPositions({
  nodes,
  edges,
  mode,
}: {
  nodes: AutomationCanvasNode[];
  edges: AutomationCanvasEdge[];
  mode: ArrangeMode;
}): Map<string, { x: number; y: number }> {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const connectorTypes = new Set<AutomationCanvasNode["type"]>(["end"]);
  const isConnectorNode = (nodeId: string) =>
    connectorTypes.has(nodeById.get(nodeId)?.type ?? "start");
  const incomingAll = new Map<string, string[]>();
  const outgoingAll = new Map<string, string[]>();
  const incomingDAG = new Map<string, string[]>();
  const outgoingDAG = new Map<string, string[]>();
  const arrangedPositions = new Map<string, { x: number; y: number }>();
  const cycleEdges = new Set<string>();

  const getNodeHeight = (node: AutomationCanvasNode) =>
    (node as AutomationCanvasNode & { measured?: { height?: number } }).measured?.height ??
    node.height ??
    DEFAULT_NODE_HEIGHT;

  const getHandleRank = (node: AutomationCanvasNode | undefined, handle: string | null | undefined) => {
    if (!node || !handle) return 0;

    if (node.type === "options") {
      const match = /^option-(\d+)$/.exec(handle);
      return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    if (node.type === "button_message") {
      const buttonId = handle.replace(/^btn-/, "");
      const buttons = ((node.data as { buttons?: Array<{ id: string }> }).buttons ?? []);
      const index = buttons.findIndex((button) => button.id === buttonId);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }

    if (node.type === "list_message") {
      const itemId = handle.replace(/^list-/, "");
      const items = ((node.data as { items?: Array<{ id: string }> }).items ?? []);
      const index = items.findIndex((item) => item.id === itemId);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }

    if (node.type === "condition") {
      const conditionData = node.data as { conditions?: Array<{ id: string }> };
      if (handle === "fallback") {
        return (conditionData.conditions?.length ?? 0) + 1;
      }
      const index = (conditionData.conditions ?? []).findIndex((condition) => condition.id === handle);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }

    return 0;
  };

  for (const node of nodes) {
    incomingAll.set(node.id, []);
    outgoingAll.set(node.id, []);
    incomingDAG.set(node.id, []);
    outgoingDAG.set(node.id, []);
  }

  const allEdgesSorted = [...edges].sort((a, b) => {
    const sourceDiff = a.source.localeCompare(b.source);
    if (sourceDiff !== 0) return sourceDiff;

    const sourceNode = nodeById.get(a.source);
    const rankDiff =
      getHandleRank(sourceNode, a.sourceHandle) - getHandleRank(sourceNode, b.sourceHandle);
    if (rankDiff !== 0) return rankDiff;

    const targetA = nodeById.get(a.target);
    const targetB = nodeById.get(b.target);
    const yDiff = (targetA?.position.y ?? 0) - (targetB?.position.y ?? 0);
    if (yDiff !== 0) return yDiff;
    const xDiff = (targetA?.position.x ?? 0) - (targetB?.position.x ?? 0);
    if (xDiff !== 0) return xDiff;
    return a.id.localeCompare(b.id);
  });

  for (const edge of allEdgesSorted) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }
    outgoingAll.set(edge.source, [...(outgoingAll.get(edge.source) ?? []), edge.target]);
    incomingAll.set(edge.target, [...(incomingAll.get(edge.target) ?? []), edge.source]);
  }

  const visitState = new Map<string, 0 | 1 | 2>();
  const markCycles = (nodeId: string) => {
    visitState.set(nodeId, 1);
    for (const target of outgoingAll.get(nodeId) ?? []) {
      const state = visitState.get(target) ?? 0;
      if (state === 0) {
        markCycles(target);
      } else if (state === 1) {
        cycleEdges.add(`${nodeId}->${target}`);
      }
    }
    visitState.set(nodeId, 2);
  };

  for (const node of nodes) {
    if ((visitState.get(node.id) ?? 0) === 0) {
      markCycles(node.id);
    }
  }

  for (const edge of allEdgesSorted) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }
    if (cycleEdges.has(`${edge.source}->${edge.target}`)) {
      continue;
    }
    outgoingDAG.set(edge.source, [...(outgoingDAG.get(edge.source) ?? []), edge.target]);
    incomingDAG.set(edge.target, [...(incomingDAG.get(edge.target) ?? []), edge.source]);
  }

  const startNode =
    nodes.find((node) => node.type === "start") ??
    [...nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0] ??
    null;
  const roots = startNode
    ? [startNode.id, ...nodes.filter((n) => n.id !== startNode.id && (incomingDAG.get(n.id)?.length ?? 0) === 0).map((n) => n.id)]
    : nodes.filter((n) => (incomingDAG.get(n.id)?.length ?? 0) === 0).map((n) => n.id);

  const computeLevels = () => {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const levelByNode = new Map<string, number>();
    for (const node of nodes) {
      const deg = incomingDAG.get(node.id)?.length ?? 0;
      inDegree.set(node.id, deg);
      if (deg === 0) queue.push(node.id);
    }
    for (const rootId of roots) {
      levelByNode.set(rootId, 0);
      if (!queue.includes(rootId)) queue.unshift(rootId);
    }
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const currentLevel = levelByNode.get(currentId) ?? 0;
      for (const target of outgoingDAG.get(currentId) ?? []) {
        levelByNode.set(target, Math.max(levelByNode.get(target) ?? 0, currentLevel + 1));
        inDegree.set(target, (inDegree.get(target) ?? 0) - 1);
        if ((inDegree.get(target) ?? 0) <= 0) {
          queue.push(target);
        }
      }
    }
    let fallbackLevel = Math.max(0, ...Array.from(levelByNode.values()));
    for (const node of nodes) {
      if (!levelByNode.has(node.id)) {
        fallbackLevel += 1;
        levelByNode.set(node.id, fallbackLevel);
      }
    }
    return levelByNode;
  };

  const levelByNode = computeLevels();

  const placeConnectorNodes = (
    positions: Map<string, { x: number; y: number }>,
    options?: { shortSegment?: number; alignToParent?: boolean },
  ) => {
    const shortSegment = options?.shortSegment ?? 84;
    const endNodeVerticalGap = 64;
    for (const node of nodes) {
      if (!isConnectorNode(node.id)) continue;

      const previousStructuralNodeId = (() => {
        const queue = [...(incomingAll.get(node.id) ?? [])];
        const visited = new Set<string>();
        while (queue.length > 0) {
          const currentId = queue.shift();
          if (!currentId || visited.has(currentId)) continue;
          visited.add(currentId);
          if (!isConnectorNode(currentId)) {
            return currentId;
          }
          queue.push(...(incomingAll.get(currentId) ?? []));
        }
        return null;
      })();

      const nextStructuralNodeId = (() => {
        const queue = [...(outgoingAll.get(node.id) ?? [])];
        const visited = new Set<string>();
        while (queue.length > 0) {
          const currentId = queue.shift();
          if (!currentId || visited.has(currentId)) continue;
          visited.add(currentId);
          if (!isConnectorNode(currentId)) {
            return currentId;
          }
          queue.push(...(outgoingAll.get(currentId) ?? []));
        }
        return null;
      })();

      const prevPos = previousStructuralNodeId
        ? positions.get(previousStructuralNodeId)
        : null;
      const nextPos = nextStructuralNodeId ? positions.get(nextStructuralNodeId) : null;

      if (prevPos && nextPos) {
        const x = (prevPos.x + nextPos.x) / 2;
        const y = options?.alignToParent
          ? prevPos.y
          : prevPos.y + (nextPos.y - prevPos.y) * 0.5;
        positions.set(node.id, { x, y });
        continue;
      }

      if (prevPos) {
        if (node.type === "end") {
          const parentNode =
            previousStructuralNodeId ? nodeById.get(previousStructuralNodeId) : undefined;
          const parentHeight = parentNode ? getNodeHeight(parentNode) : DEFAULT_NODE_HEIGHT;
          positions.set(node.id, {
            x: prevPos.x,
            y: prevPos.y + parentHeight + endNodeVerticalGap,
          });
          continue;
        }
        positions.set(node.id, { x: prevPos.x + shortSegment, y: prevPos.y });
        continue;
      }

      if (nextPos) {
        positions.set(node.id, { x: nextPos.x - shortSegment, y: nextPos.y });
      }
    }
  };

  const enforceUniformVerticalSpacing = (
    positions: Map<string, { x: number; y: number }>,
    gap: number,
  ) => {
    const nodesByColumn = new Map<number, string[]>();

    for (const node of nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      const column = Math.round(position.x);
      nodesByColumn.set(column, [...(nodesByColumn.get(column) ?? []), node.id]);
    }

    for (const ids of nodesByColumn.values()) {
      const orderedIds = [...ids].sort(
        (aId, bId) => (positions.get(aId)?.y ?? 0) - (positions.get(bId)?.y ?? 0),
      );

      let nextY = 0;
      for (const nodeId of orderedIds) {
        const node = nodeById.get(nodeId);
        if (!node) continue;
        const currentPosition = positions.get(nodeId);
        if (!currentPosition) continue;
        const y = Math.max(currentPosition.y, nextY);
        positions.set(nodeId, { x: currentPosition.x, y });
        nextY = y + getNodeHeight(node) + gap;
      }
    }

    return positions;
  };

  if (mode === "vertical_list") {
    const ordered = [...nodes].sort((a, b) => {
      const levelDiff = (levelByNode.get(a.id) ?? 0) - (levelByNode.get(b.id) ?? 0);
      if (levelDiff !== 0) return levelDiff;
      return a.position.y - b.position.y;
    });
    let currentY = 0;
    const fixedX = 0;
    for (const node of ordered) {
      arrangedPositions.set(node.id, { x: fixedX, y: currentY });
      currentY += getNodeHeight(node) + LIST_VERTICAL_SPACING;
    }
    return enforceUniformVerticalSpacing(arrangedPositions, LIST_VERTICAL_SPACING);
  }

  if (mode === "spaced_tree") {
    const childrenByParent = new Map<string, string[]>();
    for (const node of nodes) {
      childrenByParent.set(node.id, [...(outgoingDAG.get(node.id) ?? [])]);
    }
    const depthByNode = new Map<string, number>();
    const treeParent = new Map<string, string | null>();
    for (const rootId of roots) {
      const queue = [{ id: rootId, depth: 0 }];
      treeParent.set(rootId, null);
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        const previousDepth = depthByNode.get(current.id);
        if (previousDepth !== undefined && previousDepth >= current.depth) continue;
        depthByNode.set(current.id, current.depth);
        for (const target of childrenByParent.get(current.id) ?? []) {
          if (!treeParent.has(target)) treeParent.set(target, current.id);
          queue.push({ id: target, depth: current.depth + 1 });
        }
      }
    }

    let cursorY = 0;
    const verticalGap = VERTICAL_SPACING * 1.85;
    const horizontalGap = HORIZONTAL_SPACING * 1.6;
    const assignTreeY = (nodeId: string): number => {
      const children = (childrenByParent.get(nodeId) ?? []).filter(
        (childId) => treeParent.get(childId) === nodeId,
      );
      if (children.length === 0) {
        const leafY = cursorY;
        cursorY += verticalGap;
        return leafY;
      }
      const childYs = children.map((childId) => assignTreeY(childId));
      return (Math.min(...childYs) + Math.max(...childYs)) / 2;
    };

    for (const rootId of roots) {
      const y = assignTreeY(rootId);
      arrangedPositions.set(rootId, {
        x: (depthByNode.get(rootId) ?? 0) * horizontalGap,
        y,
      });
    }

    for (const node of nodes) {
      if (arrangedPositions.has(node.id)) continue;
      const parentId = treeParent.get(node.id);
      const parentPos = parentId ? arrangedPositions.get(parentId) : null;
      const depth = depthByNode.get(node.id) ?? levelByNode.get(node.id) ?? 0;
      const y = parentPos ? parentPos.y + verticalGap * 0.65 : cursorY;
      arrangedPositions.set(node.id, { x: depth * horizontalGap, y });
      cursorY = Math.max(cursorY, y + verticalGap);
    }
    return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
  }

  if (mode === "genealogical_tree") {
    const structuralNodes = nodes.filter((node) => !isConnectorNode(node.id));
    const structuralIds = new Set(structuralNodes.map((node) => node.id));
    const descendantsByStructuralParent = new Map<string, string[]>();
    const ancestorsByStructuralNode = new Map<string, string[]>();

    for (const node of structuralNodes) {
      descendantsByStructuralParent.set(node.id, []);
      ancestorsByStructuralNode.set(node.id, []);
    }

    const resolveStructuralTargets = (sourceId: string) => {
      const queue = [...(outgoingAll.get(sourceId) ?? [])];
      const visited = new Set<string>();
      const targets: string[] = [];
      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);
        if (structuralIds.has(currentId)) {
          targets.push(currentId);
          continue;
        }
        queue.push(...(outgoingAll.get(currentId) ?? []));
      }
      return targets;
    };

    for (const structuralNode of structuralNodes) {
      const children = resolveStructuralTargets(structuralNode.id)
        .filter((childId) => childId !== structuralNode.id)
        .sort((aId, bId) => {
          const a = nodeById.get(aId);
          const b = nodeById.get(bId);
          if (!a || !b) return 0;
          return a.position.y - b.position.y || a.position.x - b.position.x;
        });
      descendantsByStructuralParent.set(structuralNode.id, children);
      for (const childId of children) {
        ancestorsByStructuralNode.set(childId, [
          ...(ancestorsByStructuralNode.get(childId) ?? []),
          structuralNode.id,
        ]);
      }
    }

    const roots = structuralNodes
      .filter((node) => (ancestorsByStructuralNode.get(node.id)?.length ?? 0) === 0)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    const generationByNode = new Map<string, number>();
    const queue = roots.map((node) => node.id);
    for (const rootId of queue) generationByNode.set(rootId, 0);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const currentGeneration = generationByNode.get(currentId) ?? 0;
      for (const childId of descendantsByStructuralParent.get(currentId) ?? []) {
        const nextGeneration = currentGeneration + 1;
        if ((generationByNode.get(childId) ?? -1) < nextGeneration) {
          generationByNode.set(childId, nextGeneration);
        }
        queue.push(childId);
      }
    }

    let nextY = 0;
    const generationGap = HORIZONTAL_SPACING * 1.1;
    const siblingGap = VERTICAL_SPACING * 1.1;
    const familyAnchorY = new Map<string, number>();
    const visitFamily = (nodeId: string, preferredY?: number): number => {
      if (familyAnchorY.has(nodeId)) return familyAnchorY.get(nodeId) ?? 0;

      const children = descendantsByStructuralParent.get(nodeId) ?? [];
      if (children.length === 0) {
        const assigned = Math.max(preferredY ?? 0, nextY);
        nextY = assigned + siblingGap;
        familyAnchorY.set(nodeId, assigned);
        return assigned;
      }

      const childYs: number[] = children.map((childId, index) =>
        visitFamily(childId, (preferredY ?? nextY) + index * siblingGap),
      );
      const centeredY = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      familyAnchorY.set(nodeId, centeredY);
      return centeredY;
    };

    const effectiveRoots = roots.length > 0 ? roots.map((node) => node.id) : structuralNodes.map((node) => node.id);
    for (const rootId of effectiveRoots) {
      visitFamily(rootId);
      nextY += siblingGap * 0.25;
    }

    for (const node of structuralNodes) {
      arrangedPositions.set(node.id, {
        x: (generationByNode.get(node.id) ?? 0) * generationGap,
        y: familyAnchorY.get(node.id) ?? nextY,
      });
    }

    placeConnectorNodes(arrangedPositions, { shortSegment: 72, alignToParent: true });
    return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
  }

  if (mode === "constellation") {
    const centerX = 0;
    const centerY = 0;
    const ordered = [...nodes].sort(
      (a, b) => (levelByNode.get(a.id) ?? 0) - (levelByNode.get(b.id) ?? 0),
    );
    const angleStep = (Math.PI * 2) / Math.max(1, ordered.length);
    for (let index = 0; index < ordered.length; index += 1) {
      const node = ordered[index];
      const depth = Math.max(1, (levelByNode.get(node.id) ?? 0) + 1);
      const radius = depth * (ORTHOGONAL_GRID_SIZE * 2.2);
      const angle = angleStep * index;
      arrangedPositions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    }
    return arrangedPositions;
  }

  if (mode === "auto_focus") {
    const autoFocusPositions: Map<string, { x: number; y: number }> = getArrangementPositions({
      nodes,
      edges,
      mode: "hierarchy_ignore_back_edges",
    });
    placeConnectorNodes(autoFocusPositions, { shortSegment: 70, alignToParent: true });
    return autoFocusPositions;
  }

  const nodesByLevel = new Map<number, string[]>();
  for (const node of nodes) {
    const level = levelByNode.get(node.id) ?? 0;
    nodesByLevel.set(level, [...(nodesByLevel.get(level) ?? []), node.id]);
  }
  const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b);
  const orderIndex = new Map<string, number>();
  sortedLevels.forEach((level) => {
    (nodesByLevel.get(level) ?? [])
      .sort((aId, bId) => (nodeById.get(aId)?.position.y ?? 0) - (nodeById.get(bId)?.position.y ?? 0))
      .forEach((id, idx) => orderIndex.set(id, idx));
  });

  for (let pass = 0; pass < 2; pass += 1) {
    for (const level of sortedLevels) {
      const ids = nodesByLevel.get(level) ?? [];
      ids.sort((aId, bId) => {
        const aParents = incomingDAG.get(aId) ?? [];
        const bParents = incomingDAG.get(bId) ?? [];
        const aBarycenter =
          aParents.length > 0
            ? aParents.reduce((acc, parentId) => acc + (orderIndex.get(parentId) ?? 0), 0) / aParents.length
            : orderIndex.get(aId) ?? 0;
        const bBarycenter =
          bParents.length > 0
            ? bParents.reduce((acc, parentId) => acc + (orderIndex.get(parentId) ?? 0), 0) / bParents.length
            : orderIndex.get(bId) ?? 0;
        return aBarycenter - bBarycenter;
      });
      ids.forEach((id, idx) => orderIndex.set(id, idx));
    }
  }

  if (mode === "straight_lines") {
    const occupied = new Set<string>();
    const rowByNode = new Map<string, number>();
    for (const level of sortedLevels) {
      const ids = [...(nodesByLevel.get(level) ?? [])].sort(
        (aId, bId) => (orderIndex.get(aId) ?? 0) - (orderIndex.get(bId) ?? 0),
      );
      for (const id of ids) {
        const parentRows = (incomingDAG.get(id) ?? [])
          .map((parentId) => rowByNode.get(parentId))
          .filter((row): row is number => typeof row === "number");
        let preferred = parentRows.length > 0 ? Math.round(parentRows.reduce((a, b) => a + b, 0) / parentRows.length) : 0;
        let row = preferred;
        let radius = 0;
        while (occupied.has(`${level}:${row}`)) {
          radius += 1;
          const up = preferred - radius;
          const down = preferred + radius;
          row = occupied.has(`${level}:${up}`) ? down : up;
        }
        occupied.add(`${level}:${row}`);
        rowByNode.set(id, row);
      }
    }
    for (const node of nodes) {
      const col = levelByNode.get(node.id) ?? 0;
      const row = rowByNode.get(node.id) ?? 0;
      arrangedPositions.set(node.id, {
        x: col * (ORTHOGONAL_GRID_SIZE * 5),
        y: row * (ORTHOGONAL_GRID_SIZE * 3),
      });
    }
    return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
  }

  const horizontalGap = HORIZONTAL_SPACING;
  const verticalGap = VERTICAL_SPACING;
  for (const level of sortedLevels) {
    const ids = [...(nodesByLevel.get(level) ?? [])].sort(
      (aId, bId) => (orderIndex.get(aId) ?? 0) - (orderIndex.get(bId) ?? 0),
    );
    let cursorY = 0;
    for (const id of ids) {
      const node = nodeById.get(id);
      if (!node) continue;
      arrangedPositions.set(id, { x: level * horizontalGap, y: cursorY });
      cursorY += getNodeHeight(node) + verticalGap;
    }
  }
  return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
}

function FlowBuilderContent({
  automationId,
  initialNodes,
  initialEdges,
  initialActive,
  isAIFlowGeneratorEnabled,
  availableAutomations,
}: FlowBuilderProps) {
  const t = useTranslations("Automation");
  const locale = useLocale();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes, onNodesChangeBase] =
    useNodesState<AutomationCanvasNode>(initialNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initialEdges);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isActive, setIsActive] = useState(initialActive);

  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [generatorPrompt, setGeneratorPrompt] = useState("");
  const [generatorChannel, setGeneratorChannel] =
    useState<AutomationAIChannel>("qr");
  const [generatorTemperature, setGeneratorTemperature] = useState(0.7);
  const [generatorMaxTokens, setGeneratorMaxTokens] = useState(
    DEFAULT_GENERATOR_TOKENS,
  );

  const handleGeneratorMaxTokensChange = useCallback(
    (value: number | string) => {
      setGeneratorMaxTokens(normalizeGeneratorMaxTokens(value));
    },
    [],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] =
    useState<AutomationGeneratedFlow | null>(null);
  const [generationRawResponse, setGenerationRawResponse] = useState<
    string | null
  >(null);
  const [generationValidationErrors, setGenerationValidationErrors] = useState<
    string[]
  >([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [insertMode, setInsertMode] = useState<InsertMode>("replace");
  const [isSavePreviewOpen, setIsSavePreviewOpen] = useState(false);
  const [savePreviewWarnings, setSavePreviewWarnings] = useState<string[]>([]);
  const [savePreviewErrors, setSavePreviewErrors] = useState<string[]>([]);
  const [savePreviewFlow, setSavePreviewFlow] = useState<Extract<
    PrepareAutomationFlowResult,
    { success: true }
  > | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [isInsertTemplateOpen, setIsInsertTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateVisibility, setTemplateVisibility] = useState<"team" | "public">("team");
  const [templates, setTemplates] = useState<AutomationTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isInsertingTemplate, setIsInsertingTemplate] = useState(false);
  const [isSaveAutomationConfirmOpen, setIsSaveAutomationConfirmOpen] = useState(false);
  const [isSavingAutomationSelection, setIsSavingAutomationSelection] = useState(false);
  const [isAutoArrangeEnabled, setIsAutoArrangeEnabled] = useState(false);
  const autoArrangeSignatureRef = useRef<string | null>(null);

  const { screenToFlowPosition, toObject, fitView, setCenter } = useReactFlow();

  const getNodeIdFromIssueMessage = useCallback(
    (issue: string) => {
      const matchedNode = nodes.find((node) => issue.includes(node.id));
      return matchedNode?.id ?? null;
    },
    [nodes],
  );

  const getFriendlySaveErrorMessage = useCallback(
    (issue: string) => {
      const nodeId = getNodeIdFromIssueMessage(issue);

      if (issue.includes("must use a valid sourceHandle")) {
        return nodeId
          ? `La conexión del nodo ${nodeId} está incompleta. Haz clic para ir al nodo y corregirla.`
          : "Hay una conexión incompleta. Haz clic para revisar el nodo relacionado.";
      }

      if (issue.includes("must use a valid targetHandle")) {
        return nodeId
          ? `El nodo ${nodeId} recibe una conexión inválida. Haz clic para ir al nodo y corregirla.`
          : "Hay una conexión de entrada inválida. Haz clic para revisar el nodo relacionado.";
      }

      return issue;
    },
    [getNodeIdFromIssueMessage],
  );

  const handleSaveIssueClick = useCallback(
    (issue: string) => {
      const nodeId = getNodeIdFromIssueMessage(issue);
      if (!nodeId) {
        toast.error("No pudimos identificar el nodo de este error.");
        return;
      }

      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        toast.error("No encontramos el nodo relacionado en el flujo actual.");
        return;
      }

      setSelectedNodeIds([nodeId]);
      setIsSavePreviewOpen(false);

      const nodeWidth = targetNode.width ?? targetNode.measured?.width ?? 260;
      const nodeHeight = targetNode.height ?? targetNode.measured?.height ?? 140;
      const centerX = targetNode.position.x + nodeWidth / 2;
      const centerY = targetNode.position.y + nodeHeight / 2;

      requestAnimationFrame(() => {
        setCenter(centerX, centerY, { zoom: 1.05, duration: 300 });
      });
    },
    [getNodeIdFromIssueMessage, nodes, setCenter],
  );

  useEffect(() => {
    setIsDarkMode(resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);

    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  const availableNodeTypes = useMemo(
    () => getAllowedNodeTypesForChannel(generatorChannel),
    [generatorChannel],
  );

  const generatorConstraints = useMemo(
    () => getDefaultNodeContentConstraints(generatorChannel),
    [generatorChannel],
  );

  const currentFlowHasEditableNodes = nodes.length > 0;
  const hasValidGeneration =
    generationResult !== null && generationValidationErrors.length === 0;
  const showInsertSelectionHelper =
    hasValidGeneration &&
    currentFlowHasEditableNodes &&
    insertMode === "insert" &&
    selectedNodeIds.length === 0;
  const selectedNodeId = selectedNodeIds[0] ?? null;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const infiniteLoopDiagnostics = useMemo(
    () => detectNonTerminatingLoops(nodes, edges),
    [edges, nodes],
  );
  const problematicEdgeSummaries = useMemo(() => {
    const nodeLabelById = new Map(
      nodes.map((node) => {
        const label =
          typeof node.data?.label === "string" && node.data.label.trim().length > 0
            ? node.data.label.trim()
            : node.type;
        return [node.id, label] as const;
      }),
    );

    return edges
      .filter((edge) =>
        infiniteLoopDiagnostics.problematicEdgeKeys.has(getEdgeKey(edge)),
      )
      .map((edge) => `${nodeLabelById.get(edge.source)} → ${nodeLabelById.get(edge.target)}`);
  }, [edges, infiniteLoopDiagnostics.problematicEdgeKeys, nodes]);
  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        if (!infiniteLoopDiagnostics.problematicEdgeKeys.has(getEdgeKey(edge))) {
          return edge;
        }
        return {
          ...edge,
          style: {
            ...(edge.style ?? {}),
            stroke: "#dc2626",
            strokeWidth: 2.5,
          },
          animated: true,
        };
      }),
    [edges, infiniteLoopDiagnostics.problematicEdgeKeys],
  );
  const aiDraftMetadata = useMemo(
    () => getAutomationAIDraftMetadata(nodes as AutomationFlowNode[]),
    [nodes],
  );
  const requiresManualReview = Boolean(
    aiDraftMetadata && !aiDraftMetadata.reviewedManually,
  );
  const generatedFlowSummary = useMemo(
    () =>
      generationResult ? buildGeneratedFlowSummary(generationResult) : null,
    [generationResult],
  );

  const resetGeneratorState = useCallback(() => {
    setGenerationResult(null);
    setGenerationRawResponse(null);
    setGenerationValidationErrors([]);
    setGenerationError(null);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      setHasUnsavedChanges(true);
    },
    [setEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<AutomationCanvasNode>[]) => {
      const filteredChanges = changes.filter((change) => {
        if (change.type !== "remove") return true;
        const node = nodes.find((item) => item.id === change.id);
        if (node?.type === "start") {
          toast.error(t("start_node_delete_blocked"));
          return false;
        }
        return true;
      });
      if (filteredChanges.length > 0) {
        setHasUnsavedChanges(true);
      }
      onNodesChangeBase(filteredChanges);
    },
    [nodes, onNodesChangeBase, t],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");

      if (typeof type === "undefined" || !type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = createAutomationCanvasNode({
        type: type as AutomationCanvasNode["type"],
        position,
      });

      setNodes((nds) => [...nds, newNode]);
      setHasUnsavedChanges(true);
    },
    [screenToFlowPosition, setNodes],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: AutomationCanvasNode) => {
    setSelectedNodeIds((current) => {
      if (current.length === 1 && current[0] === node.id) {
        return current;
      }

      return [node.id];
    });
  }, []);

  const onSelectionChange = useCallback<OnSelectionChangeFunc<AutomationCanvasNode, AutomationCanvasEdge>>(
    ({ nodes: selectedNodes }) => {
      setSelectedNodeIds(selectedNodes.map((node) => node.id));
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeIds([]);
  }, []);

  const updateNodeData = (
    id: string,
    data: Partial<AutomationCanvasNodeData>,
  ) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, ...data },
          } as AutomationCanvasNode;
        }
        return node;
      }),
    );
    setHasUnsavedChanges(true);
  };

  const onEdgesChange = useCallback(
    (changes: any[]) => {
      if (changes.length > 0) {
        setHasUnsavedChanges(true);
      }
      onEdgesChangeBase(changes);
    },
    [onEdgesChangeBase],
  );

  const handleSave = () => {
    const flow = toObject();
    const preparedFlow = prepareAutomationFlowForSave({
      nodes: flow.nodes as AutomationFlowNode[],
      edges: flow.edges as AutomationFlowEdge[],
    });

    setSavePreviewWarnings(
      preparedFlow.warnings.map((warning) => warning.message),
    );

    if (!preparedFlow.success) {
      setSavePreviewErrors(preparedFlow.errors);
      setSavePreviewFlow(null);
      setIsSavePreviewOpen(true);
      toast.error(t("save_preview.validation_failed_title"));
      return;
    }

    setSavePreviewErrors([]);
    setSavePreviewFlow(preparedFlow);
    setIsSavePreviewOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!savePreviewFlow) {
      return;
    }

    setIsSaving(true);
    try {
      await saveAutomation(
        automationId,
        savePreviewFlow.nodes,
        savePreviewFlow.edges,
      );
      setNodes(savePreviewFlow.nodes as AutomationCanvasNode[]);
      setEdges(savePreviewFlow.edges as AutomationCanvasEdge[]);
      if (automationRequiresManualReview(savePreviewFlow.nodes)) {
        setIsActive(false);
      }
      setIsSavePreviewOpen(false);
      setHasUnsavedChanges(false);
      toast.success(t("toast_saved"));
    } catch (error) {
      toast.error(t("ai_generator.save_failed"));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!isActive && requiresManualReview) {
      toast.error(t("ai_review.activation_blocked_toast"));
      return;
    }

    const newState = !isActive;
    setIsActive(newState);
    try {
      await toggleAutomationStatus(automationId, newState);
      toast.success(t("toast_status_changed"));
    } catch (error) {
      setIsActive(!newState);
      toast.error(t("failed_to_update_status_toast"));
    }
  };

  const markDraftAsGenerated = useCallback(
    (flowNodes: AutomationFlowNode[]): AutomationCanvasNode[] => {
      const metadata: AutomationAIDraftMetadata = {
        source: "ai",
        status: "draft_generated",
        originalPrompt: generatorPrompt.trim(),
        generatedAt: new Date().toISOString(),
        reviewedManually: false,
        reviewedAt: null,
      };

      return applyAutomationAIDraftMetadata(
        flowNodes,
        metadata,
      ) as AutomationCanvasNode[];
    },
    [generatorPrompt],
  );

  const handleConfirmReview = useCallback(() => {
    setNodes(
      (currentNodes) =>
        markAutomationAIDraftAsReviewed(
          currentNodes as AutomationFlowNode[],
        ) as AutomationCanvasNode[],
    );
    toast.success(t("ai_review.confirmed_toast"));
  }, [setNodes, t]);

  const handleAutoArrange = useCallback((mode: ArrangeMode) => {
    if (nodes.length <= 1) {
      return;
    }

    setIsAutoArrangeEnabled(mode === "auto_focus");

    const arrangedPositions = getArrangementPositions({ nodes, edges, mode });

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        position: arrangedPositions.get(node.id) ?? node.position,
      })),
    );

    requestAnimationFrame(() => {
      if (mode === "auto_focus") {
        const focusNodeId = selectedNodeId ?? nodes.find((node) => node.type === "start")?.id;
        const focusNode = nodes.find((node) => node.id === focusNodeId);
        if (focusNode) {
          setCenter(focusNode.position.x, focusNode.position.y, {
            zoom: 1.05,
            duration: 260,
          });
          return;
        }
      }

      fitView({ padding: 0.2, duration: 350 });
    });
  }, [edges, fitView, nodes, selectedNodeId, setCenter, setNodes]);

  useEffect(() => {
    if (!isAutoArrangeEnabled || nodes.length <= 1) {
      return;
    }

    const graphSignature = JSON.stringify({
      nodeIds: nodes.map((node) => node.id),
      edgeIds: edges.map((edge) => `${edge.id}:${edge.source}->${edge.target}`),
      selectedNodeId: selectedNodeId ?? null,
    });

    if (autoArrangeSignatureRef.current === graphSignature) {
      return;
    }

    autoArrangeSignatureRef.current = graphSignature;
    const arrangedPositions = getArrangementPositions({
      nodes,
      edges,
      mode: "auto_focus",
    });

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        position: arrangedPositions.get(node.id) ?? node.position,
      })),
    );

    const focusNode = nodes.find((node) => node.id === selectedNodeId)
      ?? nodes.find((node) => node.type === "start")
      ?? nodes[0];
    if (!focusNode) return;

    const nextPosition = arrangedPositions.get(focusNode.id) ?? focusNode.position;
    requestAnimationFrame(() => {
      setCenter(nextPosition.x, nextPosition.y, {
        zoom: 1.08,
        duration: 220,
      });
    });
  }, [edges, isAutoArrangeEnabled, nodes, selectedNodeId, setCenter, setNodes]);

  const handleGenerateFlow = async () => {
    const clampedMaxTokens = normalizeGeneratorMaxTokens(generatorMaxTokens);
    if (clampedMaxTokens !== generatorMaxTokens) {
      setGeneratorMaxTokens(clampedMaxTokens);
    }

    if (generatorPrompt.trim().length < 10) {
      setGenerationError(t("ai_generator.prompt_too_short"));
      setGenerationValidationErrors([]);
      setGenerationResult(null);
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationValidationErrors([]);
    setGenerationResult(null);

    try {
      const result: GenerateAutomationFlowResult = await generateAutomationFlow(
        {
          prompt: generatorPrompt,
          locale,
          channel: generatorChannel,
          allowedNodeTypes: availableNodeTypes,
          nodeContentConstraints: generatorConstraints,
          temperature: Number(generatorTemperature.toFixed(1)),
          maxOutputTokens: clampedMaxTokens,
        },
      );

      setGenerationRawResponse(result.rawResponse ?? null);

      if (!result.success || !result.flow) {
        setGenerationError(result.error ?? t("ai_generator.generic_error"));
        setGenerationValidationErrors(result.validationErrors ?? []);
        return;
      }

      setGenerationResult(result.flow);
      setGenerationValidationErrors([]);
      toast.success(t("ai_generator.generated_toast"));
    } catch (error) {
      setGenerationError(t("ai_generator.generic_error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertGeneratedFlow = () => {
    if (!generationResult) {
      return;
    }

    if (insertMode === "replace") {
      setNodes(markDraftAsGenerated(generationResult.nodes));
      setEdges(generationResult.edges as AutomationCanvasEdge[]);
      setSelectedNodeIds([]);
      setIsActive(false);
      setIsGeneratorOpen(false);
      toast.success(t("ai_generator.inserted_replace_toast"));
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 350 }));
      return;
    }

    const mergeResult = insertGeneratedSubflow({
      currentNodes: nodes,
      currentEdges: edges,
      generatedNodes: generationResult.nodes,
      generatedEdges: generationResult.edges,
      selectedNodeId: selectedNodeId ?? "",
    });

    if (!mergeResult.success) {
      setGenerationError(mergeResult.error);
      return;
    }

    setNodes(markDraftAsGenerated(mergeResult.nodes as AutomationFlowNode[]));
    setEdges(mergeResult.edges as AutomationCanvasEdge[]);
    setIsActive(false);
    setIsGeneratorOpen(false);
    toast.success(t("ai_generator.inserted_subflow_toast"));
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 350 }));
  };

  const handleNavigateToAutomation = useCallback(
    (targetAutomationId: number) => {
      if (hasUnsavedChanges) {
        toast.warning(t("save_before_redirect_warning"));
        return;
      }
      router.push(`/automation/${targetAutomationId}`);
    },
    [hasUnsavedChanges, router, t],
  );

  const hasStartNodeInSelection = useMemo(() => {
    if (selectedNodeIds.length === 0) {
      return false;
    }

    const selectedSet = new Set(selectedNodeIds);
    return nodes.some((node) => selectedSet.has(node.id) && node.type === "start");
  }, [nodes, selectedNodeIds]);

  const handleDuplicateSelection = useCallback(() => {
    if (selectedNodeIds.length <= 1) {
      return;
    }

    if (hasStartNodeInSelection) {
      toast.error(t("bulk_actions.start_node_blocked"));
      return;
    }

    const selectedSet = new Set(selectedNodeIds);
    const selectedNodes = nodes.filter((node) => selectedSet.has(node.id));
    const idMap = new Map<string, string>();

    selectedNodes.forEach((node) => {
      idMap.set(node.id, generateCanvasId("node"));
    });

    const duplicatedNodes = selectedNodes.map((node) => {
      const duplicatedNodeId = idMap.get(node.id)!;
      return {
        ...node,
        id: duplicatedNodeId,
        position: {
          x: node.position.x + 48,
          y: node.position.y + 48,
        },
        selected: false,
        dragging: false,
      };
    });

    const duplicatedEdges = edges
      .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: generateCanvasId("edge"),
        source: idMap.get(edge.source) ?? edge.source,
        target: idMap.get(edge.target) ?? edge.target,
        selected: false,
      }));

    const duplicatedNodeIds = duplicatedNodes.map((node) => node.id);
    setNodes((currentNodes) => [...currentNodes, ...duplicatedNodes]);
    setEdges((currentEdges) => [...currentEdges, ...duplicatedEdges]);
    setSelectedNodeIds(duplicatedNodeIds);
    setHasUnsavedChanges(true);
    toast.success(
      t("bulk_actions.duplicated_toast", {
        nodes: duplicatedNodes.length,
        edges: duplicatedEdges.length,
      }),
    );
  }, [
    edges,
    hasStartNodeInSelection,
    nodes,
    selectedNodeIds,
    t,
  ]);

  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/automation/templates", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load templates");
    }

    const payload = (await response.json()) as { templates?: AutomationTemplateItem[] };
    setTemplates(payload.templates ?? []);
  }, []);

  const handleSaveTemplateSelection = useCallback(() => {
    if (hasStartNodeInSelection) {
      toast.error(t("bulk_actions.start_node_blocked"));
      return;
    }
    setTemplateName("");
    setTemplateDescription("");
    setTemplateVisibility("team");
    setIsSaveTemplateOpen(true);
  }, [hasStartNodeInSelection, t]);

  const handleSaveAutomationSelection = useCallback(() => {
    if (hasStartNodeInSelection) {
      toast.error(t("bulk_actions.start_node_blocked"));
      return;
    }

    if (selectedNodeIds.length === 0) {
      return;
    }

    setIsSaveAutomationConfirmOpen(true);
  }, [hasStartNodeInSelection, selectedNodeIds.length, t]);

  const handleConfirmSaveAutomationSelection = useCallback(async () => {
    const selectedSet = new Set(selectedNodeIds);
    if (selectedSet.size === 0) {
      return;
    }

    const selectedNodes = nodes.filter((node) => selectedSet.has(node.id));
    const selectedEdges = edges.filter(
      (edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target),
    );

    if (selectedNodes.length === 0) {
      toast.error(t("bulk_actions.invalid_selection"));
      return;
    }

    const bridgeNodeId = generateCanvasId("node");
    const bridgeNode: AutomationCanvasNode = {
      id: bridgeNodeId,
      type: "go_to_node",
      position: {
        x:
          selectedNodes.reduce((sum, node) => sum + node.position.x, 0) /
          selectedNodes.length,
        y:
          selectedNodes.reduce((sum, node) => sum + node.position.y, 0) /
          selectedNodes.length,
      },
      data: {
        mode: "other_flow",
        targetAutomationId: "",
        targetNodeId: "",
        fallbackAction: "stop",
        fallbackNodeId: "",
      },
      selected: false,
      dragging: false,
    };

    const incomingEdges = edges.filter(
      (edge) => !selectedSet.has(edge.source) && selectedSet.has(edge.target),
    );
    const outgoingEdges = edges.filter(
      (edge) => selectedSet.has(edge.source) && !selectedSet.has(edge.target),
    );

    const optimisticNodes = [
      ...nodes.filter((node) => !selectedSet.has(node.id)),
      bridgeNode,
    ];
    const optimisticEdges = [
      ...edges.filter(
        (edge) => !selectedSet.has(edge.source) && !selectedSet.has(edge.target),
      ),
      ...incomingEdges.map((edge) => ({
        ...edge,
        id: generateCanvasId("edge"),
        target: bridgeNodeId,
        targetHandle: null,
      })),
      ...outgoingEdges.map((edge) => ({
        ...edge,
        id: generateCanvasId("edge"),
        source: bridgeNodeId,
        sourceHandle: null,
      })),
    ];

    const previousNodes = nodes;
    const previousEdges = edges;
    const previousSelection = selectedNodeIds;

    setIsSavingAutomationSelection(true);
    setIsSaveAutomationConfirmOpen(false);
    setNodes(optimisticNodes);
    setEdges(optimisticEdges);
    setSelectedNodeIds([bridgeNodeId]);
    setHasUnsavedChanges(true);

    try {
      const result = await saveSelectionAsAutomation({
        sourceAutomationId: automationId,
        selectedNodes: selectedNodes as AutomationFlowNode[],
        selectedEdges: selectedEdges as AutomationFlowEdge[],
      });

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === bridgeNodeId
            ? ({
                ...node,
                data: {
                  ...(node.data ?? {}),
                  mode: "other_flow",
                  targetAutomationId: result.newAutomationId,
                  targetNodeId: result.startNodeId,
                },
              } as AutomationCanvasNode)
            : node,
        ),
      );

      toast.success(
        t("bulk_actions.save_automation_success", {
          automationId: result.newAutomationId,
        }),
      );
    } catch (error) {
      setNodes(previousNodes);
      setEdges(previousEdges);
      setSelectedNodeIds(previousSelection);
      toast.error(t("bulk_actions.save_automation_error"));
    } finally {
      setIsSavingAutomationSelection(false);
    }
  }, [automationId, edges, nodes, selectedNodeIds, setEdges, setNodes, t]);

  const handleConfirmSaveTemplate = useCallback(async () => {
    const selectedSet = new Set(selectedNodeIds);
    const endpoint =
      selectedSet.size > 1
        ? "/api/automation/templates/from-selection"
        : "/api/automation/templates/from-flow";

    const payload = {
      name: templateName.trim(),
      description: templateDescription.trim(),
      isPublic: templateVisibility === "public",
      nodes: nodes as AutomationFlowNode[],
      edges: edges as AutomationFlowEdge[],
      selectedNodeIds: selectedNodeIds,
    };

    if (!payload.name) {
      toast.error(t("template_save.name_required"));
      return;
    }

    setIsSavingTemplate(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Could not save template");
      }

      setIsSaveTemplateOpen(false);
      toast.success(t("template_save.success"));
    } catch (error) {
      toast.error(t("template_save.error"));
    } finally {
      setIsSavingTemplate(false);
    }
  }, [edges, nodes, selectedNodeIds, t, templateDescription, templateName, templateVisibility]);

  const handleInsertTemplate = useCallback(() => {
    const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
    if (!selectedTemplate) {
      toast.error(t("template_insert.select_template"));
      return;
    }

    if (selectedTemplate.nodes.length === 0) {
      toast.error(t("template_insert.empty_error"));
      return;
    }

    setIsInsertingTemplate(true);
    try {
      const idMap = new Map<string, string>();
      const remappedNodes = selectedTemplate.nodes.map((node) => {
        const nextId = generateCanvasId("node");
        idMap.set(node.id, nextId);
        return {
          ...node,
          id: nextId,
          position: {
            x: node.position.x + TEMPLATE_INSERT_OFFSET,
            y: node.position.y + TEMPLATE_INSERT_OFFSET,
          },
          selected: false,
          dragging: false,
        } as AutomationCanvasNode;
      });

      const remappedEdges = selectedTemplate.edges
        .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: generateCanvasId("edge"),
          source: idMap.get(edge.source) ?? edge.source,
          target: idMap.get(edge.target) ?? edge.target,
          selected: false,
        })) as AutomationCanvasEdge[];

      setNodes((currentNodes) => [...currentNodes, ...remappedNodes]);
      setEdges((currentEdges) => [...currentEdges, ...remappedEdges]);
      setSelectedNodeIds(remappedNodes.map((node) => node.id));
      setHasUnsavedChanges(true);
      setIsInsertTemplateOpen(false);
      toast.success(t("template_insert.success"));
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 250 }));
    } finally {
      setIsInsertingTemplate(false);
    }
  }, [fitView, selectedTemplateId, t, templates]);

  const bgColor = isDarkMode ? "#020617" : "#f8fafc";
  const dotColor = isDarkMode ? "#334155" : "#cbd5e1";
  const isShortViewport = viewportSize.height > 0 && viewportSize.height < 820;
  const isCompactViewport = viewportSize.width > 0 && viewportSize.width < 1440;
  const miniMapHeight = isShortViewport ? 96 : 136;
  const miniMapWidth = isShortViewport ? 150 : isCompactViewport ? 180 : 220;
  const miniMapLeftOffset = 16 + CONTROL_STACK_WIDTH + OVERLAY_GAP;

  const controlsStyle = {
    backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
    color: isDarkMode ? "#f8fafc" : "#0f172a",
    borderColor: isDarkMode ? "#1e293b" : "#e2e8f0",
    left: 16,
    bottom: 16,
    borderRadius: 12,
    zIndex: 6,
  };

  const miniMapStyle = {
    backgroundColor: isDarkMode ? "#0f172a" : "#ffffff",
    height: miniMapHeight,
    width: miniMapWidth,
    left: miniMapLeftOffset,
    bottom: 16,
    borderRadius: 16,
    zIndex: 5,
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="flex justify-between items-center px-6 py-3 bg-background border-b border-border shrink-0 z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                {t("header_title")}
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  ID: {automationId}
                </p>
                <span
                  className={`inline-flex items-center px-1.5 rounded-full text-[10px] font-medium ${
                    isActive
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  }`}
                >
                  {isActive ? t("status_active") : t("status_draft")}
                </span>
                {aiDraftMetadata && (
                  <span
                    className={`inline-flex items-center px-1.5 rounded-full text-[10px] font-medium ${
                      requiresManualReview
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}
                  >
                    {requiresManualReview
                      ? t("status_ai_draft_generated")
                      : t("status_ai_reviewed")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {aiDraftMetadata && (
              <Button
                variant={requiresManualReview ? "default" : "outline"}
                size="sm"
                onClick={handleConfirmReview}
                disabled={!requiresManualReview}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {requiresManualReview
                  ? t("ai_review.confirm_btn")
                  : t("ai_review.confirmed_btn")}
              </Button>
            )}
            {isAIFlowGeneratorEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsGeneratorOpen(true);
                  resetGeneratorState();
                }}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                {t("ai_generator.open_btn")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <LayoutGrid className="h-4 w-4 mr-1.5" />
                  {t("ai_generator.organize_btn")}
                  <ChevronDown className="h-4 w-4 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    handleAutoArrange("hierarchy_ignore_back_edges")
                  }
                >
                  {t("ai_generator.organize_modes.ignore_back_edges")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAutoArrange("straight_lines")}
                >
                  {t("ai_generator.organize_modes.straight_lines")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAutoArrange("spaced_tree")}>
                  {t("ai_generator.organize_modes.spaced_tree")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAutoArrange("vertical_list")}
                >
                  {t("ai_generator.organize_modes.vertical_list")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAutoArrange("genealogical_tree")}
                >
                  {t("ai_generator.organize_modes.genealogical_tree")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAutoArrange("constellation")}>
                  {t("ai_generator.organize_modes.constellation")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAutoArrange("auto_focus")}>
                  {isAutoArrangeEnabled
                    ? t("ai_generator.organize_modes.auto_focus_enabled")
                    : t("ai_generator.organize_modes.auto_focus")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTemplateId(null);
                setIsInsertTemplateOpen(true);
                loadTemplates().catch(() => {
                  toast.error(t("template_insert.load_error"));
                });
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t("template_insert.open_btn")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTemplateName("");
                setTemplateDescription("");
                setTemplateVisibility("team");
                setIsSaveTemplateOpen(true);
              }}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {t("template_save.open_btn")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleActive}
              disabled={!isActive && requiresManualReview}
              className={
                isActive
                  ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  : "text-green-600 hover:text-green-700 hover:bg-green-50"
              }
            >
              {isActive ? (
                <PauseCircle className="h-4 w-4 mr-1.5" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-1.5" />
              )}
              {isActive ? t("pause") : t("activate")}
            </Button>
            {infiniteLoopDiagnostics.hasNonTerminatingLoop ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  toast.error(
                    `${t("loop_alert_toast")} (${problematicEdgeSummaries.join(", ")})`,
                  )
                }
              >
                <Siren className="h-4 w-4 mr-2" />
                {t("loop_alert_btn")}
              </Button>
            ) : (
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={handleSave}
                disabled={isSaving}
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? t("saving") : t("save_btn")}
              </Button>
            )}
          </div>
        </header>

        {aiDraftMetadata && (
          <div
            className={`border-b px-6 py-3 text-sm ${
              requiresManualReview
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
                : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100"
            }`}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {requiresManualReview
                    ? t("ai_review.banner_title")
                    : t("ai_review.reviewed_title")}
                </div>
                <p className="text-xs md:text-sm">
                  {requiresManualReview
                    ? t("ai_review.banner_description")
                    : t("ai_review.reviewed_description")}
                </p>
              </div>
              {requiresManualReview && (
                <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                  {t("ai_review.generated_meta", {
                    timestamp: new Date(
                      aiDraftMetadata.generatedAt,
                    ).toLocaleString(locale),
                  })}
                </p>
              )}
            </div>
          </div>
        )}

        {infiniteLoopDiagnostics.hasNonTerminatingLoop && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
            <p className="font-medium">{t("loop_alert_toast")}</p>
            <p className="mt-1 text-xs opacity-90">
              {problematicEdgeSummaries.join(" · ")}
            </p>
          </div>
        )}

        <div className="flex min-h-0 min-w-0 w-full flex-1">
          <Sidebar />

          <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
            <ReactFlow
              nodes={nodes}
              edges={displayEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              selectionKeyCode="Shift"
              multiSelectionKeyCode="Shift"
              selectionOnDrag
              proOptions={proOptions}
              fitView
            >
              <Controls
                position="bottom-left"
                style={controlsStyle}
                className="[&>button]:!bg-transparent [&>button]:!border-none [&>button]:!text-current hover:[&>button]:!bg-slate-100 dark:hover:[&>button]:!bg-slate-800 [&>button]:p-1 [&>button]:rounded-sm border shadow-lg backdrop-blur-sm"
              />
              <MiniMap
                position="bottom-left"
                style={miniMapStyle}
                className="border shadow-lg backdrop-blur-sm"
                maskColor={
                  isDarkMode
                    ? "rgba(2, 6, 23, 0.7)"
                    : "rgba(248, 250, 252, 0.7)"
                }
                nodeColor={isDarkMode ? "#334155" : "#cbd5e1"}
                pannable
                zoomable
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={12}
                size={1}
                color={dotColor}
                bgColor={bgColor}
              />
            </ReactFlow>

            {selectedNodeIds.length > 1 && (
              <div className="absolute right-4 top-4 z-20 w-72 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">
                    {t("bulk_actions.title", { count: selectedNodeIds.length })}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setSelectedNodeIds([])}
                  >
                    {t("bulk_actions.clear_selection")}
                  </Button>
                </div>
                <div className="space-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleDuplicateSelection}
                  >
                    {t("bulk_actions.duplicate")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleSaveTemplateSelection}
                  >
                    {t("bulk_actions.save_template")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleSaveAutomationSelection}
                    disabled={isSavingAutomationSelection}
                  >
                    {t("bulk_actions.save_automation")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <PropertiesPanel
            selectedNode={selectedNode}
            nodes={nodes}
            currentAutomationId={automationId}
            availableAutomations={availableAutomations}
            hasUnsavedChanges={hasUnsavedChanges}
            onNavigateToAutomation={handleNavigateToAutomation}
            onUpdateNode={updateNodeData}
            onClose={() => setSelectedNodeIds([])}
          />
        </div>
      </div>

      <Dialog open={isSavePreviewOpen} onOpenChange={setIsSavePreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("save_preview.title")}</DialogTitle>
            <DialogDescription>
              {t("save_preview.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {savePreviewFlow && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="font-medium">{t("save_preview.sequence")}</div>
                <div className="mt-2 text-muted-foreground">
                  {t("save_preview.counts", {
                    nodes: savePreviewFlow.preview.nodeCount,
                    edges: savePreviewFlow.preview.edgeCount,
                  })}
                </div>
              </div>
            )}

            {savePreviewWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {t("save_preview.warnings_title")}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-700/90 dark:text-amber-300">
                  {savePreviewWarnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {savePreviewErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t("save_preview.errors_title")}
                </div>
                <p className="mt-2 text-xs text-destructive/80">
                  Haz clic en un error para ir directo al nodo relacionado.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive/90">
                  {savePreviewErrors.map((error, index) => (
                    <li key={`${error}-${index}`}>
                      <button
                        type="button"
                        onClick={() => handleSaveIssueClick(error)}
                        className="cursor-pointer text-left underline-offset-2 hover:underline"
                      >
                        {getFriendlySaveErrorMessage(error)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {savePreviewFlow && savePreviewWarnings.length === 0 && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("save_preview.ready_title")}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSavePreviewOpen(false)}
            >
              {t("save_preview.back_btn")}
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={
                !savePreviewFlow || savePreviewErrors.length > 0 || isSaving
              }
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSaving ? t("saving") : t("save_preview.confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveTemplateOpen} onOpenChange={setIsSaveTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("template_save.title")}</DialogTitle>
            <DialogDescription>{t("template_save.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">{t("template_save.name_label")}</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder={t("template_save.name_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">{t("template_save.description_label")}</Label>
              <Textarea
                id="template-description"
                rows={3}
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
                placeholder={t("template_save.description_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("template_save.visibility_label")}</Label>
              <Select
                value={templateVisibility}
                onValueChange={(value) => setTemplateVisibility(value as "team" | "public")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">{t("template_save.visibility_team")}</SelectItem>
                  <SelectItem value="public">{t("template_save.visibility_public")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveTemplateOpen(false)}>
              {t("cancel_btn")}
            </Button>
            <Button onClick={handleConfirmSaveTemplate} disabled={isSavingTemplate}>
              {isSavingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("template_save.confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isSaveAutomationConfirmOpen}
        onOpenChange={setIsSaveAutomationConfirmOpen}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("bulk_actions.save_automation_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("bulk_actions.save_automation_confirm_description", {
                count: selectedNodeIds.length,
              })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSaveAutomationConfirmOpen(false)}
              disabled={isSavingAutomationSelection}
            >
              {t("bulk_actions.save_automation_cancel")}
            </Button>
            <Button
              onClick={handleConfirmSaveAutomationSelection}
              disabled={isSavingAutomationSelection}
            >
              {isSavingAutomationSelection ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitBranchPlus className="mr-2 h-4 w-4" />
              )}
              {t("bulk_actions.save_automation_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInsertTemplateOpen} onOpenChange={setIsInsertTemplateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("template_insert.title")}</DialogTitle>
            <DialogDescription>{t("template_insert.description")}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {templates.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("template_insert.empty")}
              </div>
            ) : (
              templates.map((template) => {
                const previewItems = buildTemplatePreviewItems(template);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition",
                      selectedTemplateId === template.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{template.name}</div>
                        <p className="text-xs text-muted-foreground">
                          {template.description || t("template_insert.no_description")}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                        {template.isPublic ? t("template_insert.badge_public") : t("template_insert.badge_team")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {previewItems.map((item) => {
                        const Icon = item.icon ? ICONS_BY_KEY[item.icon] : null;
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                              item.colorClass,
                            )}
                          >
                            {Icon ? <Icon className={cn("h-3 w-3", item.iconColorClass)} /> : null}
                            <span>{t(item.labelKey)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInsertTemplateOpen(false)}>
              {t("cancel_btn")}
            </Button>
            <Button
              onClick={handleInsertTemplate}
              disabled={selectedTemplateId === null || isInsertingTemplate}
            >
              {isInsertingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {t("template_insert.confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAIFlowGeneratorEnabled && (
        <Dialog
          open={isGeneratorOpen}
          onOpenChange={setIsGeneratorOpen}
        >
          <DialogContent className="flex h-screen w-screen max-h-none max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none">
          <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
            <DialogTitle>{t("ai_generator.title")}</DialogTitle>
            <DialogDescription>
              {t("ai_generator.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="grid min-h-full gap-4 px-6 py-4 lg:grid-cols-[1.35fr_0.85fr]">
              <div className="space-y-4">
                <section className="rounded-xl bg-muted/20 p-5">
                  <div className="space-y-1 pb-4">
                    <h3 className="font-semibold">{t("ai_generator.prompt_label")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("ai_generator.prompt_placeholder")}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="ai-flow-prompt">
                        {t("ai_generator.prompt_label")}
                      </Label>
                      <Textarea
                        id="ai-flow-prompt"
                        rows={10}
                        value={generatorPrompt}
                        onChange={(event) =>
                          setGeneratorPrompt(event.target.value)
                        }
                        placeholder={t("ai_generator.prompt_placeholder")}
                        className="resize-none border-0 bg-background/90 shadow-sm"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label>{t("ai_generator.channel_label")}</Label>
                      <RadioGroup
                        value={generatorChannel}
                        onValueChange={(value) => {
                          setGeneratorChannel(value as AutomationAIChannel);
                          resetGeneratorState();
                        }}
                        className="grid gap-3 md:grid-cols-2"
                      >
                        {(["qr", "api"] as AutomationAIChannel[]).map(
                          (channel) => (
                            <label
                              key={channel}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-xl bg-background/80 p-4 shadow-sm ring-1 ring-border transition hover:ring-primary/50",
                                generatorChannel === channel &&
                                  "ring-2 ring-primary/50",
                              )}
                            >
                              <RadioGroupItem
                                value={channel}
                                className="mt-1"
                              />
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {t(`ai_generator.channels.${channel}.title`)}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {t(
                                    `ai_generator.channels.${channel}.description`,
                                  )}
                                </p>
                              </div>
                            </label>
                          ),
                        )}
                      </RadioGroup>
                    </div>
                  </div>
                </section>

                <details className="rounded-xl bg-muted/20" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium marker:hidden">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      {t("ai_generator.advanced_options_title")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {generatorTemperature.toFixed(1)} · {generatorMaxTokens}
                    </span>
                  </summary>
                  <div className="px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <Label>{t("ai_generator.temperature_label")}</Label>
                          <span className="text-xs text-muted-foreground">
                            {generatorTemperature.toFixed(1)}
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={2}
                          step={0.1}
                          value={[generatorTemperature]}
                          onValueChange={(value) =>
                            setGeneratorTemperature(value[0] ?? 0.7)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-flow-max-tokens">
                          {t("ai_generator.max_tokens_label")}
                        </Label>
                        <Input
                          id="ai-flow-max-tokens"
                          type="number"
                          min={MIN_GENERATOR_TOKENS}
                          max={MAX_GENERATOR_TOKENS}
                          step={64}
                          value={generatorMaxTokens}
                          onChange={(event) => {
                            handleGeneratorMaxTokensChange(
                              event.target.value,
                            );
                          }}
                          onBlur={(event) => {
                            event.target.value = normalizeGeneratorMaxTokens(
                              event.target.value,
                            ).toString();
                            handleGeneratorMaxTokensChange(event.target.value);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          {GENERATOR_TOKEN_RANGE_HINT}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("ai_generator.max_tokens_hint")}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-flow-max-tokens-preset">
                          {t("ai_generator.max_tokens_presets_label")}
                        </Label>
                        <Select
                          value={
                            isGeneratorTokenPreset(generatorMaxTokens)
                              ? generatorMaxTokens.toString()
                              : undefined
                          }
                          onValueChange={(value) =>
                            handleGeneratorMaxTokensChange(value)
                          }
                        >
                          <SelectTrigger id="ai-flow-max-tokens-preset">
                            <SelectValue placeholder="512 · 1024 · 2048 · 4096" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENERATOR_TOKEN_PRESETS.map((preset) => (
                              <SelectItem
                                key={preset}
                                value={preset.toString()}
                              >
                                {preset}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </details>

                <details className="rounded-xl bg-muted/20">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium marker:hidden">
                    <span>{t("ai_generator.allowed_nodes_title")}</span>
                    <span className="text-xs text-muted-foreground">
                      {
                        AUTOMATION_AI_NODE_CATALOG.filter((node) =>
                          node.channels.includes(generatorChannel),
                        ).length
                      }
                    </span>
                  </summary>
                  <div className="px-4 py-4">
                    <p className="mb-4 text-sm text-muted-foreground">
                      {t("ai_generator.allowed_nodes_desc")}
                    </p>
                    <div className="space-y-3">
                      {AUTOMATION_AI_NODE_CATALOG.filter((node) =>
                        node.channels.includes(generatorChannel),
                      ).map((node) => (
                        <div key={node.type} className="rounded-xl bg-background/80 p-3 shadow-sm">
                          <div className="text-sm font-medium">
                            {t(node.labelKey)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {node.description}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {generatorConstraints[node.type]}
                          </div>
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            {node.examples.join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              </div>

              <div className="space-y-4">
                <section className="space-y-4 rounded-xl bg-muted/20 p-5">
                  <div className="space-y-1">
                    <h3 className="font-semibold">{t("ai_generator.preview_title")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("ai_generator.preview_desc")}
                    </p>
                  </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-background/80 p-3 shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("ai_generator.status_title")}
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {generationError
                            ? t("ai_generator.status_error")
                            : isGenerating
                              ? t("ai_generator.status_generating")
                              : hasValidGeneration
                                ? t("ai_generator.status_ready")
                                : t("ai_generator.status_idle")}
                        </div>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3 shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("ai_generator.suggested_name_title")}
                        </div>
                        <div className="mt-2 text-sm font-medium leading-snug">
                          {generationResult?.suggestedName ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-background/80 p-3 shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("ai_generator.counts_title")}
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {generationResult
                            ? t("ai_generator.preview_counts", {
                                nodes: generationResult.nodes.length,
                                edges: generationResult.edges.length,
                              })
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3 shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t("ai_generator.insert_mode_title")}
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {currentFlowHasEditableNodes
                            ? insertMode === "replace"
                              ? t("ai_generator.insert_modes.replace_title")
                              : t("ai_generator.insert_modes.insert_title")
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {generationError && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        <div className="flex items-center gap-2 font-medium">
                          <AlertTriangle className="h-4 w-4" />
                          {generationError}
                        </div>
                      </div>
                    )}

                    {generationValidationErrors.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4" />
                          {t("ai_generator.validation_errors_title")}
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-700/90 dark:text-amber-300">
                          {generationValidationErrors.map((error, index) => (
                            <li key={`${error}-${index}`}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {generationResult ? (
                      <>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-100">
                          <div className="font-medium">
                            {t("ai_generator.review_notice_title")}
                          </div>
                          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                            {t("ai_generator.review_notice_description")}
                          </p>
                        </div>

                        {generationResult.warnings.length > 0 && (
                          <div>
                            <div className="mb-2 text-sm font-medium">
                              {t("ai_generator.warnings_title")}
                            </div>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                              {generationResult.warnings.map(
                                (warning, index) => (
                                  <li key={`${warning}-${index}`}>{warning}</li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}

                        {currentFlowHasEditableNodes && (
                          <div className="space-y-3 rounded-xl bg-background/80 p-3 shadow-sm">
                            <div className="text-sm font-medium">
                              {t("ai_generator.insert_mode_title")}
                            </div>
                            <RadioGroup
                              value={insertMode}
                              onValueChange={(value) =>
                                setInsertMode(value as InsertMode)
                              }
                              className="grid gap-3"
                            >
                              <label
                                className={cn(
                                  "flex cursor-pointer items-start gap-3 rounded-xl bg-background p-3 shadow-sm ring-1 ring-border transition hover:ring-primary/50",
                                  insertMode === "replace" &&
                                    "ring-2 ring-primary/50",
                                )}
                              >
                                <RadioGroupItem
                                  value="replace"
                                  className="mt-1"
                                />
                                <div>
                                  <div className="flex items-center gap-2 font-medium">
                                    <RotateCcw className="h-4 w-4" />
                                    {t(
                                      "ai_generator.insert_modes.replace_title",
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {t(
                                      "ai_generator.insert_modes.replace_desc",
                                    )}
                                  </p>
                                </div>
                              </label>
                              <label
                                className={cn(
                                  "flex cursor-pointer items-start gap-3 rounded-xl bg-background p-3 shadow-sm ring-1 ring-border transition hover:ring-primary/50",
                                  insertMode === "insert" &&
                                    "ring-2 ring-primary/50",
                                )}
                              >
                                <RadioGroupItem
                                  value="insert"
                                  className="mt-1"
                                />
                                <div>
                                  <div className="flex items-center gap-2 font-medium">
                                    <GitBranchPlus className="h-4 w-4" />
                                    {t(
                                      "ai_generator.insert_modes.insert_title",
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {t("ai_generator.insert_modes.insert_desc")}
                                  </p>
                                </div>
                              </label>
                            </RadioGroup>
                            {insertMode === "insert" && (
                              <p className="text-xs text-muted-foreground">
                                {selectedNodeId
                                  ? t("ai_generator.selected_node_ready", {
                                      nodeId: selectedNodeId,
                                    })
                                  : t("ai_generator.select_node_hint")}
                              </p>
                            )}
                          </div>
                        )}

                        {generatedFlowSummary && (
                          <Card className="border shadow-sm">
                            <CardHeader className="pb-4">
                              <CardTitle className="text-base">
                                {t("ai_generator.diff_title")}
                              </CardTitle>
                              <CardDescription>
                                {t("ai_generator.preview_counts", {
                                  nodes: generationResult.nodes.length,
                                  edges: generationResult.edges.length,
                                })}
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="grid gap-3 md:grid-cols-2">
                                {(
                                  [
                                    [
                                      "outgoingMessages",
                                      t("ai_generator.diff_sections.messages"),
                                    ],
                                    [
                                      "conditions",
                                      t(
                                        "ai_generator.diff_sections.conditions",
                                      ),
                                    ],
                                    [
                                      "savedVariables",
                                      t("ai_generator.diff_sections.variables"),
                                    ],
                                    [
                                      "links",
                                      t("ai_generator.diff_sections.links"),
                                    ],
                                  ] as const
                                ).map(([key, title]) => {
                                  const items = generatedFlowSummary[key];
                                  return (
                                    <div
                                      key={key}
                                      className="rounded-xl bg-muted/20 p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium">
                                          {title}
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          {items.length}
                                        </span>
                                      </div>
                                      {items.length > 0 ? (
                                        <div className="mt-3 space-y-2">
                                          {items.map((item) => (
                                            <div
                                              key={item.id}
                                              className="rounded-lg bg-background/80 p-2 shadow-sm"
                                            >
                                              <div className="text-sm font-medium leading-snug">
                                                {item.title}
                                              </div>
                                              {item.description && (
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                  {item.description}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                          {t("ai_generator.diff_empty")}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        <details className="rounded-xl bg-background/70 p-1" open>
                          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
                            <div className="flex items-center justify-between gap-3">
                              <span>
                                {t("ai_generator.technical_details_title")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t("ai_generator.preview_counts", {
                                  nodes: generationResult.nodes.length,
                                  edges: generationResult.edges.length,
                                })}
                              </span>
                            </div>
                          </summary>
                          <div className="space-y-3 px-4 py-4">
                            <details className="rounded-xl bg-muted/20">
                              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium marker:hidden">
                                <div className="flex items-center justify-between gap-2">
                                  <span>{t("ai_generator.nodes_title")}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {generationResult.nodes.length}
                                  </span>
                                </div>
                              </summary>
                              <div className="space-y-2 border-t px-3 py-3">
                                {generationResult.nodes.map((node) => (
                                  <div
                                    key={node.id}
                                    className="rounded-xl bg-background/80 p-3 text-sm shadow-sm"
                                  >
                                    <div className="font-medium">
                                      {node.type}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {node.id}
                                    </div>
                                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                      {JSON.stringify(node.data, null, 2)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            </details>

                            <details className="rounded-xl bg-muted/20">
                              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium marker:hidden">
                                <div className="flex items-center justify-between gap-2">
                                  <span>{t("ai_generator.edges_title")}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {generationResult.edges.length}
                                  </span>
                                </div>
                              </summary>
                              <div className="space-y-2 border-t px-3 py-3">
                                {generationResult.edges.map((edge) => (
                                  <div
                                    key={edge.id}
                                    className="rounded-xl bg-background/80 p-3 text-xs text-muted-foreground shadow-sm"
                                  >
                                    <div>
                                      {edge.source} → {edge.target}
                                    </div>
                                    {(edge.sourceHandle ||
                                      edge.targetHandle) && (
                                      <div className="mt-1">
                                        {edge.sourceHandle
                                          ? `sourceHandle=${edge.sourceHandle}`
                                          : null}
                                        {edge.sourceHandle && edge.targetHandle
                                          ? " · "
                                          : null}
                                        {edge.targetHandle
                                          ? `targetHandle=${edge.targetHandle}`
                                          : null}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>

                            {generationRawResponse && (
                              <details className="rounded-xl bg-muted/20">
                                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium marker:hidden">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>
                                      {t("ai_generator.raw_response_title")}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      JSON
                                    </span>
                                  </div>
                                </summary>
                                <div className="border-t px-3 py-3">
                                  <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                    {generationRawResponse}
                                  </pre>
                                </div>
                              </details>
                            )}
                          </div>
                        </details>
                      </>
                    ) : (
                      <div className="rounded-xl bg-background/70 p-6 text-sm text-muted-foreground shadow-sm ring-1 ring-dashed ring-border">
                        {isGenerating
                          ? t("ai_generator.generating_preview")
                          : t("ai_generator.empty_preview")}
                      </div>
                    )}

                    {generationRawResponse && !generationResult && (
                      <details className="rounded-xl bg-background/70 p-3 text-xs text-muted-foreground shadow-sm">
                        <summary className="cursor-pointer font-medium">
                          {t("ai_generator.raw_response_title")}
                        </summary>
                        <pre className="mt-3 whitespace-pre-wrap break-words">
                          {generationRawResponse}
                        </pre>
                      </details>
                    )}
                </section>
              </div>
            </div>
          </div>

          {showInsertSelectionHelper && (
            <div className="border-t border-amber-500/30 bg-amber-500/5 px-6 py-3">
              <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("ai_generator.select_node_hint")}</span>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsGeneratorOpen(false)}>
              {t("ai_generator.cancel_btn")}
            </Button>
            {hasValidGeneration ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleGenerateFlow}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {t("ai_generator.generate_again_btn")}
                </Button>
                <Button
                  onClick={handleInsertGeneratedFlow}
                  disabled={insertMode === "insert" && !selectedNodeId}
                >
                  {t("ai_generator.insert_btn")}
                </Button>
              </>
            ) : (
              <Button onClick={handleGenerateFlow} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isGenerating
                  ? t("ai_generator.generating_btn")
                  : t("ai_generator.generate_btn")}
              </Button>
            )}
          </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderContent {...props} />
    </ReactFlowProvider>
  );
}
