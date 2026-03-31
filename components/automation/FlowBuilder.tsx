"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  ChevronDown,
  Save,
  Loader2,
  PlayCircle,
  PauseCircle,
  LayoutGrid,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
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
import { Sidebar } from "./Sidebar";
import { PropertiesPanel } from "./PropertiesPanel";
import {
  generateAutomationFlow,
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
import { createAutomationCanvasNode } from "@/lib/automation/node-catalog";
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
};

interface FlowBuilderProps {
  automationId: number;
  initialNodes: AutomationCanvasNode[];
  initialEdges: AutomationCanvasEdge[];
  initialActive: boolean;
  isAIFlowGeneratorEnabled: boolean;
}

const proOptions: ProOptions = { hideAttribution: true };
const CONTROL_STACK_HEIGHT = 116;
const OVERLAY_GAP = 16;
const HORIZONTAL_SPACING = 380;
const VERTICAL_SPACING = 170;
const LIST_VERTICAL_SPACING = 50;
const DEFAULT_NODE_HEIGHT = 120;
const ORTHOGONAL_GRID_SIZE = 80;

type InsertMode = "replace" | "insert";
type ArrangeMode =
  | "hierarchy_ignore_back_edges"
  | "straight_lines"
  | "spaced_tree"
  | "vertical_list";

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

const MIN_GENERATOR_TOKENS = 128;
const MAX_GENERATOR_TOKENS = 4096;
const DEFAULT_GENERATOR_TOKENS = 1200;
const GENERATOR_TOKEN_RANGE_HINT = "Rango permitido: 128–4096";
const GENERATOR_TOKEN_PRESETS = [512, 1024, 2048, 4096] as const;

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
}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
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

  for (const node of nodes) {
    incomingAll.set(node.id, []);
    outgoingAll.set(node.id, []);
    incomingDAG.set(node.id, []);
    outgoingDAG.set(node.id, []);
  }

  for (const edge of edges) {
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

  for (const edge of edges) {
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
    return arrangedPositions;
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
    return arrangedPositions;
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
    return arrangedPositions;
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
  return arrangedPositions;
}

function FlowBuilderContent({
  automationId,
  initialNodes,
  initialEdges,
  initialActive,
  isAIFlowGeneratorEnabled,
}: FlowBuilderProps) {
  const t = useTranslations("Automation");
  const locale = useLocale();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<AutomationCanvasNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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

  const { screenToFlowPosition, toObject, fitView } = useReactFlow();

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
    !selectedNodeId;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
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
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
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
    },
    [screenToFlowPosition, setNodes],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: AutomationCanvasNode) => {
      setSelectedNodeId(node.id);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
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
  };

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

    const arrangedPositions = getArrangementPositions({ nodes, edges, mode });

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        position: arrangedPositions.get(node.id) ?? node.position,
      })),
    );

    requestAnimationFrame(() => {
      fitView({
        padding: 0.2,
        duration: 350,
      });
    });
  }, [edges, fitView, nodes, setNodes]);

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
      setSelectedNodeId(null);
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

  const bgColor = isDarkMode ? "#020617" : "#f8fafc";
  const dotColor = isDarkMode ? "#334155" : "#cbd5e1";
  const isShortViewport = viewportSize.height > 0 && viewportSize.height < 820;
  const isCompactViewport = viewportSize.width > 0 && viewportSize.width < 1440;
  const miniMapHeight = isShortViewport ? 96 : 136;
  const miniMapWidth = isShortViewport ? 150 : isCompactViewport ? 180 : 220;
  const miniMapBottomOffset = CONTROL_STACK_HEIGHT + OVERLAY_GAP + 16;

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
    left: 16,
    bottom: miniMapBottomOffset,
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
              </DropdownMenuContent>
            </DropdownMenu>
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

        <div className="flex min-h-0 min-w-0 w-full flex-1">
          <Sidebar />

          <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
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
          </div>

          <PropertiesPanel
            selectedNode={selectedNode}
            onUpdateNode={updateNodeData}
            onClose={() => setSelectedNodeId(null)}
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
                <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive/90">
                  {savePreviewErrors.map((error, index) => (
                    <li key={`${error}-${index}`}>{error}</li>
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
