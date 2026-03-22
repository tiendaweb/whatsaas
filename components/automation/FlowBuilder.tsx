'use client';

import React, { useCallback, useState, useEffect } from 'react';
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
import { ArrowLeft, Save, Loader2, PlayCircle, PauseCircle, LayoutGrid } from 'lucide-react';
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
const CONTROL_STACK_HEIGHT = 116;
const OVERLAY_GAP = 16;
const HORIZONTAL_SPACING = 380;
const VERTICAL_SPACING = 170;

function FlowBuilderContent({ automationId, initialNodes, initialEdges, initialActive }: FlowBuilderProps) {
  const t = useTranslations('Automation');
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActive, setIsActive] = useState(initialActive);
  
  const { screenToFlowPosition, toObject, fitView } = useReactFlow();

  useEffect(() => {
    setIsDarkMode(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);

    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);

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

  const handleAutoArrange = useCallback(() => {
    if (nodes.length <= 1) {
      return;
    }

    const outgoing = new Map<string, string[]>();
    const incomingCount = new Map<string, number>();

    for (const node of nodes) {
      outgoing.set(node.id, []);
      incomingCount.set(node.id, 0);
    }

    for (const edge of edges) {
      outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    }

    const roots = nodes
      .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
      .sort((a, b) => {
        if (a.type === 'start' && b.type !== 'start') return -1;
        if (a.type !== 'start' && b.type === 'start') return 1;
        return a.position.y - b.position.y;
      });

    const workingIncomingCount = new Map(incomingCount);
    const levelByNode = new Map<string, number>();
    const queue = roots.map((node) => node.id);

    roots.forEach((node) => {
      levelByNode.set(node.id, 0);
    });

    while (queue.length > 0) {
      const currentId = queue.shift();

      if (!currentId) {
        continue;
      }

      const currentLevel = levelByNode.get(currentId) ?? 0;

      for (const target of outgoing.get(currentId) ?? []) {
        levelByNode.set(target, Math.max(levelByNode.get(target) ?? 0, currentLevel + 1));
        workingIncomingCount.set(target, (workingIncomingCount.get(target) ?? 0) - 1);

        if ((workingIncomingCount.get(target) ?? 0) <= 0) {
          queue.push(target);
        }
      }
    }

    let fallbackLevel = Math.max(...Array.from(levelByNode.values()), 0);
    for (const node of nodes) {
      if (!levelByNode.has(node.id)) {
        fallbackLevel += 1;
        levelByNode.set(node.id, fallbackLevel);
      }
    }

    const nodesByLevel = new Map<number, Node[]>();
    for (const node of nodes) {
      const level = levelByNode.get(node.id) ?? 0;
      nodesByLevel.set(level, [...(nodesByLevel.get(level) ?? []), node]);
    }

    const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b);
    const largestColumn = Math.max(...sortedLevels.map((level) => nodesByLevel.get(level)?.length ?? 0), 1);

    const arrangedPositions = new Map<string, { x: number; y: number }>();

    sortedLevels.forEach((level) => {
      const levelNodes = [...(nodesByLevel.get(level) ?? [])].sort((a, b) => a.position.y - b.position.y);
      const columnHeight = (levelNodes.length - 1) * VERTICAL_SPACING;
      const verticalOffset = ((largestColumn - 1) * VERTICAL_SPACING - columnHeight) / 2;

      levelNodes.forEach((node, index) => {
        arrangedPositions.set(node.id, {
          x: level * HORIZONTAL_SPACING,
          y: verticalOffset + index * VERTICAL_SPACING,
        });
      });
    });

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        position: arrangedPositions.get(node.id) ?? node.position,
      })),
    );

    requestAnimationFrame(() => {
      fitView({
        padding: 0.2,
        duration: 350,
      });
    });
  }, [edges, fitView, nodes, setNodes]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const bgColor = isDarkMode ? '#020617' : '#f8fafc';
  const dotColor = isDarkMode ? '#334155' : '#cbd5e1';
  const isShortViewport = viewportSize.height > 0 && viewportSize.height < 820;
  const isCompactViewport = viewportSize.width > 0 && viewportSize.width < 1440;
  const miniMapHeight = isShortViewport ? 96 : 136;
  const miniMapWidth = isShortViewport ? 150 : isCompactViewport ? 180 : 220;
  const miniMapBottomOffset = CONTROL_STACK_HEIGHT + OVERLAY_GAP * 2;
  
  const controlsStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    borderColor: isDarkMode ? '#1e293b' : '#e2e8f0',
    left: 16,
    bottom: 16,
    borderRadius: 12,
    zIndex: 6,
  };

  const miniMapStyle = {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    height: miniMapHeight,
    width: miniMapWidth,
    left: 16,
    bottom: miniMapBottomOffset,
    borderRadius: 16,
    zIndex: 5,
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
            onClick={handleAutoArrange}
          >
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Organize nodes
          </Button>
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

      <div className="flex min-h-0 min-w-0 w-full flex-1">
        <Sidebar />
        
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
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
              position="bottom-left"
              style={controlsStyle} 
              className="[&>button]:!bg-transparent [&>button]:!border-none [&>button]:!text-current hover:[&>button]:!bg-slate-100 dark:hover:[&>button]:!bg-slate-800 [&>button]:p-1 [&>button]:rounded-sm border shadow-lg backdrop-blur-sm" 
            />
            <MiniMap 
              position="bottom-left"
              style={miniMapStyle} 
              className="border shadow-lg backdrop-blur-sm"
              maskColor={isDarkMode ? 'rgba(2, 6, 23, 0.7)' : 'rgba(248, 250, 252, 0.7)'}
              nodeColor={isDarkMode ? '#334155' : '#cbd5e1'}
              pannable
              zoomable
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
