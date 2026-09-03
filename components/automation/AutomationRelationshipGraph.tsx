"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  Focus,
  Maximize2,
  Minimize2,
  Network,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAutomaticAutomationMapPositions,
  getAutomationMapConnections,
  type AutomationMapConnection,
} from "@/lib/automation/map-layout";
import type { AutomationMapItem } from "./AutomationConnectionsMap";

type RelationshipNodeData = {
  automationId: number;
  name: string;
  isActive: boolean;
  instanceName: string;
  incoming: number;
  outgoing: number;
};

type RelationshipNode = Node<RelationshipNodeData, "automation">;

const GRAPH_NODE_WIDTH = 252;
const GRAPH_NODE_HEIGHT = 86;
const GRAPH_COLUMN_GAP = 148;
const GRAPH_ROW_GAP = 34;

function RelationshipNodeCard({ data, selected }: NodeProps<RelationshipNode>) {
  const t = useTranslations("Automation");
  return (
    <div
      className={[
        "w-[252px] border bg-background text-foreground transition-[border-color,opacity] duration-300",
        selected
          ? "border-primary ring-2 ring-primary/15"
          : "border-border hover:border-primary/50",
      ].join(" ")}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-primary"
      />
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center",
            data.isActive
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-muted/40 text-muted-foreground",
          ].join(" ")}
        >
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{data.name}</span>
          <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
            {data.instanceName}
          </span>
        </span>
        {data.isActive && (
          <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary">
            {t("graph.active")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 border-t border-border text-[9px] text-muted-foreground">
        <span className="border-r border-border px-3 py-1.5">
          {t("relationship_graph.incoming", { count: data.incoming })}
        </span>
        <span className="px-3 py-1.5">
          {t("relationship_graph.outgoing", { count: data.outgoing })}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-primary"
      />
    </div>
  );
}

const relationshipNodeTypes = { automation: RelationshipNodeCard };

function getFocusedAutomationIds(
  focusId: number,
  connections: AutomationMapConnection[],
) {
  const depth = new Map<number, number>([[focusId, 0]]);
  const queue = [focusId];
  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    const currentDepth = depth.get(sourceId) ?? 0;
    if (currentDepth >= 2) continue;
    connections
      .filter((connection) => connection.sourceId === sourceId)
      .forEach((connection) => {
        if (depth.has(connection.targetId)) return;
        depth.set(connection.targetId, currentDepth + 1);
        queue.push(connection.targetId);
      });
  }
  connections
    .filter((connection) => connection.targetId === focusId)
    .forEach((connection) => {
      if (!depth.has(connection.sourceId)) depth.set(connection.sourceId, -1);
    });
  return depth;
}

function getFocusedPositions(
  automations: AutomationMapItem[],
  connections: AutomationMapConnection[],
  focusId: number,
) {
  const depth = getFocusedAutomationIds(focusId, connections);
  const groups = new Map<number, AutomationMapItem[]>();
  automations.forEach((automation) => {
    const level = depth.get(automation.id);
    if (level === undefined) return;
    const group = groups.get(level) ?? [];
    group.push(automation);
    groups.set(level, group);
  });
  groups.forEach((group) =>
    group.sort(
      (a, b) =>
        Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) ||
        a.name.localeCompare(b.name),
    ),
  );
  const columnHeight = (count: number) =>
    count * GRAPH_NODE_HEIGHT + Math.max(0, count - 1) * GRAPH_ROW_GAP;
  const maxHeight = Math.max(
    GRAPH_NODE_HEIGHT,
    ...[...groups.values()].map((group) => columnHeight(group.length)),
  );
  const positions = new Map<number, { x: number; y: number }>();
  groups.forEach((group, level) => {
    const top = 80 + (maxHeight - columnHeight(group.length)) / 2;
    group.forEach((automation, index) => {
      positions.set(automation.id, {
        x: 80 + (level + 1) * (GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP),
        y: top + index * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
      });
    });
  });
  return positions;
}

function RelationshipGraphCanvas({
  automations,
  focusId,
  showAll,
  onFocus,
  onOpen,
}: {
  automations: AutomationMapItem[];
  focusId: number;
  showAll: boolean;
  onFocus: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const { fitView } = useReactFlow<RelationshipNode, Edge>();
  const connections = useMemo(
    () => getAutomationMapConnections(automations),
    [automations],
  );
  const automaticPositions = useMemo(
    () => getAutomaticAutomationMapPositions(automations, connections),
    [automations, connections],
  );
  const focusedPositions = useMemo(
    () => getFocusedPositions(automations, connections, focusId),
    [automations, connections, focusId],
  );
  const visibleIds = useMemo(
    () =>
      showAll
        ? new Set(automations.map((automation) => automation.id))
        : new Set(focusedPositions.keys()),
    [automations, focusedPositions, showAll],
  );
  const counts = useMemo(() => {
    const result = new Map<number, { incoming: number; outgoing: number }>();
    automations.forEach((automation) =>
      result.set(automation.id, { incoming: 0, outgoing: 0 }),
    );
    connections.forEach((connection) => {
      const source = result.get(connection.sourceId);
      const target = result.get(connection.targetId);
      if (source) source.outgoing += 1;
      if (target) target.incoming += 1;
    });
    return result;
  }, [automations, connections]);
  const nodes = useMemo<RelationshipNode[]>(
    () =>
      automations
        .filter((automation) => visibleIds.has(automation.id))
        .map((automation) => {
          const position = showAll
            ? automaticPositions[automation.id]
            : focusedPositions.get(automation.id);
          const count = counts.get(automation.id) ?? { incoming: 0, outgoing: 0 };
          return {
            id: String(automation.id),
            type: "automation",
            position: position ?? { x: 80, y: 80 },
            selected: automation.id === focusId,
            data: {
              automationId: automation.id,
              name: automation.name,
              isActive: automation.isActive,
              instanceName: automation.instance?.instanceName ?? `#${automation.id}`,
              incoming: count.incoming,
              outgoing: count.outgoing,
            },
          };
        }),
    [
      automations,
      automaticPositions,
      counts,
      focusId,
      focusedPositions,
      showAll,
      visibleIds,
    ],
  );
  const edges = useMemo<Edge[]>(
    () =>
      connections
        .filter(
          (connection) =>
            visibleIds.has(connection.sourceId) &&
            visibleIds.has(connection.targetId),
        )
        .map((connection) => {
          const returnsToFocus = connection.targetId === focusId;
          const leavesFocus = connection.sourceId === focusId;
          return {
            id: connection.id,
            source: String(connection.sourceId),
            target: String(connection.targetId),
            type: "smoothstep",
            animated: leavesFocus,
            style: {
              stroke: leavesFocus
                ? "var(--color-primary)"
                : returnsToFocus
                  ? "#6B7280"
                  : "#9CA3AF",
              strokeWidth: leavesFocus ? 2.2 : 1.25,
              strokeDasharray: returnsToFocus ? "5 6" : undefined,
              opacity: leavesFocus || returnsToFocus ? 0.9 : 0.48,
            },
          };
        }),
    [connections, focusId, visibleIds],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => fitView({ padding: 0.22, duration: 480 })),
    );
    return () => cancelAnimationFrame(frame);
  }, [fitView, focusId, showAll]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={relationshipNodeTypes}
      onNodeClick={(_, node) => onFocus(node.data.automationId)}
      onNodeDoubleClick={(_, node) => onOpen(node.data.automationId)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      minZoom={0.18}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="bg-muted/20"
    >
      <Controls className="!rounded-none !border-border !shadow-none [&>button]:!rounded-none [&>button]:!border-border [&>button]:!bg-background" />
      <Background
        variant={BackgroundVariant.Lines}
        gap={28}
        size={0.6}
        color="rgba(128,128,128,.14)"
      />
    </ReactFlow>
  );
}

export function AutomationRelationshipGraph({
  automations,
}: {
  automations: AutomationMapItem[];
}) {
  const t = useTranslations("Automation");
  const router = useRouter();
  const initialFocus =
    automations.find((automation) => automation.isActive)?.id ??
    automations[0]?.id ??
    0;
  const [focusId, setFocusId] = useState(initialFocus);
  const [showAll, setShowAll] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (automations.some((automation) => automation.id === focusId)) return;
    setFocusId(
      automations.find((automation) => automation.isActive)?.id ??
        automations[0]?.id ??
        0,
    );
  }, [automations, focusId]);

  const renderSurface = (isFullscreen: boolean) => (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden border border-border bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Network className="h-4 w-4 text-primary" />
        <label className="flex min-w-0 items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("relationship_graph.focus")}
          </span>
          <select
            value={focusId}
            onChange={(event) => setFocusId(Number(event.target.value))}
            className="h-8 max-w-72 border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {[...automations]
              .sort(
                (a, b) =>
                  Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) ||
                  a.name.localeCompare(b.name),
              )
              .map((automation) => (
                <option key={automation.id} value={automation.id}>
                  {automation.name}
                </option>
              ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant={showAll ? "outline" : "secondary"}
            className="h-8 rounded-none text-xs"
            onClick={() => setShowAll(false)}
          >
            <Focus className="mr-1.5 h-3.5 w-3.5" />
            {t("relationship_graph.context")}
          </Button>
          <Button
            size="sm"
            variant={showAll ? "secondary" : "outline"}
            className="h-8 rounded-none text-xs"
            onClick={() => setShowAll(true)}
          >
            <Network className="mr-1.5 h-3.5 w-3.5" />
            {t("relationship_graph.all")}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-none"
            onClick={() => setFullscreen(!isFullscreen)}
            title={
              isFullscreen
                ? t("graph.exit_fullscreen")
                : t("graph.fullscreen")
            }
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <RelationshipGraphCanvas
            automations={automations}
            focusId={focusId}
            showAll={showAll}
            onFocus={setFocusId}
            onOpen={(id) => router.push(`/automation/${id}`)}
          />
        </ReactFlowProvider>
      </div>
      <div className="shrink-0 border-t border-border px-3 py-1.5 text-[9px] text-muted-foreground">
        {t("relationship_graph.hint")}
      </div>
    </section>
  );

  if (automations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
        {t("relationship_graph.empty")}
      </div>
    );
  }

  return (
    <>
      {renderSurface(false)}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          showCloseButton={false}
          className="!fixed !inset-0 !left-0 !top-0 !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-background p-0"
          style={{ zIndex: 2147483647 }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("relationship_graph.tab")}</DialogTitle>
          </DialogHeader>
          {renderSurface(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}
