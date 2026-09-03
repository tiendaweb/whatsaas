import React from "react";
import { getAutomationFolders, getAutomations } from "./actions";
import { enforceFeature } from "@/lib/limits";
import { getTeamForUser } from "@/lib/db/queries";
import { redirect } from "next/navigation";
import { AutomationWorkspace } from "@/components/automation/AutomationWorkspace";

export default async function AutomationListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const team = await getTeamForUser();

  if (!team) redirect(`/${locale}/sign-in`);

  try {
    await enforceFeature(team.id, "isFlowBuilderEnabled");
  } catch (e) {
    return redirect(`/${locale}/dashboard`);
  }

  const [automationsList, folders] = await Promise.all([
    getAutomations(),
    getAutomationFolders(),
  ]);

  return (
    <AutomationWorkspace
      automations={automationsList}
      folders={folders}
      locale={locale}
    />
  );
}
