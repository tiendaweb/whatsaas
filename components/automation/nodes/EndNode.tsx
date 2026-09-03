import React from "react";
import { Position } from "@xyflow/react";
import { XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DisconnectableTargetHandle } from "./DisconnectableTargetHandle";

export function EndNode({
  id,
  selected,
}: {
  id: string;
  data?: unknown;
  selected?: boolean;
}) {
  const t = useTranslations("Automation");

  return (
    <div
      className={cn(
        "relative flex w-[220px] items-center gap-2 rounded-xl border border-destructive bg-destructive px-4 py-3 text-white shadow-sm transition-all dark:bg-destructive/60",
        selected
          ? "ring-2 ring-destructive/30"
          : "hover:brightness-95",
      )}
    >
      <XCircle className="h-4 w-4 shrink-0" />
      <span className="text-sm font-semibold">{t("nodes.end")}</span>
      <DisconnectableTargetHandle
        nodeId={id}
        position={Position.Left}
        className="!h-3 !w-3 !-ml-1.5 !border-2 !border-destructive/30 !bg-destructive"
      />
    </div>
  );
}
