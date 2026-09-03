import React from 'react';
import { notFound, redirect } from 'next/navigation';
import FlowBuilder from '@/components/automation/FlowBuilder';
import { getAutomation, getAutomations } from '../actions';
import { getAutomationAdminSettings } from '@/lib/automation/admin-settings';
import { enforceFeature } from '@/lib/limits';
import { getTeamForUser } from '@/lib/db/queries';
import { createAutomationCanvasNode } from '@/lib/automation/node-catalog';
import type { AutomationCanvasEdge, AutomationCanvasNode, AutomationFlowChannel } from '@/lib/automation/flow-schema';

export default async function AutomationEditorPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = await params;
  const team = await getTeamForUser();
  if(!team) redirect(`/${locale}/sign-in`);
  try {
    await enforceFeature(team.id, 'isFlowBuilderEnabled');
  } catch (e) {
    return redirect(`/${locale}/dashboard`);
  }
  
  const automationId = parseInt(id);
  
  if (isNaN(automationId)) return notFound();

  const [automation, automationSettings, teamAutomations] = await Promise.all([
    getAutomation(automationId),
    getAutomationAdminSettings(),
    getAutomations(),
  ]);

  if (!automation) return notFound();

  
  const initialNodes = (automation.nodes as AutomationCanvasNode[])?.length > 0 
    ? (automation.nodes as AutomationCanvasNode[]) 
    : [createAutomationCanvasNode({ id: 'start-1', type: 'start', position: { x: 250, y: 100 } })];

  const initialEdges = (automation.edges as AutomationCanvasEdge[]) || [];
  // Interactive nodes (options, buttons, list, CTA) are only available on the
  // official Meta Cloud API. QR (Baileys) instances use plain-text nodes.
  const channel: AutomationFlowChannel =
    automation.instance?.integration === 'WHATSAPP-BUSINESS' ? 'api' : 'qr';
  const availableAutomations = teamAutomations
    .filter((item) => item.instanceId === automation.instanceId)
    .map((item) => ({
      id: item.id,
      name: item.name,
      instanceId: item.instanceId,
    }));
  const automationMapItems = teamAutomations.map((item) => ({
    id: item.id,
    name: item.name,
    note: item.note,
    isActive: item.isActive,
    edges: item.edges,
    nodes: item.nodes,
    instance: item.instance
      ? {
          instanceName: item.instance.instanceName,
        }
      : null,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <FlowBuilder 
        automationId={automationId}
        automationName={automation.name}
        automationNote={automation.note}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        initialActive={automation.isActive}
        initialUpdatedAt={automation.updatedAt.toISOString()}
        isAIFlowGeneratorEnabled={Boolean(automationSettings?.aiFlowGeneratorEnabled ?? true)}
        availableAutomations={availableAutomations}
        allAutomations={automationMapItems}
        channel={channel}
      />
    </div>
  );
}
