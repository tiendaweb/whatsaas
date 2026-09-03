"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Bot,
  GitBranchPlus,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  Plus,
  Repeat,
  RotateCcw,
  StickyNote,
  Undo2,
} from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AUTOMATION_CANVAS_BOTTOM_SPACE,
  AUTOMATION_CANVAS_SIDE_SPACE,
  AUTOMATION_CANVAS_TOP_SPACE,
  AUTOMATION_CARD_HEIGHT,
  AUTOMATION_CARD_WIDTH,
  type AutomationMapConnection,
  type AutomationMapPosition,
  type ClassifiedAutomationConnection,
  classifyAutomationMapConnections,
  getAutomaticAutomationMapPositions,
  getAutomationMapConnections,
  getAutomationMapLevels,
  getBackAutomationPath,
  getForwardAutomationPath,
  getSameLevelAutomationPath,
  getSelfAutomationPath,
} from "@/lib/automation/map-layout";

export type AutomationMapItem = {
  id: number;
  name: string;
  note?: string | null;
  isActive: boolean;
  nodes: unknown;
  folderId?: number | null;
  instance?: { instanceName?: string | null } | null;
};

export type AutomationConnectionsMapLabels = {
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
  legendSameLevel?: string;
  viewGraph: string;
  viewList: string;
  sendsTo: string;
  receivesFrom: string;
  returnsBadge: string;
  selfBadge: string;
  noConnections: string;
  currentFlow?: string;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.14;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const CANVAS_PAN_GUTTER = 1280;
const POSITION_STORAGE_PREFIX = "whatsaas-automation-map-positions-v5";
const VIEW_STORAGE_KEY = "whatsaas-automation-map-viewmode-v2";
const CURRENT_FLOW_COLUMN_GAP = 220;
const CURRENT_FLOW_ROW_GAP = 52;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function loadPositions(storageKey: string) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Record<number, AutomationMapPosition>) : {};
  } catch {
    return {};
  }
}

function getCurrentFlowPositions(
  automations: AutomationMapItem[],
  connections: AutomationMapConnection[],
  currentAutomationId: number,
) {
  const outgoingIds = new Set(
    connections
      .filter(
        (connection) =>
          connection.sourceId === currentAutomationId &&
          connection.targetId !== currentAutomationId,
      )
      .map((connection) => connection.targetId),
  );
  const incomingIds = new Set(
    connections
      .filter(
        (connection) =>
          connection.targetId === currentAutomationId &&
          connection.sourceId !== currentAutomationId &&
          !outgoingIds.has(connection.sourceId),
      )
      .map((connection) => connection.sourceId),
  );
  const byName = (a: AutomationMapItem, b: AutomationMapItem) =>
    a.name.localeCompare(b.name);
  const incoming = automations
    .filter((automation) => incomingIds.has(automation.id))
    .sort(byName);
  const outgoing = automations
    .filter((automation) => outgoingIds.has(automation.id))
    .sort(byName);
  const rowStep = AUTOMATION_CARD_HEIGHT + CURRENT_FLOW_ROW_GAP;
  const maxRows = Math.max(1, incoming.length, outgoing.length);
  const fullHeight =
    maxRows * AUTOMATION_CARD_HEIGHT +
    Math.max(0, maxRows - 1) * CURRENT_FLOW_ROW_GAP;
  const centerY =
    AUTOMATION_CANVAS_TOP_SPACE + (fullHeight - AUTOMATION_CARD_HEIGHT) / 2;
  const centerX =
    AUTOMATION_CANVAS_SIDE_SPACE + AUTOMATION_CARD_WIDTH + CURRENT_FLOW_COLUMN_GAP;
  const positions: Record<number, AutomationMapPosition> = {
    [currentAutomationId]: { x: centerX, y: centerY },
  };
  const placeColumn = (items: AutomationMapItem[], x: number) => {
    const columnHeight =
      items.length * AUTOMATION_CARD_HEIGHT +
      Math.max(0, items.length - 1) * CURRENT_FLOW_ROW_GAP;
    const top = AUTOMATION_CANVAS_TOP_SPACE + (fullHeight - columnHeight) / 2;
    items.forEach((automation, index) => {
      positions[automation.id] = { x, y: top + index * rowStep };
    });
  };

  placeColumn(incoming, AUTOMATION_CANVAS_SIDE_SPACE);
  placeColumn(
    outgoing,
    centerX + AUTOMATION_CARD_WIDTH + CURRENT_FLOW_COLUMN_GAP,
  );
  return positions;
}

export function AutomationConnectionsMap({
  automations,
  labels,
  currentAutomationId,
  className = "",
  viewportClassName = "max-h-[460px]",
  autoCenterOnCurrent = false,
  scopeKey = "all",
  focusCurrentOnly = false,
}: {
  automations: AutomationMapItem[];
  locale: string;
  labels: AutomationConnectionsMapLabels;
  currentAutomationId?: number;
  className?: string;
  viewportClassName?: string;
  autoCenterOnCurrent?: boolean;
  scopeKey?: string;
  focusCurrentOnly?: boolean;
}) {
  const router = useRouter();
  const markerId = useId().replaceAll(":", "");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    origin: AutomationMapPosition;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const zoomRef = useRef(1);
  const autoCenteredKeyRef = useRef<string | null>(null);
  const pendingFitRef = useRef(false);
  const hasFocusedCurrent =
    focusCurrentOnly &&
    currentAutomationId !== undefined &&
    automations.some((automation) => automation.id === currentAutomationId);
  const storageKey = `${POSITION_STORAGE_PREFIX}:${
    hasFocusedCurrent ? `current-${currentAutomationId}` : scopeKey
  }`;

  const allConnections = useMemo(
    () => getAutomationMapConnections(automations),
    [automations],
  );
  const connections = useMemo(
    () =>
      hasFocusedCurrent
        ? allConnections.filter(
            (connection) =>
              connection.sourceId === currentAutomationId ||
              connection.targetId === currentAutomationId,
          )
        : allConnections,
    [allConnections, currentAutomationId, hasFocusedCurrent],
  );
  const mapAutomations = useMemo(() => {
    if (!hasFocusedCurrent) return automations;
    const visibleIds = new Set<number>([currentAutomationId]);
    connections.forEach((connection) => {
      visibleIds.add(connection.sourceId);
      visibleIds.add(connection.targetId);
    });
    return automations.filter((automation) => visibleIds.has(automation.id));
  }, [automations, connections, currentAutomationId, hasFocusedCurrent]);
  const levels = useMemo(
    () => {
      if (!hasFocusedCurrent) {
        return getAutomationMapLevels(mapAutomations, connections);
      }
      const focusedLevels = new Map<number, number>();
      mapAutomations.forEach((automation) => {
        const isOutgoing = connections.some(
          (connection) =>
            connection.sourceId === currentAutomationId &&
            connection.targetId === automation.id &&
            automation.id !== currentAutomationId,
        );
        focusedLevels.set(
          automation.id,
          automation.id === currentAutomationId ? 1 : isOutgoing ? 2 : 0,
        );
      });
      return focusedLevels;
    }, [connections, currentAutomationId, hasFocusedCurrent, mapAutomations],
  );
  const classified = useMemo(
    () => classifyAutomationMapConnections(connections, levels),
    [connections, levels],
  );
  const automaticPositions = useMemo(
    () =>
      hasFocusedCurrent
        ? getCurrentFlowPositions(
            mapAutomations,
            connections,
            currentAutomationId,
          )
        : getAutomaticAutomationMapPositions(mapAutomations, connections),
    [connections, currentAutomationId, hasFocusedCurrent, mapAutomations],
  );
  const automationById = useMemo(
    () =>
      new Map(mapAutomations.map((automation) => [automation.id, automation])),
    [mapAutomations],
  );
  const connectionsByAutomation = useMemo(() => {
    const result = new Map<
      number,
      { outgoing: ClassifiedAutomationConnection[]; incoming: ClassifiedAutomationConnection[] }
    >();
    mapAutomations.forEach((automation) =>
      result.set(automation.id, { outgoing: [], incoming: [] }),
    );
    classified.forEach((connection) => {
      result.get(connection.sourceId)?.outgoing.push(connection);
      if (connection.kind !== "self") {
        result.get(connection.targetId)?.incoming.push(connection);
      }
    });
    return result;
  }, [classified, mapAutomations]);
  const listItems = useMemo(
    () =>
      [...mapAutomations].sort(
        (a, b) =>
          (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [levels, mapAutomations],
  );

  const [positions, setPositions] = useState<Record<number, AutomationMapPosition>>(
    () => ({
      ...automaticPositions,
      ...(hasFocusedCurrent ? {} : loadPositions(storageKey)),
    }),
  );
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredAutomationId, setHoveredAutomationId] = useState<number | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<"graph" | "list">(() => {
    if (typeof window === "undefined") return "graph";
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list"
      ? "list"
      : "graph";
  });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (hasFocusedCurrent) {
      setPositions({ ...automaticPositions });
      return;
    }
    const stored = loadPositions(storageKey);
    setPositions((current) => {
      const next: Record<number, AutomationMapPosition> = {};
      mapAutomations.forEach((automation) => {
        next[automation.id] =
          stored[automation.id] ??
          current[automation.id] ??
          automaticPositions[automation.id];
      });
      return next;
    });
  }, [automaticPositions, hasFocusedCurrent, mapAutomations, storageKey]);

  useEffect(() => {
    if (hasFocusedCurrent) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(positions));
    } catch {
      // The layout still works when storage is unavailable.
    }
  }, [hasFocusedCurrent, positions, storageKey]);

  const backLaneCount = classified.filter(
    (connection) => connection.kind === "back",
  ).length;
  const furthestRight = Math.max(
    720,
    ...Object.values(positions).map(
      (position) =>
        position.x + AUTOMATION_CARD_WIDTH + AUTOMATION_CANVAS_SIDE_SPACE,
    ),
  );
  const furthestBottom = Math.max(
    520,
    ...Object.values(positions).map(
      (position) =>
        position.y +
        AUTOMATION_CARD_HEIGHT +
        AUTOMATION_CANVAS_BOTTOM_SPACE +
        backLaneCount * 24,
    ),
  );
  const canvasWidth = furthestRight;
  const canvasHeight = furthestBottom;
  const contentBounds = useMemo(() => {
    const values = Object.values(positions);
    if (values.length === 0) {
      return { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
    }
    return {
      left: Math.max(0, Math.min(...values.map((position) => position.x)) - 72),
      top: Math.max(0, Math.min(...values.map((position) => position.y)) - 72),
      right: Math.min(
        canvasWidth,
        Math.max(...values.map((position) => position.x + AUTOMATION_CARD_WIDTH)) +
          176,
      ),
      bottom: Math.min(
        canvasHeight,
        Math.max(...values.map((position) => position.y + AUTOMATION_CARD_HEIGHT)) +
          112 +
          backLaneCount * 24,
      ),
    };
  }, [backLaneCount, canvasHeight, canvasWidth, positions]);

  const zoomAround = useCallback(
    (
      nextValue: number | ((current: number) => number),
      anchor?: { x: number; y: number },
    ) => {
      const viewport = viewportRef.current;
      setZoom((current) => {
        const next = clampZoom(
          typeof nextValue === "function" ? nextValue(current) : nextValue,
        );
        if (viewport && next !== current) {
          const rect = viewport.getBoundingClientRect();
          const anchorX = anchor ? anchor.x - rect.left : viewport.clientWidth / 2;
          const anchorY = anchor ? anchor.y - rect.top : viewport.clientHeight / 2;
          const contentX =
            (viewport.scrollLeft + anchorX - CANVAS_PAN_GUTTER) / current;
          const contentY =
            (viewport.scrollTop + anchorY - CANVAS_PAN_GUTTER) / current;
          requestAnimationFrame(() => {
            viewport.scrollLeft =
              CANVAS_PAN_GUTTER + contentX * next - anchorX;
            viewport.scrollTop =
              CANVAS_PAN_GUTTER + contentY * next - anchorY;
          });
        }
        zoomRef.current = next;
        return next;
      });
    },
    [],
  );

  const fitMap = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const contentWidth = Math.max(contentBounds.right - contentBounds.left, 1);
    const contentHeight = Math.max(contentBounds.bottom - contentBounds.top, 1);
    const padding = isFullscreen ? 44 : 28;
    const next = clampZoom(
      Math.min(
        isFullscreen ? 0.96 : 0.78,
        (viewport.clientWidth - padding * 2) / contentWidth,
        (viewport.clientHeight - padding * 2) / contentHeight,
      ),
    );
    setZoom(next);
    zoomRef.current = next;
    requestAnimationFrame(() =>
      viewport.scrollTo({
        left:
          CANVAS_PAN_GUTTER +
          ((contentBounds.left + contentBounds.right) / 2) * next -
          viewport.clientWidth / 2,
        top:
          CANVAS_PAN_GUTTER +
          ((contentBounds.top + contentBounds.bottom) / 2) * next -
          viewport.clientHeight / 2,
      }),
    );
  }, [contentBounds, isFullscreen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const frame = requestAnimationFrame(() => {
      fitMap();
    });
    return () => cancelAnimationFrame(frame);
    // Establish a centered starting view for each independently stored scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!pendingFitRef.current) return;
    pendingFitRef.current = false;
    const frame = requestAnimationFrame(fitMap);
    return () => cancelAnimationFrame(frame);
  }, [fitMap, positions]);

  useEffect(() => {
    if (!isFullscreen) return;
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(fitMap);
      return () => cancelAnimationFrame(second);
    });
    return () => cancelAnimationFrame(first);
  }, [fitMap, isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || viewMode !== "graph") return;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitMap);
    });
    observer.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitMap, isFullscreen, viewMode]);

  useEffect(() => {
    if (!autoCenterOnCurrent || !currentAutomationId) return;
    const viewport = viewportRef.current;
    const position = positions[currentAutomationId];
    if (!viewport || !position) return;
    const centerKey = `${storageKey}:${currentAutomationId}`;
    if (autoCenteredKeyRef.current === centerKey) return;
    autoCenteredKeyRef.current = centerKey;
    const currentZoom = zoomRef.current;
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left:
          CANVAS_PAN_GUTTER +
          (position.x + AUTOMATION_CARD_WIDTH / 2) * currentZoom -
          viewport.clientWidth / 2,
        top:
          CANVAS_PAN_GUTTER +
          (position.y + AUTOMATION_CARD_HEIGHT / 2) * currentZoom -
          viewport.clientHeight / 2,
        behavior: "smooth",
      });
    });
  }, [autoCenterOnCurrent, currentAutomationId, positions, storageKey]);

  const changeViewMode = (mode: "graph" | "list") => {
    setViewMode(mode);
    if (mode === "graph") {
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (viewport && viewport.scrollLeft === 0) fitMap();
      });
    }
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Session-only fallback.
    }
  };

  const openAutomation = (automationId: number) => {
    router.push(`/automation/${automationId}`);
  };

  const edgePath = (
    connection: ClassifiedAutomationConnection,
    source: AutomationMapPosition,
    target: AutomationMapPosition,
  ) => {
    if (connection.kind === "forward") return getForwardAutomationPath(source, target);
    if (connection.kind === "same-level") {
      return getSameLevelAutomationPath(source, target, connection.laneIndex);
    }
    if (connection.kind === "self") {
      return getSelfAutomationPath(source, connection.laneIndex);
    }
    return getBackAutomationPath(source, target, connection.laneIndex);
  };

  const renderGraph = (fullscreen: boolean) => (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={fullscreen || !isFullscreen ? viewportRef : undefined}
        className={[
          "h-full select-none overflow-auto overscroll-contain bg-muted/20 text-foreground",
          isPanning ? "cursor-grabbing" : "cursor-grab",
          fullscreen ? "min-h-0 flex-1" : viewportClassName,
        ].join(" ")}
        style={{
          backgroundImage:
            "linear-gradient(rgba(128,128,128,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          touchAction: "none",
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("button,[data-map-control]") ||
            (event.button !== 0 && event.button !== 1)
          ) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
          };
          setIsPanning(true);
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan) return;
          event.currentTarget.scrollLeft =
            pan.scrollLeft - (event.clientX - pan.startX);
          event.currentTarget.scrollTop =
            pan.scrollTop - (event.clientY - pan.startY);
        }}
        onPointerUp={(event) => {
          if (!panRef.current) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          panRef.current = null;
          setIsPanning(false);
        }}
        onPointerCancel={() => {
          panRef.current = null;
          setIsPanning(false);
        }}
        onLostPointerCapture={() => {
          panRef.current = null;
          setIsPanning(false);
        }}
        onWheel={(event) => {
          event.preventDefault();
          zoomAround(
            (current) =>
              current * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
            {
              x: event.clientX,
              y: event.clientY,
            },
          );
        }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: canvasWidth * zoom + CANVAS_PAN_GUTTER * 2,
            height: canvasHeight * zoom + CANVAS_PAN_GUTTER * 2,
          }}
        >
          <div
            className="absolute origin-top-left"
            style={{
              left: CANVAS_PAN_GUTTER,
              top: CANVAS_PAN_GUTTER,
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
            }}
          >
            {hasFocusedCurrent &&
              ([0, 1, 2] as const).map((level) => {
                const columnItems = mapAutomations.filter(
                  (automation) => levels.get(automation.id) === level,
                );
                const columnPositions = columnItems
                  .map((automation) => positions[automation.id])
                  .filter((position): position is AutomationMapPosition =>
                    Boolean(position),
                  );
                if (columnPositions.length === 0) return null;
                const label =
                  level === 0
                    ? labels.receivesFrom
                    : level === 1
                      ? labels.currentFlow
                      : labels.sendsTo;
                if (!label) return null;
                return (
                  <div
                    key={level}
                    className="pointer-events-none absolute z-[5] border-b border-border/80 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                    style={{
                      left: Math.min(
                        ...columnPositions.map((position) => position.x),
                      ),
                      top:
                        Math.min(
                          ...columnPositions.map((position) => position.y),
                        ) - 36,
                      width: AUTOMATION_CARD_WIDTH,
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              aria-hidden="true"
            >
              <defs>
                {[
                  ["forward", "fill-primary"],
                  ["same", "fill-muted-foreground"],
                  ["back", "fill-muted-foreground"],
                ].map(([name, markerClassName]) => (
                  <marker
                    key={name}
                    id={`${markerId}-${name}-${fullscreen ? "full" : "base"}`}
                    markerWidth="9"
                    markerHeight="9"
                    refX="8"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path
                      d="M0,0 L0,8 L8,4 z"
                      className={markerClassName}
                    />
                  </marker>
                ))}
              </defs>
              {classified.map((connection) => {
                const source = positions[connection.sourceId];
                const target = positions[connection.targetId];
                if (!source || !target) return null;
                const related =
                  hoveredAutomationId === null ||
                  hoveredAutomationId === connection.sourceId ||
                  hoveredAutomationId === connection.targetId;
                const palette =
                  connection.kind === "forward"
                    ? { className: "stroke-primary", marker: "forward", dash: undefined }
                    : connection.kind === "same-level"
                      ? { className: "stroke-muted-foreground", marker: "same", dash: undefined }
                      : { className: "stroke-muted-foreground", marker: "back", dash: "7 7" };
                return (
                  <path
                    key={connection.id}
                    d={edgePath(connection, source, target)}
                    fill="none"
                    strokeWidth={related ? 2.5 : 1.5}
                    strokeDasharray={palette.dash}
                    strokeLinecap="round"
                    opacity={related ? 0.78 : 0.14}
                    markerEnd={`url(#${markerId}-${palette.marker}-${fullscreen ? "full" : "base"})`}
                    className={`${palette.className} transition-[opacity,stroke-width] duration-200`}
                  />
                );
              })}
            </svg>

            {mapAutomations.map((automation) => {
              const position = positions[automation.id] ??
                automaticPositions[automation.id] ?? {
                  x: AUTOMATION_CANVAS_SIDE_SPACE,
                  y: 176,
                };
              const isCurrent = currentAutomationId === automation.id;
              const faded =
                hoveredAutomationId !== null &&
                hoveredAutomationId !== automation.id &&
                !classified.some(
                  (connection) =>
                    (connection.sourceId === hoveredAutomationId &&
                      connection.targetId === automation.id) ||
                    (connection.targetId === hoveredAutomationId &&
                      connection.sourceId === automation.id),
                );
              return (
                <button
                  key={automation.id}
                  type="button"
                  title={labels.opensFlow}
                  className={[
                    "absolute z-10 flex cursor-grab flex-col justify-between rounded-md border border-border bg-card p-4 text-left text-card-foreground transition-[opacity,border-color,box-shadow] hover:border-primary/60 hover:ring-1 hover:ring-primary/15 active:cursor-grabbing",
                    isCurrent
                      ? "border-primary bg-primary/[0.035] ring-2 ring-primary/15"
                      : "",
                    faded ? "opacity-45" : "opacity-100",
                  ].join(" ")}
                  style={{
                    left: position.x,
                    top: position.y,
                    width: AUTOMATION_CARD_WIDTH,
                    height: AUTOMATION_CARD_HEIGHT,
                  }}
                  onPointerEnter={() => setHoveredAutomationId(automation.id)}
                  onPointerLeave={() => setHoveredAutomationId(null)}
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
                    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) drag.moved = true;
                    setPositions((current) => ({
                      ...current,
                      [automation.id]: {
                        x: Math.max(56, drag.origin.x + deltaX),
                        y: Math.max(72, drag.origin.y + deltaY),
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
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
                        automation.isActive
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted text-muted-foreground",
                      ].join(" ")}
                    >
                      <Bot className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {automation.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] opacity-60">
                        {automation.instance?.instanceName ?? `#${automation.id}`}
                      </span>
                      {isCurrent && labels.currentFlow && (
                        <span className="mt-1.5 inline-flex border-l-2 border-primary pl-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                          {labels.currentFlow}
                        </span>
                      )}
                    </span>
                    <span
                      className={[
                        "ml-auto mt-1 h-2 w-2 shrink-0 rounded-full",
                        automation.isActive ? "bg-primary" : "bg-muted-foreground/50",
                      ].join(" ")}
                    />
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] opacity-60">
                    <StickyNote className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {automation.note?.trim() || labels.noteFallback}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div data-map-control className="pointer-events-none absolute bottom-3 left-3 z-30 hidden items-center gap-3 rounded-lg border border-border bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur-md md:flex">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-primary" />
          {labels.legendForward}
        </span>
        {!hasFocusedCurrent && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-muted-foreground" />
            {labels.legendSameLevel ?? labels.legendForward}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-muted-foreground/60" />
          {labels.legendBack}
        </span>
      </div>

      <div data-map-control className="absolute bottom-3 right-3 z-30 flex items-center rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md text-foreground"
          onClick={() => zoomAround((current) => current - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-11 text-center text-[10px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md text-foreground"
          onClick={() => zoomAround((current) => current + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  const renderList = () => (
    <div className={["min-h-0 flex-1 overflow-auto bg-muted/20 p-3 pt-14 text-foreground", viewportClassName].join(" ")}>
      <div className="space-y-2">
        {listItems.map((automation) => {
          const itemConnections = connectionsByAutomation.get(automation.id) ?? {
            outgoing: [],
            incoming: [],
          };
          return (
            <div
              key={automation.id}
              className="rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted text-xs font-semibold text-foreground">
                  {(levels.get(automation.id) ?? 0) + 1}
                </span>
                <button
                  type="button"
                  onClick={() => openAutomation(automation.id)}
                  className="min-w-0 truncate text-left text-sm font-semibold hover:underline"
                >
                  {automation.name}
                </button>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {automation.isActive ? labels.active : labels.paused}
                </span>
              </div>
              {itemConnections.outgoing.length + itemConnections.incoming.length === 0 ? (
                <p className="mt-2 pl-9 text-[11px] text-muted-foreground">
                  {labels.noConnections}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                  {itemConnections.outgoing.map((connection) => {
                    const target = automationById.get(connection.targetId);
                    if (!target) return null;
                    const Icon =
                      connection.kind === "self"
                        ? Repeat
                        : connection.kind === "back"
                          ? Undo2
                          : connection.kind === "same-level"
                            ? ArrowDownUp
                            : ArrowRight;
                    return (
                      <button
                        key={`out-${connection.id}`}
                        type="button"
                        onClick={() => openAutomation(target.id)}
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] transition-colors hover:border-primary/40"
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {connection.kind === "self" ? labels.selfBadge : target.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSurface = (fullscreen: boolean) => (
    <section
      className={[
        "relative flex min-h-0 flex-col overflow-hidden bg-background text-foreground",
        fullscreen ? "h-full border-0" : "h-full rounded-xl border border-border",
      ].join(" ")}
    >
      <div
        data-map-control
        className="absolute right-3 top-3 z-40 flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur-md"
      >
          <span
            className="hidden items-center gap-1.5 px-2 text-[10px] text-muted-foreground sm:inline-flex"
            title={labels.title}
          >
            <GitBranchPlus className="h-3 w-3" />
            {connections.length}
          </span>
          <div className="flex items-center rounded-md bg-muted/60 p-0.5">
            <Button
              variant={viewMode === "graph" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => changeViewMode("graph")}
              title={labels.viewGraph}
            >
              <Network className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-md"
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
              className="h-8 w-8 rounded-md"
              onClick={() => {
                pendingFitRef.current = true;
                setPositions({ ...automaticPositions });
              }}
              title={labels.resetLayout}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            onClick={() => setIsFullscreen(!fullscreen)}
            title={fullscreen ? labels.exitFullscreen : labels.fullscreen}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
      </div>
      {viewMode === "graph" ? renderGraph(fullscreen) : renderList()}
    </section>
  );

  return (
    <div className={["min-h-0", className].join(" ")}>
      {renderSurface(false)}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent
          showCloseButton={false}
          className="!fixed !inset-0 !left-0 !top-0 !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-background p-0"
          style={{
            position: "fixed",
            inset: 0,
            top: 0,
            left: 0,
            width: "100vw",
            maxWidth: "none",
            height: "100dvh",
            transform: "none",
            zIndex: 2147483647,
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{labels.title}</DialogTitle>
          </DialogHeader>
          {renderSurface(true)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
