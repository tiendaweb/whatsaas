"use client";

import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleAutomationStatus } from "@/app/[locale]/(dashboard)/automation/actions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface AutomationStatusToggleProps {
  id: number;
  initialActive: boolean;
  requiresManualReview?: boolean;
}

export function AutomationStatusToggle({
  id,
  initialActive,
  requiresManualReview = false,
}: AutomationStatusToggleProps) {
  const t = useTranslations("Automation");
  const [isActive, setIsActive] = useState(initialActive);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsActive(checked);
    setIsLoading(true);

    try {
      await toggleAutomationStatus(id, checked);
      toast.success(
        checked
          ? t("automation_activated_toast")
          : t("automation_paused_toast"),
      );
    } catch (error) {
      setIsActive(!checked);
      toast.error(t("failed_to_update_status_toast"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      title={
        requiresManualReview
          ? t("ai_review.activation_blocked_hint")
          : undefined
      }
    >
      <Switch
        checked={isActive}
        onCheckedChange={handleToggle}
        disabled={isLoading || requiresManualReview}
      />
    </div>
  );
}
