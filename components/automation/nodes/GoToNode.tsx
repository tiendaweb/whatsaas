import React from "react";
import { Handle, Position } from "@xyflow/react";
import { ArrowLeft, ArrowRight, GitBranchPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { BaseNode } from "./BaseNode";

type GoToNodeData = {
  label?: string;
  referenceName?: string;
  mode?: "previous_node" | "specific_node" | "other_flow";
  targetNodeId?: string;
  targetAutomationId?: string | number;
  isVirtualIncoming?: boolean;
  isVirtualOutgoing?: boolean;
  sourceAutomationName?: string;
  targetAutomationName?: string;
  targetNodeLabel?: string;
  targetNodePreview?: string;
  resolvedTargetNodeId?: string;
  onNavigateToTargetNode?: () => void;
  onNavigateToAutomation?: () => void;
};

function RoundNavigateButton({
  onClick,
  label,
  side = "right",
  direction = "right",
}: {
  onClick?: () => void;
  label: string;
  side?: "left" | "right";
  direction?: "left" | "right";
}) {
  if (!onClick) return null;
  const sideClass = side === "left" ? "-left-5" : "-right-5";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`nodrag nopan absolute ${sideClass} top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-indigo-500 bg-background text-indigo-600 shadow-sm transition-colors hover:bg-indigo-600 hover:text-white dark:text-indigo-300`}
      title={label}
      aria-label={label}
    >
      {direction === "left" ? (
        <ArrowLeft className="h-4 w-4" />
      ) : (
        <ArrowRight className="h-4 w-4" />
      )}
    </button>
  );
}

export function GoToNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: GoToNodeData;
  selected?: boolean;
}) {
  const t = useTranslations("Automation");
  const mode = data.mode || "previous_node";

  if (data.isVirtualIncoming) {
    const sourceName =
      data.sourceAutomationName || data.label || t("go_to_source_automation");
    return (
      <div
        className={[
          "relative w-[260px] cursor-pointer rounded-l-[28px] rounded-r-md border border-l-4 bg-indigo-50 text-indigo-950 shadow-sm transition-all",
          selected
            ? "border-indigo-500 ring-2 ring-indigo-400"
            : "border-indigo-300 hover:border-indigo-500",
          "dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-50",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 rounded-tl-[24px] rounded-tr-sm border-b border-indigo-200 bg-indigo-100/80 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/50">
          <GitBranchPlus className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
          <span className="text-sm font-semibold">{t("go_to_derives_from")}</span>
        </div>
        <div className="p-4 text-base font-semibold leading-snug">
          {sourceName}
        </div>
        <RoundNavigateButton
          onClick={data.onNavigateToAutomation}
          label={t("go_to_open_automation", { automation: sourceName })}
          side="left"
          direction="left"
        />
        <Handle
          id="incoming-source"
          type="source"
          position={Position.Right}
          isConnectable={false}
          className="!h-3 !w-3 !-mr-1.5 !border-2 !border-indigo-200 !bg-indigo-600"
        />
      </div>
    );
  }

  if (data.isVirtualOutgoing) {
    const targetName =
      data.targetAutomationName || data.label || t("go_to_target_automation");
    return (
      <div
        className={[
          "relative w-[300px] cursor-pointer rounded-xl border bg-indigo-50 text-indigo-950 shadow-sm transition-all",
          selected
            ? "border-indigo-500 ring-2 ring-indigo-400"
            : "border-indigo-300 hover:border-indigo-500",
          "dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-50",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 rounded-t-xl border-b border-indigo-200 bg-indigo-100/80 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/50">
          <ArrowRight className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
          <span className="text-sm font-semibold">
            {t("go_to_title_other_automation")}
          </span>
        </div>
        <div className="p-4">
          <div className="text-base font-semibold leading-snug">{targetName}</div>
          {data.targetNodeLabel ? (
            <div className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
              {data.targetNodeLabel}
            </div>
          ) : null}
        </div>
        <RoundNavigateButton
          onClick={data.onNavigateToAutomation}
          label={t("go_to_open_automation", { automation: targetName })}
        />
        <Handle
          id="outgoing-target"
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="!h-3 !w-3 !-ml-1.5 !border-2 !border-indigo-200 !bg-indigo-500"
        />
      </div>
    );
  }

  const isOtherAutomation = mode === "other_flow";
  const title =
    mode === "specific_node"
      ? t("go_to_title_other_node")
      : isOtherAutomation
        ? t("go_to_title_other_automation")
        : t("go_to_title_previous_node");
  const targetAutomationName =
    data.targetAutomationName || t("go_to_target_automation");
  const destinationName =
    mode === "specific_node"
      ? data.targetNodeLabel || t("go_to_target_node_label")
      : isOtherAutomation
        ? targetAutomationName
        : t("go_to_mode_previous");
  const navigate =
    mode === "specific_node"
      ? data.onNavigateToTargetNode
      : isOtherAutomation
        ? data.onNavigateToAutomation
        : undefined;

  return (
    <BaseNode
      nodeId={id}
      title={title}
      icon={GitBranchPlus}
      selected={selected}
      disableSource
      accent={isOtherAutomation || mode === "specific_node" ? "indigo" : "default"}
      referenceName={data.referenceName}
      className={isOtherAutomation ? "w-[340px] min-w-[340px]" : "w-[320px] min-w-[320px]"}
    >
      <div className="pr-4">
        <div className="break-words text-base font-semibold leading-snug text-foreground">
          {destinationName}
        </div>
        {isOtherAutomation && data.targetNodeLabel ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {data.targetNodeLabel}
          </div>
        ) : null}
        {data.targetNodePreview ? (
          <div className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
            {data.targetNodePreview}
          </div>
        ) : null}
      </div>
      <RoundNavigateButton
        onClick={navigate}
        label={
          isOtherAutomation
            ? t("go_to_open_automation", { automation: targetAutomationName })
            : t("go_to_open_node", { node: destinationName })
        }
      />
    </BaseNode>
  );
}
