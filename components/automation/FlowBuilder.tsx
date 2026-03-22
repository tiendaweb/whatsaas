'use client';

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge,
  ProOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Loader2, PlayCircle, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { StartNode } from './nodes/StartNode';
import { MessageNode } from './nodes/MessageNode';
import { OptionsNode } from './nodes/OptionsNode';
import { DelayNode } from './nodes/DelayNode';
import { CollectNode } from './nodes/CollectNode';
import { SaveContactNode } from './nodes/SaveContactNode'; 
import { MediaNode } from './nodes/MediaNode';
import { EndNode } from './nodes/EndNode';
import { ButtonMessageNode } from './nodes/ButtonMessageNode';
import { ListMessageNode } from './nodes/ListMessageNode';
import { CallToActionNode } from './nodes/CallToActionNode';
import { AiControlNode } from './nodes/AiControlNode';
import { ConditionNode } from './nodes/ConditionNode';

import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { saveAutomation, toggleAutomationStatus } from '@/app/[locale]/(dashboard)/automation/actions';
import { useTranslations } from 'next-intl';

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  options: OptionsNode,
  delay: DelayNode,
  collect: CollectNode, 
  save_contact: SaveContactNode, 
  media: MediaNode, 
  end: EndNode,
  button_message: ButtonMessageNode,
  list_message: ListMessageNode,
  call_to_action: CallToActionNode,
  ai_control: AiControlNode,
  condition: ConditionNode
};

interface FlowBuilderProps {
  automationId: number;
  initialNodes: Node[];
  initialEdges: Edge[];
  initialActive: boolean;
}

const proOptions: ProOptions = { hideAttribution: true };

function FlowBuilderContent({ automationId, initialNodes, initialEdges, initialActive }: FlowBuilderProps) {
  const t = useTranslations('Automation');
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActive, setIsActive] = useState(initialActive);
  
  const { screenToFlowPosition, toObject } = useReactFlow();

  useEffect(() => {
    setIsDarkMode(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      
      if (typeof type === 'undefined' || !type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: 'New Node' },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeData = (id: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      })
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    const flow = toObject();
    try {
      await saveAutomation(automationId, flow.nodes, flow.edges);
      toast.success(t('toast_saved'));
    } catch (error) {
      toast.error('Failed to save flow');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async () => {
      const newState = !isActive;
      setIsActive(newState);
      try {
          await toggleAutomationStatus(automationId, newState);
          toast.success(t('toast_status_changed'));
      } catch (error) {
          setIsActive(!newState);
          toast.error("Failed to change status");
      }
  };

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const bgColor = isDarkMode ? '#020617' : '#f8fafc';
  const dotColor = isDarkMode ? '#334155' : '#cbd5e1';
  
  const controlsStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    borderColor: isDarkMode ? '#1e293b' : '#e2e8f0',
  };

  const miniMapStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
    height: 120, 
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex justify-between items-center px-6 py-3 bg-background border-b border-border shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t('header_title')}</h1>
            <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">ID: {automationId}</p>
                <span className={`inline-flex items-center px-1.5 rounded-full text-[10px] font-medium ${
                  isActive 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                  {isActive ? t('status_active') : t('status_draft')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={toggleActive}
            className={isActive ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50" : "text-green-600 hover:text-green-700 hover:bg-green-50"}
          >
            {isActive ? <PauseCircle className="h-4 w-4 mr-1.5" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
            {isActive ? t('pause') : t('activate')}
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isSaving ? t('saving') : t('save_btn')}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex w-full h-full">
        <Sidebar />
        
        <div className="flex-1 h-full relative bg-slate-50 dark:bg-slate-950" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            proOptions={proOptions}
            fitView
          >
            <Controls 
              style={controlsStyle} 
              className="[&>button]:!bg-transparent [&>button]:!border-none [&>button]:!text-current hover:[&>button]:!bg-slate-100 dark:hover:[&>button]:!bg-slate-800 [&>button]:p-1 [&>button]:rounded-sm border shadow-sm" 
            />
            <MiniMap 
              style={miniMapStyle} 
              className="border shadow-sm"
              maskColor={isDarkMode ? 'rgba(2, 6, 23, 0.7)' : 'rgba(248, 250, 252, 0.7)'}
              nodeColor={isDarkMode ? '#334155' : '#cbd5e1'}
            />
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={12} 
              size={1} 
              color={dotColor}
              bgColor={bgColor}
            />
          </ReactFlow>
        </div>

        <PropertiesPanel 
          selectedNode={selectedNode} 
          onUpdateNode={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
    </div>
  );
}

export default function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderContent {...props} />
    </ReactFlowProvider>
  );
}