import React from "react";
import { StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type StickyNoteNodeData = {
  title?: string;
  bodyText?: string;
  referenceName?: string;
};

export function StickyNoteNode({
  data,
  selected,
}: {
  id: string;
  data: StickyNoteNodeData;
  selected?: boolean;
}) {
  const t = useTranslations("Automation");
  const title = typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : t("nodes.sticky_note");
  const body = typeof data.bodyText === "string" && data.bodyText.trim().length > 0
    ? data.bodyText.trim()
    : t("note.empty");

  return (
    <div
      className={cn(
        "w-[280px] rounded-xl border bg-amber-50 text-amber-950 shadow-sm transition-all dark:bg-amber-950/30 dark:text-amber-50",
        selected ? "border-amber-500 ring-1 ring-amber-500" : "border-amber-200 hover:border-amber-400",
      )}
    >
      <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-100/80 px-4 py-3 rounded-t-xl dark:border-amber-900/50 dark:bg-amber-900/40">
        <StickyNote className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <span className="text-sm font-medium">{title}</span>
      </div>

      {data.referenceName && (
        <div className="px-4 pt-1 text-[10px] font-mono text-amber-700/80 dark:text-amber-200/70 truncate">
          {data.referenceName}
        </div>
      )}

      <div className="p-4">
        <div className="whitespace-pre-wrap text-sm leading-5 text-amber-900/90 line-clamp-6 dark:text-amber-50/90">
          {body}
        </div>
      </div>
    </div>
  );
}
