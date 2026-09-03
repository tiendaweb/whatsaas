import React from "react";
import { ClipboardList, ListOrdered, TextCursorInput } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormNodeData } from "@/lib/automation/flow-schema";
import { getMenuMarker } from "@/lib/automation/menu-simple";
import { BaseNode } from "./BaseNode";

export function FormNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: FormNodeData;
  selected?: boolean;
}) {
  const t = useTranslations("Automation");
  const fields = Array.isArray(data.fields) ? data.fields : [];

  return (
    <BaseNode
      nodeId={id}
      title={t("nodes.form")}
      icon={ClipboardList}
      selected={selected}
      referenceName={data.referenceName}
      className="w-[320px] min-w-[320px]"
    >
      <div className="space-y-2">
        {fields.map((field, fieldIndex) => (
          <div
            key={field.id}
            className="border border-border bg-muted/30 px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                {fieldIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {field.type === "menu" ? (
                    <ListOrdered className="h-3 w-3" />
                  ) : (
                    <TextCursorInput className="h-3 w-3" />
                  )}
                  {field.type === "menu"
                    ? t("form_field_type_menu")
                    : t("form_field_type_text")}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs font-medium text-foreground">
                  {field.label}
                </p>
                {field.type === "menu" && field.menuOptions?.length ? (
                  <div className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
                    {field.menuOptions.slice(0, 3).map((option, optionIndex) => (
                      <div key={option.id} className="truncate">
                        {getMenuMarker(field.markerStyle ?? "emoji_number", optionIndex)}{" "}
                        {option.text}
                      </div>
                    ))}
                    {field.menuOptions.length > 3 ? (
                      <div>
                        {t("form_more_options", {
                          count: field.menuOptions.length - 3,
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-1.5 font-mono text-[10px] text-primary">
                  {`{{${field.variable}}}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </BaseNode>
  );
}
