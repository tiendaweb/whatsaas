"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { ArrowRight, Bot, GitBranchPlus, List, Maximize2, Minimize2, Minus, Network, Plus, Repeat, RotateCcw, StickyNote, Undo2 } from "lucide-react";
import type { AutomationFlowNode } from "@/lib/automation/flow-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AutomationMapItem = {
  id: number;
  name: string;
  note?: string | null;
  isActive: boolean;
  nodes: unknown;
  instance?: {
    instanceName?: string | null;
  } | null;
};

type AutomationConnectionsMapLabels = {
  title: string;
  description: string;
  noLinks: string;
  linkedCount: string;
  active: string;
  paused: string;
  opensFlow: string;
  resetLayout: string;
  dragHint: string;
  fullscreen: string;
  exitFullscreen: string;
  noteFallback: string;
  legendForward: string;
  legendBack: string;
  viewGraph: string;
  viewList: string;
  sendsTo: string;
  receivesFrom: string;
  returnsBadge: string;
  selfBadge: string;
  noConnections: string;
};

type AutomationConnection = {
  id: string;
  sourceId: number;
  targetId: number;
};

type MapPosition = { x: number; y: number };

const CARD_WIDTH = 260;
const CARD_HEIGHT = 128;
const COLUMN_GAP = 190;
const ROW_GAP = 54;
const PADDING = 48;
// Extra breathing room around the content so cards can be dragged freely
// (más lienzo) without hitting the scroll edges.
const CANVAS_MARGIN = 320;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.15;
const STORAGE_KEY = "whatsaas-automation-map-positions-v1";
const VIEW_MODE_STORAGE_KEY = "whatsaas-automation-map-viewmode-v1";

const BACK_EDGE_BASE_DROP = 56;
const BACK_EDGE_LANE_GAP = 28;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Bézier horizontal estándar: sale por la derecha del origen y entra por la izquierda del destino. */
function getForwardPath(source: MapPosition, target: MapPosition) {
  const startX = source.x + CARD_WIDTH;
  const startY = source.y + CARD_HEIGHT / 2;
  const endX = target.x;
  const endY = target.y + CARD_HEIGHT / 2;
  const curve = Math.max(80, Math.abs(endX - startX) / 2);
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}

/**
 * Back-edge: sale por el borde inferior del origen, rodea por debajo de ambas
 * tarjetas y entra por el borde inferior del destino. laneIndex escalona la
 * profundidad para que varios retornos no se superpongan.
 */
function getBackPath(source: MapPosition, target: MapPosition, laneIndex: number) {
  const startX = source.x + CARD_WIDTH / 2;
  const startY = source.y + CARD_HEIGHT;
  const endX = target.x + CARD_WIDTH / 2;
  const endY = target.y + CARD_HEIGHT;
  const dropY = Math.max(startY, endY) + BACK_EDGE_BASE_DROP + laneIndex * BACK_EDGE_LANE_GAP;
  return `M ${startX} ${startY} C ${startX} ${dropY}, ${endX} ${dropY}, ${endX} ${endY}`;
}

/** Self-loop: óvalo saliente por el borde derecho de la tarjeta. */
function getSelfLoopPath(position: MapPosition, laneIndex: number) {
  const x = position.x + CARD_WIDTH;
  const startY = position.y + CARD_HEIGHT / 2 + 20;
  const endY = position.y + CARD_HEIGHT / 2 - 20;
  const reach = 70 + laneIndex * 20;
  return `M ${x} ${startY} C ${x + reach} ${startY + 40}, ${x + reach} ${endY - 40}, ${x} ${endY}`;
}

function getFlowConnections(automations: AutomationMapItem[]) {
  const automationIds = new Set(automations.map((automation) => automation.id));
  const connections: AutomationConnection[] = [];
  const seen = new Set<string>();

  for (const automation of automations) {
    const nodes = Array.isArray(automation.nodes)
      ? (automation.nodes as AutomationFlowNode[])
      : [];

    for (const node of nodes) {
      if (node.type !== "go_to_node" || node.data?.mode !== "other_flow") {
        continue;
      }

      const targetId = Number(node.data?.targetAutomationId);
      if (!Number.isFinite(targetId) || !automationIds.has(targetId)) {
        continue;
      }

      const connectionId = `${automation.id}-${targetId}`;
      if (seen.has(connectionId)) continue;

      seen.add(connectionId);
      connections.push({
        id: connectionId,
        sourceId: automation.id,
        targetId,
      });
    }
  }

  return connections;
}

function getAutomationLevels(
  automations: AutomationMapItem[],
  connections: AutomationConnection[],
) {
  const levels = new Map<number, number>();
  const incomingCount = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();

  automations.forEach((automation) => {
    levels.set(automation.id, 0);
    incomingCount.set(automation.id, 0);
    outgoing.set(automation.id, []);
    incoming.set(automation.id, []);
  });

  connections.forEach((connection) => {
    // Self-loops don't affect topological depth.
    if (connection.sourceId === connection.targetId) return;
    incomingCount.set(
      connection.targetId,
      (incomingCount.get(connection.targetId) ?? 0) + 1,
    );
    outgoing.get(connection.sourceId)?.push(connection.targetId);
    incoming.get(connection.targetId)?.push(connection.sourceId);
  });

  const processed = new Set<number>();
  const queue: number[] = [];

  const enqueue = (id: number) => {
    if (processed.has(id)) return;
    processed.add(id);
    queue.push(id);
  };

  automations
    .filter((automation) => (incomingCount.get(automation.id) ?? 0) === 0)
    .forEach((automation) => enqueue(automation.id));

  // Kahn + cycle breaking: when the queue drains with unprocessed nodes left
  // (a cycle), force-seed one of them so every automation gets a deterministic
  // level. Prefer a node already reached by a processed predecessor so the
  // cycle continues from where the flow enters it.
  while (processed.size < automations.length) {
    for (let index = 0; index < queue.length; index += 1) {
      const sourceId = queue[index];
      const sourceLevel = levels.get(sourceId) ?? 0;

      for (const targetId of outgoing.get(sourceId) ?? []) {
        // An edge into an already-placed node is the cycle's closing edge:
        // don't bump its level (that's exactly what makes it a back-edge).
        if (processed.has(targetId)) continue;
        levels.set(targetId, Math.max(levels.get(targetId) ?? 0, sourceLevel + 1));
        incomingCount.set(
          targetId,
          Math.max((incomingCount.get(targetId) ?? 1) - 1, 0),
        );
        if ((incomingCount.get(targetId) ?? 0) === 0) enqueue(targetId);
      }
    }
    queue.length = 0;

    if (processed.size >= automations.length) break;

    const remaining = automations.filter((automation) => !processed.has(automation.id));
    const seed =
      remaining.find((automation) =>
        (incoming.get(automation.id) ?? []).some((sourceId) => processed.has(sourceId)),
      ) ?? remaining[0];
    if (!seed) break;
    enqueue(seed.id);
  }

  return levels;
}

type ConnectionKind = "forward" | "back" | "self";

type ClassifiedConnection = AutomationConnection & {
  kind: ConnectionKind;
  laneIndex: number;
};

function classifyConnections(
  connections: AutomationConnection[],
  levels: Map<number, number>,
): ClassifiedConnection[] {
  let backLane = 0;
  let selfLane = 0;

  return connections.map((connection) => {
    if (connection.sourceId === connection.targetId) {
      return { ...connection, kind: "self" as const, laneIndex: selfLane++ };
    }
    const sourceLevel = levels.get(connection.sourceId) ?? 0;
    const targetLevel = levels.get(connection.targetId) ?? 0;
    if (targetLevel <= sourceLevel) {
      return { ...connection, kind: "back" as const, laneIndex: backLane++ };
    }
    return { ...connection, kind: "forward" as const, laneIndex: 0 };
  });
}

function getAutomaticPositions(
  automations: AutomationMapItem[],
  connections: AutomationConnection[],
) {
  const levels = getAutomationLevels(automations, connections);
  const groups = new Map<number, AutomationMapItem[]>();

  automations.forEach((automation) => {
    const level = levels.get(automation.id) ?? 0;
    const group = groups.get(level) ?? [];
    group.push(automation);
    groups.set(level, group);
  });

  Array.from(groups.values()).forEach((group) => {
    group.sort((a, b) => a.name.localeCompare(b.name));
  });

  const positions: Record<number, MapPosition> = {};
  Array.from(groups.entries()).forEach(([level, group]) => {
    group.forEach((automation, index) => {
      positions[automation.id] = {
        x: PADDING + level * (CARD_WIDTH + COLUMN_GAP),
        y: PADDING + index * (CARD_HEIGHT + ROW_GAP),
      };
    });
  });

  return positions;
}

function loadStoredPositions() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, MapPosition>;
  } catch {
    return {};
  }
}

export function AutomationConnectionsMap({
  automations,
  locale,
  labels,
  currentAutomationId,
  className = "",
  viewportClassName = "max-h-[420px]",
  autoCenterOnCurrent = false,
}: {
  automations: AutomationMapItem[];
  locale: string;
  labels: AutomationConnectionsMapLabels;
  currentAutomationId?: number;
  className?: string;
  viewportClassName?: string;
  autoCenterOnCurrent?: boolean;
}) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    origin: MapPosition;
    moved: boolean;
  } | null>(null);

  const connections = useMemo(() => getFlowConnections(automations), [automations]);
  const levelsMap = useMemo(
    () => getAutomationLevels(automations, connections),
    [automations, connections],
  );
  const classifiedConnections = useMemo(
    () => classifyConnections(connections, levelsMap),
    [connections, levelsMap],
  );
  const hasBackConnections = useMemo(
    () => classifiedConnections.some((connection) => connection.kind !== "forward"),
    [classifiedConnections],
  );
  const automationById = useMemo(
    () => new Map(automations.map((automation) => [automation.id, automation] as const)),
    [automations],
  );
  // Índice para la vista lista: conexiones salientes/entrantes por automatización.
  const connectionsByAutomation = useMemo(() => {
    const map = new Map<number, { outgoing: ClassifiedConnection[]; incoming: ClassifiedConnection[] }>();
    automations.forEach((automation) => map.set(automation.id, { outgoing: [], incoming: [] }));
    classifiedConnections.forEach((connection) => {
      map.get(connection.sourceId)?.outgoing.push(connection);
      if (connection.kind !== "self") map.get(connection.targetId)?.incoming.push(connection);
    });
    return map;
  }, [automations, classifiedConnections]);
  // Orden de lectura de la lista: por profundidad en el flujo y luego por nombre.
  const listOrderedAutomations = useMemo(
    () =>
      [...automations].sort(
        (a, b) =>
          (levelsMap.get(a.id) ?? 0) - (levelsMap.get(b.id) ?? 0) || a.name.localeCompare(b.name),
      ),
    [automations, levelsMap],
  );
  const automaticPositions = useMemo(
    () => getAutomaticPositions(automations, connections),
    [automations, connections],
  );
  const [positions, setPositions] = useState<Record<number, MapPosition>>(() => ({
    ...automaticPositions,
    ...loadStoredPositions(),
  }));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<"graph" | "list">(() => {
    if (typeof window === "undefined") return "graph";
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "graph";
  });

  const changeViewMode = (mode: "graph" | "list") => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage no disponible: la preferencia solo dura la sesión.
    }
  };

  const zoomAround = useCallback(
    (nextZoomRaw: number, anchor?: { x: number; y: number }) => {
      const viewport = viewportRef.current;
      setZoom((current) => {
        const nextZoom = clampZoom(nextZoomRaw);
        if (viewport && nextZoom !== current) {
          // Keep the anchor point (defaults to viewport center) visually stable.
          const rect = viewport.getBoundingClientRect();
          const anchorX = anchor ? anchor.x - rect.left : viewport.clientWidth / 2;
          const anchorY = anchor ? anchor.y - rect.top : viewport.clientHeight / 2;
          const contentX = (viewport.scrollLeft + anchorX) / current;
          const contentY = (viewport.scrollTop + anchorY) / current;
          window.requestAnimationFrame(() => {
            viewport.scrollLeft = contentX * nextZoom - anchorX;
            viewport.scrollTop = contentY * nextZoom - anchorY;
          });
        }
        return nextZoom;
      });
    },
    [],
  );

  useEffect(() => {
    const stored = loadStoredPositions();
    const next: Record<number, MapPosition> = {};
    automations.forEach((automation) => {
      next[automation.id] =
        stored[automation.id] ?? positions[automation.id] ?? automaticPositions[automation.id];
    });
    setPositions(next);
    // Keep this tied to the automation set, not every drag update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticPositions, automations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }, [positions]);

  useEffect(() => {
    if (!autoCenterOnCurrent || !currentAutomationId) return;
    const viewport = viewportRef.current;
    const position = positions[currentAutomationId];
    if (!viewport || !position) return;

    const left = Math.max((position.x + CARD_WIDTH / 2) * zoom - viewport.clientWidth / 2, 0);
    const top = Math.max((position.y + CARD_HEIGHT / 2) * zoom - viewport.clientHeight / 2, 0);
    window.requestAnimationFrame(() => {
      viewport.scrollTo({ left, top, behavior: "smooth" });
    });
  }, [autoCenterOnCurrent, currentAutomationId, positions, zoom]);

  const canvasWidth = Math.max(
    900,
    ...Object.values(positions).map((position) => position.x + CARD_WIDTH + CANVAS_MARGIN),
  );
  const canvasHeight = Math.max(
    440,
    ...Object.values(positions).map((position) => position.y + CARD_HEIGHT + CANVAS_MARGIN),
  );

  const resetLayout = () => {
    setPositions(automaticPositions);
    setZoom(1);
  };

  const openAutomation = (automationId: number) => {
    router.push(`/automation/${automationId}`);
  };

  const mapContent = (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-medium text-foreground">{labels.title}</h2>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            <GitBranchPlus className="h-3 w-3" />
            {connections.length > 0 ? labels.linkedCount : labels.noLinks}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-1 flex items-center rounded-md border bg-muted/40 p-0.5">
            <Button
              variant={viewMode === "graph" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => changeViewMode("graph")}
              title={labels.viewGraph}
            >
              <Network className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => changeViewMode("list")}
              title={labels.viewList}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          {viewMode === "graph" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={resetLayout}
              title={labels.resetLayout}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setIsFullscreen(true)}
            title={labels.fullscreen}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {viewMode === "graph" && (
      <div className="relative min-h-0 flex-1">
        <div
          ref={viewportRef}
          className={["h-full overflow-auto bg-muted/20", viewportClassName].join(" ")}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            zoomAround(
              zoom - Math.sign(event.deltaY) * ZOOM_STEP,
              { x: event.clientX, y: event.clientY },
            );
          }}
        >
        <div
          className="relative origin-top-left"
          style={{
            width: canvasWidth * zoom,
            height: canvasHeight * zoom,
          }}
        >
        <div
          className="relative origin-top-left"
          style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="automation-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" className="fill-primary" />
              </marker>
              <marker
                id="automation-arrow-back"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" className="fill-amber-500" />
              </marker>
            </defs>
            {classifiedConnections.map((connection) => {
              const source = positions[connection.sourceId];
              const target = positions[connection.targetId];
              if (!source || !target) return null;

              if (connection.kind === "forward") {
                return (
                  <path
                    key={connection.id}
                    d={getForwardPath(source, target)}
                    className="fill-none stroke-primary/70"
                    strokeWidth="2.5"
                    markerEnd="url(#automation-arrow)"
                  />
                );
              }

              const path =
                connection.kind === "self"
                  ? getSelfLoopPath(source, connection.laneIndex)
                  : getBackPath(source, target, connection.laneIndex);

              return (
                <path
                  key={connection.id}
                  d={path}
                  className="fill-none stroke-amber-500/70"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  markerEnd="url(#automation-arrow-back)"
                />
              );
            })}
          </svg>

          {automations.map((automation) => {
            const position = positions[automation.id] ?? automaticPositions[automation.id] ?? { x: PADDING, y: PADDING };
            const isCurrent = currentAutomationId === automation.id;
            const isDragging = dragRef.current?.id === automation.id;

            return (
              <button
                key={automation.id}
                type="button"
                title={labels.opensFlow}
                className={[
                  "absolute flex cursor-grab flex-col justify-between rounded-lg border bg-card p-3 text-left text-card-foreground shadow-sm transition hover:border-primary/60 hover:shadow-md active:cursor-grabbing",
                  isCurrent ? "border-primary ring-2 ring-primary/20" : "",
                  isDragging ? "z-20 shadow-lg" : "z-10",
                ].join(" ")}
                style={{
                  left: position.x,
                  top: position.y,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    id: automation.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    origin: position,
                    moved: false,
                  };
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.id !== automation.id) return;

                  const deltaX = (event.clientX - drag.startX) / zoom;
                  const deltaY = (event.clientY - drag.startY) / zoom;
                  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                    drag.moved = true;
                  }

                  setPositions((current) => ({
                    ...current,
                    [automation.id]: {
                      x: Math.max(PADDING / 2, drag.origin.x + deltaX),
                      y: Math.max(PADDING / 2, drag.origin.y + deltaY),
                    },
                  }));
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  const drag = dragRef.current;
                  dragRef.current = null;
                  if (!drag?.moved) openAutomation(automation.id);
                }}
              >
                <div className="flex items-start gap-2">
                  <div className={automation.isActive ? "text-green-600" : "text-muted-foreground"}>
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{automation.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {automation.instance?.instanceName ?? `#${automation.id}`}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <StickyNote className="h-3 w-3 shrink-0" />
                    <span className="truncate">{automation.note?.trim() || labels.noteFallback}</span>
                  </div>
                  <div className={automation.isActive ? "text-[11px] font-medium text-green-700" : "text-[11px] text-muted-foreground"}>
                    {automation.isActive ? labels.active : labels.paused}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        </div>
        </div>

        {hasBackConnections && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex flex-col gap-1.5 rounded-lg border bg-background/90 p-2 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <svg width="28" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="27" y2="4" className="stroke-primary/70" strokeWidth="2.5" />
              </svg>
              <span className="text-[10px] text-muted-foreground">{labels.legendForward}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="28" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="27" y2="4" className="stroke-amber-500/80" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <span className="text-[10px] text-muted-foreground">{labels.legendBack}</span>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="pointer-events-auto h-7 w-7 text-muted-foreground"
            onClick={() => zoomAround(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom +"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <span className="select-none text-[10px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="pointer-events-auto h-7 w-7 text-muted-foreground"
            onClick={() => zoomAround(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom -"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      )}

      {viewMode === "list" && (
        <div className={["min-h-0 flex-1 overflow-auto bg-muted/20 p-3", viewportClassName].join(" ")}>
          <div className="flex flex-col gap-2">
            {listOrderedAutomations.map((automation) => {
              const lists = connectionsByAutomation.get(automation.id) ?? { outgoing: [], incoming: [] };
              const isCurrent = currentAutomationId === automation.id;
              const level = levelsMap.get(automation.id) ?? 0;
              const hasAny = lists.outgoing.length > 0 || lists.incoming.length > 0;

              const renderChip = (connection: ClassifiedConnection, direction: "out" | "in") => {
                const otherId = direction === "out" ? connection.targetId : connection.sourceId;
                const other = automationById.get(otherId);
                if (!other) return null;
                const isReturn = connection.kind !== "forward";
                return (
                  <button
                    key={`${direction}-${connection.id}`}
                    type="button"
                    onClick={() => openAutomation(otherId)}
                    title={labels.opensFlow}
                    className={[
                      "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition hover:shadow-sm",
                      isReturn
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:border-amber-500/70"
                        : "border-primary/30 bg-primary/5 text-foreground hover:border-primary/60",
                    ].join(" ")}
                  >
                    {connection.kind === "self" ? (
                      <Repeat className="h-3 w-3 shrink-0" />
                    ) : isReturn ? (
                      <Undo2 className="h-3 w-3 shrink-0" />
                    ) : (
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {connection.kind === "self" ? labels.selfBadge : other.name}
                    </span>
                    {connection.kind === "back" && (
                      <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[9px] font-medium uppercase tracking-wide">
                        {labels.returnsBadge}
                      </span>
                    )}
                  </button>
                );
              };

              return (
                <div
                  key={automation.id}
                  className={[
                    "rounded-lg border bg-card p-3 shadow-sm",
                    isCurrent ? "border-primary/60 ring-1 ring-primary/30" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {level + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => openAutomation(automation.id)}
                      title={labels.opensFlow}
                      className="min-w-0 truncate text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {automation.name}
                    </button>
                    <span
                      className={[
                        "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                        automation.isActive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      ].join(" ")}
                    >
                      <span className={["h-1.5 w-1.5 rounded-full", automation.isActive ? "bg-emerald-500" : "bg-muted-foreground/50"].join(" ")} />
                      {automation.isActive ? labels.active : labels.paused}
                    </span>
                  </div>

                  {hasAny ? (
                    <div className="mt-2 space-y-1.5">
                      {lists.outgoing.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {labels.sendsTo}
                          </span>
                          {lists.outgoing.map((connection) => renderChip(connection, "out"))}
                        </div>
                      )}
                      {lists.incoming.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {labels.receivesFrom}
                          </span>
                          {lists.incoming.map((connection) => renderChip(connection, "in"))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground">{labels.noConnections}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <section className={["flex shrink-0 flex-col overflow-hidden rounded-lg border bg-background", className].join(" ")}>
      {mapContent}

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="h-[96vh] max-w-[98vw] gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{labels.title}</DialogTitle>
          </DialogHeader>
          <section className="flex h-full min-h-0 flex-col bg-background">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">{labels.title}</h2>
                <p className="text-xs text-muted-foreground">{labels.dragHint}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
                <Minimize2 className="h-3.5 w-3.5" />
                {labels.exitFullscreen}
              </Button>
            </div>
            <AutomationConnectionsMap
              automations={automations}
              locale={locale}
              labels={labels}
              currentAutomationId={currentAutomationId}
              className="min-h-0 flex-1 flex-col border-0"
              viewportClassName="min-h-0 flex-1"
              autoCenterOnCurrent={autoCenterOnCurrent}
            />
          </section>
        </DialogContent>
      </Dialog>
    </section>
  );
}
