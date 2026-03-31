import React from 'react';
import { notFound, redirect } from 'next/navigation';
import FlowBuilder from '@/components/automation/FlowBuilder';
import { getAutomation, getAutomations } from '../actions';
import { getAutomationAdminSettings } from '@/lib/automation/admin-settings';
import { enforceFeature } from '@/lib/limits';
import { getTeamForUser } from '@/lib/db/queries';
import { createAutomationCanvasNode } from '@/lib/automation/node-catalog';
import type { AutomationCanvasEdge, AutomationCanvasNode } from '@/lib/automation/flow-schema';

export default async function AutomationEditorPage({ params }: { params: { id: string } }) {
  const team = await getTeamForUser();
  if(!team) redirect('/login');
  try {
    await enforceFeature(team.id, 'isFlowBuilderEnabled');
  } catch (e) {
    return redirect('/dashboard');
  }
  
  const { id } = await params;
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
  const availableAutomations = teamAutomations
    .filter((item) => item.instanceId === automation.instanceId)
    .map((item) => ({
      id: item.id,
      name: item.name,
      instanceId: item.instanceId,
    }));

  return (
    <FlowBuilder 
      automationId={automationId} 
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      initialActive={automation.isActive}
      isAIFlowGeneratorEnabled={Boolean(automationSettings?.aiFlowGeneratorEnabled ?? true)}
      availableAutomations={availableAutomations}
    />
  );
}
