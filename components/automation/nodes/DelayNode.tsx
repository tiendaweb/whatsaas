import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { BaseNode } from "./BaseNode";

type DelayNodeData = {
  referenceName?: string;
  seconds?: number;
  onChangeSeconds?: (seconds: number) => void;
};

export function DelayNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: DelayNodeData;
  selected?: boolean;
}) {
  const t = useTranslations("Automation");
  const seconds = Math.max(1, Number(data.seconds) || 2);
  const [draftSeconds, setDraftSeconds] = useState(String(seconds));

  useEffect(() => {
    setDraftSeconds(String(seconds));
  }, [seconds]);

  const commit = () => {
    const next = Math.min(86400, Math.max(1, Number(draftSeconds) || 1));
    setDraftSeconds(String(next));
    data.onChangeSeconds?.(next);
  };

  return (
    <BaseNode
      nodeId={id}
      title={t("nodes.delay")}
      icon={Clock}
      selected={selected}
      referenceName={data.referenceName}
    >
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={86400}
          value={draftSeconds}
          onChange={(event) => setDraftSeconds(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onWheel={(event) => event.currentTarget.blur()}
          onPointerDown={(event) => event.stopPropagation()}
          className="nodrag nopan h-9 w-24 rounded-md border border-border bg-background px-2 text-right font-mono text-base font-semibold outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          aria-label={t("wait_duration_label")}
        />
        <span className="text-sm text-muted-foreground">
          {t("delay_node_wait_suffix")}
        </span>
      </div>
    </BaseNode>
  );
}
