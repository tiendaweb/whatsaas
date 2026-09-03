"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/routing";
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
  ArrowRight,
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
  Presentation,
  PanelLeft,
  Maximize2,
  StickyNote,
  ListOrdered,
  ClipboardList,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { StartNode } from "./nodes/StartNode";
import { MessageNode } from "./nodes/MessageNode";
import { OptionsNode } from "./nodes/OptionsNode";
import { MenuSimpleNode } from "./nodes/MenuSimpleNode";
import { DelayNode } from "./nodes/DelayNode";
import { CollectNode } from "./nodes/CollectNode";
import { FormNode } from "./nodes/FormNode";
import { SaveContactNode } from "./nodes/SaveContactNode";
import { MediaNode } from "./nodes/MediaNode";
import { EndNode } from "./nodes/EndNode";
import { ButtonMessageNode } from "./nodes/ButtonMessageNode";
import { ListMessageNode } from "./nodes/ListMessageNode";
import { CallToActionNode } from "./nodes/CallToActionNode";
import { AiControlNode } from "./nodes/AiControlNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { GoToNode } from "./nodes/GoToNode";
import { StickyNoteNode } from "./nodes/StickyNoteNode";
import { Sidebar } from "./Sidebar";
import { PropertiesPanel } from "./PropertiesPanel";
import { FlowEditorHeader } from "./FlowEditorHeader";
import { AutomationConnectionsMap } from "./AutomationConnectionsMap";
import { AutomationChatSimulator } from "./AutomationChatSimulator";
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
  getAutomationNodeCatalogEntry,
  getAutomationNodeDefaults,
} from "@/lib/automation/node-catalog";
import { cn } from "@/lib/utils";
import { useBranding } from "@/providers/branding-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  AutomationAIDraftMetadata,
  AutomationEdgeStyleVariant,
  AutomationCanvasEdge,
  AutomationCanvasNode,
  AutomationCanvasNodeData,
  AutomationFlowChannel,
  AutomationFlowEdge,
  AutomationFlowNode,
} from "@/lib/automation/flow-schema";

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  options: OptionsNode,
  delay: DelayNode,
  collect: CollectNode,
  form: FormNode,
  save_contact: SaveContactNode,
  media: MediaNode,
  end: EndNode,
  button_message: ButtonMessageNode,
  list_message: ListMessageNode,
  call_to_action: CallToActionNode,
  ai_control: AiControlNode,
  condition: ConditionNode,
  go_to_node: GoToNode,
  sticky_note: StickyNoteNode,
  menu_simple: MenuSimpleNode,
};

interface FlowBuilderProps {
  automationId: number;
  automationName: string;
  automationNote?: string | null;
  initialNodes: AutomationCanvasNode[];
  initialEdges: AutomationCanvasEdge[];
  initialActive: boolean;
  initialUpdatedAt: string;
  isAIFlowGeneratorEnabled: boolean;
  availableAutomations: Array<{ id: number; name: string; instanceId: number | null }>;
  allAutomations: Array<{
    id: number;
    name: string;
    note?: string | null;
    isActive: boolean;
    nodes: unknown;
    edges?: unknown;
    instance?: { instanceName?: string | null } | null;
  }>;
  channel: AutomationFlowChannel;
}

type FlowBuilderViewMode = 'visual' | 'map' | 'simulator' | 'steps-list' | 'text-script';

const proOptions: ProOptions = { hideAttribution: true };
const CONTROL_STACK_HEIGHT = 116;
const CONTROL_STACK_WIDTH = 44;
const OVERLAY_GAP = 16;
const HORIZONTAL_SPACING = 440;
const VERTICAL_SPACING = 210;
const LIST_VERTICAL_SPACING = 86;
const DEFAULT_NODE_WIDTH = 280;
const COMPACT_MIND_MAP_HORIZONTAL_GAP = 100;
const COMPACT_MIND_MAP_VERTICAL_GAP = 32;
const UNIFORM_VERTICAL_NODE_GAP = 96;
const DEFAULT_NODE_HEIGHT = 120;
const INITIAL_EDITOR_ZOOM = 0.95;
const ORTHOGONAL_GRID_SIZE = 92;
const VIRTUAL_FLOW_NODE_VERTICAL_GAP = 136;

type InsertMode = "replace" | "insert";
type ArrangeMode =
  | "hierarchy_ignore_back_edges"
  | "straight_lines"
  | "spaced_tree"
  | "orthogonal_connectors"
  | "vertical_list"
  | "genealogical_tree"
  | "compact_mind_map"
  | "mind_map"
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

type IncomingLinkedGoTo = {
  sourceAutomationId: number;
  sourceAutomationName: string;
  sourceNodeId: string;
  sourceReferenceName?: string;
};

type TemplateNodeVisualData = {
  name?: string;
  icon?: AutomationSidebarIconKey;
  colorClass?: string;
  iconColorClass?: string;
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
  "sticky-note": StickyNote,
  "list-ordered": ListOrdered,
  "clipboard-list": ClipboardList,
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

const EDGE_STYLE_VARIANTS: AutomationEdgeStyleVariant[] = [
  "default",
  "dashed",
  "dotted",
  "bold",
  "subtle",
];

function getEdgeStyleVariant(edge: AutomationCanvasEdge): AutomationEdgeStyleVariant {
  return EDGE_STYLE_VARIANTS.includes((edge.styleVariant as AutomationEdgeStyleVariant | undefined) ?? "default")
    ? (edge.styleVariant as AutomationEdgeStyleVariant | undefined) ?? "default"
    : "default";
}

function getEdgeVisualStyle(
  edge: AutomationCanvasEdge,
  params: {
    problematic: boolean;
  },
) {
  const variant = getEdgeStyleVariant(edge);
  const stroke = params.problematic
    ? "var(--color-destructive)"
    : "var(--color-muted-foreground)";

  const styles: Record<AutomationEdgeStyleVariant, React.CSSProperties> = {
    default: {
      stroke,
      strokeWidth: 2.25,
      strokeLinecap: "round",
    },
    dashed: {
      stroke,
      strokeWidth: 2.25,
      strokeDasharray: "8 6",
      strokeLinecap: "round",
    },
    dotted: {
      stroke,
      strokeWidth: 2.2,
      strokeDasharray: "2 6",
      strokeLinecap: "round",
    },
    bold: {
      stroke,
      strokeWidth: 3.5,
      strokeLinecap: "round",
    },
    subtle: {
      stroke,
      strokeWidth: 1.6,
      opacity: params.problematic ? 1 : 0.65,
      strokeLinecap: "round",
    },
  };

  return styles[variant];
}

// Back edges = connections that point back to a node already on the active
// traversal path (an ancestor or a sibling/parallel branch reached earlier).
// We surface them so they can be drawn differently (dotted + animated) and not
// visually clash with the forward flow.
function detectBackEdges(
  nodes: AutomationCanvasNode[],
  edges: AutomationCanvasEdge[],
): Set<string> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, AutomationCanvasEdge[]>();
  for (const node of nodes) outgoing.set(node.id, []);
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge);
  }

  const startNode = nodes.find((node) => node.type === "start");
  const order = startNode
    ? [startNode.id, ...nodes.filter((node) => node.id !== startNode.id).map((node) => node.id)]
    : nodes.map((node) => node.id);

  const state = new Map<string, 0 | 1 | 2>();
  const backEdgeKeys = new Set<string>();

  const visit = (nodeId: string) => {
    state.set(nodeId, 1);
    for (const edge of outgoing.get(nodeId) ?? []) {
      const targetState = state.get(edge.target) ?? 0;
      if (targetState === 0) {
        visit(edge.target);
      } else if (targetState === 1) {
        backEdgeKeys.add(getEdgeKey(edge));
      }
    }
    state.set(nodeId, 2);
  };

  for (const nodeId of order) {
    if ((state.get(nodeId) ?? 0) === 0) visit(nodeId);
  }

  return backEdgeKeys;
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
    const visualData =
      typeof node.data === "object" &&
      node.data !== null &&
      "templateVisual" in node.data &&
      typeof node.data.templateVisual === "object" &&
      node.data.templateVisual !== null
        ? (node.data.templateVisual as TemplateNodeVisualData)
        : undefined;

    const customIcon =
      visualData?.icon && visualData.icon in ICONS_BY_KEY
        ? visualData.icon
        : undefined;

    const customName =
      typeof visualData?.name === "string" && visualData.name.trim().length > 0
        ? visualData.name.trim()
        : undefined;

    return {
      id: node.id,
      labelKey: catalogEntry?.labelKey ?? "nodes.message",
      customName,
      icon: customIcon ?? catalogEntry?.sidebar?.icon,
      colorClass: visualData?.colorClass ?? catalogEntry?.sidebar?.colorClass ?? "bg-muted",
      iconColorClass:
        visualData?.iconColorClass ??
        catalogEntry?.sidebar?.iconColorClass ??
        "text-foreground",
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
            description: `Archivo: ${node.data.mediaType || "image"}`,
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
        case "form":
          node.data.fields.forEach((field, index) => {
            summary.savedVariables.push({
              id: `${node.id}-${field.id}`,
              title: field.variable,
              description: `${index + 1}. ${field.label}`,
            });
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

// Logical flow order helper: BFS from start + type priority so that
// "chat/message" content, delays and especially "end" terminals are ordered naturally
// (end nodes should appear last in human reading of flow, delays inline after actions).
function getLogicalNodeOrder(
  allNodes: AutomationCanvasNode[],
  allEdges: AutomationCanvasEdge[],
): string[] {
  const planningNoteIds = new Set(
    allNodes.filter((node) => node.type === "sticky_note").map((node) => node.id),
  );
  const executableNodes = allNodes.filter((node) => node.type !== "sticky_note");
  if (executableNodes.length === 0) {
    return [];
  }
  const start = executableNodes.find((n) => n.type === "start");
  const adj = new Map<string, string[]>();
  executableNodes.forEach((n) => adj.set(n.id, []));
  allEdges.forEach((e) => {
    if (adj.has(e.source) && !planningNoteIds.has(e.source) && !planningNoteIds.has(e.target)) adj.get(e.source)!.push(e.target);
  });

  const order: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = start ? [start.id] : [executableNodes[0].id];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    order.push(cur);
    const nexts = [...(adj.get(cur) ?? [])];
    // sort children to put content nodes before delay/end when multiple
    nexts.sort((aId, bId) => {
      const a = executableNodes.find((nn) => nn.id === aId);
      const b = executableNodes.find((nn) => nn.id === bId);
      const rank = (n: any) => (n?.type === "end" ? 100 : n?.type === "delay" ? 50 : n?.type === "start" ? -10 : 0);
      return rank(a) - rank(b) || (a?.position?.y ?? 0) - (b?.position?.y ?? 0);
    });
    nexts.forEach((nxt) => {
      if (!visited.has(nxt)) queue.push(nxt);
    });
  }
  // append any orphans, but put ends at the very end
  const remaining = executableNodes
    .filter((n) => !visited.has(n.id))
    .sort((a, b) => {
      const ra = a.type === "end" ? 1 : 0;
      const rb = b.type === "end" ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return (a.position?.y ?? 0) - (b.position?.y ?? 0);
    });
  remaining.forEach((n) => order.push(n.id));

  // final pass: ensure all end nodes are moved to tail while preserving relative for branches
  const ends = order.filter((id) => executableNodes.find((n) => n.id === id)?.type === "end");
  const nonEnds = order.filter((id) => !ends.includes(id));
  return [...nonEnds, ...ends];
}

function isVirtualFlowElementId(id: unknown) {
  const value = String(id || "");
  return value.startsWith("virtual-incoming-") || value.startsWith("virtual-outgoing-");
}

function getAutomationNodePrimaryText(node: AutomationCanvasNode | AutomationFlowNode | undefined) {
  if (!node) return undefined;
  const data = (node.data ?? {}) as Record<string, unknown>;

  const stringFields = [
    data.label,
    data.bodyText,
    data.caption,
    data.title,
    data.buttonText,
    data.mediaUrl,
    data.variable,
    data.action,
  ];
  const directValue = stringFields.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (directValue) return directValue.trim();

  if (Array.isArray(data.options) && data.options.length > 0) {
    return data.options.filter((option) => typeof option === "string").slice(0, 4).join(" / ");
  }

  if (Array.isArray(data.buttons) && data.buttons.length > 0) {
    return data.buttons
      .map((button) => (button && typeof button === "object" ? String((button as { text?: unknown }).text ?? "") : ""))
      .filter(Boolean)
      .slice(0, 3)
      .join(" / ");
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    return data.items
      .map((item) => (item && typeof item === "object" ? String((item as { title?: unknown }).title ?? "") : ""))
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ");
  }

  if (Array.isArray(data.conditions) && data.conditions.length > 0) {
    return data.conditions
      .map((condition) => {
        if (!condition || typeof condition !== "object") return "";
        const item = condition as { label?: unknown; type?: unknown; operator?: unknown; value?: unknown };
        return String(item.label ?? [item.type, item.operator, item.value].filter(Boolean).join(" "));
      })
      .filter(Boolean)
      .slice(0, 3)
      .join(" / ");
  }

  if (Array.isArray(data.menuOptions) && data.menuOptions.length > 0) {
    return data.menuOptions
      .map((option) => (option && typeof option === "object" ? String((option as { text?: unknown }).text ?? "") : ""))
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ");
  }

  return undefined;
}

function getAutomationNodeDisplaySummary(node: AutomationCanvasNode | AutomationFlowNode | undefined) {
  if (!node) {
    return {
      label: "Nodo destino",
      preview: undefined,
      typeLabel: undefined,
      referenceName: undefined,
    };
  }

  const data = (node.data ?? {}) as Record<string, unknown>;
  const referenceName =
    typeof data.referenceName === "string" && data.referenceName.trim().length > 0
      ? data.referenceName.trim()
      : undefined;
  const primaryText = getAutomationNodePrimaryText(node);

  return {
    label: referenceName || primaryText || node.type,
    preview: referenceName && primaryText && primaryText !== referenceName ? primaryText : undefined,
    typeLabel: node.type,
    referenceName,
  };
}

function getFirstExecutableNode(nodes: AutomationCanvasNode[] | AutomationFlowNode[] | unknown) {
  if (!Array.isArray(nodes)) return undefined;
  return [...nodes]
    .filter((node): node is AutomationCanvasNode | AutomationFlowNode => {
      if (!node || typeof node !== "object") return false;
      const candidate = node as AutomationCanvasNode | AutomationFlowNode;
      return Boolean(candidate.id) && candidate.type !== "start" && candidate.type !== "sticky_note";
    })
    .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0) || (a.position?.y ?? 0) - (b.position?.y ?? 0))[0];
}

function getOrphanNodeIds(
  allNodes: AutomationCanvasNode[],
  allEdges: AutomationCanvasEdge[],
): string[] {
  const realNodes = allNodes.filter(
    (node) => !isVirtualFlowElementId(node.id) && node.type !== "sticky_note",
  );
  const realNodeIds = new Set(realNodes.map((node) => node.id));
  const startNode = realNodes.find((node) => node.type === "start");
  if (!startNode) {
    return realNodes.map((node) => node.id);
  }

  const outgoing = new Map<string, string[]>();
  for (const node of realNodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of allEdges) {
    if (
      isVirtualFlowElementId(edge.source) ||
      isVirtualFlowElementId(edge.target) ||
      !realNodeIds.has(edge.source) ||
      !realNodeIds.has(edge.target)
    ) {
      continue;
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const reachable = new Set<string>();
  const queue = [startNode.id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    for (const target of outgoing.get(current) ?? []) {
      if (!reachable.has(target)) queue.push(target);
    }
  }

  return realNodes
    .filter((node) => node.type !== "start" && !reachable.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((node) => node.id);
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
  const layoutNodes = nodes.filter((node) => node.type !== "sticky_note");
  const nodeById = new Map(layoutNodes.map((node) => [node.id, node] as const));
  const connectorTypes = new Set<AutomationCanvasNode["type"]>(["end"]);
  // Delays and end should be treated as "inline" / terminal for better human visual order.
  // Messages ("chat") stay as structural content. Prioritize end/delay placement last in flow.
  const isConnectorNode = (nodeId: string) => {
    const t = nodeById.get(nodeId)?.type ?? "start";
    return connectorTypes.has(t) || t === "delay";
  };
  const incomingAll = new Map<string, string[]>();
  const outgoingAll = new Map<string, string[]>();
  const incomingDAG = new Map<string, string[]>();
  const outgoingDAG = new Map<string, string[]>();
  const arrangedPositions = new Map<string, { x: number; y: number }>();
  const cycleEdges = new Set<string>();

  const getEstimatedNodeHeight = (node: AutomationCanvasNode) => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
    const hasTargetPreview = Boolean(
      (typeof data.targetNodePreview === "string" && data.targetNodePreview.trim()) ||
      (typeof data.targetNodeLabel === "string" && data.targetNodeLabel.trim()) ||
      (typeof data.targetAutomationName === "string" && data.targetAutomationName.trim()),
    );

    switch (node.type) {
      case "start":
        return 130;
      case "message":
        return 150;
      case "media":
        return 170;
      case "delay":
      case "end":
        return 118;
      case "collect":
        return 175;
      case "form":
        return 155 + count(data.fields) * 104;
      case "options":
        return 170 + count(data.options) * 26;
      case "button_message":
        return 180 + count(data.buttons) * 28;
      case "list_message":
        return 190 + count(data.items) * 26;
      case "menu_simple":
        return 185 + count(data.menuOptions) * 28;
      case "condition":
        return 185 + count(data.conditions) * 30;
      case "call_to_action":
        return 190;
      case "save_contact":
        return 180;
      case "ai_control":
        return 160;
      case "go_to_node":
        return data.mode === "other_flow"
          ? hasTargetPreview ? 232 : 216
          : data.mode === "specific_node"
            ? hasTargetPreview ? 176 : 164
            : 165;
      default:
        return DEFAULT_NODE_HEIGHT;
    }
  };

  const getNodeHeight = (node: AutomationCanvasNode) => {
    const measuredHeight =
      (node as AutomationCanvasNode & { measured?: { height?: number } }).measured?.height ??
      node.height ??
      0;
    return Math.max(measuredHeight, getEstimatedNodeHeight(node), DEFAULT_NODE_HEIGHT);
  };

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

    if (node.type === "menu_simple") {
      const menuData = node.data as { menuOptions?: Array<{ id: string }> };
      if (handle === "fallback") {
        return (menuData.menuOptions?.length ?? 0) + 1;
      }
      const optionId = handle.replace(/^menu-/, "");
      const index = (menuData.menuOptions ?? []).findIndex((option) => option.id === optionId);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }

    return 0;
  };

  for (const node of layoutNodes) {
    incomingAll.set(node.id, []);
    outgoingAll.set(node.id, []);
    incomingDAG.set(node.id, []);
    outgoingDAG.set(node.id, []);
  }

  const allEdgesSorted = [...edges]
    .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
    .sort((a, b) => {
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

  for (const node of layoutNodes) {
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
    layoutNodes.find((node) => node.type === "start") ??
    [...layoutNodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0] ??
    null;
  const roots = startNode
    ? [startNode.id, ...layoutNodes.filter((n) => n.id !== startNode.id && (incomingDAG.get(n.id)?.length ?? 0) === 0).map((n) => n.id)]
    : layoutNodes.filter((n) => (incomingDAG.get(n.id)?.length ?? 0) === 0).map((n) => n.id);

  const computeLevels = () => {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const levelByNode = new Map<string, number>();
    for (const node of layoutNodes) {
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
    for (const node of layoutNodes) {
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
    for (const node of layoutNodes) {
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

    for (const node of layoutNodes) {
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
    const ordered = [...layoutNodes].sort((a, b) => {
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
    for (const node of layoutNodes) {
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

    for (const node of layoutNodes) {
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
    const structuralNodes = layoutNodes.filter((node) => !isConnectorNode(node.id));
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

  if (mode === "mind_map" || mode === "compact_mind_map") {
    const isCompactMindMap = mode === "compact_mind_map";
    // Los GoTo son hojas terminales altas. No deben inflar la altura de todas
    // las filas al abrir el editor; su propia columna se corrige más abajo con
    // la altura real para que nunca se superpongan.
    const heightReferenceNodes = isCompactMindMap
      ? layoutNodes.filter((node) => node.type !== "go_to_node")
      : layoutNodes;
    const maxNodeHeight = Math.max(
      DEFAULT_NODE_HEIGHT,
      ...heightReferenceNodes.map((node) => getNodeHeight(node)),
    );
    const colWidth = isCompactMindMap
      ? DEFAULT_NODE_WIDTH + COMPACT_MIND_MAP_HORIZONTAL_GAP
      : HORIZONTAL_SPACING * 1.15;
    const rowGap = isCompactMindMap ? COMPACT_MIND_MAP_VERTICAL_GAP : VERTICAL_SPACING;
    // In compact mode, one unusually tall menu must not enlarge every row in
    // the graph. Same-column overlap is corrected below using each node's real
    // height, so the base grid can remain genuinely compact.
    const rowUnit =
      (isCompactMindMap ? DEFAULT_NODE_HEIGHT : maxNodeHeight) + rowGap;

    const subtreeLeaves = new Map<string, number>();
    const countVisited = new Set<string>();

    const countLeaves = (nodeId: string): number => {
      if (countVisited.has(nodeId)) return 1;
      countVisited.add(nodeId);
      const children = outgoingDAG.get(nodeId) ?? [];
      if (children.length === 0) {
        subtreeLeaves.set(nodeId, 1);
        return 1;
      }
      const total = children.reduce((acc, c) => acc + countLeaves(c), 0);
      subtreeLeaves.set(nodeId, total);
      return total;
    };

    for (const rootId of roots) countLeaves(rootId);
    for (const node of layoutNodes) {
      if (!subtreeLeaves.has(node.id)) countLeaves(node.id);
    }

    const placed = new Set<string>();

    const assignPos = (nodeId: string, col: number, rowStart: number) => {
      if (placed.has(nodeId)) return;
      placed.add(nodeId);

      const leaves = subtreeLeaves.get(nodeId) ?? 1;
      const centerRow = rowStart + (leaves - 1) / 2;

      arrangedPositions.set(nodeId, {
        x: col * colWidth,
        y: centerRow * rowUnit,
      });

      const children = outgoingDAG.get(nodeId) ?? [];
      let childRowStart = rowStart;
      for (const childId of children) {
        assignPos(childId, col + 1, childRowStart);
        childRowStart += subtreeLeaves.get(childId) ?? 1;
      }
    };

    let globalRowStart = 0;
    for (const rootId of roots) {
      assignPos(rootId, 0, globalRowStart);
      globalRowStart += subtreeLeaves.get(rootId) ?? 1;
    }

    for (const node of layoutNodes) {
      if (!arrangedPositions.has(node.id)) {
        arrangedPositions.set(node.id, { x: 0, y: globalRowStart * rowUnit });
        globalRowStart += 1;
      }
    }

    return enforceUniformVerticalSpacing(arrangedPositions, rowGap);
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
  for (const node of layoutNodes) {
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
    for (const node of layoutNodes) {
      const col = levelByNode.get(node.id) ?? 0;
      const row = rowByNode.get(node.id) ?? 0;
      arrangedPositions.set(node.id, {
        x: col * (ORTHOGONAL_GRID_SIZE * 5),
        y: row * (ORTHOGONAL_GRID_SIZE * 3),
      });
    }
    return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
  }

  if (mode === "orthogonal_connectors") {
    const occupied = new Set<string>();
    const rowByNode = new Map<string, number>();
    const columnGap = HORIZONTAL_SPACING * 1.45;
    const rowGap = DEFAULT_NODE_HEIGHT + VERTICAL_SPACING * 1.25;

    for (const level of sortedLevels) {
      const ids = [...(nodesByLevel.get(level) ?? [])].sort(
        (aId, bId) => (orderIndex.get(aId) ?? 0) - (orderIndex.get(bId) ?? 0),
      );
      ids.sort((aId, bId) => {
        const aEnd = nodeById.get(aId)?.type === "end" ? 1 : 0;
        const bEnd = nodeById.get(bId)?.type === "end" ? 1 : 0;
        if (aEnd !== bEnd) return aEnd - bEnd;
        return 0;
      });

      ids.forEach((id, index) => {
        const parentRows = (incomingDAG.get(id) ?? [])
          .map((parentId) => rowByNode.get(parentId))
          .filter((row): row is number => typeof row === "number");
        const preferred =
          parentRows.length > 0
            ? Math.round(parentRows.reduce((sum, row) => sum + row, 0) / parentRows.length)
            : index;

        let row = preferred;
        let radius = 0;
        while (occupied.has(`${level}:${row}`)) {
          radius += 1;
          const above = preferred - radius;
          const below = preferred + radius;
          row = !occupied.has(`${level}:${above}`) ? above : below;
        }

        occupied.add(`${level}:${row}`);
        rowByNode.set(id, row);
      });
    }

    for (const node of layoutNodes) {
      const level = levelByNode.get(node.id) ?? 0;
      const row = rowByNode.get(node.id) ?? 0;
      arrangedPositions.set(node.id, {
        x: level * columnGap,
        y: row * rowGap,
      });
    }

    placeConnectorNodes(arrangedPositions, {
      shortSegment: Math.max(120, columnGap * 0.22),
      alignToParent: true,
    });
    return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
  }

  const horizontalGap = HORIZONTAL_SPACING;
  const verticalGap = VERTICAL_SPACING;
  for (const level of sortedLevels) {
    const ids = [...(nodesByLevel.get(level) ?? [])].sort(
      (aId, bId) => (orderIndex.get(aId) ?? 0) - (orderIndex.get(bId) ?? 0),
    );
    // Secondary sort: within level, put end nodes last (human intuition: terminals at bottom of column)
    ids.sort((aId, bId) => {
      const aEnd = nodeById.get(aId)?.type === "end" ? 1 : 0;
      const bEnd = nodeById.get(bId)?.type === "end" ? 1 : 0;
      if (aEnd !== bEnd) return aEnd - bEnd;
      return 0;
    });
    let cursorY = 0;
    for (const id of ids) {
      const node = nodeById.get(id);
      if (!node) continue;
      arrangedPositions.set(id, { x: level * horizontalGap, y: cursorY });
      cursorY += getNodeHeight(node) + verticalGap;
    }
  }
  // Final global correction: move all end nodes visually to the "end" of their predecessors in flow.
  // Ensures "end" never appears before a message/delay in a branch visually.
  const endNodes = layoutNodes.filter((n) => n.type === "end");
  endNodes.forEach((endNode) => {
    const incoming = incomingAll.get(endNode.id) ?? [];
    if (incoming.length > 0) {
      const predId = incoming[0];
      const predPos = arrangedPositions.get(predId) ?? { x: endNode.position.x, y: endNode.position.y };
      // place slightly to the right and below last content, not mixed in middle
      arrangedPositions.set(endNode.id, {
        x: predPos.x + 60,
        y: predPos.y + 90,
      });
    }
  });
  return enforceUniformVerticalSpacing(arrangedPositions, UNIFORM_VERTICAL_NODE_GAP);
}

function FlowBuilderContent({
  automationId,
  automationName,
  automationNote,
  initialNodes,
  initialEdges,
  initialActive,
  initialUpdatedAt,
  isAIFlowGeneratorEnabled,
  availableAutomations,
  allAutomations,
  channel,
}: FlowBuilderProps) {
  const t = useTranslations("Automation");
  const locale = useLocale();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { identity } = useBranding();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [automationVersion, setAutomationVersion] = useState(initialUpdatedAt);
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
    useState<AutomationAIChannel>(channel);
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
  const [newSubAutomationName, setNewSubAutomationName] = useState("");
  const [isAutoArrangeEnabled, setIsAutoArrangeEnabled] = useState(false);
  const autoArrangeSignatureRef = useRef<string | null>(null);

  const [incomingLinkedFlows, setIncomingLinkedFlows] = useState<IncomingLinkedGoTo[]>([]);

  // New UI states for requested features: hideable panels, contextual connect, presentation mode
  const [showNodeSidebar, setShowNodeSidebar] = useState(false);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  // AI assistant / code-prompt view (toggles with visual flow)
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [presentationNodeOrder, setPresentationNodeOrder] = useState<string[]>([]);
  const [presentationIndex, setPresentationIndex] = useState(0);
  const [pendingConnection, setPendingConnection] = useState<{
    nodeId: string;
    handleId?: string | null;
    handleType: "source" | "target";
  } | null>(null);
  const [connectMenuPos, setConnectMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [connectSearch, setConnectSearch] = useState("");
  const connectMenuRef = useRef<HTMLDivElement>(null);
  const pendingConnectionRef = useRef<{
    nodeId: string;
    handleId?: string | null;
    handleType: "source" | "target";
  } | null>(null);
  const didConnectRef = useRef(false);

  // Context menu for node (right click) - useful for per-node quick actions
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Main view mode for the flow editor: visual canvas + 2 new massive human-friendly full-flow edit views
  // Similar to the "agentes" (AI) view, but for humans doing bulk edits.
  const [flowViewMode, setFlowViewMode] = useState<FlowBuilderViewMode>('visual');

  // For the text-script massive editor
  const [scriptText, setScriptText] = useState('');
  const scriptTextRef = useRef<HTMLTextAreaElement>(null);

  // Ref to apply default layout + clean sidebars only once on open
  const defaultLayoutAppliedRef = useRef(false);

  // When switching to massive edit views, hide distracting panels for focus
  useEffect(() => {
    if (flowViewMode !== 'visual') {
      setShowPropertiesPanel(false);
      setContextMenu(null);
    }
  }, [flowViewMode]);

  // Auto load the text editor when switching to text-script (if empty)
  useEffect(() => {
    if (flowViewMode === 'text-script' && !scriptText.trim() && nodes.length > 0) {
      // Trigger the load logic by simulating the button (we call the serialize)
      const order = getLogicalNodeOrder(nodes, edges);
      const lines: string[] = [];
      order.forEach((id, idx) => {
        const stepNum = idx + 1;
        const n = nodes.find(nn => nn.id === id)!;
        const d: any = n.data || {};
        let line = `${stepNum}. [${n.type}]`;
        if (n.type === 'delay') line += ` seconds=${d.seconds || 2}`;
        else {
          const main = d.label || d.bodyText || d.title || d.caption || '';
          if (main) line += ` "${main.replace(/"/g,'\'')}"`;
        }
        lines.push(line);

        // branches
        if (n.type === 'options' && d.options?.length) {
          d.options.forEach((opt: string, i:number) => {
            const te = edges.find(e => e.source===id && e.sourceHandle===`option-${i}`);
            const ts = te ? order.indexOf(te.target)+1 : '';
            lines.push(`  - "${opt}"${ts ? ` -> ${ts}` : ''}`);
          });
        }
        if (n.type === 'condition' && d.conditions?.length) {
          d.conditions.forEach((c:any, i:number) => {
            const te = edges.find(e => e.source===id && e.sourceHandle === c.id);
            const ts = te ? order.indexOf(te.target)+1 : '';
            lines.push(`  if "${c.type} ${c.operator} ${c.value||''}"${ts?` -> ${ts}`:''}`);
          });
          const fb = edges.find(e => e.source===id && e.sourceHandle==='fallback');
          if (fb) lines.push(`  else -> ${order.indexOf(fb.target)+1}`);
        }
        if (['message','collect'].includes(n.type)) {
          const out = edges.find(e => e.source === id);
          if (out) lines.push(`  -> ${order.indexOf(out.target)+1}`);
        }
      });
      setScriptText(lines.join('\n'));
    }
  }, [flowViewMode, nodes.length]);

  const { screenToFlowPosition, toObject, fitView, setCenter, zoomIn, zoomOut } = useReactFlow();

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 220 });
  }, [fitView]);

  const handleCenterStart = useCallback(() => {
    const start = nodes.find((n) => n.type === "start");
    if (start) setCenter(start.position.x, start.position.y, { zoom: 1, duration: 280 });
  }, [nodes, setCenter]);

  const handleFocusSelected = useCallback(() => {
    const sid = selectedNodeIds[0];
    if (!sid) return;
    const n = nodes.find((nd) => nd.id === sid);
    if (n) setCenter(n.position.x, n.position.y, { zoom: 1.2, duration: 220 });
  }, [selectedNodeIds, nodes, setCenter]);

  // Apply a compact default ordering on editor open and land on Start.
  // Only once per mount; after that, user manual edits are respected.
  useEffect(() => {
    if (defaultLayoutAppliedRef.current) return;
    if (nodes.length < 2) {
      defaultLayoutAppliedRef.current = true;
      setShowNodeSidebar(false);
      setShowPropertiesPanel(false);
      const start = nodes.find((node) => node.type === "start") ?? nodes[0];
      const focusTimer = window.setTimeout(() => {
        if (!start) {
          fitView({ padding: 0.16, duration: 220 });
          return;
        }
        setCenter(
          start.position.x + DEFAULT_NODE_WIDTH / 2,
          start.position.y + DEFAULT_NODE_HEIGHT / 2,
          { zoom: INITIAL_EDITOR_ZOOM, duration: 320 },
        );
      }, 100);
      return () => window.clearTimeout(focusTimer);
    }

    defaultLayoutAppliedRef.current = true;
    setShowNodeSidebar(false);
    setShowPropertiesPanel(false);

    const arranged = getArrangementPositions({ nodes, edges, mode: "compact_mind_map" });
    const start = nodes.find((node) => node.type === "start") ?? nodes[0];
    const startPosition = start
      ? arranged.get(start.id) ?? start.position
      : null;
    setNodes((curr) =>
      curr.map((node) => {
        const nextPosition = arranged.get(node.id);
        return nextPosition ? { ...node, position: nextPosition } : node;
      }),
    );

    const focusTimer = window.setTimeout(() => {
      if (!startPosition) {
        fitView({ padding: 0.08, duration: 320 });
        return;
      }
      setCenter(
        startPosition.x + DEFAULT_NODE_WIDTH / 2,
        startPosition.y + DEFAULT_NODE_HEIGHT / 2,
        { zoom: INITIAL_EDITOR_ZOOM, duration: 360 },
      );
    }, 100);
    return () => window.clearTimeout(focusTimer);
  }, [nodes.length]); // trigger once nodes are populated from initial

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

  // No quick bar sync anymore (floating removed per request)

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
  // Always-fresh mirror of hasUnsavedChanges so deferred navigation callbacks
  // (which may run after an in-panel edit flips the flag) read the latest value.
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Persist the flow to the database directly (no preview dialog). Used when the
  // user triggers a "go to node / automation" action and we need both the node
  // and the whole flow saved before navigating away. Returns whether it saved.
  const saveFlowDirect = useCallback(async (): Promise<boolean> => {
    const flow = toObject();
    const isVirtualFlowId = (id: unknown) => {
      const value = String(id || "");
      return value.startsWith("virtual-incoming-") || value.startsWith("virtual-outgoing-");
    };
    const realNodes = (flow.nodes as any[]).filter((node: any) => !isVirtualFlowId(node.id));
    const realEdges = (flow.edges as any[]).filter(
      (edge: any) => !isVirtualFlowId(edge.source) && !isVirtualFlowId(edge.target),
    );
    const preparedFlow = prepareAutomationFlowForSave({
      nodes: realNodes as AutomationFlowNode[],
      edges: realEdges as AutomationFlowEdge[],
    });

    setSavePreviewWarnings(preparedFlow.warnings.map((warning) => warning.message));

    if (!preparedFlow.success) {
      // Fall back to the detailed preview so the user can fix the errors.
      setSavePreviewErrors(preparedFlow.errors);
      setSavePreviewFlow(null);
      setIsSavePreviewOpen(true);
      toast.error(t("save_preview.validation_failed_title"));
      return false;
    }

    try {
      const saved = await saveAutomation(
        automationId,
        preparedFlow.nodes,
        preparedFlow.edges,
        automationVersion,
      );
      setAutomationVersion(saved.updatedAt);
      setNodes(preparedFlow.nodes as AutomationCanvasNode[]);
      setEdges(preparedFlow.edges as AutomationCanvasEdge[]);
      if (automationRequiresManualReview(preparedFlow.nodes)) {
        setIsActive(false);
      }
      setSavePreviewErrors([]);
      setHasUnsavedChanges(false);
      toast.success(t("toast_saved"));
      return true;
    } catch (error) {
      const isVersionConflict =
        error instanceof Error && error.message.includes("AUTOMATION_VERSION_CONFLICT");
      if (isVersionConflict) {
        toast.error(t("ai_generator.save_conflict_reload"));
        window.location.reload();
      } else {
        toast.error(t("ai_generator.save_failed"));
      }
      return false;
    }
  }, [automationId, automationVersion, setEdges, setNodes, t, toObject]);

  const focusNodeById = useCallback(
    async (targetNodeId?: string | null) => {
      if (!targetNodeId) return;
      // Save the element + flow first if there are pending changes.
      if (hasUnsavedChangesRef.current) {
        const saved = await saveFlowDirect();
        if (!saved) return;
      }
      const targetNode = nodes.find((node) => node.id === targetNodeId);
      if (!targetNode) {
        toast.warning("Nodo destino no encontrado");
        return;
      }
      setSelectedNodeIds([targetNode.id]);
      setContextMenu(null);
      setShowPropertiesPanel(true);
      if (isPresentationMode) {
        const presentationTargetIndex = presentationNodeOrder.indexOf(targetNode.id);
        if (presentationTargetIndex >= 0) {
          setPresentationIndex(presentationTargetIndex);
        }
      }
      const nodeWidth = targetNode.measured?.width ?? targetNode.width ?? 300;
      const nodeHeight = targetNode.measured?.height ?? targetNode.height ?? 150;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setCenter(
            targetNode.position.x + nodeWidth / 2,
            targetNode.position.y + nodeHeight / 2,
            {
              zoom: targetNode.type === "menu_simple" ? 1.02 : 1.12,
              duration: isPresentationMode ? 520 : 280,
            },
          );
        }),
      );
    },
    [
      isPresentationMode,
      nodes,
      presentationNodeOrder,
      saveFlowDirect,
      setCenter,
      setShowPropertiesPanel,
    ],
  );
  const orphanNodeIds = useMemo(() => getOrphanNodeIds(nodes, edges), [edges, nodes]);
  const selectedOrphanNodeIds = useMemo(
    () => selectedNodeIds.filter((nodeId) => orphanNodeIds.includes(nodeId)),
    [orphanNodeIds, selectedNodeIds],
  );
  const handleOrganizeOrphans = useCallback(() => {
    if (orphanNodeIds.length === 0) return;

    const orphanSet = new Set(orphanNodeIds);
    const anchoredNodes = nodes.filter((node) => !orphanSet.has(node.id) && !isVirtualFlowElementId(node.id));
    const anchorMaxX = anchoredNodes.length > 0
      ? Math.max(...anchoredNodes.map((node) => node.position.x))
      : 0;
    const anchorMinY = nodes.length > 0
      ? Math.min(...nodes.map((node) => node.position.y))
      : 0;
    const orderedOrphans = orphanNodeIds
      .map((nodeId) => nodes.find((node) => node.id === nodeId))
      .filter((node): node is AutomationCanvasNode => Boolean(node));

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const orphanIndex = orderedOrphans.findIndex((orphan) => orphan.id === node.id);
        if (orphanIndex === -1) return node;
        return {
          ...node,
          position: {
            x: anchorMaxX + 460,
            y: anchorMinY + orphanIndex * (DEFAULT_NODE_HEIGHT + UNIFORM_VERTICAL_NODE_GAP),
          },
        };
      }),
    );
    setHasUnsavedChanges(true);
    toast.success(t("orphans.organized_toast", { count: orphanNodeIds.length }));
  }, [nodes, orphanNodeIds, setNodes, t]);

  const handleDeleteSelectedOrphans = useCallback(() => {
    if (selectedOrphanNodeIds.length === 0) return;
    const selectedSet = new Set(selectedOrphanNodeIds);
    setNodes((currentNodes) => currentNodes.filter((node) => !selectedSet.has(node.id)));
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => !selectedSet.has(edge.source) && !selectedSet.has(edge.target)),
    );
    setSelectedNodeIds([]);
    setHasUnsavedChanges(true);
    toast.success(t("orphans.deleted_toast", { count: selectedOrphanNodeIds.length }));
  }, [selectedOrphanNodeIds, setEdges, setNodes, t]);
  const handleNavigateToAutomation = useCallback(
    async (targetAutomationId: number) => {
      // Save the element + flow before leaving so nothing is lost.
      if (hasUnsavedChangesRef.current) {
        const saved = await saveFlowDirect();
        if (!saved) return;
      }
      router.push(`/automation/${targetAutomationId}`);
    },
    [router, saveFlowDirect],
  );

  // Compute actual incoming linked flows: other automations that have a go_to_node pointing to THIS automation
  useEffect(() => {
    if (!automationId || availableAutomations.length === 0) {
      setIncomingLinkedFlows([]);
      return;
    }

    const others = availableAutomations.filter(a => a.id !== automationId);
    if (others.length === 0) {
      setIncomingLinkedFlows([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const linked: IncomingLinkedGoTo[] = [];

      await Promise.all(others.map(async (a) => {
        try {
          const res = await fetch(`/api/automation/${a.id}/nodes`);
          if (!res.ok) return;
          const data = await res.json();
          const theirNodes: any[] = data?.nodes || [];
          theirNodes.forEach((n: any) => {
            const targetsCurrentAutomation =
              n.type === 'go_to_node' &&
              (n.data?.targetAutomationId === automationId ||
                String(n.data?.targetAutomationId) === String(automationId));

            if (!targetsCurrentAutomation) return;

            linked.push({
              sourceAutomationId: a.id,
              sourceAutomationName: a.name,
              sourceNodeId: String(n.id || `go-to-${linked.length}`),
              sourceReferenceName:
                typeof n.data?.referenceName === "string" && n.data.referenceName.trim()
                  ? n.data.referenceName.trim()
                  : undefined,
            });
          });
        } catch (e) {
          // ignore fetch errors for individual automations
        }
      }));

      if (!cancelled) {
        setIncomingLinkedFlows(
          linked.sort((a, b) =>
            a.sourceAutomationName.localeCompare(b.sourceAutomationName) ||
            a.sourceNodeId.localeCompare(b.sourceNodeId),
          ),
        );
      }
    })();

    return () => { cancelled = true; };
  }, [automationId, availableAutomations]);

  // Virtual incoming link nodes (from other automations that GoTo / call this flow).
  // Rendered as real nodes to the left of the start node, connected automatically.
  // Only in visual view. Not persisted. Click to open the calling flow in same tab.
  const startNode = useMemo(() => nodes.find((n) => n.type === "start"), [nodes]);
  const virtualIncomingNodes = useMemo(() => {
    if (flowViewMode !== "visual" || !startNode || incomingLinkedFlows.length === 0) return [];
    return incomingLinkedFlows.map((flow, i) => ({
      id: `virtual-incoming-${flow.sourceAutomationId}-${flow.sourceNodeId}`,
      type: "go_to_node",
      position: {
        x: (startNode.position?.x || 0) - HORIZONTAL_SPACING,
        y: (startNode.position?.y || 0) + (i - (incomingLinkedFlows.length - 1) / 2) * VIRTUAL_FLOW_NODE_VERTICAL_GAP,
      },
      data: {
        label: flow.sourceAutomationName,
        mode: "other_flow",
        targetAutomationId: flow.sourceAutomationId,
        isVirtualIncoming: true,
        sourceAutomationName: flow.sourceAutomationName,
        onNavigateToAutomation: () =>
          handleNavigateToAutomation(flow.sourceAutomationId),
      },
      // mark to exclude from interactions/saves
    }));
  }, [flowViewMode, handleNavigateToAutomation, incomingLinkedFlows, startNode]);

  const virtualIncomingEdges = useMemo(() => {
    if (!startNode) return [];
    return virtualIncomingNodes.map((vn) => ({
      id: `v-in-${vn.id}`,
      source: vn.id,
      target: startNode.id,
      sourceHandle: "incoming-source",
      targetHandle: "incoming-delegation",
      type: "smoothstep",
      style: {
        stroke: "var(--color-indigo-500)",
        strokeWidth: 2.5,
      },
    }));
  }, [virtualIncomingNodes, startNode]);

  const virtualOutgoingNodes = useMemo(() => {
    if (flowViewMode !== "visual") return [];
    return nodes
      .filter((node) => node.type === "go_to_node" && node.data?.mode === "other_flow" && node.data?.targetAutomationId)
      .map((node) => {
        const targetAutomationId = Number(node.data?.targetAutomationId);
        const targetAutomation = allAutomations.find((automation) => automation.id === targetAutomationId);
        const targetAutomationName =
          targetAutomation?.name ||
          availableAutomations.find((automation) => automation.id === targetAutomationId)?.name ||
          `Automatización ${node.data?.targetAutomationId}`;
        const targetNodes = Array.isArray(targetAutomation?.nodes)
          ? (targetAutomation.nodes as AutomationCanvasNode[])
          : [];
        const configuredTargetNode =
          node.data?.targetNodeId
            ? targetNodes.find((item) => item.id === node.data?.targetNodeId)
            : undefined;
        const targetSummary = node.data?.targetNodeId
          ? getAutomationNodeDisplaySummary(configuredTargetNode)
          : {
              label: t("go_to_flow_start"),
              preview: undefined,
              typeLabel: "start",
              referenceName: undefined,
            };

        return {
          id: `virtual-outgoing-${node.id}`,
          type: "go_to_node",
          position: {
            x: (node.position?.x || 0) + HORIZONTAL_SPACING,
            y: node.position?.y || 0,
          },
          data: {
            label: targetAutomationName,
            mode: "other_flow",
            targetAutomationId,
            isVirtualOutgoing: true,
            targetAutomationName,
            targetNodeLabel: targetSummary.label,
            targetNodePreview: targetSummary.preview,
            targetNodeTypeLabel: targetSummary.typeLabel,
            targetNodeReferenceName: targetSummary.referenceName,
            resolvedTargetNodeId: node.data.targetNodeId || undefined,
            onNavigateToAutomation: () =>
              handleNavigateToAutomation(targetAutomationId),
          },
        };
      });
  }, [
    allAutomations,
    availableAutomations,
    flowViewMode,
    handleNavigateToAutomation,
    nodes,
    t,
  ]);

  const virtualOutgoingEdges = useMemo(
    () =>
      virtualOutgoingNodes.map((vn) => ({
        id: `v-out-${vn.id}`,
        source: vn.id.replace("virtual-outgoing-", ""),
        target: vn.id,
        targetHandle: "outgoing-target",
        type: "smoothstep",
        style: {
          stroke: "var(--color-indigo-500)",
          strokeWidth: 2.5,
        },
      })),
    [virtualOutgoingNodes],
  );

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
  const backEdgeKeys = useMemo(() => detectBackEdges(nodes, edges), [edges, nodes]);
  const displayEdges = useMemo(
    () =>
      edges.map((edge): AutomationCanvasEdge => {
        const edgeKey = getEdgeKey(edge);
        const isProblematic = infiniteLoopDiagnostics.problematicEdgeKeys.has(edgeKey);
        const applyBackEdgeStyle =
          backEdgeKeys.has(edgeKey) &&
          !isProblematic &&
          getEdgeStyleVariant(edge) === "default";

        if (applyBackEdgeStyle) {
          return {
            ...edge,
            type: "smoothstep",
            zIndex: 0,
            style: {
              ...(edge.style ?? {}),
              stroke: "var(--color-amber-500)",
              strokeWidth: 2,
              strokeDasharray: "2 6",
              strokeLinecap: "round",
              opacity: 0.85,
            },
            animated: true,
          };
        }

        return {
          ...edge,
          style: {
            ...(edge.style ?? {}),
            ...getEdgeVisualStyle(edge, { problematic: isProblematic }),
          },
          animated: isProblematic ? true : edge.animated,
        };
      }),
    [backEdgeKeys, edges, infiniteLoopDiagnostics.problematicEdgeKeys, isDarkMode],
  );

  const presentationFocusNodeId = isPresentationMode
    ? presentationNodeOrder[presentationIndex] ?? selectedNodeId
    : null;

  const updateDelayFromNode = useCallback(
    (nodeId: string, seconds: number) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, seconds },
              }
            : node,
        ),
      );
      setHasUnsavedChanges(true);
    },
    [setNodes],
  );

  // Presentation keeps the real graph editable, but lowers unrelated nodes so
  // the current step and each branch can be read without losing context.
  const viewNodes = useMemo(() => {
    const menuConnectionTargets = new Map<string, string>();
    for (const edge of edges) {
      if (!edge.sourceHandle) continue;
      menuConnectionTargets.set(`${edge.source}:${edge.sourceHandle}`, edge.target);
    }

    const enrichedNodes = nodes.map((node) => {
      if (node.type === "delay") {
        return {
          ...node,
          data: {
            ...node.data,
            onChangeSeconds: (seconds: number) =>
              updateDelayFromNode(node.id, seconds),
          },
        };
      }

      if (node.type === "menu_simple") {
        const connectedSourceHandles = edges
          .filter((edge) => edge.source === node.id && Boolean(edge.sourceHandle))
          .map((edge) => String(edge.sourceHandle));

        return {
          ...node,
          data: {
            ...node.data,
            connectedSourceHandles,
            onNavigateToConnectedNode: (sourceHandle: string) => {
              const targetNodeId = menuConnectionTargets.get(`${node.id}:${sourceHandle}`);
              if (targetNodeId) void focusNodeById(targetNodeId);
            },
          },
        };
      }

      if (node.type !== "go_to_node") {
        return node;
      }

      if (node.data?.mode === "specific_node" && node.data?.targetNodeId) {
        const targetNode = nodes.find((item) => item.id === node.data?.targetNodeId);
        const targetSummary = getAutomationNodeDisplaySummary(targetNode);
        return {
          ...node,
          data: {
            ...node.data,
            targetNodeLabel: targetSummary.label || node.data.targetNodeId,
            targetNodePreview: targetSummary.preview,
            targetNodeTypeLabel: targetSummary.typeLabel,
            targetNodeReferenceName: targetSummary.referenceName,
            onNavigateToTargetNode: () => focusNodeById(String(node.data?.targetNodeId)),
          },
        };
      }

      // Cross-automation jumps get their own navigation callback so the node
      // can render a distinct (violet) "go to automation" action.
      if (node.data?.mode === "other_flow" && node.data?.targetAutomationId) {
        const targetAutomationId = Number(node.data?.targetAutomationId);
        const targetAutomation = allAutomations.find(
          (automation) => automation.id === targetAutomationId,
        );
        const targetAutomationName = targetAutomation?.name ?? availableAutomations.find(
          (automation) => automation.id === targetAutomationId,
        )?.name;
        const targetNodes = Array.isArray(targetAutomation?.nodes)
          ? (targetAutomation.nodes as AutomationCanvasNode[])
          : [];
        const configuredTargetNode =
          node.data?.targetNodeId
            ? targetNodes.find((item) => item.id === node.data?.targetNodeId)
            : undefined;
        const targetSummary = node.data?.targetNodeId
          ? getAutomationNodeDisplaySummary(configuredTargetNode)
          : {
              label: t("go_to_flow_start"),
              preview: undefined,
              typeLabel: "start",
              referenceName: undefined,
            };

        return {
          ...node,
          data: {
            ...node.data,
            targetAutomationName,
            targetNodeLabel: targetSummary.label,
            targetNodePreview: targetSummary.preview,
            targetNodeTypeLabel: targetSummary.typeLabel,
            targetNodeReferenceName: targetSummary.referenceName,
            resolvedTargetNodeId: node.data.targetNodeId || undefined,
            onNavigateToAutomation: Number.isFinite(targetAutomationId)
              ? () => handleNavigateToAutomation(targetAutomationId)
              : undefined,
          },
        };
      }

      return node;
    });

    const combined = [
      ...enrichedNodes,
      ...virtualIncomingNodes,
      ...virtualOutgoingNodes,
    ] as AutomationCanvasNode[];
    if (!presentationFocusNodeId) return combined;

    const directNeighborIds = new Set<string>();
    edges.forEach((edge) => {
      if (edge.source === presentationFocusNodeId) directNeighborIds.add(edge.target);
      if (edge.target === presentationFocusNodeId) directNeighborIds.add(edge.source);
    });

    return combined.map((node) => {
      const isFocus = node.id === presentationFocusNodeId;
      const isNeighbor = directNeighborIds.has(node.id);
      return {
        ...node,
        selected: isFocus,
        draggable: false,
        className: [
          node.className,
          isFocus ? "presentation-focus-node" : "",
          isNeighbor ? "presentation-neighbor-node" : "",
        ]
          .filter(Boolean)
          .join(" "),
        style: {
          ...(node.style ?? {}),
          opacity: isFocus ? 1 : isNeighbor ? 0.42 : 0.075,
          transition: "opacity 420ms ease, filter 420ms ease",
          filter: isFocus ? "none" : isNeighbor ? "saturate(.75)" : "grayscale(1)",
          zIndex: isFocus ? 30 : isNeighbor ? 10 : 1,
        },
      };
    });
  }, [
    allAutomations,
    availableAutomations,
    edges,
    focusNodeById,
    handleNavigateToAutomation,
    nodes,
    presentationFocusNodeId,
    t,
    updateDelayFromNode,
    virtualIncomingNodes,
    virtualOutgoingNodes,
  ]);
  const viewEdges = useMemo(() => {
    const combined = [
      ...displayEdges,
      ...virtualIncomingEdges,
      ...virtualOutgoingEdges,
    ];
    if (!presentationFocusNodeId) return combined;

    const directNeighborIds = new Set<string>();
    combined.forEach((edge) => {
      if (edge.source === presentationFocusNodeId) directNeighborIds.add(edge.target);
      if (edge.target === presentationFocusNodeId) directNeighborIds.add(edge.source);
    });

    return combined.map((edge) => {
      const adjacent =
        edge.source === presentationFocusNodeId ||
        edge.target === presentationFocusNodeId;
      const secondary =
        directNeighborIds.has(edge.source) || directNeighborIds.has(edge.target);
      return {
        ...edge,
        animated: adjacent || ("animated" in edge ? Boolean(edge.animated) : false),
        style: {
          ...(edge.style ?? {}),
          opacity: adjacent ? 0.94 : secondary ? 0.2 : 0.03,
          transition: "opacity 420ms ease, stroke-width 420ms ease",
          strokeWidth: adjacent ? 2.6 : secondary ? 1.5 : 1,
        },
      } as AutomationCanvasEdge;
    });
  }, [
    displayEdges,
    presentationFocusNodeId,
    virtualIncomingEdges,
    virtualOutgoingEdges,
  ]);

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
      // Clear any pending connection (successful handle drop)
      pendingConnectionRef.current = null;
      didConnectRef.current = true;
      setPendingConnection(null);
      setConnectMenuPos(null);
      setConnectSearch("");
    },
    [setEdges],
  );

  const onConnectStart = useCallback(
    (_event: any, params: { nodeId?: string | null; handleId?: string | null; handleType?: string | null }) => {
      if (!params.nodeId || !params.handleType) return;
      const conn = {
        nodeId: params.nodeId,
        handleId: params.handleId,
        handleType: (params.handleType as "source" | "target"),
      };
      pendingConnectionRef.current = conn;
      setPendingConnection(conn);
      setConnectSearch("");
    },
    [],
  );

  const onConnectEnd = useCallback((event: any) => {
    // Show the contextual node picker only if no successful connection was made
    if (pendingConnectionRef.current && event?.clientX != null && !didConnectRef.current) {
      setConnectMenuPos({ x: event.clientX, y: event.clientY });
    }
    // reset flag
    didConnectRef.current = false;
  }, []);

  const connectToNode = useCallback((targetId: string) => {
    const currentPending = pendingConnectionRef.current;
    if (!currentPending) return;
    const { nodeId: src, handleId: srcHandle, handleType } = currentPending;

    const params: any =
      handleType === "source"
        ? { source: src, sourceHandle: srcHandle || undefined, target: targetId }
        : { source: targetId, target: src, targetHandle: srcHandle || undefined };

    setEdges((eds) => addEdge(params, eds));
    setHasUnsavedChanges(true);
    pendingConnectionRef.current = null;
    didConnectRef.current = false;
    setPendingConnection(null);
    setConnectMenuPos(null);
    setConnectSearch("");
  }, [setEdges]);

  // Create a brand new node from the node catalog and connect the pending edge to it.
  // This is used when user drops a connector in empty canvas space.
  const createNodeAndConnect = useCallback((nodeType: string) => {
    const currentPending = pendingConnectionRef.current;
    if (!currentPending) return;
    if (nodeType === "sticky_note") return;

    // Compute a nice position: prefer near the drop location, or to the right of source node
    let position = { x: 420, y: 180 };
    if (connectMenuPos && typeof screenToFlowPosition === 'function') {
      const flowPos = screenToFlowPosition({ x: connectMenuPos.x, y: connectMenuPos.y });
      position = { x: flowPos.x + 40, y: flowPos.y + 10 };
    }

    const sourceNode = nodes.find((n) => n.id === currentPending.nodeId);
    if (sourceNode) {
      // Place nicely to the right of source
      position = {
        x: sourceNode.position.x + 320,
        y: sourceNode.position.y + (Math.random() - 0.5) * 60,
      };
    }

    const newNode = createAutomationCanvasNode({
      type: nodeType as any,
      position,
    });

    setNodes((prev) => [...prev, newNode]);
    setHasUnsavedChanges(true);

    // Build the edge
    const { nodeId: src, handleId: srcHandle, handleType } = currentPending;
    const params: any =
      handleType === "source"
        ? { source: src, sourceHandle: srcHandle || undefined, target: newNode.id }
        : { source: newNode.id, target: src, targetHandle: srcHandle || undefined };

    setEdges((eds) => addEdge(params, eds));
    setHasUnsavedChanges(true);

    // Select the newly created node and open the properties sidebar for immediate editing
    setSelectedNodeIds([newNode.id]);
    setShowPropertiesPanel(true);

    // cleanup
    pendingConnectionRef.current = null;
    didConnectRef.current = false;
    setPendingConnection(null);
    setConnectMenuPos(null);
    setConnectSearch("");
  }, [nodes, setNodes, setEdges, connectMenuPos, screenToFlowPosition, setSelectedNodeIds, setShowPropertiesPanel]);

  const closeConnectMenu = useCallback(() => {
    pendingConnectionRef.current = null;
    didConnectRef.current = false;
    setPendingConnection(null);
    setConnectMenuPos(null);
    setConnectSearch("");
  }, []);

  // Close connect menu on outside click (to prevent it from sticking and covering UI)
  useEffect(() => {
    if (!connectMenuPos) return;
    const handleOutside = (e: MouseEvent) => {
      if (connectMenuRef.current && !connectMenuRef.current.contains(e.target as Node)) {
        closeConnectMenu();
      }
    };
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [connectMenuPos, closeConnectMenu]);

  // Close context (right-click) menu on outside clicks - intuitive behavior
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [contextMenu]);

  // Presentation mode helpers (navegar por flechas, un nodo a la vez)
  const computePresentationOrder = useCallback(() => {
    if (nodes.length === 0) return [];
    // Use logical order so end/delay/chat(message) are presented in human-friendly sequence
    // (ends last, delays after their triggering action)
    const logical = getLogicalNodeOrder(nodes, edges);
    if (logical.length > 0) return logical;

    const start = nodes.find((n) => n.type === "start");
    if (!start) {
      return [...nodes]
        .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
        .map((n) => n.id);
    }
    const order: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [start.id];
    const adj = new Map<string, string[]>();
    nodes.forEach((n) => adj.set(n.id, []));
    edges.forEach((e) => {
      adj.get(e.source)?.push(e.target);
    });
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      order.push(cur);
      const nexts = adj.get(cur) || [];
      nexts.forEach((nxt) => {
        if (!visited.has(nxt)) queue.push(nxt);
      });
    }
    nodes.forEach((n) => {
      if (!visited.has(n.id)) order.push(n.id);
    });
    return order;
  }, [nodes, edges]);

  const enterPresentationMode = useCallback(() => {
    const order = computePresentationOrder();
    if (order.length === 0) return;
    setPresentationNodeOrder(order);
    setPresentationIndex(0);
    setIsPresentationMode(true);
    setShowNodeSidebar(false);
    setShowPropertiesPanel(true);
    setContextMenu(null);
    setConnectMenuPos(null);
    didConnectRef.current = false;
    const firstNode = nodes.find((n) => n.id === order[0]);
    if (firstNode) {
      setTimeout(() => {
        const nodeWidth = firstNode.measured?.width ?? firstNode.width ?? 300;
        const nodeHeight = firstNode.measured?.height ?? firstNode.height ?? 150;
        setCenter(
          firstNode.position.x + nodeWidth / 2,
          firstNode.position.y + nodeHeight / 2,
          {
            zoom: firstNode.type === "menu_simple" ? 1.02 : 1.12,
            duration: 520,
          },
        );
        setSelectedNodeIds([order[0]]);
      }, 80);
    }
  }, [computePresentationOrder, nodes, setCenter, setSelectedNodeIds]);

  const exitPresentationMode = useCallback(() => {
    setIsPresentationMode(false);
    setPresentationNodeOrder([]);
    setPresentationIndex(0);
    // Do not show sidebars on exit (user request: keep clean canvas)
    setShowNodeSidebar(false);
    setShowPropertiesPanel(false);
    setContextMenu(null);
    setTimeout(() => {
      fitView({ padding: 0.18, duration: 220 });
    }, 30);
  }, [fitView]);

  const goToPresentationIndex = useCallback(
    (idx: number) => {
      if (!presentationNodeOrder.length) return;
      const clamped = Math.max(0, Math.min(idx, presentationNodeOrder.length - 1));
      setPresentationIndex(clamped);
      const nid = presentationNodeOrder[clamped];
      const node = nodes.find((n) => n.id === nid);
      if (node) {
        setSelectedNodeIds([nid]);
        setShowPropertiesPanel(true);
        const nodeWidth = node.measured?.width ?? node.width ?? 300;
        const nodeHeight = node.measured?.height ?? node.height ?? 150;
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            setCenter(
              node.position.x + nodeWidth / 2,
              node.position.y + nodeHeight / 2,
              {
                zoom: node.type === "menu_simple" ? 1.02 : 1.12,
                duration: 520,
              },
            ),
          ),
        );
      }
    },
    [
      presentationNodeOrder,
      nodes,
      setCenter,
      setSelectedNodeIds,
      setShowPropertiesPanel,
    ]
  );

  // Keyboard navigation for presentation mode + close menus + edit nodes + hide right sidebar
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isPresentationMode) {
        const target = e.target as HTMLElement | null;
        const isEditing =
          target?.matches("input, textarea, select, [contenteditable='true']") ??
          false;
        if (isEditing && e.key !== "Escape") return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          goToPresentationIndex(presentationIndex + 1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          goToPresentationIndex(presentationIndex - 1);
        } else if (e.key === "Escape") {
          e.preventDefault();
          exitPresentationMode();
        }
      } else {
        if (e.key === "Escape") {
          e.preventDefault();
          if (connectMenuPos) {
            closeConnectMenu();
          } else if (contextMenu) {
            setContextMenu(null);
          } else if (showPropertiesPanel) {
            setShowPropertiesPanel(false);
          } else {
            setSelectedNodeIds([]);
          }
        }
        if (e.key === "Enter" && selectedNodeIds.length > 0 && !showPropertiesPanel) {
          e.preventDefault();
          setShowPropertiesPanel(true);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPresentationMode, presentationIndex, goToPresentationIndex, exitPresentationMode, connectMenuPos, closeConnectMenu, showPropertiesPanel, selectedNodeIds, setShowPropertiesPanel]);

  const onNodesChange = useCallback(
    (changes: NodeChange<AutomationCanvasNode>[]) => {
      const filteredChanges = changes.filter((change) => {
        const chId = (change as any).id;
        if (typeof chId === "string" && chId.startsWith("virtual-incoming-")) return false; // never mutate virtual incoming nodes
        if (typeof chId === "string" && chId.startsWith("virtual-outgoing-")) return false; // never mutate virtual outgoing nodes
        if (change.type !== "remove") return true;
        const node = nodes.find((item) => item.id === chId);
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
      event.stopPropagation();
      const type =
        event.dataTransfer.getData("application/reactflow") ||
        event.dataTransfer.getData("text/plain");

      if (
        typeof type === "undefined" ||
        !type ||
        !AUTOMATION_NODE_CATALOG.some((entry) => entry.type === type)
      ) {
        return;
      }

      // Reject node types not allowed for the current connection channel
      // (e.g. interactive nodes dropped into a QR flow).
      const catalogEntry = getAutomationNodeCatalogEntry(type as AutomationCanvasNode["type"]);
      if (catalogEntry && !catalogEntry.channels.includes(channel)) {
        toast.error(t("channel_node_not_allowed"));
        return;
      }

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
    [channel, screenToFlowPosition, setNodes, t],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: AutomationCanvasNode) => {
    if (node.id.startsWith("virtual-incoming-") || node.id.startsWith("virtual-outgoing-")) {
      setContextMenu(null);
      return;
    }

    setSelectedNodeIds((current) => {
      if (current.length === 1 && current[0] === node.id) {
        return current;
      }
      return [node.id];
    });
    setContextMenu(null);

    // Keep the same editor sidebar available in both visual and presentation modes.
    setShowPropertiesPanel(true);

    // If in presentation, jump to that node in the sequence if possible
    if (isPresentationMode && presentationNodeOrder.length > 0) {
      const idx = presentationNodeOrder.indexOf(node.id);
      if (idx !== -1) {
        goToPresentationIndex(idx);
      }
    }
  }, [
    goToPresentationIndex,
    isPresentationMode,
    presentationNodeOrder,
    setShowPropertiesPanel,
  ]);

  const onSelectionChange = useCallback<OnSelectionChangeFunc<AutomationCanvasNode, AutomationCanvasEdge>>(
    ({ nodes: selectedNodes }) => {
      const real = selectedNodes.filter((n) => !n.id.startsWith("virtual-incoming-") && !n.id.startsWith("virtual-outgoing-"));
      setSelectedNodeIds(real.map((node) => node.id));
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeIds([]);
    setShowPropertiesPanel(false);
    setContextMenu(null);
    if (connectMenuPos) closeConnectMenu();
  }, [connectMenuPos, closeConnectMenu, setShowPropertiesPanel]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: AutomationCanvasNode) => {
    if (node.id.startsWith("virtual-incoming-") || node.id.startsWith("virtual-outgoing-")) {
      const targetId = Number(node.data?.targetAutomationId);
      if (targetId) handleNavigateToAutomation(targetId);
      return;
    }
    setSelectedNodeIds([node.id]);
    setContextMenu(null);
    setShowPropertiesPanel(true);
  }, [handleNavigateToAutomation, setShowPropertiesPanel]);

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: AutomationCanvasEdge) => {
    if (edge.id.startsWith("v-in-") || edge.id.startsWith("v-out-")) {
      return;
    }

    const currentVariant = getEdgeStyleVariant(edge);
    const currentIndex = EDGE_STYLE_VARIANTS.indexOf(currentVariant);
    const nextVariant = EDGE_STYLE_VARIANTS[(currentIndex + 1) % EDGE_STYLE_VARIANTS.length];

    setEdges((currentEdges) =>
      currentEdges.map((currentEdge) =>
        currentEdge.id === edge.id
          ? {
              ...currentEdge,
              styleVariant: nextVariant,
            }
          : currentEdge,
      ),
    );
    setHasUnsavedChanges(true);
  }, [setEdges]);

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

  // Context menu open helper (simplified after removing floating quick bar)
  const openContextMenuForNode = useCallback((nodeId: string, clientX: number, clientY: number) => {
    setSelectedNodeIds([nodeId]);
    setContextMenu({ nodeId, x: clientX, y: clientY });
  }, [setSelectedNodeIds, setContextMenu]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const quickAppendNode = useCallback((nodeType: string) => {
    const sid = selectedNodeIds[0];
    if (!sid) return;
    const srcNode = nodes.find((n) => n.id === sid);
    if (!srcNode) return;
    const newPos = {
      x: srcNode.position.x + 340,
      y: srcNode.position.y + (Math.random() - 0.4) * 80,
    };
    const newNode = createAutomationCanvasNode({
      type: nodeType as any,
      position: newPos,
    });
    setNodes((prev) => [...prev, newNode]);
    setHasUnsavedChanges(true);
    const edgeParams: any = { source: sid, target: newNode.id };
    setEdges((eds) => addEdge(edgeParams, eds));
    setHasUnsavedChanges(true);
    setSelectedNodeIds([newNode.id]);
    setContextMenu(null);
    setTimeout(() => {
      setCenter(newNode.position.x, newNode.position.y, { zoom: 1.05, duration: 120 });
    }, 10);
  }, [selectedNodeIds, nodes, setNodes, setEdges, setCenter]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: AutomationCanvasNode) => {
    event.preventDefault();
    openContextMenuForNode(node.id, event.clientX, event.clientY);
  }, [openContextMenuForNode]);

  const removeNodeById = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.type === "start") {
      toast.error(t("start_node_delete_blocked"));
      return;
    }
    setNodes((nds) => nds.filter((nn) => nn.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setHasUnsavedChanges(true);
    if (selectedNodeIds.includes(nodeId)) setSelectedNodeIds([]);
    setContextMenu(null);
    setShowPropertiesPanel(false);
  }, [nodes, setNodes, setEdges, selectedNodeIds, t]);

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
    // exclude virtual incoming link nodes/edges from save
    const isVirtualFlowId = (id: unknown) => {
      const value = String(id || "");
      return value.startsWith("virtual-incoming-") || value.startsWith("virtual-outgoing-");
    };
    const realNodes = (flow.nodes as any[]).filter((n: any) => !isVirtualFlowId(n.id));
    const realEdges = (flow.edges as any[]).filter((e: any) =>
      !isVirtualFlowId(e.source) &&
      !isVirtualFlowId(e.target)
    );
    const preparedFlow = prepareAutomationFlowForSave({
      nodes: realNodes as AutomationFlowNode[],
      edges: realEdges as AutomationFlowEdge[],
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
      const saved = await saveAutomation(
        automationId,
        savePreviewFlow.nodes,
        savePreviewFlow.edges,
        automationVersion,
      );
      setAutomationVersion(saved.updatedAt);
      setNodes(savePreviewFlow.nodes as AutomationCanvasNode[]);
      setEdges(savePreviewFlow.edges as AutomationCanvasEdge[]);
      if (automationRequiresManualReview(savePreviewFlow.nodes)) {
        setIsActive(false);
      }
      setIsSavePreviewOpen(false);
      setHasUnsavedChanges(false);
      toast.success(t("toast_saved"));
    } catch (error) {
      const isVersionConflict =
        error instanceof Error && error.message.includes("AUTOMATION_VERSION_CONFLICT");
      if (isVersionConflict) {
        toast.error(t("ai_generator.save_conflict_reload"));
        window.location.reload();
      } else {
        toast.error(t("ai_generator.save_failed"));
      }
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
      const result = await toggleAutomationStatus(automationId, newState);
      setAutomationVersion(result.updatedAt);
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

    setIsAutoArrangeEnabled(false);

    const arrangedPositions = getArrangementPositions({ nodes, edges, mode });

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (String(node.id).startsWith("virtual-incoming-")) return node;
        return {
          ...node,
          position: arrangedPositions.get(node.id) ?? node.position,
        };
      }),
    );

    if (mode === "orthogonal_connectors") {
      setEdges((currentEdges) =>
        currentEdges.map((edge) => ({
          ...edge,
          type: "smoothstep",
        })),
      );
    }

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
  }, [edges, fitView, nodes, selectedNodeId, setCenter, setEdges, setNodes]);

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
      mode: "mind_map",
    });

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (String(node.id).startsWith("virtual-incoming-")) return node; // keep manual left-of-start positions
        return {
          ...node,
          position: arrangedPositions.get(node.id) ?? node.position,
        };
      }),
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

    // Default name for the new sub-automation
    setNewSubAutomationName("Subflujo");
    setIsSaveAutomationConfirmOpen(true);
  }, [hasStartNodeInSelection, selectedNodeIds.length, t]);

  const handleConfirmSaveAutomationSelection = useCallback(async () => {
    const selectedSet = new Set(selectedNodeIds);
    if (selectedSet.size === 0) {
      return;
    }

    if (!nodes.some((node) => selectedSet.has(node.id))) {
      toast.error(t("bulk_actions.invalid_selection"));
      return;
    }

    setIsSavingAutomationSelection(true);
    setIsSaveAutomationConfirmOpen(false);

    try {
      const result = await saveSelectionAsAutomation({
        sourceAutomationId: automationId,
        currentNodes: nodes as AutomationFlowNode[],
        currentEdges: edges as AutomationFlowEdge[],
        selectedNodeIds: [...selectedSet],
        expectedUpdatedAt: automationVersion,
        name: newSubAutomationName.trim() || undefined,
      });

      setNodes(result.sourceNodes as AutomationCanvasNode[]);
      setEdges(result.sourceEdges as AutomationCanvasEdge[]);
      setSelectedNodeIds([]);
      setAutomationVersion(result.updatedAt);
      setHasUnsavedChanges(false);
      router.refresh();

      toast.success(
        t("bulk_actions.save_automation_success", {
          automationId: result.newAutomationId,
        }),
      );
    } catch (error) {
      const isVersionConflict =
        error instanceof Error &&
        error.message.includes("AUTOMATION_VERSION_CONFLICT");
      toast.error(
        isVersionConflict
          ? t("bulk_actions.save_automation_conflict")
          : t("bulk_actions.save_automation_error"),
      );
      if (isVersionConflict) window.location.reload();
    } finally {
      setIsSavingAutomationSelection(false);
    }
  }, [
    automationId,
    automationVersion,
    edges,
    newSubAutomationName,
    nodes,
    router,
    selectedNodeIds,
    setEdges,
    setNodes,
    t,
  ]);

  const handleConfirmSaveTemplate = useCallback(async () => {
    const selectedSet = new Set(selectedNodeIds);
    const endpoint =
      selectedSet.size > 0
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

  const bgColor = "var(--background)";
  const dotColor = "var(--border)";
  const isShortViewport = viewportSize.height > 0 && viewportSize.height < 820;
  const isCompactViewport = viewportSize.width > 0 && viewportSize.width < 1440;
  const miniMapHeight = isShortViewport ? 96 : 136;
  const miniMapWidth = isShortViewport ? 150 : isCompactViewport ? 180 : 220;
  // Bottom-right positioning for Controls + MiniMap (user request: map + nav buttons bottom-right)
  const miniMapRightOffset = 16 + CONTROL_STACK_WIDTH + OVERLAY_GAP;

  const controlsStyle = {
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
    borderColor: "var(--border)",
    right: 16,
    bottom: 16,
    borderRadius: 12,
    zIndex: 6,
  };

  const miniMapStyle = {
    backgroundColor: "var(--card)",
    height: miniMapHeight,
    width: miniMapWidth,
    right: miniMapRightOffset,
    bottom: 16,
    borderRadius: 16,
    zIndex: 5,
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <FlowEditorHeader
          automationId={automationId}
          automationName={automationName}
          automationNote={automationNote}
          isActive={isActive}
          onToggleActive={toggleActive}
          onSave={handleSave}
          isSaving={isSaving}
          hasUnsavedChanges={hasUnsavedChanges}

          isAIFlowGeneratorEnabled={isAIFlowGeneratorEnabled}
          onOpenAIGenerator={() => {
            setIsGeneratorOpen(true);
            resetGeneratorState();
          }}
          aiDraftMetadata={aiDraftMetadata}
          requiresManualReview={requiresManualReview}
          onConfirmReview={handleConfirmReview}

          // showNodeSidebar / properties toggles removed from header (FAB for components; node click for props)
          selectedNode={selectedNode}
          onOpenPropertiesModal={() => setIsPropertiesModalOpen(true)}

          // AI assistant view toggle (new)
          aiAssistantActive={showAIAssistant}
          onToggleAIAssistant={() => setShowAIAssistant(!showAIAssistant)}

          isPresentationMode={isPresentationMode}
          onEnterPresentation={enterPresentationMode}
          onExitPresentation={exitPresentationMode}
          presentationIndex={presentationIndex}
          presentationTotal={presentationNodeOrder.length}
          onPrevPresentation={() => goToPresentationIndex(presentationIndex - 1)}
          onNextPresentation={() => goToPresentationIndex(presentationIndex + 1)}

          onOrganize={handleAutoArrange}
          isAutoArrangeEnabled={isAutoArrangeEnabled}
          onOpenInsertTemplate={() => {
            setSelectedTemplateId(null);
            setIsInsertTemplateOpen(true);
            loadTemplates().catch(() => {
              toast.error(t("template_insert.load_error"));
            });
          }}
          onOpenSaveTemplate={() => {
            setTemplateName("");
            setTemplateDescription("");
            setTemplateVisibility("team");
            setIsSaveTemplateOpen(true);
          }}

          hasLoopWarning={infiniteLoopDiagnostics.hasNonTerminatingLoop}
          onShowLoopWarning={() =>
            toast.error(
              `${t("loop_alert_toast")} (${problematicEdgeSummaries.join(", ")})`
            )
          }

          // Text + List massive editors - buttons integrated in header
          flowViewMode={flowViewMode}
          onSetFlowViewMode={setFlowViewMode}
        />

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
          {showNodeSidebar && !showAIAssistant && flowViewMode === 'visual' && (
            <Sidebar
              collapsed={false}
              onToggle={() => setShowNodeSidebar(false)}
              channel={channel}
            />
          )}

          <div
            className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-background"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            {/* Main editor area: Visual canvas + 2 new full-flow massive edit views for humans.
                Like the AI agents view, but focused on easy human bulk editing of the whole flow.
                - Lista de Pasos: editable sequential list of the entire conversation.
                - Editor Texto: human-readable script you can edit in bulk and apply. */}
            {!showAIAssistant && flowViewMode === 'visual' && (
              <ReactFlow
                nodes={viewNodes}
                edges={viewEdges}
                className={cn(
                  "transition-colors duration-500",
                  isPresentationMode &&
                    "[&_.presentation-focus-node>div]:!w-[min(440px,58vw)] [&_.presentation-focus-node>div]:!max-h-[68vh] [&_.presentation-focus-node>div]:overflow-y-auto [&_.presentation-focus-node_.line-clamp-3]:!line-clamp-none [&_.presentation-focus-node_.truncate]:!overflow-visible [&_.presentation-focus-node_.truncate]:!whitespace-normal [&_.presentation-focus-node_.truncate]:!text-clip",
                )}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onSelectionChange={onSelectionChange}
                nodeTypes={nodeTypes}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                onEdgeDoubleClick={onEdgeDoubleClick}
                onPaneClick={onPaneClick}
                onNodeContextMenu={handleNodeContextMenu}
                selectionKeyCode="Shift"
                multiSelectionKeyCode="Shift"
                selectionOnDrag
                nodesDraggable={!isPresentationMode}
                proOptions={proOptions}
                fitView
                fitViewOptions={{ padding: 0.35 }}
                minZoom={0.2}
              >
                <Controls
                  position="bottom-right"
                  style={controlsStyle}
                  className="[&>button]:!bg-transparent [&>button]:!border-none [&>button]:!text-current hover:[&>button]:!bg-accent [&>button]:p-1 [&>button]:rounded-sm border shadow-lg backdrop-blur-sm"
                />
                <MiniMap
                  position="bottom-right"
                  style={miniMapStyle}
                  className="border shadow-lg backdrop-blur-sm"
                  maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
                  nodeColor="var(--border)"
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
            )}

            {!showAIAssistant && flowViewMode === 'map' && (
              <div className="absolute inset-0 z-20 overflow-auto bg-muted p-4">
                <div className="mx-auto flex h-full min-h-[520px] max-w-7xl flex-col gap-4">
                  <AutomationConnectionsMap
                    automations={allAutomations}
                    locale={locale}
                    currentAutomationId={automationId}
                    className="flex min-h-0 flex-1 flex-col"
                    viewportClassName="min-h-0 flex-1"
                    focusCurrentOnly
                    labels={{
                      title: t("graph.title"),
                      description: t("graph.description"),
                      noLinks: t("graph.no_links"),
                      linkedCount: t("graph.linked_count"),
                      active: t("graph.active"),
                      paused: t("graph.paused"),
                      opensFlow: t("graph.opens_flow"),
                      resetLayout: t("graph.reset_layout"),
                      dragHint: t("graph.drag_hint"),
                      fullscreen: t("graph.fullscreen"),
                      exitFullscreen: t("graph.exit_fullscreen"),
                      noteFallback: t("graph.note_fallback"),
                      legendForward: t("graph.legend_forward"),
                      legendBack: t("graph.legend_back"),
                      viewGraph: t("graph.view_graph"),
                      viewList: t("graph.view_list"),
                      sendsTo: t("graph.sends_to"),
                      receivesFrom: t("graph.receives_from"),
                      returnsBadge: t("graph.returns_badge"),
                      selfBadge: t("graph.self_badge"),
                      noConnections: t("graph.no_connections"),
                      currentFlow: t("graph.current_flow"),
                    }}
                  />
                  <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                    {t("graph.editor_hint")}
                  </div>
                </div>
              </div>
            )}

            {!showAIAssistant && flowViewMode === 'simulator' && (
              <div className="absolute inset-0 z-20 overflow-hidden bg-background">
                <AutomationChatSimulator
                  automations={[
                    {
                      id: automationId,
                      name: automationName,
                      nodes,
                      edges,
                    },
                    ...allAutomations
                      .filter((automation) => automation.id !== automationId)
                      .map((automation) => ({
                        id: automation.id,
                        name: automation.name,
                        nodes: automation.nodes,
                        edges: automation.edges,
                      })),
                  ]}
                  currentAutomationId={automationId}
                  title={t("simulator.title")}
                  description={t("simulator.description")}
                  className="h-full"
                  onNodeFocus={(nodeId) => {
                    const node = nodes.find((item) => item.id === nodeId);
                    setSelectedNodeIds([nodeId]);
                    if (node) {
                      setCenter(node.position.x, node.position.y, {
                        zoom: 1.05,
                        duration: 180,
                      });
                    }
                  }}
                />
              </div>
            )}

            {/* VIEW 1: LISTA DE PASOS - Massive sequential editing of the full flow. Easy for humans to read and edit end-to-end like a script. */}
            {!showAIAssistant && flowViewMode === 'steps-list' && (
              <div className="absolute inset-0 z-20 overflow-auto bg-background p-4">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-semibold">Lista de Pasos — Edición Masiva del Flujo</div>
                      <div className="text-xs text-muted-foreground">Edita todo el flujo de forma secuencial. Cambios se aplican en vivo.</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setFlowViewMode('visual')}>Volver a Visual</Button>
                  </div>

                  <div className="space-y-3">
                    {getLogicalNodeOrder(nodes, edges).map((nodeId, index) => {
                      const node = nodes.find(n => n.id === nodeId);
                      if (!node) return null;
                      const data = node.data || {};
                      const isDelay = node.type === 'delay';
                      const isOptions = node.type === 'options';
                      const isMessageLike = ['message','collect','button_message','list_message','call_to_action'].includes(node.type);
                      const mainValue = isDelay ? (data.seconds ?? 2) : (data.label || data.bodyText || data.title || '');
                      return (
                        <div key={nodeId} className="rounded-lg border p-3 bg-card">
                          <div className="flex items-start gap-3">
                            <div className="text-xs w-6 mt-1 text-muted-foreground tabular-nums">{index + 1}</div>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono px-1.5 py-0.5 bg-muted rounded">{node.type}</span>
                                <span className="text-muted-foreground truncate">{String(data.label || data.bodyText || data.title || '').slice(0,70)}</span>
                              </div>

                              {/* Simple unified editor for massive changes */}
                              {isDelay ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs">Espera</span>
                                  <Input type="number" className="h-8 w-24" value={data.seconds ?? 2} onChange={e => updateNodeData(nodeId, { seconds: Math.max(1, parseInt(e.target.value)||1) })} />
                                  <span className="text-xs text-muted-foreground">segundos</span>
                                </div>
                              ) : isOptions ? (
                                <div className="space-y-1">
                                  <Textarea rows={2} className="text-sm" value={String(data.label || '')} onChange={e => updateNodeData(nodeId, { label: e.target.value })} />
                                  <Textarea rows={3} className="font-mono text-xs" value={(data.options || []).join('\n')} onChange={e => updateNodeData(nodeId, { options: e.target.value.split('\n').map((s:string)=>s.trim()).filter(Boolean) })} />
                                </div>
                              ) : (
                                <Textarea rows={3} className="text-sm" value={String(mainValue)} onChange={e => {
                                  const v = e.target.value;
                                  if (['message','collect'].includes(node.type)) updateNodeData(nodeId, {label: v});
                                  else updateNodeData(nodeId, {bodyText: v});
                                }} />
                              )}

                              {node.type === 'condition' && <div className="text-xs text-muted-foreground">Ramas de condición (usa panel para editar detalles)</div>}
                              {node.type === 'end' && <div className="text-xs text-destructive">Fin del flujo</div>}

                              <div className="flex gap-1 pt-1">
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => removeNodeById(nodeId)}>Eliminar</Button>
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setSelectedNodeIds([nodeId]); quickAppendNode('message'); setFlowViewMode('visual'); }}>+ Msg</Button>
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setSelectedNodeIds([nodeId]); quickAppendNode('delay'); setFlowViewMode('visual'); }}>+ Delay</Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {nodes.length === 0 && <div className="text-muted-foreground text-sm">Sin nodos</div>}
                  </div>

                  <div className="mt-4 text-[11px] text-muted-foreground">Tip: Usa "Ordenar" arriba para reacomodar visualmente. Los cambios de texto son masivos e inmediatos.</div>
                </div>
              </div>
            )}

            {/* VIEW 2: EDITOR DE TEXTO / SCRIPT - Massive text editing of the entire flow. Humans edit like a document/script. */}
            {!showAIAssistant && flowViewMode === 'text-script' && (
              <div className="absolute inset-0 z-20 overflow-auto bg-background p-4">
                <div className="max-w-4xl mx-auto space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Editor de Texto del Flujo</div>
                      <div className="text-xs text-muted-foreground">Formato legible para humanos. Edita masivamente y aplica.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        // Auto load full rich text representation - supports all node types + branches
                        const order = getLogicalNodeOrder(nodes, edges);
                        const stepToId = new Map<number, string>();
                        order.forEach((id, i) => stepToId.set(i+1, id));

                        const lines: string[] = [];
                        order.forEach((id, idx) => {
                          const stepNum = idx + 1;
                          const n = nodes.find(nn => nn.id === id)!;
                          const d: any = n.data || {};
                          let line = `${stepNum}. [${n.type}]`;

                          // Per type rich serialization
                          if (n.type === 'start') {
                            line += ` trigger=${d.triggerType || 'first_message'}`;
                          } else if (n.type === 'delay') {
                            line += ` seconds=${d.seconds || 2}`;
                          } else if (n.type === 'end') {
                            line += ' (fin del flujo)';
                          } else {
                            const main = d.label || d.bodyText || d.title || d.caption || '';
                            if (main) line += ` "${main.replace(/"/g, "'")}"`;
                          }

                          lines.push(line);

                          // Handle branches / options / conditions / buttons / list items
                          if (n.type === 'options' && d.options?.length) {
                            d.options.forEach((opt: string, i: number) => {
                              const targetEdge = edges.find(e => e.source === id && e.sourceHandle === `option-${i}`);
                              const targetStep = targetEdge ? (order.indexOf(targetEdge.target) + 1) : null;
                              lines.push(`   - "${opt}"${targetStep ? ` -> ${targetStep}` : ''}`);
                            });
                          }

                          if (n.type === 'button_message' && d.buttons?.length) {
                            d.buttons.forEach((btn: any) => {
                              const targetEdge = edges.find(e => e.source === id && e.sourceHandle === `btn-${btn.id}`);
                              const targetStep = targetEdge ? (order.indexOf(targetEdge.target) + 1) : null;
                              lines.push(`   - [btn] "${btn.text}"${targetStep ? ` -> ${targetStep}` : ''}`);
                            });
                          }

                          if (n.type === 'list_message' && d.items?.length) {
                            d.items.forEach((item: any) => {
                              const targetEdge = edges.find(e => e.source === id && e.sourceHandle === `list-${item.id}`);
                              const targetStep = targetEdge ? (order.indexOf(targetEdge.target) + 1) : null;
                              lines.push(`   - [item] "${item.title}"${targetStep ? ` -> ${targetStep}` : ''}`);
                            });
                          }

                          if (n.type === 'condition' && d.conditions?.length) {
                            d.conditions.forEach((cond: any, i: number) => {
                              const targetEdge = edges.find(e => e.source === id && e.sourceHandle === cond.id);
                              const targetStep = targetEdge ? (order.indexOf(targetEdge.target) + 1) : null;
                              const condStr = `${cond.type} ${cond.operator} ${cond.value || ''}`.trim();
                              lines.push(`   if "${condStr}"${targetStep ? ` -> ${targetStep}` : ''}`);
                            });
                            const fb = edges.find(e => e.source === id && e.sourceHandle === 'fallback');
                            if (fb) {
                              const t = order.indexOf(fb.target) + 1;
                              lines.push(`   else -> ${t}`);
                            }
                          }

                          // Simple next for single-out nodes
                          if (['message', 'media', 'collect', 'save_contact', 'ai_control', 'call_to_action'].includes(n.type)) {
                            const out = edges.find(e => e.source === id);
                            if (out) {
                              const tStep = order.indexOf(out.target) + 1;
                              lines.push(`   -> ${tStep}`);
                            }
                          }
                        });

                        setScriptText(lines.join('\n'));
                      }}>Cargar desde flujo (auto)</Button>

                      <Button size="sm" onClick={() => {
                        // Strong parser: supports nodes, branches, conditions, connections
                        const text = scriptText;
                        if (!text.trim()) return;

                        const lines = text.split('\n').map(l => l.trimEnd());
                        const stepMap = new Map<number, {id: string, type: string, data: any, branches: any[]}>();
                        let currentStep = 0;
                        const branchLines: any[] = [];

                        lines.forEach(raw => {
                          const line = raw.trim();
                          if (!line || line.startsWith('#')) return;

                          // Step header
                          const stepMatch = line.match(/^(\d+)\.\s*\[([a-z_]+)\]?\s*(.*)$/i);
                          if (stepMatch) {
                            currentStep = parseInt(stepMatch[1]);
                            const type = stepMatch[2].toLowerCase();
                            const rest = stepMatch[3] || '';
                            const data: any = {};

                            // Extract quoted text or key values
                            const quoted = rest.match(/"([^"]+)"/);
                            if (quoted) data._main = quoted[1];

                            if (type === 'delay') {
                              const s = rest.match(/seconds?=(\d+)/i);
                              data.seconds = s ? parseInt(s[1]) : 2;
                            } else if (type === 'start') {
                              const tr = rest.match(/trigger=(\w+)/i);
                              data.triggerType = tr ? tr[1] : 'first_message';
                            } else if (data._main) {
                              if (['message','collect','options'].includes(type)) data.label = data._main;
                              else data.bodyText = data._main;
                            }

                            const id = `text-${currentStep}-${Date.now().toString(36).slice(2,8)}`;
                            stepMap.set(currentStep, { id, type, data, branches: [] });
                            return;
                          }

                          // Branch lines
                          const branchMatch = line.match(/^-\s*(?:"([^"]+)"|\[([^\]]+)\])\s*(?:->\s*(\d+))?/i);
                          if (branchMatch && currentStep) {
                            const label = branchMatch[1] || branchMatch[2] || 'option';
                            const targetStep = branchMatch[3] ? parseInt(branchMatch[3]) : null;
                            const stepData = stepMap.get(currentStep);
                            if (stepData) {
                              stepData.branches.push({ label, targetStep });
                            }
                            return;
                          }

                          const ifMatch = line.match(/^if\s+"?([^"]+)"?\s*(?:->\s*(\d+))?/i);
                          if (ifMatch && currentStep) {
                            const condStr = ifMatch[1];
                            const target = ifMatch[2] ? parseInt(ifMatch[2]) : null;
                            const stepData = stepMap.get(currentStep);
                            if (stepData) stepData.branches.push({ type: 'cond', cond: condStr, targetStep: target });
                          }

                          const elseMatch = line.match(/^else\s*(?:->\s*(\d+))?/i);
                          if (elseMatch && currentStep) {
                            const stepData = stepMap.get(currentStep);
                            if (stepData) stepData.branches.push({ type: 'else', targetStep: elseMatch[1] ? parseInt(elseMatch[1]) : null });
                          }

                          const arrowMatch = line.match(/^->\s*(\d+)/);
                          if (arrowMatch && currentStep) {
                            const stepData = stepMap.get(currentStep);
                            if (stepData) stepData.branches.push({ type: 'next', targetStep: parseInt(arrowMatch[1]) });
                          }
                        });

                        // Build nodes
                        const newNodes: any[] = [];
                        const stepToNewId = new Map<number, string>();
                        let x = 120, y = 80;

                        stepMap.forEach((info, step) => {
                          const { type, data, branches } = info;
                          const nodeId = `text-step-${step}`;
                          stepToNewId.set(step, nodeId);

                          const nodeData: any = { ...data };
                          if (data._main) {
                            if (type === 'delay') delete nodeData._main;
                            else if (['options','button_message','list_message'].includes(type)) nodeData.label = data._main;
                            else nodeData.bodyText = data._main;
                          }

                          // Set reasonable defaults for known types
                          const catalogDefaults = getAutomationNodeDefaults(type as any) || {};
                          const finalData = { ...catalogDefaults, ...nodeData };

                          newNodes.push({
                            id: nodeId,
                            type,
                            position: { x, y },
                            data: finalData,
                          });
                          y += 160;
                          if (y > 600) { y = 100; x += 320; }
                        });

                        // Build edges from branches
                        const newEdges: any[] = [];
                        stepMap.forEach((info, step) => {
                          const srcId = stepToNewId.get(step)!;
                          info.branches.forEach((b: any, bi: number) => {
                            if (!b.targetStep) return;
                            const tgtId = stepToNewId.get(b.targetStep);
                            if (!tgtId) return;

                            let sourceHandle = undefined;
                            if (info.type === 'options') sourceHandle = `option-${bi}`;
                            else if (info.type === 'condition') sourceHandle = b.type === 'else' ? 'fallback' : `cond-${bi}`;
                            else if (info.type === 'button_message') sourceHandle = `btn-${bi}`;

                            newEdges.push({
                              id: `e-${srcId}-${tgtId}-${bi}`,
                              source: srcId,
                              target: tgtId,
                              sourceHandle,
                            });
                          });
                        });

                        // If we have content, replace
                        if (newNodes.length > 0) {
                          setNodes(newNodes as any);
                          setEdges(newEdges);
                          setHasUnsavedChanges(true);
                          toast.success('Flujo actualizado desde el editor de texto (estructura + ramas)');
                        }
                      }}>Aplicar al flujo (estructura completa)</Button>
                      <Button size="sm" variant="outline" onClick={() => setFlowViewMode('visual')}>Volver a Visual</Button>
                    </div>
                  </div>

                  <Textarea
                    ref={scriptTextRef as any}
                    className="font-mono text-sm h-[70vh] resize-y"
                    value={scriptText}
                    onChange={e => setScriptText(e.target.value)}
                    placeholder="Aquí aparece el flujo como texto. Carga desde flujo, edita libremente (mensajes, delays, opciones), luego Aplica."
                  />
                  <div className="flex justify-between items-center">
                    <div className="text-[10px] text-muted-foreground">
                      Editor de Texto reforzado: soporta todos los tipos de nodo, ramas (options, buttons, lists, conditions), conexiones y estructura completa.
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => {
                        const docs = `# DOCUMENTACIÓN COMPLETA - Editor de Texto para Flujos de Automatización (${identity.name})

## Propósito
Este es un editor de flujos basado en texto legible por humanos. Permite editar, reescribir y generar flujos completos de forma masiva. Es ideal para usar con IA (como Grok, GPT, Claude).

El formato es intencionalmente simple pero poderoso. Soporta:
- Todos los tipos de nodo del sistema
- Ramas condicionales y de opciones
- Conexiones explícitas entre nodos
- Carga y guardado round-trip (pérdida mínima de datos)

## Cómo se usa (pasos simples)

1. En el editor de flujos, cambia a la pestaña "Texto" en el header.
2. Pulsa "Cargar desde flujo (auto)" → el sistema genera el texto actual automáticamente.
3. Edita el texto libremente (puedes reescribir mensajes enteros, cambiar delays, reordenar pasos, agregar/quitar ramas).
4. Pulsa "Aplicar al flujo (estructura completa)" → los nodos, datos y conexiones se actualizan en el canvas visual.
5. Cambia de vuelta a "Visual" para ver el resultado y ajustar posiciones si quieres.

## Formato del Texto (reglas)

- Cada paso empieza con un número seguido de punto: 1. 2. 3.
- El tipo va entre corchetes: [message] [options] [condition] [delay] [end] etc.
- El contenido principal va después (puede ir entre comillas).
- Ramas y opciones se indentan con 2 espacios + guión.
- Conexiones explícitas se indican con "-> NUMERO" o "-> id"

### Ejemplos por tipo

1. [start]

2. [message]
   "Hola, bienvenido. ¿En qué te ayudo?"

3. [options]
   "¿Qué deseas hacer?"
   - "Ver catálogo" -> 4
   - "Hablar con humano" -> 8

4. [delay]
   seconds=4

5. [condition]
   if "variable == 'vip'"
     -> 6
   else
     -> 7

6. [message]
   "Bienvenido usuario VIP"

7. [message]
   "Gracias por contactarnos"

8. [end]

### Nodos soportados y campos clave

- start: trigger=first_message | contains | ...
- message: "texto del mensaje"
- options: "pregunta" + lista indentada de opciones con ->
- button_message / list_message: mismo, con - [btn] o - [item]
- delay: seconds=5
- collect: "pregunta" (guarda en variable)
- condition: if "condición" -> paso   else -> paso
- media, save_contact, ai_control, go_to_node, call_to_action: se representan con su tipo y datos principales
- end: fin del flujo

## Consejos para IA / uso masivo

- Sé explícito con las ramas usando "-> NÚMERO"
- Para conditions usa el formato:
   if "texto contains precio" -> pasoX
   else -> pasoY
- Puedes reordenar pasos cambiando los números.
- El parser es tolerante: intenta mantener el orden lógico.
- Después de aplicar, usa el botón "Ordenar" (en header) para layout limpio.
- Si la IA genera el texto, pídele que respete exactamente el formato de arriba.

## Limitaciones conocidas (para que la IA las evite)
- Los ids internos se regeneran al aplicar (no es problema).
- Posiciones visuales se pierden (usa Ordenar después).
- Algunas propiedades avanzadas (custom fields complejos) pueden necesitar ajuste manual en el panel.

Este formato es la forma recomendada para editar flujos grandes con IA de forma segura y eficiente.`;

                        navigator.clipboard.writeText(docs);
                        toast.success('Documentación completa copiada. Pégala a tu IA.');
                      }}
                    >
                      📋 Copiar docs para IA
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* AI pane (absolute to cover canvas area when active) */}
            {showAIAssistant && (
              <div className="absolute inset-0 z-30 overflow-auto bg-background p-4 text-sm border">
                <div className="flex justify-between mb-2">
                  <strong>Vista para Agentes IA (JSON + Prompt)</strong>
                  <Button size="sm" variant="outline" onClick={() => setShowAIAssistant(false)}>Volver</Button>
                </div>

                <div className="mb-3">
                  <div className="text-xs mb-1 flex justify-between font-medium">
                    <span>JSON editable del flujo actual</span>
                    <Button size="sm" className="h-5 text-[10px]" onClick={() => {
                      const clean = {nodes: nodes.map(n=>({id:n.id,type:n.type,position:n.position,data:n.data})), edges};
                      navigator.clipboard.writeText(JSON.stringify(clean,null,2)); toast.success("Copiado");
                    }}>Copiar JSON</Button>
                  </div>
                  <textarea 
                    className="w-full h-40 text-xs font-mono border p-2 rounded resize-y" 
                    defaultValue={JSON.stringify({nodes: nodes.map(n=>({id:n.id,type:n.type,position:n.position,data:n.data})), edges}, null, 2)} 
                    onBlur={(e) => {
                      try { 
                        const p = JSON.parse(e.target.value); 
                        if(p.nodes && p.edges){ 
                          setNodes(p.nodes); 
                          setEdges(p.edges); 
                          setHasUnsavedChanges(true); 
                          toast.success("JSON aplicado al flujo");
                        } 
                      }catch(err){
                        toast.error("JSON inválido");
                      }
                    }} 
                  />
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" className="text-xs" onClick={() => {
                      const ta = document.querySelector('textarea[defaultValue*=\'"nodes"\']') as HTMLTextAreaElement | null;
                      if (ta) {
                        try {
                          const p = JSON.parse(ta.value);
                          if (p.nodes && p.edges) {
                            setNodes(p.nodes);
                            setEdges(p.edges);
                            setHasUnsavedChanges(true);
                            toast.success("Cambios aplicados");
                          }
                        } catch {}
                      }
                    }}>Aplicar cambios</Button>
                    <span className="text-[10px] text-muted-foreground self-center">Edita el JSON y pierde el foco o pulsa Aplicar</span>
                  </div>
                </div>

                {/* Enhanced prompt + ID safety explanation */}
                <div className="space-y-2">
                  <div className="text-xs font-medium flex justify-between items-center">
                    <span>Prompt listo para IA + Instrucciones de IDs</span>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6" 
                      onClick={() => {
                        const clean = {nodes: nodes.map(n=>({id:n.id,type:n.type,position:n.position,data:n.data})), edges};
                        const fullPrompt = `Eres un experto en diseño de flujos de automatización conversacional (chatbots).

Tienes el siguiente flujo ACTUAL representado exactamente como:

${JSON.stringify(clean, null, 2)}

TAREA:
- Analiza el flujo actual.
- Realiza las modificaciones o expansiones que te pida el usuario.
- Devuelve SOLO un objeto JSON válido con esta estructura exacta:
{
  "nodes": [ ... ],
  "edges": [ ... ]
}

REGLAS CRÍTICAS PARA NO ROMPER EL FLUJO:

1. **IDs de nodos**:
   - NUNCA reutilices ni modifiques los "id" de los nodos existentes a menos que quieras eliminarlos o renombrarlos explícitamente.
   - Para crear NODOS NUEVOS, genera IDs completamente nuevos que NO existan en el JSON actual.
     Ejemplos recomendados:
       - "new-1", "new-2", ...
       - "ai-msg-001", "ai-delay-042"
       - "step-" + timestamp corto + random (ej: "step-0628a3")
     Evita usar números simples como "1", "2" o ids que ya aparezcan.

2. **Edges / Conexiones**:
   - Usa los IDs correctos en "source" y "target".
   - Para nodos con múltiples salidas (options, button_message, list_message, condition) usa el campo "sourceHandle" correcto:
     - options → "option-0", "option-1", ...
     - button_message → "btn-xxx" (el id del botón)
     - condition → el "id" de la condición o "fallback"
   - Si agregas nuevos nodos, conecta los edges apropiadamente desde nodos existentes o entre los nuevos.

3. **Estructura**:
   - Incluye TODOS los nodos y edges del flujo resultante (no solo los cambios).
   - Mantén los tipos de nodo válidos: start, message, options, delay, end, condition, collect, media, button_message, list_message, call_to_action, ai_control, save_contact, go_to_node.
   - Los datos de cada nodo deben ser coherentes con su tipo.

4. **Buenas prácticas**:
   - Prefiere agregar al final del flujo cuando sea posible.
   - Para insertar en medio, usa go_to_node o conecta correctamente.
   - Si el usuario quiere "agregar una rama", crea los nodos nuevos con IDs nuevos y conecta desde el nodo de decisión.

Ejemplo de respuesta válida:
{
  "nodes": [ ...todos los nodos incluyendo los nuevos con ids nuevos... ],
  "edges": [ ...todas las conexiones... ]
}

Devuelve únicamente el JSON. No agregues explicaciones fuera del JSON.`;

                        navigator.clipboard.writeText(fullPrompt);
                        toast.success("Prompt detallado + reglas de IDs copiado");
                      }}
                    >
                      Copiar prompt completo + reglas de IDs
                    </Button>
                  </div>

                  <div className="bg-muted/40 border rounded p-3 text-xs space-y-2">
                    <div className="font-semibold">Cómo generar sin interferir con IDs nuevos</div>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                      <li>Al crear nodos nuevos, <strong>usa siempre IDs que no existan</strong> actualmente (ej: "new-1", "ai-branch-01", "generated-xyz").</li>
                      <li>Nunca reutilices un ID existente para un nodo nuevo.</li>
                      <li>Mantén los IDs originales de los nodos que quieres conservar.</li>
                      <li>Las conexiones (edges) deben apuntar a los IDs correctos (existentes o nuevos).</li>
                      <li>Después de pegar el JSON generado, pulsa "Aplicar cambios" o pierde el foco del textarea.</li>
                      <li>Recomendación: después de aplicar, ve a la vista Visual y usa el botón "Ordenar" para acomodar los nuevos nodos.</li>
                    </ul>
                    <div className="text-[10px] text-muted-foreground pt-1">
                      El prompt que se genera arriba ya incluye estas instrucciones detalladas para que la IA las respete.
                    </div>
                  </div>

                  <div>
                    <div className="text-xs mb-1 text-muted-foreground">Prompt básico rápido:</div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6" 
                      onClick={() => {
                        const clean = {nodes: nodes.map(n=>({id:n.id,type:n.type,position:n.position,data:n.data})), edges};
                        const p = `Eres experto en flujos de automatización. JSON actual:\n${JSON.stringify(clean, null, 2)}\n\nInstrucciones: Modifica o amplía el flujo según lo que te pida el usuario.\nREGLA DE IDs: Para nodos nuevos usa identificadores que NO existan en el JSON actual (ej: "new-1", "ai-xxx"). Nunca reutilices IDs existentes.\nDevuelve SOLO el JSON completo con {nodes, edges}.`;
                        navigator.clipboard.writeText(p); 
                        toast.success("Prompt copiado");
                      }}
                    >
                      Copiar prompt básico + regla de IDs
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Custom nav buttons (fit, center start, focus) - only for visual canvas */}
            {!showAIAssistant && flowViewMode === 'visual' && (
            <div
              className="absolute bottom-3 right-[260px] z-40 flex flex-col gap-1 rounded-md border bg-background/95 p-0.5 shadow backdrop-blur"
            >
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fitView({ padding: 0.2, duration: 180 })} title={t("fit_all")}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCenterStart} title={t("center_start")}>
                <PlayCircle className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFocusSelected} title={t("focus_current")} disabled={!selectedNodeId}>
                <MousePointerClick className="h-3.5 w-3.5" />
              </Button>
            </div>
            )}

            {orphanNodeIds.length > 0 && flowViewMode === 'visual' && (
              <div className="absolute left-4 top-4 z-20 w-80 rounded-lg border border-amber-200 bg-amber-50/95 p-3 text-amber-950 shadow-lg backdrop-blur dark:border-amber-900/60 dark:bg-amber-950/80 dark:text-amber-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{t("orphans.title", { count: orphanNodeIds.length })}</p>
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                      {t("orphans.description")}
                    </p>
                  </div>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 bg-background/70 text-xs"
                    onClick={() => focusNodeById(orphanNodeIds[0])}
                  >
                    <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
                    {t("orphans.focus_first")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 bg-background/70 text-xs"
                    onClick={handleOrganizeOrphans}
                  >
                    <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
                    {t("orphans.organize")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 bg-background/70 text-xs text-destructive hover:text-destructive"
                    onClick={handleDeleteSelectedOrphans}
                    disabled={selectedOrphanNodeIds.length === 0}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    {t("orphans.delete_selected", { count: selectedOrphanNodeIds.length })}
                  </Button>
                </div>
              </div>
            )}

            {selectedNodeIds.length > 1 && flowViewMode === 'visual' && (
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

            {/* Contextual node creation picker — when user drags a connector and drops on empty canvas.
                Shows node types (not existing nodes). Does NOT open the left elements sidebar.
                Intuitive card style with icons and colors.
             */}
            {connectMenuPos && pendingConnection && (
              <div
                ref={connectMenuRef}
                className="fixed z-[80] w-[320px] rounded-xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
                style={{
                  left: Math.max(12, Math.min(connectMenuPos.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 340)),
                  top: Math.max(12, Math.min(connectMenuPos.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 900) - 380)),
                }}
              >
                <div className="px-3 py-2.5 border-b bg-muted/40 flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Elegir tipo de nodo</div>
                    <div className="text-[10px] text-muted-foreground">Se creará un nuevo nodo y se conectará</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeConnectMenu}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="p-2">
                  <input
                    autoFocus
                    value={connectSearch}
                    onChange={(e) => setConnectSearch(e.target.value)}
                    placeholder="Buscar nodo (mensaje, condición, delay...)"
                    className="mb-2 w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />

                  <div className="max-h-[260px] overflow-auto pr-1 space-y-1 custom-scrollbar">
                    {AUTOMATION_NODE_CATALOG
                      .filter(entry => entry.type !== 'start' && entry.type !== 'sticky_note') // notes are planning blocks, not flow junctions
                      .filter(entry => {
                        const q = connectSearch.toLowerCase().trim();
                        if (!q) return true;
                        const label = t(entry.labelKey as any) || entry.labelKey || entry.type;
                        return label.toLowerCase().includes(q) || entry.type.toLowerCase().includes(q);
                      })
                      .map((entry) => {
                        const Icon = ICONS_BY_KEY[entry.sidebar?.icon || 'message-square'] || MessageSquare;
                        const colorClass = entry.sidebar?.colorClass || 'bg-muted';
                        const iconColor = entry.sidebar?.iconColorClass || 'text-foreground';
                        const label = t(entry.labelKey as any) || entry.type;

                        return (
                          <button
                            key={entry.type}
                            onClick={() => createNodeAndConnect(entry.type)}
                            className="w-full flex items-center gap-3 rounded-lg border border-transparent hover:border-primary/40 hover:bg-accent/60 px-3 py-2 text-left transition-colors active:scale-[0.985]"
                          >
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm", colorClass)}>
                              <Icon className={cn("h-4.5 w-4.5", iconColor)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm leading-tight truncate">{label}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{entry.aiDescription?.slice(0, 60) || entry.type}</div>
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono shrink-0">
                              {entry.category}
                            </div>
                          </button>
                        );
                      })}
                    {AUTOMATION_NODE_CATALOG.filter(e => e.type !== 'start' && e.type !== 'sticky_note').length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground">No hay nodos disponibles.</div>
                    )}
                  </div>

                  <div className="mt-2 px-1 text-[10px] text-muted-foreground flex items-center gap-1">
                    <MousePointerClick className="h-3 w-3" /> Suelta en el lienzo para crear y conectar
                  </div>
                </div>
              </div>
            )}

            {/* Presentation mode navigation overlay */}
            {isPresentationMode && presentationNodeOrder.length > 0 && (
              <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border border-border bg-background/95 px-2 py-1.5 text-sm backdrop-blur">
                <Button variant="ghost" size="sm" onClick={() => goToPresentationIndex(presentationIndex - 1)} disabled={presentationIndex <= 0}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t("prev_node")}
                </Button>
                <div className="px-3 tabular-nums font-medium text-foreground">
                  {t("presentation_counter", { current: presentationIndex + 1, total: presentationNodeOrder.length })}
                </div>
                <Button variant="ghost" size="sm" onClick={() => goToPresentationIndex(presentationIndex + 1)} disabled={presentationIndex >= presentationNodeOrder.length - 1}>
                  {t("next_node")}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                <div className="mx-1 h-3 w-px bg-border" />
                <Button
                  variant={showPropertiesPanel ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowPropertiesPanel((current) => !current)}
                >
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("properties_title")}
                </Button>
                <Button variant="ghost" size="sm" onClick={exitPresentationMode}>
                  {t("exit_presentation")}
                </Button>
                <span className="ml-2 text-[10px] text-muted-foreground hidden sm:inline">{t("presentation_hint")}</span>
              </div>
            )}

            {/* Floating quick actions removed... (per prior) */}

            {/* Context Menu (right click) - kept as simple per-node helper, not the main massive flow editor */}
            {contextMenu && !showAIAssistant && !isPresentationMode && (
              <div
                ref={contextMenuRef}
                className="absolute z-[90] min-w-[200px] rounded-lg border bg-background/95 p-1 shadow-xl backdrop-blur text-sm"
                style={{ left: contextMenu.x + 4, top: contextMenu.y + 4 }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const cnode = nodes.find((n) => n.id === contextMenu.nodeId);
                  if (!cnode) return null;
                  const isEnd = cnode.type === "end";
                  return (
                    <div className="py-0.5">
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {String(cnode.data?.label || cnode.data?.bodyText || cnode.type)} • {cnode.type}
                      </div>
                      <button className="w-full text-left px-3 py-1.5 hover:bg-muted rounded" onClick={() => { setShowPropertiesPanel(true); setContextMenu(null); }}>
                        Editar propiedades
                      </button>
                      <button className="w-full text-left px-3 py-1.5 hover:bg-muted rounded" onClick={() => { setIsPropertiesModalOpen(true); setContextMenu(null); }}>
                        Editar en ventana
                      </button>
                      {!isEnd && (
                        <>
                          <button className="w-full text-left px-3 py-1.5 hover:bg-muted rounded" onClick={() => { quickAppendNode("message"); setContextMenu(null); }}>+ Mensaje después</button>
                          <button className="w-full text-left px-3 py-1.5 hover:bg-muted rounded" onClick={() => { quickAppendNode("delay"); setContextMenu(null); }}>+ Delay después</button>
                          <button className="w-full text-left px-3 py-1.5 hover:bg-muted rounded" onClick={() => { quickAppendNode("end"); setContextMenu(null); }}>+ Terminar después</button>
                        </>
                      )}
                      <div className="border-t my-1" />
                      <button className="w-full text-left px-3 py-1.5 hover:bg-muted rounded text-destructive" onClick={() => removeNodeById(contextMenu.nodeId)}>Eliminar nodo</button>
                      <button className="w-full text-left px-3 py-1 text-[11px] text-muted-foreground hover:bg-muted rounded" onClick={() => setContextMenu(null)}>Cerrar</button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Round floating FAB for "mostrar componentes" (left sidebar) - only when closed, on the lienzo.
                Round, prominent, easy on mobile/desktop. Opens the node palette. */}
            {!showNodeSidebar && (
              <button
                onClick={() => setShowNodeSidebar(true)}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-50 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:bg-primary/90 active:scale-95 transition"
                title={t("show_components") ?? "Mostrar componentes"}
                aria-label={t("show_components") ?? "Mostrar componentes"}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            )}

            {/* View switcher moved to header for clean integration. "Ordenar" is also available from header dropdown. */}

            {/* Incoming links are now rendered as virtual nodes to the left of start (see viewNodes below) */}
          </div>

          {showPropertiesPanel && !showAIAssistant && flowViewMode === 'visual' && (
            <PropertiesPanel
              selectedNode={selectedNode}
              nodes={nodes}
              currentAutomationId={automationId}
              availableAutomations={availableAutomations}
              hasUnsavedChanges={hasUnsavedChanges}
              onNavigateToAutomation={handleNavigateToAutomation}
              onUpdateNode={updateNodeData}
              currentInstanceId={availableAutomations[0]?.instanceId ?? null}
              onSelectNode={(nodeId) => {
                setSelectedNodeIds([nodeId]);
                setShowPropertiesPanel(true);
                const targetNode = nodes.find((n) => n.id === nodeId);
                if (targetNode) {
                  setCenter(targetNode.position.x, targetNode.position.y, { zoom: 1.1, duration: 200 });
                }
              }}
              onClose={() => {
                setSelectedNodeIds([]);
                setShowPropertiesPanel(false);
              }}
            />
          )}
        </div>
      </div>

      <Dialog open={isSavePreviewOpen} onOpenChange={setIsSavePreviewOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("save_preview.title")}</DialogTitle>
            <DialogDescription>
              {t("save_preview.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
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
                <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 pr-2 text-amber-700/90 dark:text-amber-300">
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
                <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 pr-2 text-destructive/90">
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
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("save_preview.ready_title")}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0">
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
        onOpenChange={(open) => {
          setIsSaveAutomationConfirmOpen(open);
          if (!open) setNewSubAutomationName("");
        }}
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

          <div className="space-y-2 py-2">
            <Label htmlFor="subflow-name">{t("bulk_actions.subflow_name_label") || "Nombre del nuevo flujo"}</Label>
            <Input
              id="subflow-name"
              value={newSubAutomationName}
              onChange={(e) => setNewSubAutomationName(e.target.value)}
              placeholder={t("bulk_actions.default_subflow_name") || "Subflujo"}
              disabled={isSavingAutomationSelection}
            />
            <p className="text-[10px] text-muted-foreground">
              {t("bulk_actions.subflow_name_hint") || "Este nombre se usará para la nueva automatización creada a partir de la selección."}
            </p>
          </div>

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
                            <span>{item.customName ?? t(item.labelKey)}</span>
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

      {/* Full screen / modal editor for node (when side panel hidden or explicit expand) */}
      <Dialog open={isPropertiesModalOpen} onOpenChange={setIsPropertiesModalOpen}>
        <DialogContent className="max-w-[95vw] md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[1200px] p-0 overflow-hidden h-[90vh]">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">{t("properties_title")}</div>
            <Button variant="ghost" size="icon" onClick={() => setIsPropertiesModalOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-2 max-h-[70vh] overflow-auto">
            <PropertiesPanel
              variant="modal"
              selectedNode={selectedNode}
              nodes={nodes}
              currentAutomationId={automationId}
              availableAutomations={availableAutomations}
              hasUnsavedChanges={hasUnsavedChanges}
              onNavigateToAutomation={(id) => {
                setIsPropertiesModalOpen(false);
                handleNavigateToAutomation(id);
              }}
              onUpdateNode={updateNodeData}
              currentInstanceId={availableAutomations[0]?.instanceId ?? null}
              onSelectNode={(nodeId) => {
                setSelectedNodeIds([nodeId]);
                setIsPropertiesModalOpen(false);
                setShowPropertiesPanel(true);
                const targetNode = nodes.find((n) => n.id === nodeId);
                if (targetNode) {
                  setCenter(targetNode.position.x, targetNode.position.y, { zoom: 1.1, duration: 200 });
                }
              }}
              onClose={() => setIsPropertiesModalOpen(false)}
            />
          </div>
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
