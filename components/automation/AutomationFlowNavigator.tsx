"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CircleDot,
  CornerDownRight,
  GitBranch,
  Loader2,
  PanelRightOpen,
  Route,
  Save,
  Variable,
} from "lucide-react";
import { toast } from "sonner";
import { saveAutomation } from "@/app/[locale]/(dashboard)/automation/actions";
import { Button } from "@/components/ui/button";
import { PropertiesPanel } from "@/components/automation/PropertiesPanel";
import { getMenuMarker } from "@/lib/automation/menu-simple";
import type {
  AutomationCanvasNode,
  AutomationCanvasNodeData,
  AutomationFlowEdge,
  AutomationFlowNode,
  MenuSimpleMarkerStyle,
} from "@/lib/automation/flow-schema";
import {
  buildAutomationNavigatorGraph,
  getAutomationEdges,
  getAutomationNodeKey,
  getAutomationNodes,
  getAutomationStartReference,
  getDefaultNavigatorFocus,
  getNavigatorNeighborhood,
  resolveGoToNodeDestination,
  type AutomationNavigatorConnection,
  type AutomationNavigatorGraph,
  type AutomationNavigatorNode,
  type AutomationNodeReference,
  type NavigatorAutomationLike,
} from "@/lib/automation/flow-navigator";

type EditableNavigatorAutomation = NavigatorAutomationLike & {
  instanceId?: number | null;
  updatedAt?: Date | string;
};

const NODE_TRANSLATION_KEYS: Record<string, string> = {
  start: "start",
  message: "message",
  media: "media",
  options: "options",
  delay: "delay",
  collect: "collect",
  form: "form",
  save_contact: "save_contact",
  end: "end",
  button_message: "buttons",
  list_message: "list",
  call_to_action: "cta",
  ai_control: "ai_control",
  condition: "condition",
  go_to_node: "go_to_node",
  sticky_note: "sticky_note",
  menu_simple: "menu_simple",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNodeText(node: AutomationFlowNode) {
  const data = asRecord(node.data);
  const values = [
    data.referenceName,
    data.label,
    data.bodyText,
    data.caption,
    data.title,
    data.buttonText,
  ];
  return values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  )?.trim();
}

function connectionIdentity(connection: AutomationNavigatorConnection) {
  return [
    connection.id,
    getAutomationNodeKey(connection.source),
    getAutomationNodeKey(connection.target),
    connection.sourceHandle ?? "",
  ].join(":");
}

export function AutomationFlowNavigator({
  scopedAutomations,
  allAutomations,
  scopeKey,
}: {
  scopedAutomations: EditableNavigatorAutomation[];
  allAutomations: EditableNavigatorAutomation[];
  scopeKey: string;
}) {
  const t = useTranslations("Automation");
  const [workingAutomations, setWorkingAutomations] =
    useState<EditableNavigatorAutomation[]>(allAutomations);
  const [dirtyAutomationIds, setDirtyAutomationIds] = useState<Set<number>>(
    new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    setWorkingAutomations(allAutomations);
    setDirtyAutomationIds(new Set());
  }, [allAutomations]);

  const scopedIds = useMemo(
    () => new Set(scopedAutomations.map((automation) => automation.id)),
    [scopedAutomations],
  );
  const workingScopedAutomations = useMemo(
    () =>
      workingAutomations.filter((automation) => scopedIds.has(automation.id)),
    [scopedIds, workingAutomations],
  );
  const graph = useMemo(
    () => buildAutomationNavigatorGraph(workingAutomations),
    [workingAutomations],
  );
  const defaultFocus = useMemo(
    () => getDefaultNavigatorFocus(workingScopedAutomations),
    [workingScopedAutomations],
  );
  const defaultFocusAutomationId = defaultFocus?.automationId;
  const defaultFocusNodeId = defaultFocus?.nodeId;
  const [focus, setFocus] =
    useState<AutomationNodeReference | null>(defaultFocus);

  useEffect(() => {
    setFocus(
      defaultFocusAutomationId !== undefined && defaultFocusNodeId
        ? {
            automationId: defaultFocusAutomationId,
            nodeId: defaultFocusNodeId,
          }
        : null,
    );
    setShowEditor(false);
  }, [defaultFocusAutomationId, defaultFocusNodeId, scopeKey]);

  const focusKey = focus ? getAutomationNodeKey(focus) : "";
  const validFocus = focus && graph.nodes.has(focusKey) ? focus : defaultFocus;
  const neighborhood = validFocus
    ? getNavigatorNeighborhood(graph, validFocus)
    : null;
  const focusedAutomation = validFocus
    ? workingAutomations.find(
        (automation) => automation.id === validFocus.automationId,
      )
    : undefined;
  const focusedNodes = focusedAutomation
    ? getAutomationNodes(focusedAutomation).filter(
        (node) => node.type !== "sticky_note",
      )
    : [];
  const hasUnsavedChanges = focusedAutomation
    ? dirtyAutomationIds.has(focusedAutomation.id)
    : false;

  const typeLabel = (node: AutomationFlowNode) => {
    const key = NODE_TRANSLATION_KEYS[node.type];
    return key ? t(`nodes.${key}`) : node.type;
  };

  const nodeTitle = (node: AutomationFlowNode) =>
    getNodeText(node) || typeLabel(node);

  const focusReference = (reference: AutomationNodeReference) => {
    if (!graph.nodes.has(getAutomationNodeKey(reference))) return;
    setFocus(reference);
    setShowEditor(false);
  };

  const getConnectionLabel = (
    connection?: AutomationNavigatorConnection,
  ): string | null => {
    if (!connection) return null;
    if (connection.kind === "jump") return t("navigator.jump");
    const handle = connection.sourceHandle;
    if (!handle) return t("navigator.continues");
    if (handle === "fallback") return t("navigator.fallback");

    const source = graph.nodes.get(getAutomationNodeKey(connection.source));
    const data = asRecord(source?.node.data);
    if (source?.node.type === "menu_simple") {
      const options = Array.isArray(data.menuOptions)
        ? data.menuOptions.map(asRecord)
        : [];
      const optionId = handle.replace(/^menu-/, "");
      const option = options.find((item) => String(item.id) === optionId);
      return nonEmptyString(option?.text) ?? `${t("navigator.option")} ${optionId}`;
    }
    if (source?.node.type === "options") {
      const index = Number(handle.replace(/^option-/, ""));
      const options = Array.isArray(data.options) ? data.options : [];
      return (
        nonEmptyString(options[index]) ??
        `${t("navigator.option")} ${Number.isFinite(index) ? index + 1 : handle}`
      );
    }
    if (source?.node.type === "button_message") {
      const buttonId = handle.replace(/^btn-/, "");
      const buttons = Array.isArray(data.buttons)
        ? data.buttons.map(asRecord)
        : [];
      const button = buttons.find((item) => String(item.id) === buttonId);
      return nonEmptyString(button?.text) ?? buttonId;
    }
    if (source?.node.type === "list_message") {
      const itemId = handle.replace(/^list-/, "");
      const items = Array.isArray(data.items) ? data.items.map(asRecord) : [];
      const item = items.find((entry) => String(entry.id) === itemId);
      return nonEmptyString(item?.title) ?? itemId;
    }
    if (source?.node.type === "condition") {
      const conditions = Array.isArray(data.conditions)
        ? data.conditions.map(asRecord)
        : [];
      const condition = conditions.find((entry) => String(entry.id) === handle);
      return (
        nonEmptyString(condition?.label) ??
        nonEmptyString(condition?.value) ??
        `${t("navigator.branch")} ${handle}`
      );
    }
    return handle;
  };

  const updateNode = (
    nodeId: string,
    data: Partial<AutomationCanvasNodeData>,
  ) => {
    if (!validFocus) return;
    setWorkingAutomations((current) =>
      current.map((automation) => {
        if (automation.id !== validFocus.automationId) return automation;
        const nodes = getAutomationNodes(automation).map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...asRecord(node.data),
                  ...data,
                },
              }
            : node,
        );
        return { ...automation, nodes };
      }),
    );
    setDirtyAutomationIds((current) => {
      const next = new Set(current);
      next.add(validFocus.automationId);
      return next;
    });
  };

  const saveFocusedAutomation = async () => {
    if (!focusedAutomation || !hasUnsavedChanges || isSaving) return;
    setIsSaving(true);
    try {
      const expectedUpdatedAt =
        focusedAutomation.updatedAt instanceof Date
          ? focusedAutomation.updatedAt.toISOString()
          : focusedAutomation.updatedAt;
      const result = await saveAutomation(
        focusedAutomation.id,
        getAutomationNodes(focusedAutomation),
        getAutomationEdges(focusedAutomation),
        expectedUpdatedAt,
      );
      setWorkingAutomations((current) =>
        current.map((automation) =>
          automation.id === focusedAutomation.id
            ? { ...automation, updatedAt: result.updatedAt }
            : automation,
        ),
      );
      setDirtyAutomationIds((current) => {
        const next = new Set(current);
        next.delete(focusedAutomation.id);
        return next;
      });
      toast.success(t("navigator.saved"));
    } catch (error) {
      const isVersionConflict =
        error instanceof Error &&
        error.message.includes("AUTOMATION_VERSION_CONFLICT");
      toast.error(
        isVersionConflict
          ? t("navigator.version_conflict")
          : t("navigator.save_error"),
      );
      if (isVersionConflict) window.location.reload();
    } finally {
      setIsSaving(false);
    }
  };

  const NodeCard = ({
    item,
    connection,
  }: {
    item: AutomationNavigatorNode;
    connection?: AutomationNavigatorConnection;
  }) => {
    const destination =
      item.node.type === "go_to_node"
        ? resolveGoToNodeDestination(item, workingAutomations)
        : null;
    const destinationNode = destination
      ? graph.nodes.get(getAutomationNodeKey(destination))
      : undefined;
    const outsideScope = !scopedIds.has(item.automationId);
    const branch = getConnectionLabel(connection);
    const isDerivation = Boolean(connection?.sourceHandle);
    const isFallback = connection?.sourceHandle === "fallback";

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => focusReference(item)}
          className={[
            "group w-full border px-3 py-2.5 text-left transition-colors",
            isDerivation
              ? isFallback
                ? "rounded-l-2xl rounded-r-sm border-destructive/30 border-l-4 bg-destructive/5 hover:border-destructive/60"
                : "rounded-l-2xl rounded-r-sm border-indigo-300 border-l-4 bg-indigo-50 hover:border-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/35"
              : "border-border bg-background hover:border-primary/55",
          ].join(" ")}
        >
          <span className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-muted/50 text-muted-foreground">
              {isDerivation ? (
                <GitBranch className="h-3.5 w-3.5" />
              ) : item.node.type === "go_to_node" ? (
                <Route className="h-3.5 w-3.5" />
              ) : item.node.type === "start" ? (
                <CircleDot className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {nodeTitle(item.node)}
              </span>
              <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {typeLabel(item.node)}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                {item.automation.name}
              </span>
              {branch && (
                <span
                  className={[
                    "mt-1.5 flex items-center gap-1 border-l-2 pl-2 text-[10px] font-semibold",
                    isFallback
                      ? "border-destructive text-destructive"
                      : "border-indigo-600 text-indigo-800 dark:text-indigo-300",
                  ].join(" ")}
                >
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{branch}</span>
                </span>
              )}
              {outsideScope && (
                <span className="mt-1 block text-[9px] text-muted-foreground">
                  {t("navigator.outside_folder")}
                </span>
              )}
            </span>
          </span>
        </button>
        {destination && destinationNode && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              focusReference(destination);
            }}
            className="absolute -right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            title={t("navigator.jump_to", {
              automation: destinationNode.automation.name,
            })}
            aria-label={t("navigator.jump_to", {
              automation: destinationNode.automation.name,
            })}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  const FocusedNodeCard = ({
    item,
  }: {
    item: AutomationNavigatorNode;
  }) => {
    const data = asRecord(item.node.data);
    const outgoing = graph.outgoing.get(getAutomationNodeKey(item)) ?? [];
    const menuOptions = Array.isArray(data.menuOptions)
      ? data.menuOptions.map(asRecord)
      : [];
    const regularOptions = Array.isArray(data.options) ? data.options : [];
    const buttons = Array.isArray(data.buttons) ? data.buttons.map(asRecord) : [];
    const listItems = Array.isArray(data.items) ? data.items.map(asRecord) : [];
    const conditions = Array.isArray(data.conditions)
      ? data.conditions.map(asRecord)
      : [];
    const formFields = Array.isArray(data.fields)
      ? data.fields.map(asRecord)
      : [];
    const markerStyle =
      (nonEmptyString(data.markerStyle) as MenuSimpleMarkerStyle | null) ??
      "emoji_number";
    const focusedTitle =
      nonEmptyString(data.referenceName) || typeLabel(item.node);
    const textFields = [
      ["title", data.title],
      ["body", data.bodyText],
      ["message", data.label],
      ["caption", data.caption],
      ["footer", data.footerText],
      ["button", data.buttonText],
      ["url", data.url],
    ].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    );
    const variables = [
      ["variable", data.variable],
      ["name", data.nameVariable],
      ...formFields.map((field, index) => [
        `campo ${index + 1}`,
        field.variable,
      ]),
      ...Object.entries(asRecord(data.customFields)).map(([key, value]) => [
        key,
        value,
      ]),
    ].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    );

    const Destination = ({
      connection,
    }: {
      connection: AutomationNavigatorConnection | undefined;
    }) => {
      if (!connection) {
        return (
          <span className="shrink-0 text-[9px] text-muted-foreground">
            {t("navigator.unconnected")}
          </span>
        );
      }
      const target = graph.nodes.get(getAutomationNodeKey(connection.target));
      if (!target) return null;
      return (
        <button
          type="button"
          onClick={() => focusReference(connection.target)}
          className="flex min-w-0 shrink items-center gap-1 text-right text-[10px] font-medium text-primary hover:underline"
        >
          <span className="truncate">{nodeTitle(target.node)}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
        </button>
      );
    };

    const BranchRow = ({
      marker,
      text,
      handle,
      detail,
    }: {
      marker?: React.ReactNode;
      text: string;
      handle: string;
      detail?: string | null;
    }) => {
      const connection = outgoing.find(
        (candidate) => candidate.sourceHandle === handle,
      );
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
          <div className="flex min-w-0 items-start gap-2">
            {marker ? (
              <span className="min-w-5 shrink-0 text-xs font-semibold text-foreground">
                {marker}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="block whitespace-pre-wrap break-words text-xs text-foreground">
                {text}
              </span>
              {detail ? (
                <span className="mt-0.5 block break-all text-[9px] text-muted-foreground">
                  {detail}
                </span>
              ) : null}
            </span>
          </div>
          <Destination connection={connection} />
        </div>
      );
    };

    return (
      <article
        key={getAutomationNodeKey(item)}
        className="animate-in fade-in slide-in-from-right-2 duration-300 border border-primary bg-background shadow-lg"
      >
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-primary-foreground">
            {item.node.type === "go_to_node" ? (
              <Route className="h-4 w-4" />
            ) : item.node.type === "start" ? (
              <CircleDot className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold">
              {focusedTitle}
            </span>
            <span className="mt-1 block text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {typeLabel(item.node)}
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {item.automation.name}
            </span>
          </span>
        </header>

        <div className="max-h-[55vh] overflow-y-auto">
          {textFields.length > 0 && (
            <div className="space-y-3 px-4 py-4">
              {textFields.map(([label, value]) => (
                <div key={label}>
                  <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t(`navigator.content_${label}`)}
                  </span>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {item.node.type === "delay" && (
            <div className="px-4 py-4 text-sm">
              {t("navigator.delay_seconds", {
                seconds: Number(data.seconds) || 0,
              })}
            </div>
          )}

          {formFields.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("form_fields_label")}
              </div>
              <div className="divide-y divide-border border-t border-border">
                {formFields.map((field, index) => {
                  const fieldOptions = Array.isArray(field.menuOptions)
                    ? field.menuOptions.map(asRecord)
                    : [];
                  const fieldMarkerStyle =
                    (nonEmptyString(field.markerStyle) as MenuSimpleMarkerStyle | null) ??
                    "emoji_number";
                  return (
                    <div key={String(field.id ?? index)} className="space-y-2 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                          {index + 1}
                        </span>
                        <p className="whitespace-pre-wrap break-words text-xs leading-5">
                          {nonEmptyString(field.label) ??
                            t("form_field_number", { number: index + 1 })}
                        </p>
                      </div>
                      {fieldOptions.length > 0 && (
                        <div className="space-y-1 pl-7">
                          {fieldOptions.map((option, optionIndex) => (
                            <div
                              key={String(option.id ?? optionIndex)}
                              className="flex items-start gap-2 text-[10px] text-muted-foreground"
                            >
                              <span className="shrink-0 font-semibold">
                                {getMenuMarker(fieldMarkerStyle, optionIndex)}
                              </span>
                              <span className="whitespace-pre-wrap break-words">
                                {nonEmptyString(option.text) ??
                                  `${t("navigator.option")} ${optionIndex + 1}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {menuOptions.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("navigator.menu_and_connections")}
              </div>
              <div className="border-t border-border">
                {menuOptions.map((option, index) => (
                  <BranchRow
                    key={String(option.id)}
                    marker={getMenuMarker(markerStyle, index)}
                    text={
                      nonEmptyString(option.text) ??
                      `${t("navigator.option")} ${index + 1}`
                    }
                    handle={`menu-${String(option.id)}`}
                    detail={
                      nonEmptyString(option.matchValue)
                        ? `${nonEmptyString(option.matchOperator) ?? ""} ${String(option.matchValue)}`.trim()
                        : null
                    }
                  />
                ))}
                {outgoing.some(
                  (connection) => connection.sourceHandle === "fallback",
                ) && (
                  <BranchRow
                    text={t("navigator.fallback")}
                    handle="fallback"
                  />
                )}
              </div>
            </div>
          )}

          {regularOptions.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("navigator.options_and_connections")}
              </div>
              {regularOptions.map((option, index) => (
                <BranchRow
                  key={`${index}:${String(option)}`}
                  marker={index + 1}
                  text={String(option)}
                  handle={`option-${index}`}
                />
              ))}
            </div>
          )}

          {buttons.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("navigator.buttons_and_connections")}
              </div>
              {buttons.map((button, index) => (
                <BranchRow
                  key={String(button.id)}
                  marker={index + 1}
                  text={
                    nonEmptyString(button.text) ??
                    `${t("navigator.option")} ${index + 1}`
                  }
                  handle={`btn-${String(button.id)}`}
                  detail={nonEmptyString(button.value)}
                />
              ))}
            </div>
          )}

          {listItems.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("navigator.items_and_connections")}
              </div>
              {listItems.map((listItem, index) => (
                <BranchRow
                  key={String(listItem.id)}
                  marker={index + 1}
                  text={
                    nonEmptyString(listItem.title) ??
                    `${t("navigator.option")} ${index + 1}`
                  }
                  handle={`list-${String(listItem.id)}`}
                  detail={nonEmptyString(listItem.description)}
                />
              ))}
            </div>
          )}

          {item.node.type === "condition" && conditions.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("navigator.conditions_and_connections")}
              </div>
              {conditions.map((condition, index) => (
                <BranchRow
                  key={String(condition.id)}
                  marker={index + 1}
                  text={
                    nonEmptyString(condition.label) ??
                    `${String(condition.type ?? "")} ${String(condition.operator ?? "")} ${String(condition.value ?? "")}`.trim()
                  }
                  handle={String(condition.id)}
                  detail={
                    nonEmptyString(condition.label)
                      ? `${String(condition.type ?? "")} ${String(condition.operator ?? "")} ${String(condition.value ?? "")}`.trim()
                      : null
                  }
                />
              ))}
              {outgoing.some(
                (connection) => connection.sourceHandle === "fallback",
              ) && (
                <BranchRow
                  text={t("navigator.fallback")}
                  handle="fallback"
                />
              )}
            </div>
          )}

          {variables.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <span className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Variable className="h-3 w-3" />
                {t("navigator.variables")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {variables.map(([name, value]) => (
                  <span
                    key={`${name}:${value}`}
                    className="border border-border bg-muted/40 px-2 py-1 font-mono text-[10px]"
                  >
                    {name}: {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {textFields.length === 0 &&
            menuOptions.length === 0 &&
            regularOptions.length === 0 &&
            buttons.length === 0 &&
            listItems.length === 0 &&
            conditions.length === 0 &&
            formFields.length === 0 &&
            variables.length === 0 &&
            item.node.type !== "delay" && (
              <div className="px-4 py-5 text-xs text-muted-foreground">
                {t("navigator.no_content")}
              </div>
            )}

          {outgoing.length > 0 &&
            menuOptions.length === 0 &&
            regularOptions.length === 0 &&
            buttons.length === 0 &&
            listItems.length === 0 &&
            item.node.type !== "condition" && (
              <div className="border-t border-border">
                <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("navigator.connections")}
                </div>
                {outgoing.map((connection) => {
                  const target = graph.nodes.get(
                    getAutomationNodeKey(connection.target),
                  );
                  return target ? (
                    <button
                      key={connectionIdentity(connection)}
                      type="button"
                      onClick={() => focusReference(connection.target)}
                      className="flex w-full items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block text-[9px] text-muted-foreground">
                          {getConnectionLabel(connection)}
                        </span>
                        <span className="block truncate font-medium">
                          {nodeTitle(target.node)}
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                    </button>
                  ) : null;
                })}
              </div>
            )}
        </div>
      </article>
    );
  };

  if (!validFocus || !neighborhood?.focus) {
    return (
      <div className="flex h-full items-center justify-center border border-dashed border-border bg-card text-sm text-muted-foreground">
        {t("navigator.empty")}
      </div>
    );
  }

  const previous = neighborhood.previous;
  const next = neighborhood.next;
  const afterNext = neighborhood.afterNext;

  const Column = ({
    label,
    icon,
    children,
    empty,
    emphasized = false,
  }: {
    label: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    empty: boolean;
    emphasized?: boolean;
  }) => (
    <div className={emphasized ? "w-[430px]" : "w-[228px]"}>
      <div className="mb-2 flex items-center gap-1.5 border-b border-border pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="space-y-1.5">
        {empty ? (
          <div className="border border-dashed border-border px-3 py-5 text-center text-[10px] text-muted-foreground">
            {label === t("navigator.previous")
              ? t("navigator.no_previous")
              : t("navigator.no_next")}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-card text-foreground">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <label className="flex min-w-0 items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("navigator.automation")}
          </span>
          <select
            value={focusedAutomation?.id ?? ""}
            onChange={(event) => {
              const automation = workingAutomations.find(
                (item) => item.id === Number(event.target.value),
              );
              const start = automation
                ? getAutomationStartReference(automation)
                : null;
              if (start) focusReference(start);
            }}
            className="h-8 max-w-60 border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {workingScopedAutomations.map((automation) => (
              <option key={automation.id} value={automation.id}>
                {automation.name}
                {automation.isActive ? ` — ${t("navigator.active")}` : ""}
              </option>
            ))}
            {focusedAutomation && !scopedIds.has(focusedAutomation.id) && (
              <option value={focusedAutomation.id}>
                {focusedAutomation.name}
              </option>
            )}
          </select>
        </label>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <label className="flex min-w-0 items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("navigator.focus_node")}
          </span>
          <select
            value={validFocus.nodeId}
            onChange={(event) =>
              focusReference({
                automationId: validFocus.automationId,
                nodeId: event.target.value,
              })
            }
            className="h-8 max-w-64 border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {focusedNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {nodeTitle(node)}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-muted-foreground xl:flex">
          <GitBranch className="h-3.5 w-3.5" />
          {t("navigator.direct_connections")}
        </span>
        {!showEditor && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            onClick={() => setShowEditor(true)}
          >
            <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
            {t("navigator.edit")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-none"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={saveFocusedAutomation}
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : hasUnsavedChanges ? (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          )}
          {hasUnsavedChanges
            ? t("navigator.save_flow")
            : t("navigator.up_to_date")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto bg-muted/20">
          <div className="flex min-h-full min-w-max items-center gap-10 px-10 py-8">
            <Column
              label={t("navigator.previous")}
              icon={<ArrowLeft className="h-3 w-3" />}
              empty={previous.length === 0}
            >
              {previous.map((connection) => {
                const item = graph.nodes.get(
                  getAutomationNodeKey(connection.source),
                );
                return item ? (
                  <NodeCard
                    key={connectionIdentity(connection)}
                    item={item}
                    connection={connection}
                  />
                ) : null;
              })}
            </Column>

            <Column
              label={t("navigator.current")}
              icon={<CircleDot className="h-3 w-3" />}
              empty={false}
              emphasized
            >
              <FocusedNodeCard item={neighborhood.focus} />
            </Column>

            <Column
              label={t("navigator.next")}
              icon={<ArrowRight className="h-3 w-3" />}
              empty={next.length === 0}
            >
              {next.map((connection) => {
                const item = graph.nodes.get(
                  getAutomationNodeKey(connection.target),
                );
                return item ? (
                  <NodeCard
                    key={connectionIdentity(connection)}
                    item={item}
                    connection={connection}
                  />
                ) : null;
              })}
            </Column>

            {afterNext.length > 0 && (
              <Column
                label={t("navigator.after_next")}
                icon={<CornerDownRight className="h-3 w-3" />}
                empty={false}
              >
                {afterNext.map((connection) => {
                  const item = graph.nodes.get(
                    getAutomationNodeKey(connection.target),
                  );
                  return item ? (
                    <NodeCard
                      key={connectionIdentity(connection)}
                      item={item}
                      connection={connection}
                    />
                  ) : null;
                })}
              </Column>
            )}
          </div>
        </div>

        {showEditor && focusedAutomation && (
          <PropertiesPanel
            selectedNode={neighborhood.focus.node as AutomationCanvasNode}
            nodes={getAutomationNodes(focusedAutomation) as AutomationCanvasNode[]}
            currentAutomationId={focusedAutomation.id}
            availableAutomations={workingAutomations.map((automation) => ({
              id: automation.id,
              name: automation.name,
              instanceId: automation.instanceId ?? null,
            }))}
            hasUnsavedChanges={hasUnsavedChanges}
            onNavigateToAutomation={(automationId) => {
              const automation = workingAutomations.find(
                (candidate) => candidate.id === automationId,
              );
              const start = automation
                ? getAutomationStartReference(automation)
                : null;
              if (start) focusReference(start);
            }}
            onUpdateNode={updateNode}
            onClose={() => setShowEditor(false)}
            currentInstanceId={focusedAutomation.instanceId ?? null}
            onSelectNode={(nodeId) =>
              setFocus({
                automationId: focusedAutomation.id,
                nodeId,
              })
            }
          />
        )}
      </div>
    </section>
  );
}
