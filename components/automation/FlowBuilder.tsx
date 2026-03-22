'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  ProOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Save,
  Loader2,
  PlayCircle,
  PauseCircle,
  LayoutGrid,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  GitBranchPlus,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
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
import {
  generateAutomationFlow,
  saveAutomation,
  toggleAutomationStatus,
  type GenerateAutomationFlowResult,
} from '@/app/[locale]/(dashboard)/automation/actions';
import {
  AUTOMATION_AI_NODE_CATALOG,
  getAllowedNodeTypesForChannel,
  getDefaultNodeContentConstraints,
  insertGeneratedSubflow,
  validateAutomationCanvas,
  type AutomationAIChannel,
  type AutomationGeneratedFlow,
} from '@/lib/automation/ai-flow';
import { createAutomationCanvasNode } from '@/lib/automation/node-catalog';
import type { AutomationCanvasEdge, AutomationCanvasNode, AutomationCanvasNodeData, AutomationFlowEdge, AutomationFlowNode } from '@/lib/automation/flow-schema';

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
  condition: ConditionNode,
};

interface FlowBuilderProps {
  automationId: number;
  initialNodes: AutomationCanvasNode[];
  initialEdges: AutomationCanvasEdge[];
  initialActive: boolean;
}

const proOptions: ProOptions = { hideAttribution: true };
const CONTROL_STACK_HEIGHT = 116;
const OVERLAY_GAP = 16;
const HORIZONTAL_SPACING = 380;
const VERTICAL_SPACING = 170;

type InsertMode = 'replace' | 'insert';

function FlowBuilderContent({ automationId, initialNodes, initialEdges, initialActive }: FlowBuilderProps) {
  const t = useTranslations('Automation');
  const locale = useLocale();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<AutomationCanvasNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActive, setIsActive] = useState(initialActive);

  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [generatorPrompt, setGeneratorPrompt] = useState('');
  const [generatorChannel, setGeneratorChannel] = useState<AutomationAIChannel>('qr');
  const [generatorTemperature, setGeneratorTemperature] = useState(0.7);
  const [generatorMaxTokens, setGeneratorMaxTokens] = useState(1200);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<AutomationGeneratedFlow | null>(null);
  const [generationRawResponse, setGenerationRawResponse] = useState<string | null>(null);
  const [generationValidationErrors, setGenerationValidationErrors] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [insertMode, setInsertMode] = useState<InsertMode>('replace');

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

  const availableNodeTypes = useMemo(
    () => getAllowedNodeTypesForChannel(generatorChannel),
    [generatorChannel],
  );

  const generatorConstraints = useMemo(
    () => getDefaultNodeContentConstraints(generatorChannel),
    [generatorChannel],
  );

  const currentFlowHasEditableNodes = nodes.length > 0;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const resetGeneratorState = useCallback(() => {
    setGenerationResult(null);
    setGenerationRawResponse(null);
    setGenerationValidationErrors([]);
    setGenerationError(null);
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

      const newNode = createAutomationCanvasNode({
        type: type as AutomationCanvasNode['type'],
        position,
      });

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: AutomationCanvasNode) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeData = (id: string, data: Partial<AutomationCanvasNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...data } } as AutomationCanvasNode;
        }
        return node;
      })
    );
  };

  const handleSave = async () => {
    const flow = toObject();
    const validation = validateAutomationCanvas(flow.nodes as unknown[], flow.edges as unknown[]);

    if (!validation.success) {
      toast.error(t('ai_generator.validation_before_save_title'));
      setGenerationValidationErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    try {
      await saveAutomation(automationId, flow.nodes as AutomationFlowNode[], flow.edges as AutomationFlowEdge[]);
      toast.success(t('toast_saved'));
    } catch (error) {
      toast.error(t('ai_generator.save_failed'));
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
      toast.error('Failed to change status');
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

    const nodesByLevel = new Map<number, AutomationCanvasNode[]>();
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

  const handleGenerateFlow = async () => {
    if (generatorPrompt.trim().length < 10) {
      setGenerationError(t('ai_generator.prompt_too_short'));
      setGenerationValidationErrors([]);
      setGenerationResult(null);
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationValidationErrors([]);
    setGenerationResult(null);

    try {
      const result: GenerateAutomationFlowResult = await generateAutomationFlow({
        prompt: generatorPrompt,
        locale,
        channel: generatorChannel,
        allowedNodeTypes: availableNodeTypes,
        nodeContentConstraints: generatorConstraints,
        temperature: Number(generatorTemperature.toFixed(1)),
        maxOutputTokens: generatorMaxTokens,
      });

      setGenerationRawResponse(result.rawResponse ?? null);

      if (!result.success || !result.flow) {
        setGenerationError(result.error ?? t('ai_generator.generic_error'));
        setGenerationValidationErrors(result.validationErrors ?? []);
        return;
      }

      setGenerationResult(result.flow);
      setGenerationValidationErrors([]);
      toast.success(t('ai_generator.generated_toast'));
    } catch (error) {
      setGenerationError(t('ai_generator.generic_error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertGeneratedFlow = () => {
    if (!generationResult) {
      return;
    }

    if (insertMode === 'replace') {
      setNodes(generationResult.nodes as AutomationCanvasNode[]);
      setEdges(generationResult.edges as AutomationCanvasEdge[]);
      setSelectedNodeId(null);
      setIsGeneratorOpen(false);
      toast.success(t('ai_generator.inserted_replace_toast'));
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 350 }));
      return;
    }

    const mergeResult = insertGeneratedSubflow({
      currentNodes: nodes,
      currentEdges: edges,
      generatedNodes: generationResult.nodes,
      generatedEdges: generationResult.edges,
      selectedNodeId: selectedNodeId ?? '',
    });

    if (!mergeResult.success) {
      setGenerationError(mergeResult.error);
      return;
    }

    setNodes(mergeResult.nodes as AutomationCanvasNode[]);
    setEdges(mergeResult.edges as AutomationCanvasEdge[]);
    setIsGeneratorOpen(false);
    toast.success(t('ai_generator.inserted_subflow_toast'));
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 350 }));
  };

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
    <>
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
            <Button variant="outline" size="sm" onClick={() => {
              setIsGeneratorOpen(true);
              resetGeneratorState();
            }}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {t('ai_generator.open_btn')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleAutoArrange}>
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              {t('ai_generator.organize_btn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleActive}
              className={isActive ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}
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

          <PropertiesPanel selectedNode={selectedNode} onUpdateNode={updateNodeData} onClose={() => setSelectedNodeId(null)} />
        </div>
      </div>

      <Dialog open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('ai_generator.title')}</DialogTitle>
            <DialogDescription>{t('ai_generator.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 overflow-hidden lg:grid-cols-[1.1fr_0.9fr] flex-1 min-h-0">
            <div className="space-y-5 overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label htmlFor="ai-flow-prompt">{t('ai_generator.prompt_label')}</Label>
                <Textarea
                  id="ai-flow-prompt"
                  rows={8}
                  value={generatorPrompt}
                  onChange={(event) => setGeneratorPrompt(event.target.value)}
                  placeholder={t('ai_generator.prompt_placeholder')}
                  className="resize-none"
                />
              </div>

              <div className="space-y-3">
                <Label>{t('ai_generator.channel_label')}</Label>
                <RadioGroup
                  value={generatorChannel}
                  onValueChange={(value) => {
                    setGeneratorChannel(value as AutomationAIChannel);
                    resetGeneratorState();
                  }}
                  className="grid gap-3 md:grid-cols-2"
                >
                  {(['qr', 'api'] as AutomationAIChannel[]).map((channel) => (
                    <label key={channel} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:border-primary/60">
                      <RadioGroupItem value={channel} className="mt-1" />
                      <div className="space-y-1">
                        <div className="font-medium">{t(`ai_generator.channels.${channel}.title`)}</div>
                        <p className="text-sm text-muted-foreground">{t(`ai_generator.channels.${channel}.description`)}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t('ai_generator.temperature_label')}</Label>
                    <span className="text-xs text-muted-foreground">{generatorTemperature.toFixed(1)}</span>
                  </div>
                  <Slider
                    min={0}
                    max={2}
                    step={0.1}
                    value={[generatorTemperature]}
                    onValueChange={(value) => setGeneratorTemperature(value[0] ?? 0.7)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-flow-max-tokens">{t('ai_generator.max_tokens_label')}</Label>
                  <Input
                    id="ai-flow-max-tokens"
                    type="number"
                    min={128}
                    max={4096}
                    step={64}
                    value={generatorMaxTokens}
                    onChange={(event) => setGeneratorMaxTokens(Number(event.target.value) || 1200)}
                  />
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t('ai_generator.allowed_nodes_title')}</CardTitle>
                  <CardDescription>{t('ai_generator.allowed_nodes_desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {AUTOMATION_AI_NODE_CATALOG.filter((node) => node.channels.includes(generatorChannel)).map((node) => (
                    <div key={node.type} className="rounded-lg border p-3">
                      <div className="font-medium text-sm">{t(node.labelKey)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{node.description}</div>
                      <div className="text-xs mt-2 text-muted-foreground">{generatorConstraints[node.type]}</div>
                      <div className="text-[11px] mt-2 text-muted-foreground">{node.examples.join(' · ')}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              <Card>
                <CardHeader>
                  <CardTitle>{t('ai_generator.preview_title')}</CardTitle>
                  <CardDescription>{t('ai_generator.preview_desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {generationError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        {generationError}
                      </div>
                    </div>
                  )}

                  {generationValidationErrors.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        {t('ai_generator.validation_errors_title')}
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-700/90 dark:text-amber-300">
                        {generationValidationErrors.map((error, index) => (
                          <li key={`${error}-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {generationResult ? (
                    <>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          {generationResult.suggestedName}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {t('ai_generator.preview_counts', {
                            nodes: generationResult.nodes.length,
                            edges: generationResult.edges.length,
                          })}
                        </div>
                      </div>

                      {generationResult.warnings.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">{t('ai_generator.warnings_title')}</div>
                          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            {generationResult.warnings.map((warning, index) => (
                              <li key={`${warning}-${index}`}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {currentFlowHasEditableNodes && (
                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="text-sm font-medium">{t('ai_generator.insert_mode_title')}</div>
                          <RadioGroup value={insertMode} onValueChange={(value) => setInsertMode(value as InsertMode)} className="grid gap-3">
                            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:border-primary/60">
                              <RadioGroupItem value="replace" className="mt-1" />
                              <div>
                                <div className="flex items-center gap-2 font-medium"><RotateCcw className="h-4 w-4" /> {t('ai_generator.insert_modes.replace_title')}</div>
                                <p className="text-sm text-muted-foreground">{t('ai_generator.insert_modes.replace_desc')}</p>
                              </div>
                            </label>
                            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:border-primary/60">
                              <RadioGroupItem value="insert" className="mt-1" />
                              <div>
                                <div className="flex items-center gap-2 font-medium"><GitBranchPlus className="h-4 w-4" /> {t('ai_generator.insert_modes.insert_title')}</div>
                                <p className="text-sm text-muted-foreground">{t('ai_generator.insert_modes.insert_desc')}</p>
                              </div>
                            </label>
                          </RadioGroup>
                          {insertMode === 'insert' && (
                            <p className="text-xs text-muted-foreground">
                              {selectedNodeId
                                ? t('ai_generator.selected_node_ready', { nodeId: selectedNodeId })
                                : t('ai_generator.select_node_hint')}
                            </p>
                          )}
                        </div>
                      )}

                      <Separator />

                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium mb-2">{t('ai_generator.nodes_title')}</div>
                          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                            {generationResult.nodes.map((node) => (
                              <div key={node.id} className="rounded-lg border p-3 text-sm">
                                <div className="font-medium">{node.type}</div>
                                <div className="text-xs text-muted-foreground mt-1">{node.id}</div>
                                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(node.data, null, 2)}</pre>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium mb-2">{t('ai_generator.edges_title')}</div>
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {generationResult.edges.map((edge) => (
                              <div key={edge.id} className="rounded-lg border p-3 text-xs text-muted-foreground">
                                <div>{edge.source} → {edge.target}</div>
                                {(edge.sourceHandle || edge.targetHandle) && (
                                  <div className="mt-1">
                                    {edge.sourceHandle ? `sourceHandle=${edge.sourceHandle}` : null}
                                    {edge.sourceHandle && edge.targetHandle ? ' · ' : null}
                                    {edge.targetHandle ? `targetHandle=${edge.targetHandle}` : null}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      {isGenerating ? t('ai_generator.generating_preview') : t('ai_generator.empty_preview')}
                    </div>
                  )}

                  {generationRawResponse && !generationResult && (
                    <details className="rounded-lg border p-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium">{t('ai_generator.raw_response_title')}</summary>
                      <pre className="mt-3 whitespace-pre-wrap break-words">{generationRawResponse}</pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGeneratorOpen(false)}>{t('ai_generator.cancel_btn')}</Button>
            <Button variant="outline" onClick={handleGenerateFlow} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {isGenerating ? t('ai_generator.generating_btn') : t('ai_generator.generate_btn')}
            </Button>
            <Button
              onClick={handleInsertGeneratedFlow}
              disabled={!generationResult || generationValidationErrors.length > 0 || (insertMode === 'insert' && !selectedNodeId)}
            >
              {t('ai_generator.insert_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderContent {...props} />
    </ReactFlowProvider>
  );
}
