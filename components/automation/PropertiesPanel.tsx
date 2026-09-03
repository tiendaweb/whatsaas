import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DraftShortcutsModal } from '@/components/chat/DraftShortcutsModal';
import type { DraftItem } from '@/components/drafts/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { ArrowRight, X, Save, Plus, Trash2, UploadCloud, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createAutomation, saveAutomation } from '@/app/[locale]/(dashboard)/automation/actions';
import type {
  AutomationCanvasNode,
  AutomationCanvasNodeData,
  AIControlNodeData,
  ButtonMessageButton,
  ConditionEntry,
  FormField,
  ListMessageItem,
  MediaNodeData,
  AutomationFlowNode,
  MenuSimpleMarkerStyle,
  MenuSimpleOption,
  StartNodeData,
} from '@/lib/automation/flow-schema';
import { MENU_SIMPLE_MARKER_STYLES } from '@/lib/automation/flow-schema';
import { buildMenuSimpleMessage, getMenuMarker } from '@/lib/automation/menu-simple';
import {
  createAutomationCanvasNode,
  getAutomationNodeCatalogEntry,
  getEditableFieldDefinition,
  mergeAutomationNodeDataWithDefaults,
  validateAutomationNodeData,
} from '@/lib/automation/node-catalog';

const MAX_SELECT_LABEL_CHARS = 60;
const FLOW_START_TARGET_VALUE = '__flow_start__';

function truncateSelectLabel(label: string, maxChars = MAX_SELECT_LABEL_CHARS) {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 1)}…`;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PropertiesPanelProps {
  selectedNode: AutomationCanvasNode | null;
  nodes: AutomationCanvasNode[];
  currentAutomationId: number;
  availableAutomations: Array<{ id: number; name: string; instanceId: number | null }>;
  hasUnsavedChanges: boolean;
  onNavigateToAutomation: (automationId: number) => void;
  onUpdateNode: (id: string, data: Partial<AutomationCanvasNodeData>) => void;
  onClose: () => void;
  variant?: 'sidebar' | 'modal';
  currentInstanceId?: number | null;
  onSelectNode?: (nodeId: string) => void;
}

export function PropertiesPanel({
  selectedNode,
  nodes,
  currentAutomationId,
  availableAutomations,
  hasUnsavedChanges,
  onNavigateToAutomation,
  onUpdateNode,
  onClose,
  variant = 'sidebar',
  currentInstanceId,
  onSelectNode,
}: PropertiesPanelProps) {
  const t = useTranslations('Automation');
  const [label, setLabel] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [seconds, setSeconds] = useState<number>(2);
  
  const [variable, setVariable] = useState('');

  const [saveNameVar, setSaveNameVar] = useState('');
  const [saveAgentId, setSaveAgentId] = useState('null');
  const [saveDepartmentId, setSaveDepartmentId] = useState('null');
  const [saveTagId, setSaveTagId] = useState('null');
  const [saveFunnelId, setSaveFunnelId] = useState('null');
  const [saveCustomFields, setSaveCustomFields] = useState<Record<string, string>>({});

  const [triggerType, setTriggerType] = useState<NonNullable<StartNodeData['triggerType']>>('contains');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [conditionStage, setConditionStage] = useState<string>('null');
  const [conditionTag, setConditionTag] = useState<string>('null');
  const [conditionAgent, setConditionAgent] = useState<string>('null');
  const [conditionDepartment, setConditionDepartment] = useState<string>('null');

  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<NonNullable<MediaNodeData['mediaType']>>('image');
  const [mediaCaption, setMediaCaption] = useState('');
  const [fileName, setFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [draftShortcutsOpen, setDraftShortcutsOpen] = useState(false);
  const [draftShortcutQuery, setDraftShortcutQuery] = useState('');
  const [draftInsertTarget, setDraftInsertTarget] = useState<'label' | 'title' | 'bodyText' | 'footerText' | 'buttonText' | null>(null);
  const [buttons, setButtons] = useState<ButtonMessageButton[]>([]);
  const [listItems, setListItems] = useState<ListMessageItem[]>([]);

  const [aiAction, setAiAction] = useState<AIControlNodeData['action']>('active');

  const [conditions, setConditions] = useState<ConditionEntry[]>([]);
  const [menuMarkerStyle, setMenuMarkerStyle] = useState<MenuSimpleMarkerStyle>('emoji_number');
  const [menuOptions, setMenuOptions] = useState<MenuSimpleOption[]>([]);
  const [menuGlobalDelay, setMenuGlobalDelay] = useState<number>(0);
  const [menuVariable, setMenuVariable] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [goToMode, setGoToMode] = useState<'previous_node' | 'specific_node' | 'other_flow'>('previous_node');
  const [goToFallbackAction, setGoToFallbackAction] = useState<'stop' | 'node'>('stop');
  const [goToTargetNodeId, setGoToTargetNodeId] = useState('');
  const [goToTargetAutomationId, setGoToTargetAutomationId] = useState('');
  const [goToFallbackNodeId, setGoToFallbackNodeId] = useState('');

  const [referenceName, setReferenceName] = useState('');

  // Dirty tracking for unsaved changes prompt
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const markDirty = () => setIsDirty(true);

  const shouldFetchCRM = selectedNode?.type === 'start' || selectedNode?.type === 'save_contact';
  const { data: funnelStages } = useSWR<any[]>(shouldFetchCRM ? '/api/funnel-stages' : null, fetcher);
  const { data: tags } = useSWR<any[]>(shouldFetchCRM ? '/api/tags' : null, fetcher);
  const { data: teamData } = useSWR<any>(shouldFetchCRM ? '/api/team' : null, fetcher);
  const { data: customFields } = useSWR<any[]>(shouldFetchCRM ? '/api/custom-fields' : null, fetcher);
  const { data: departmentsList } = useSWR<any[]>(shouldFetchCRM ? '/api/departments' : null, fetcher);
  const { data: drafts } = useSWR<DraftItem[]>('/api/drafts', fetcher);
  const shouldFetchTargetAutomationNodes =
    selectedNode?.type === 'go_to_node' &&
    goToMode === 'other_flow' &&
    Boolean(goToTargetAutomationId);
  const { data: targetAutomationData } = useSWR<{ nodes?: AutomationCanvasNode[] }>(
    shouldFetchTargetAutomationNodes
      ? `/api/automation/${goToTargetAutomationId}/nodes`
      : null,
    fetcher,
  );
  
  const agents = teamData?.teamMembers?.map((tm: any) => tm.user) || [];
  const selectedNodeMeta = selectedNode ? getAutomationNodeCatalogEntry(selectedNode.type) : null;
  const nodeOrder = useMemo(
    () =>
      // Use logical flow order if possible (ensures end nodes after chat/delay content,
      // delays not before their triggers). Fallback to position sort.
      // We compute a lightweight BFS here without full import to keep independent.
      (() => {
        const executableNodes = nodes.filter((n) => n.type !== "sticky_note");
        const start = executableNodes.find((n) => n.type === "start");
        if (!start || executableNodes.length <= 1) {
          return [...executableNodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
        }
        const adj = new Map<string, string[]>();
        executableNodes.forEach((n) => adj.set(n.id, []));
        // Note: edges not passed to this panel easily; use only nodes for fallback topo via positions + type rank
        const rank = (n: any) => (n.type === "end" ? 100 : n.type === "delay" ? 40 : n.type === "start" ? -10 : 0);
        return [...executableNodes].sort((a, b) => {
          const r = rank(a) - rank(b);
          if (r !== 0) return r;
          return a.position.x - b.position.x || a.position.y - b.position.y;
        });
      })(),
    [nodes],
  );
  const currentFlowNodeOptions = useMemo(() => {
    if (!selectedNode) return [];
    return nodeOrder
      .filter(
        (node) =>
          node.id !== selectedNode.id &&
          !['start', 'end', 'go_to_node', 'sticky_note'].includes(node.type),
      )
      .map((node) => {
        const ref = (node.data as any)?.referenceName;
        const display = ref ? `${ref} (${node.data.label || node.type})` : (node.data.label || node.type);
        return {
          value: node.id,
          label: truncateSelectLabel(String(display)),
        };
      });
  }, [nodeOrder, selectedNode]);
  const flowAutomationOptions = useMemo(
    () =>
      availableAutomations
        .filter((automation) => automation.id !== currentAutomationId)
        .map((automation) => ({
          value: String(automation.id),
          label: truncateSelectLabel(automation.name),
        })),
    [availableAutomations, currentAutomationId],
  );
  const targetAutomationNodeOptions = useMemo(() => {
    const nodesInAutomation = targetAutomationData?.nodes ?? [];
    return [...nodesInAutomation]
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
      .filter(
        (node) =>
          !['start', 'end', 'go_to_node', 'sticky_note'].includes(node.type),
      )
      .map((node) => {
        const ref = (node.data as any)?.referenceName;
        const display = ref ? `${ref} (${node.data.label || node.type})` : (node.data.label || node.type);
        return {
          value: node.id,
          label: truncateSelectLabel(String(display)),
        };
      });
  }, [targetAutomationData]);
  useEffect(() => {
    if (
      goToMode === 'other_flow' &&
      goToTargetNodeId &&
      goToTargetNodeId !== FLOW_START_TARGET_VALUE &&
      targetAutomationData?.nodes?.some(
        (node) => node.id === goToTargetNodeId && node.type === 'start',
      )
    ) {
      setGoToTargetNodeId(FLOW_START_TARGET_VALUE);
    }
  }, [
    goToMode,
    goToTargetNodeId,
    targetAutomationData,
  ]);
  const optionsFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'options') : null;
  const buttonsFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'buttons') : null;
  const listItemsFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'items') : null;
  const conditionsFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'conditions') : null;
  const listButtonTextFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'buttonText') : null;
  const ctaUrlFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'url') : null;
  const mediaCaptionFieldMeta = selectedNode ? getEditableFieldDefinition(selectedNode.type, 'caption') : null;

  useEffect(() => {
    if (selectedNode) {
      const mergedData = mergeAutomationNodeDataWithDefaults(selectedNode.type, selectedNode.data);
      setIsDirty(false);

      setLabel((mergedData.label as string) || '');
      setTitle((mergedData.title as string) || '');
      setBodyText((mergedData.bodyText as string) || '');
      setFooterText((mergedData.footerText as string) || '');
      setButtonText((mergedData.buttonText as string) || '');

      if (selectedNode.type === 'options') setOptions((mergedData.options as string[]) || []);
      if (selectedNode.type === 'delay') setSeconds(Number(mergedData.seconds) || 2);

      if (selectedNode.type === 'collect') {
        setVariable((mergedData.variable as string) || '');
      }

      if (selectedNode.type === 'save_contact') {
        setSaveNameVar((mergedData.nameVariable as string) || '');
        setSaveAgentId((mergedData.agentId as string) || 'null');
        setSaveDepartmentId((mergedData.departmentId as string) || 'null');
        setSaveTagId((mergedData.tagId as string) || 'null');
        setSaveFunnelId((mergedData.funnelStageId as string) || 'null');
        setSaveCustomFields((mergedData.customFields as Record<string, string>) || {});
      }

      if (selectedNode.type === 'start') {
        setTriggerType(mergedData.triggerType || 'first_message');
        setKeywords((mergedData.keywords as string[]) || []);
        const conditions = (mergedData.conditions as StartNodeData['conditions']) || {};
        setConditionStage(conditions.funnelStageId || 'null');
        setConditionTag(conditions.tagId || 'null');
        setConditionAgent(conditions.assignedUserId || 'null');
        setConditionDepartment(conditions.departmentId || 'null');
      }

      if (selectedNode.type === 'media') {
        setMediaUrl((mergedData.mediaUrl as string) || '');
        setMediaType(mergedData.mediaType || 'image');
        setMediaCaption((mergedData.caption as string) || '');
        setFileName((mergedData.fileName as string) || '');
      }

      if (selectedNode.type === 'button_message') {
        setButtons((mergedData.buttons as ButtonMessageButton[]) || []);
      }

      if (selectedNode.type === 'list_message') {
        setListItems((mergedData.items as ListMessageItem[]) || []);
      }

      if (selectedNode.type === 'call_to_action') {
        setCtaUrl((mergedData.url as string) || '');
      }

      if (selectedNode.type === 'ai_control') {
        setAiAction(mergedData.action || 'active');
      }

      if (selectedNode.type === 'condition') {
        setConditions((mergedData.conditions as ConditionEntry[]) || []);
      }

      if (selectedNode.type === 'menu_simple') {
        setLabel((mergedData.label as string) || '');
        setMenuMarkerStyle((mergedData.markerStyle as MenuSimpleMarkerStyle) || 'emoji_number');
        setMenuOptions((mergedData.menuOptions as MenuSimpleOption[]) || []);
        setMenuGlobalDelay(Number(mergedData.globalDelaySeconds) || 0);
        setMenuVariable((mergedData.variable as string) || '');
      }

      if (selectedNode.type === 'form') {
        setFormFields((mergedData.fields as FormField[]) || []);
      }

      if (selectedNode.type === 'go_to_node') {
        const nextMode = (mergedData.mode as 'previous_node' | 'specific_node' | 'other_flow') || 'previous_node';
        setGoToMode(nextMode);
        setGoToTargetNodeId(
          (mergedData.targetNodeId as string) ||
            (nextMode === 'other_flow' ? FLOW_START_TARGET_VALUE : ''),
        );
        setGoToTargetAutomationId(String(mergedData.targetAutomationId || ''));
        const fallbackNodeId = (mergedData.fallbackNodeId as string) || '';
        const fallbackAction = mergedData.fallbackAction === 'node' || mergedData.fallbackAction === 'stop'
          ? mergedData.fallbackAction
          : (fallbackNodeId ? 'node' : 'stop');
        setGoToFallbackAction(fallbackAction);
        setGoToFallbackNodeId(fallbackNodeId);
      }

      if (selectedNode.type === 'sticky_note') {
        setTitle((mergedData.title as string) || '');
        setBodyText((mergedData.bodyText as string) || '');
      }

      setReferenceName((mergedData.referenceName as string) || '');
    }
  }, [selectedNode]);

  if (!selectedNode) {
    const isModal = variant === 'modal';
    return (
      <aside className={cn(
        'flex min-h-0 shrink-0 flex-col items-center justify-center overflow-hidden border-l border-border bg-background p-6 text-center',
        isModal ? 'w-full border-0' : 'w-[clamp(18rem,24vw,22rem)] min-w-[18rem] max-w-[22rem] resize-x'
      )}>
        <p className="text-sm text-muted-foreground">{t('select_node_to_edit')}</p>
      </aside>
    );
  }

  const handleSave = (): boolean => {
    let dataToSave: Partial<AutomationCanvasNodeData> = { label, referenceName };

    if (selectedNode.type === 'message' || selectedNode.type === 'collect' || selectedNode.type === 'options') {
       dataToSave.label = label;
    }

    if (selectedNode.type === 'options') dataToSave.options = options;
    if (selectedNode.type === 'delay') dataToSave.seconds = seconds;
    if (selectedNode.type === 'collect') {
      dataToSave.variable = variable;
    }

    if (selectedNode.type === 'save_contact') {
      dataToSave.nameVariable = saveNameVar;
      dataToSave.agentId = saveAgentId;
      dataToSave.departmentId = saveDepartmentId;
      dataToSave.tagId = saveTagId;
      dataToSave.funnelStageId = saveFunnelId;
      dataToSave.customFields = saveCustomFields;
    }

    if (selectedNode.type === 'start') {
      dataToSave = {
        ...dataToSave,
        triggerType,
        keywords,
        conditions: {
          funnelStageId: conditionStage !== 'null' ? conditionStage : undefined,
          tagId: conditionTag !== 'null' ? conditionTag : undefined,
          assignedUserId: conditionAgent !== 'null' ? conditionAgent : undefined,
          departmentId: conditionDepartment !== 'null' ? conditionDepartment : undefined,
        }
      };
    }

    if (selectedNode.type === 'media') {
      dataToSave.mediaUrl = mediaUrl;
      dataToSave.mediaType = mediaType;
      dataToSave.caption = mediaCaption;
      dataToSave.fileName = fileName;
    }

    if (['button_message', 'list_message', 'call_to_action'].includes(selectedNode.type || '')) {
      dataToSave.title = title;
      dataToSave.bodyText = bodyText;
      dataToSave.footerText = footerText;
      dataToSave.buttonText = buttonText;
    }

    if (selectedNode.type === 'sticky_note') {
      dataToSave.title = title;
      dataToSave.bodyText = bodyText;
    }

    if (selectedNode.type === 'button_message') {
      dataToSave.buttons = buttons;
    }

    if (selectedNode.type === 'list_message') {
      dataToSave.items = listItems;
    }

    if (selectedNode.type === 'call_to_action') {
      dataToSave.url = ctaUrl;
    }

    if (selectedNode.type === 'ai_control') {
      dataToSave.action = aiAction;
    }

    if (selectedNode.type === 'condition') {
      dataToSave.conditions = conditions;
    }

    if (selectedNode.type === 'menu_simple') {
      const cleanedOptions = menuOptions
        .map((option) => ({
          ...option,
          text: option.text.trim(),
          matchValue: option.matchValue?.trim() || undefined,
          matchValue2: option.matchValue2?.trim() || undefined,
        }))
        .filter((option) => option.text.length > 0);

      if (cleanedOptions.length === 0) {
        toast.error(t('menu_simple_validation_options_required'));
        return false;
      }

      dataToSave.label = label;
      dataToSave.markerStyle = menuMarkerStyle;
      dataToSave.menuOptions = cleanedOptions;
      dataToSave.globalDelaySeconds = Number.isFinite(menuGlobalDelay) ? Math.max(0, menuGlobalDelay) : 0;
      dataToSave.variable = menuVariable.trim() || undefined;
    }

    if (selectedNode.type === 'form') {
      const cleanedFields = formFields.map((field, fieldIndex) => ({
        ...field,
        label: field.label.trim(),
        variable: field.variable.trim(),
        markerStyle: field.markerStyle || 'emoji_number',
        menuOptions:
          field.type === 'menu'
            ? (field.menuOptions ?? [])
                .map((option) => ({ ...option, text: option.text.trim() }))
                .filter((option) => option.text.length > 0)
            : undefined,
      }));
      const invalidField = cleanedFields.find(
        (field) =>
          !field.label ||
          !field.variable ||
          (field.type === 'menu' && (!field.menuOptions || field.menuOptions.length === 0)),
      );
      if (cleanedFields.length === 0 || invalidField) {
        toast.error(t('form_validation_required'));
        return false;
      }
      const variables = cleanedFields.map((field) => field.variable);
      if (new Set(variables).size !== variables.length) {
        toast.error(t('form_validation_unique_variables'));
        return false;
      }
      dataToSave.fields = cleanedFields;
    }

    if (selectedNode.type === 'go_to_node') {
      const trimmedTargetNodeId = goToTargetNodeId.trim();
      const trimmedTargetAutomationId = goToTargetAutomationId.trim();
      const targetsFlowStart = trimmedTargetNodeId === FLOW_START_TARGET_VALUE;
      const isTargetNodeInSelectedAutomation = targetAutomationNodeOptions.some(
        (node) => node.value === trimmedTargetNodeId,
      );

      if (goToMode === 'specific_node' && !trimmedTargetNodeId) {
        toast.error(t('go_to_validation_target_node_required'));
        return false;
      }

      if (goToMode === 'other_flow') {
        if (!trimmedTargetAutomationId) {
          toast.error(t('go_to_validation_target_automation_required'));
          return false;
        }

        if (!targetsFlowStart && (!trimmedTargetNodeId || !isTargetNodeInSelectedAutomation)) {
          toast.error(t('go_to_validation_target_node_invalid_other_flow'));
          return false;
        }
      }

      dataToSave.mode = goToMode;
      dataToSave.targetNodeId = targetsFlowStart ? undefined : (trimmedTargetNodeId || undefined);
      dataToSave.targetAutomationId = trimmedTargetAutomationId || undefined;
      dataToSave.fallbackAction = goToFallbackAction;
      dataToSave.fallbackNodeId = goToFallbackAction === 'node' ? (goToFallbackNodeId.trim() || undefined) : undefined;
    }

    const mergedData = mergeAutomationNodeDataWithDefaults(selectedNode.type, dataToSave);
    const validation = validateAutomationNodeData(selectedNode.type, mergedData);

    if (!validation.success) {
      toast.error(validation.errors[0] || 'Invalid node configuration.');
      return false;
    }

    onUpdateNode(selectedNode.id, validation.data);
    setIsDirty(false);
    return true;
  };

  // Apply the form to the node first (so "el elemento" is saved), aborting if
  // validation fails. Returns whether it's safe to continue.
  const applyChangesIfNeeded = (): boolean => {
    if (!isDirty) return true;
    return handleSave();
  };

  // "Ir al nodo destino" inside the current flow: apply + select it locally.
  const handleGoToNodeInCurrentFlow = (nodeId: string) => {
    if (!nodeId) return;
    if (!applyChangesIfNeeded()) return;
    if (onSelectNode) {
      onSelectNode(nodeId);
    } else {
      toast.info('Nodo seleccionado en el flujo actual');
    }
  };

  // Jump to another automation: apply the node, then navigate (the navigation
  // handler in the builder persists the whole flow before leaving). We defer one
  // frame so the applied change is committed before it gets saved.
  const handleGoToTargetAutomation = () => {
    if (!goToTargetAutomationId) return;
    if (!applyChangesIfNeeded()) return;
    const targetAutomationId = Number(goToTargetAutomationId);
    if (!Number.isFinite(targetAutomationId)) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => onNavigateToAutomation(targetAutomationId)),
    );
  };

  const handleConvertStickyNote = async () => {
    if (selectedNode?.type !== 'sticky_note') return;
    if (!currentInstanceId) {
      toast.error('No se pudo identificar la instancia conectada.');
      return;
    }

    const noteTitle = title.trim() || 'Nota sticky';
    const noteBody = bodyText.trim();
    const flowName = noteTitle;

    try {
      const automation = await createAutomation(flowName, currentInstanceId);
      const startNode = createAutomationCanvasNode({
        type: 'start',
        position: { x: 0, y: 0 },
        data: {
          label: 'Start',
          triggerType: 'first_message',
          keywords: [],
          conditions: {},
        },
      }) as AutomationFlowNode;
      const messageNode = createAutomationCanvasNode({
        type: 'message',
        position: { x: 340, y: 0 },
        data: {
          label: noteBody || noteTitle,
        },
      }) as AutomationFlowNode;

      await saveAutomation(automation.id, [startNode, messageNode], [{
        id: `edge-${Date.now()}`,
        source: startNode.id,
        target: messageNode.id,
        sourceHandle: null,
        targetHandle: null,
      }]);

      toast.success('La nota se convirtió en una automatización nueva.');
      onNavigateToAutomation(automation.id);
    } catch (error) {
      toast.error('No se pudo convertir la nota en automatización.');
    }
  };

  const handleCloseRequest = () => {
    if (isDirty) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const confirmClose = (save: boolean) => {
    if (save) {
      handleSave();
    }
    setShowConfirmDialog(false);
    onClose();
    setIsDirty(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/automation/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.url) {
            setMediaUrl(data.url);
            setFileName(data.filename);
            
            const mime = data.mimetype || '';
            if(mime.startsWith('image')) setMediaType('image');
            else if(mime.startsWith('video')) setMediaType('video');
            else if(mime.startsWith('audio')) setMediaType('audio');
            else setMediaType('document');
        }
    } catch (err) {
        console.error(err);
    } finally {
        setIsUploading(false);
    }
  };

  const addKeyword = () => { if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) { setKeywords([...keywords, keywordInput.trim()]); setKeywordInput(''); } };
  const removeKeyword = (k: string) => { setKeywords(keywords.filter(kw => kw !== k)); };
  
  const addOption = () => {
    if (typeof optionsFieldMeta?.max === 'number' && options.length >= optionsFieldMeta.max) return;
    setOptions([...options, `Option ${options.length + 1}`]);
  };
  const removeOption = (index: number) => setOptions(options.filter((_, i) => i !== index));
  const updateOption = (index: number, value: string) => { const newOptions = [...options]; newOptions[index] = value; setOptions(newOptions); };

  const addButton = () => {
    if (typeof buttonsFieldMeta?.max === 'number' && buttons.length >= buttonsFieldMeta.max) return;
    setButtons([...buttons, { id: Date.now().toString(), text: '', value: '' }]);
  };
  const removeButton = (idx: number) => setButtons(buttons.filter((_, i) => i !== idx));
  const updateButton = (idx: number, field: keyof ButtonMessageButton, val: string) => {
    setButtons((current) => current.map((button, index) => index === idx ? { ...button, [field]: val } : button));
  };

  const addListItem = () => {
    if (typeof listItemsFieldMeta?.max === 'number' && listItems.length >= listItemsFieldMeta.max) return;
    setListItems([...listItems, { id: Date.now().toString(), title: '', description: '', rowId: '' }]);
  };
  const removeListItem = (idx: number) => setListItems(listItems.filter((_, i) => i !== idx));
  const updateListItem = (idx: number, field: keyof ListMessageItem, val: string) => {
    setListItems((current) => current.map((item, index) => index === idx ? { ...item, [field]: val } : item));
  };

  const addCondition = () => {
    if (typeof conditionsFieldMeta?.max === 'number' && conditions.length >= conditionsFieldMeta.max) return;
    setConditions([...conditions, { id: `cond-${Date.now()}`, type: 'text', operator: 'equals', value: '' }]);
    markDirty();
  };
  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
    markDirty();
  };
  const updateCondition = (idx: number, field: keyof ConditionEntry, val: string) => {
    setConditions((current) => current.map((condition, index) => index === idx ? { ...condition, [field]: val } : condition));
    markDirty();
  };

  const addMenuOption = () => {
    if (menuOptions.length >= 10) return;
    setMenuOptions([...menuOptions, { id: `opt-${Date.now()}`, text: `Opción ${menuOptions.length + 1}` }]);
    markDirty();
  };
  const removeMenuOption = (idx: number) => {
    setMenuOptions(menuOptions.filter((_, i) => i !== idx));
    markDirty();
  };
  const updateMenuOption = (idx: number, field: keyof MenuSimpleOption, val: string) => {
    setMenuOptions((current) =>
      current.map((option, index) => (index === idx ? { ...option, [field]: val } : option)),
    );
    markDirty();
  };

  const addFormField = (type: FormField['type']) => {
    if (formFields.length >= 20) return;
    const id = `field-${Date.now()}-${formFields.length + 1}`;
    setFormFields((current) => [
      ...current,
      {
        id,
        type,
        label:
          type === 'menu'
            ? t('form_default_menu_question')
            : t('form_default_text_question'),
        variable: `respuesta_${current.length + 1}`,
        markerStyle: 'emoji_number',
        menuOptions:
          type === 'menu'
            ? [
                { id: `${id}-option-1`, text: t('form_default_option', { number: 1 }) },
                { id: `${id}-option-2`, text: t('form_default_option', { number: 2 }) },
              ]
            : undefined,
      },
    ]);
    markDirty();
  };

  const updateFormField = (index: number, patch: Partial<FormField>) => {
    setFormFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index
          ? {
              ...field,
              ...patch,
              menuOptions:
                patch.type === 'menu' && !field.menuOptions?.length
                  ? [
                      { id: `${field.id}-option-1`, text: t('form_default_option', { number: 1 }) },
                      { id: `${field.id}-option-2`, text: t('form_default_option', { number: 2 }) },
                    ]
                  : patch.type === 'text'
                    ? undefined
                    : patch.menuOptions ?? field.menuOptions,
            }
          : field,
      ),
    );
    markDirty();
  };

  const removeFormField = (index: number) => {
    if (formFields.length <= 1) return;
    setFormFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
    markDirty();
  };

  const addFormMenuOption = (fieldIndex: number) => {
    const field = formFields[fieldIndex];
    if (!field || (field.menuOptions?.length ?? 0) >= 10) return;
    const optionNumber = (field.menuOptions?.length ?? 0) + 1;
    updateFormField(fieldIndex, {
      menuOptions: [
        ...(field.menuOptions ?? []),
        {
          id: `${field.id}-option-${Date.now()}`,
          text: t('form_default_option', { number: optionNumber }),
        },
      ],
    });
  };

  const updateFormMenuOption = (
    fieldIndex: number,
    optionIndex: number,
    text: string,
  ) => {
    const field = formFields[fieldIndex];
    if (!field) return;
    updateFormField(fieldIndex, {
      menuOptions: (field.menuOptions ?? []).map((option, index) =>
        index === optionIndex ? { ...option, text } : option,
      ),
    });
  };

  const removeFormMenuOption = (fieldIndex: number, optionIndex: number) => {
    const field = formFields[fieldIndex];
    if (!field || (field.menuOptions?.length ?? 0) <= 1) return;
    updateFormField(fieldIndex, {
      menuOptions: (field.menuOptions ?? []).filter(
        (_, index) => index !== optionIndex,
      ),
    });
  };

  const maybeOpenDraftShortcuts = (
    value: string,
    target: 'label' | 'title' | 'bodyText' | 'footerText' | 'buttonText',
  ) => {
    if (!value.startsWith('##')) return;
    setDraftShortcutQuery(value.slice(2).trim());
    setDraftInsertTarget(target);
    setDraftShortcutsOpen(true);
  };

  const handleInsertDraft = (renderedText: string) => {
    if (draftInsertTarget === 'label') setLabel(renderedText);
    if (draftInsertTarget === 'title') setTitle(renderedText);
    if (draftInsertTarget === 'bodyText') setBodyText(renderedText);
    if (draftInsertTarget === 'footerText') setFooterText(renderedText);
    if (draftInsertTarget === 'buttonText') setButtonText(renderedText);
    setDraftInsertTarget(null);
    setDraftShortcutsOpen(false);
    toast.success('Borrador insertado en el nodo.');
  };

  const handleDraftModalOpenChange = (open: boolean) => {
    setDraftShortcutsOpen(open);
    if (!open) setDraftInsertTarget(null);
  };

  const isModal = variant === 'modal';
  return (
    <aside className={cn(
      'flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-background',
      isModal ? 'w-full border-0' : 'w-[clamp(18rem,24vw,22rem)] min-w-[18rem] max-w-[22rem] resize-x'
    )}>
      <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30 shrink-0">
        <div>
          <h2 className="font-semibold text-sm">{t('properties_title')}</h2>
          {selectedNodeMeta ? <p className="text-[11px] text-muted-foreground">{t(selectedNodeMeta.labelKey)}</p> : null}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCloseRequest}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6 custom-scrollbar">
        
        <div className="space-y-2">
          <Label>Nombre de referencia interna (opcional)</Label>
          <Input
            value={referenceName}
            onChange={(e) => {
              setReferenceName(e.target.value);
              markDirty();
            }}
            placeholder="Ej: bienvenida_cliente_vip"
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">Usado para identificar el nodo internamente (GoTo, logs, etc).</p>
        </div>

        {(selectedNode.type === 'message' || selectedNode.type === 'options' || selectedNode.type === 'collect') && (
          <div className="space-y-2">
            <Label>{selectedNode.type === 'collect' ? t('question_label') : t('message_text_label')}</Label>
            <Textarea
              rows={4}
              value={label}
              onChange={(e) => {
                const nextValue = e.target.value;
                setLabel(nextValue);
                markDirty();
                maybeOpenDraftShortcuts(nextValue, 'label');
              }}
              placeholder={t('type_placeholder')}
              className="resize-none"
            />
          </div>
        )}

        {selectedNode.type === 'sticky_note' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titulo de la nota</Label>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
                placeholder="Ej: Pendiente de validacion"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label>Contenido de la nota</Label>
              <Textarea
                rows={5}
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value);
                  markDirty();
                }}
                placeholder="Escribe una referencia, una decision o un plan de trabajo."
                className="resize-none"
              />
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleConvertStickyNote}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Convertir en automatizacion
            </Button>
          </div>
        )}

        {selectedNode.type === 'ai_control' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('action_label')}</Label>
              <Select value={aiAction} onValueChange={(value) => setAiAction(value as AIControlNodeData['action'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('enable_ai_select')}</SelectItem>
                  <SelectItem value="paused">{t('disable_pause_ai_select')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('control_ai_agent_desc')}</p>
            </div>
          </div>
        )}

        {selectedNode.type === 'condition' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>{t('ConditionProperties.title')}</Label>
              <Button variant="outline" size="sm" onClick={addCondition} disabled={typeof conditionsFieldMeta?.max === 'number' && conditions.length >= conditionsFieldMeta.max} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> {t('ConditionProperties.add_condition_btn')}
              </Button>
            </div>
            
            <div className="space-y-3">
              {conditions.map((cond, idx) => (
                <div key={idx} className="p-3 bg-muted/40 rounded border border-border space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground">{t('ConditionProperties.condition_label', { number: idx + 1 })}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCondition(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">Texto identificador (para referencia humana)</Label>
                    <Input 
                      value={cond.label || ''} 
                      onChange={(e) => updateCondition(idx, 'label', e.target.value)} 
                      className="h-8 text-xs"
                      placeholder="Ej: Cliente VIP, Pago exitoso..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('ConditionProperties.type_label')}</Label>
                    <Select value={cond.type} onValueChange={(v) => updateCondition(idx, 'type', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t('ConditionProperties.types.text')}</SelectItem>
                        <SelectItem value="number">{t('ConditionProperties.types.number')}</SelectItem>
                        <SelectItem value="time">{t('ConditionProperties.types.time')}</SelectItem>
                        <SelectItem value="variable">{t('ConditionProperties.types.variable')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('ConditionProperties.operator_label')}</Label>
                    <Select value={cond.operator} onValueChange={(v) => updateCondition(idx, 'operator', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cond.type === 'text' || cond.type === 'variable' ? (
                          <>
                            <SelectItem value="equals">{t('ConditionProperties.operators.equals')}</SelectItem>
                            <SelectItem value="not_equals">{t('ConditionProperties.operators.not_equals')}</SelectItem>
                            <SelectItem value="contains">{t('ConditionProperties.operators.contains')}</SelectItem>
                            <SelectItem value="starts_with">{t('ConditionProperties.operators.starts_with')}</SelectItem>
                            <SelectItem value="ends_with">{t('ConditionProperties.operators.ends_with')}</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="equals">{t('ConditionProperties.operators.equals')}</SelectItem>
                            <SelectItem value="greater_than">{t('ConditionProperties.operators.greater_than')}</SelectItem>
                            <SelectItem value="less_than">{t('ConditionProperties.operators.less_than')}</SelectItem>
                            <SelectItem value="gte">{t('ConditionProperties.operators.gte')}</SelectItem>
                            <SelectItem value="lte">{t('ConditionProperties.operators.lte')}</SelectItem>
                            <SelectItem value="between">{t('ConditionProperties.operators.between')}</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('ConditionProperties.value_label')}</Label>
                    <Input 
                      value={cond.value} 
                      onChange={(e) => updateCondition(idx, 'value', e.target.value)} 
                      className="h-8 text-xs"
                      type={cond.type === 'time' ? 'time' : 'text'}
                      placeholder={cond.type === 'variable' ? t('ConditionProperties.variable_name_placeholder') : ''}
                    />
                  </div>

                   {cond.operator === 'between' && (
                     <div className="space-y-2">
                      <Label className="text-[10px]">{t('ConditionProperties.value2_label')}</Label>
                      <Input 
                        value={cond.value2 || ''} 
                        onChange={(e) => updateCondition(idx, 'value2', e.target.value)} 
                        className="h-8 text-xs"
                        type={cond.type === 'time' ? 'time' : 'text'}
                      />
                    </div>
                   )}
                </div>
              ))}
              
              {conditions.length === 0 && (
                  <div className="p-4 border border-dashed rounded text-center text-xs text-muted-foreground">
                      {t('ConditionProperties.else_label')}
                  </div>
              )}
            </div>
          </div>
        )}

        {selectedNode.type === 'menu_simple' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('message_text_label')} <span className="text-destructive">*</span></Label>
              <Textarea
                rows={3}
                value={label}
                onChange={(e) => { setLabel(e.target.value); markDirty(); }}
                placeholder={t('type_placeholder')}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('menu_simple_marker_style_label')}</Label>
              <Select
                value={menuMarkerStyle}
                onValueChange={(v) => { setMenuMarkerStyle(v as MenuSimpleMarkerStyle); markDirty(); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MENU_SIMPLE_MARKER_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {t(`menu_simple_marker.${style}`)} ({getMenuMarker(style, 0)} {getMenuMarker(style, 1)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>{t('menu_simple_options_label')}</Label>
                <Button variant="outline" size="sm" onClick={addMenuOption} disabled={menuOptions.length >= 10} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> {t('menu_simple_add_option_btn')}
                </Button>
              </div>

              {menuOptions.map((option, idx) => (
                <div key={option.id} className="p-3 bg-muted/40 rounded border border-border space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-7 shrink-0">{getMenuMarker(menuMarkerStyle, idx)}</span>
                    <Input
                      value={option.text}
                      onChange={(e) => updateMenuOption(idx, 'text', e.target.value)}
                      className="h-8 text-xs"
                      placeholder={t('menu_simple_option_placeholder')}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeMenuOption(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <details className="group">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                      {t('menu_simple_advanced_label')}
                    </summary>
                    <div className="mt-2 space-y-2 border-l-2 border-border pl-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={option.matchType || 'text'} onValueChange={(v) => updateMenuOption(idx, 'matchType', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">{t('ConditionProperties.types.text')}</SelectItem>
                            <SelectItem value="number">{t('ConditionProperties.types.number')}</SelectItem>
                            <SelectItem value="variable">{t('ConditionProperties.types.variable')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={option.matchOperator || 'equals'} onValueChange={(v) => updateMenuOption(idx, 'matchOperator', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(option.matchType || 'text') === 'number' ? (
                              <>
                                <SelectItem value="equals">{t('ConditionProperties.operators.equals')}</SelectItem>
                                <SelectItem value="greater_than">{t('ConditionProperties.operators.greater_than')}</SelectItem>
                                <SelectItem value="less_than">{t('ConditionProperties.operators.less_than')}</SelectItem>
                                <SelectItem value="gte">{t('ConditionProperties.operators.gte')}</SelectItem>
                                <SelectItem value="lte">{t('ConditionProperties.operators.lte')}</SelectItem>
                                <SelectItem value="between">{t('ConditionProperties.operators.between')}</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="equals">{t('ConditionProperties.operators.equals')}</SelectItem>
                                <SelectItem value="not_equals">{t('ConditionProperties.operators.not_equals')}</SelectItem>
                                <SelectItem value="contains">{t('ConditionProperties.operators.contains')}</SelectItem>
                                <SelectItem value="starts_with">{t('ConditionProperties.operators.starts_with')}</SelectItem>
                                <SelectItem value="ends_with">{t('ConditionProperties.operators.ends_with')}</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        value={option.matchValue || ''}
                        onChange={(e) => updateMenuOption(idx, 'matchValue', e.target.value)}
                        className="h-8 text-xs"
                        placeholder={t('menu_simple_match_value_placeholder')}
                      />
                      {option.matchOperator === 'between' && (
                        <Input
                          value={option.matchValue2 || ''}
                          onChange={(e) => updateMenuOption(idx, 'matchValue2', e.target.value)}
                          className="h-8 text-xs"
                          placeholder={t('ConditionProperties.value2_label')}
                        />
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>{t('menu_simple_global_delay_label')}</Label>
              <Input
                type="number"
                min={0}
                max={600}
                value={menuGlobalDelay}
                onChange={(e) => { setMenuGlobalDelay(Number(e.target.value)); markDirty(); }}
              />
              <p className="text-[10px] text-muted-foreground">{t('menu_simple_global_delay_helper')}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('menu_simple_variable_label')}</Label>
              <Input
                value={menuVariable}
                onChange={(e) => { setMenuVariable(e.target.value); markDirty(); }}
                placeholder={t('menu_simple_variable_placeholder')}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">{t('menu_simple_preview_label')}</Label>
              <pre className="whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 text-xs text-foreground">
                {buildMenuSimpleMessage({ label, markerStyle: menuMarkerStyle, menuOptions }) || '—'}
              </pre>
            </div>
          </div>
        )}

        {selectedNode.type === 'form' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('form_fields_label')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  disabled={formFields.length >= 20}
                  onClick={() => addFormField('text')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('form_add_text_field')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  disabled={formFields.length >= 20}
                  onClick={() => addFormField('menu')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('form_add_menu_field')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {formFields.map((field, fieldIndex) => (
                <div
                  key={field.id}
                  className="space-y-3 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {t('form_field_number', { number: fieldIndex + 1 })}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={formFields.length <= 1}
                      onClick={() => removeFormField(fieldIndex)}
                      aria-label={t('form_remove_field')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {(['text', 'menu'] as const).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-8 text-xs',
                          field.type === type && 'bg-background shadow-sm hover:bg-background',
                        )}
                        aria-pressed={field.type === type}
                        onClick={() => updateFormField(fieldIndex, { type })}
                      >
                        {t(type === 'text' ? 'form_field_type_text' : 'form_field_type_menu')}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('form_question_label')}</Label>
                    <Textarea
                      rows={3}
                      className="resize-none text-xs"
                      value={field.label}
                      onChange={(event) =>
                        updateFormField(fieldIndex, { label: event.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px]">{t('form_variable_label')}</Label>
                    <Input
                      className="h-8 text-xs"
                      value={field.variable}
                      onChange={(event) =>
                        updateFormField(fieldIndex, { variable: event.target.value })
                      }
                      placeholder="respuesta_1"
                    />
                  </div>

                  {field.type === 'menu' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-[10px]">
                          {t('menu_simple_marker_style_label')}
                        </Label>
                        <Select
                          value={field.markerStyle || 'emoji_number'}
                          onValueChange={(value) =>
                            updateFormField(fieldIndex, {
                              markerStyle: value as MenuSimpleMarkerStyle,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MENU_SIMPLE_MARKER_STYLES.map((style) => (
                              <SelectItem key={style} value={style}>
                                {t(`menu_simple_marker.${style}`)} ({getMenuMarker(style, 0)}{' '}
                                {getMenuMarker(style, 1)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-[10px]">
                            {t('form_menu_options_label')}
                          </Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-[10px]"
                            disabled={(field.menuOptions?.length ?? 0) >= 10}
                            onClick={() => addFormMenuOption(fieldIndex)}
                          >
                            <Plus className="h-3 w-3" />
                            {t('menu_simple_add_option_btn')}
                          </Button>
                        </div>
                        {(field.menuOptions ?? []).map((option, optionIndex) => (
                          <div key={option.id} className="flex items-center gap-2">
                            <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                              {getMenuMarker(field.markerStyle || 'emoji_number', optionIndex)}
                            </span>
                            <Input
                              className="h-8 text-xs"
                              value={option.text}
                              onChange={(event) =>
                                updateFormMenuOption(
                                  fieldIndex,
                                  optionIndex,
                                  event.target.value,
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-destructive"
                              disabled={(field.menuOptions?.length ?? 0) <= 1}
                              onClick={() =>
                                removeFormMenuOption(fieldIndex, optionIndex)
                              }
                              aria-label={t('form_remove_option')}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedNode.type === 'go_to_node' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('go_to_mode_label')}</Label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ['previous_node', t('go_to_mode_previous')],
                  ['specific_node', t('go_to_mode_specific')],
                  ['other_flow', t('go_to_mode_other_automation')],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={goToMode === value ? 'default' : 'outline'}
                    className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-[10px] leading-tight"
                    aria-pressed={goToMode === value}
                    onClick={() => {
                      setGoToMode(value);
                      markDirty();
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {goToMode === 'specific_node' && (
              <div className="space-y-2">
                <Label>2 · {t('go_to_target_node_label')}</Label>
                <Select
                  value={goToTargetNodeId || undefined}
                  onValueChange={(value) => {
                    setGoToTargetNodeId(value);
                    markDirty();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('go_to_target_node_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {currentFlowNodeOptions.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {t('go_to_no_available_nodes')}
                      </div>
                    ) : (
                      currentFlowNodeOptions.map((node) => (
                        <SelectItem key={node.value} value={node.value}>
                          {node.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {goToTargetNodeId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => handleGoToNodeInCurrentFlow(goToTargetNodeId)}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Guardar e ir al nodo destino
                  </Button>
                )}
              </div>
            )}

            {goToMode === 'other_flow' && (
              <>
                <div className="space-y-2">
                  <Label>2 · {t('go_to_target_automation_label')}</Label>
                  <Select
                    value={goToTargetAutomationId || undefined}
                    onValueChange={(value) => {
                      setGoToTargetAutomationId(value);
                      setGoToTargetNodeId(FLOW_START_TARGET_VALUE);
                      markDirty();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('go_to_target_automation_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {flowAutomationOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {t('go_to_no_automations')}
                        </div>
                      ) : (
                        flowAutomationOptions.map((automation) => (
                          <SelectItem key={automation.value} value={automation.value}>
                            {automation.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {!goToTargetAutomationId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 w-full gap-1.5 text-xs"
                      onClick={async () => {
                        const title = prompt('Título para el nuevo flujo:', 'Nuevo flujo desde Ir a nodo');
                        if (!title || !title.trim()) return;
                        const inst = currentInstanceId ?? availableAutomations[0]?.instanceId;
                        if (!inst) {
                          toast.error('No se pudo determinar la instancia');
                          return;
                        }
                        try {
                          const res = await createAutomation(title.trim(), inst);
                          if (res?.id) {
                            setGoToTargetAutomationId(String(res.id));
                            setGoToTargetNodeId(FLOW_START_TARGET_VALUE);
                            markDirty();
                            toast.success(t('go_to_flow_created_linked'));
                            if (confirm('¿Ir ahora al nuevo flujo para configurarlo?')) {
                              handleGoToTargetAutomation();
                            }
                          }
                        } catch (e) {
                          toast.error('Error al crear el flujo');
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Crear nuevo flujo y enlazar
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>3 · {t('go_to_target_node_label')}</Label>
                  <Select
                    value={goToTargetNodeId || undefined}
                    onValueChange={(value) => {
                      setGoToTargetNodeId(value);
                      markDirty();
                    }}
                    disabled={!goToTargetAutomationId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('go_to_target_node_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {!goToTargetAutomationId ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {t('go_to_select_automation_first')}
                        </div>
                      ) : (
                        <>
                          <SelectItem value={FLOW_START_TARGET_VALUE}>
                            {t('go_to_flow_start')}
                          </SelectItem>
                          {targetAutomationNodeOptions.map((node) => (
                            <SelectItem key={node.value} value={node.value}>
                              {node.label}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  className="w-full gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
                  disabled={!goToTargetAutomationId}
                  onClick={handleGoToTargetAutomation}
                >
                  <ArrowRight className="h-4 w-4" />
                  Guardar e ir a la automatización destino
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Se guardan el nodo y el flujo automáticamente antes de abrir la otra automatización.
                </p>
              </>
            )}

            {/* Fallback — what to do if the destination is missing */}
            <div className="space-y-2 border-t pt-4">
              <Label>{goToMode === 'previous_node' ? '2' : goToMode === 'specific_node' ? '3' : '4'} · {t('go_to_fallback_action_label')}</Label>
              <Select
                value={goToFallbackAction}
                onValueChange={(value) => {
                  setGoToFallbackAction(value as 'stop' | 'node');
                  markDirty();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop">{t('go_to_fallback_action_stop')}</SelectItem>
                  <SelectItem value="node">{t('go_to_fallback_action_node')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {goToFallbackAction === 'node' && (
              <div className="space-y-2">
                <Label>{t('go_to_fallback_node_label')}</Label>
                <Select
                  value={goToFallbackNodeId || undefined}
                  onValueChange={(value) => {
                    setGoToFallbackNodeId(value);
                    markDirty();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('go_to_fallback_node_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {currentFlowNodeOptions.map((node) => (
                      <SelectItem key={node.value} value={node.value}>
                        {node.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {selectedNode.type === 'list_message' && (
          <div className="space-y-4">
             <div className="space-y-2">
              <Label>{t('header_text_optional_label')}</Label>
              <Input
                value={title}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setTitle(nextValue); markDirty();
                  maybeOpenDraftShortcuts(nextValue, 'title');
                }}
                placeholder={t('header_text_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('body_text_label')} <span className="text-destructive">*</span></Label>
              <Textarea
                rows={4}
                value={bodyText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setBodyText(nextValue); markDirty();
                  maybeOpenDraftShortcuts(nextValue, 'bodyText');
                }}
                placeholder={t('body_text_placeholder')}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('footer_text_optional_label')}</Label>
              <Input
                value={footerText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setFooterText(nextValue);
                  maybeOpenDraftShortcuts(nextValue, 'footerText');
                }}
                placeholder={t('footer_text_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('button_text_label')} <span className="text-destructive">*</span></Label>
              <Input
                value={buttonText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setButtonText(nextValue);
                  maybeOpenDraftShortcuts(nextValue, 'buttonText');
                }}
                placeholder={t('button_text_placeholder')}
                maxLength={listButtonTextFieldMeta?.max}
              />
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <Label>{t('list_items_label', { count: listItems.length })}</Label>
                  <Button variant="outline" size="sm" onClick={addListItem} disabled={typeof listItemsFieldMeta?.max === 'number' && listItems.length >= listItemsFieldMeta.max} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> {t('add_item_btn')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {listItems.map((item, idx) => (
                    <div key={idx} className="space-y-2 p-3 bg-muted/50 rounded border border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">{t('item_x_span', { count: idx + 1})}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeListItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <Input placeholder={t('item_title_placeholder')} value={item.title} onChange={(e) => updateListItem(idx, 'title', e.target.value)} className="h-8 text-xs" maxLength={24} />
                      <Input placeholder={t('description_optional_placeholder')} value={item.description} onChange={(e) => updateListItem(idx, 'description', e.target.value)} className="h-8 text-xs" maxLength={72} />
                      <Input placeholder={t('row_id_unique_placeholder')} value={item.rowId} onChange={(e) => updateListItem(idx, 'rowId', e.target.value)} className="h-8 text-xs" />
                    </div>
                  ))}
                </div>
            </div>
          </div>
        )}

        {selectedNode.type === 'call_to_action' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('header_optional_label')}</Label>
              <Input
                value={title}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setTitle(nextValue); markDirty();
                  maybeOpenDraftShortcuts(nextValue, 'title');
                }}
                placeholder={t('enter_header_text_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('value_text_label')} <span className="text-destructive">*</span></Label>
              <Textarea
                rows={4}
                value={bodyText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setBodyText(nextValue); markDirty();
                  maybeOpenDraftShortcuts(nextValue, 'bodyText');
                }}
                placeholder={t('enter_value_text_placeholder')}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('button_text_label')} <span className="text-destructive">*</span></Label>
              <Input
                value={buttonText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setButtonText(nextValue);
                  maybeOpenDraftShortcuts(nextValue, 'buttonText');
                }}
                placeholder={t('click_here_placeholder')}
                maxLength={listButtonTextFieldMeta?.max}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('button_link_label')} <span className="text-destructive">*</span></Label>
              <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t('enter_url_placeholder')} maxLength={ctaUrlFieldMeta?.max} />
            </div>
            <div className="space-y-2">
              <Label>{t('footer_optional_label')}</Label>
              <Input
                value={footerText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setFooterText(nextValue);
                  maybeOpenDraftShortcuts(nextValue, 'footerText');
                }}
                placeholder={t('enter_footer_text_placeholder')}
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'button_message' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('message_text_required_label')} <span className="text-destructive">*</span></Label>
              <Textarea
                rows={4}
                value={bodyText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setBodyText(nextValue); markDirty();
                  maybeOpenDraftShortcuts(nextValue, 'bodyText');
                }}
                placeholder={t('enter_message_text_placeholder')}
                className="resize-none"
              />
            </div>
             <div className="space-y-2">
              <Label>{t('footer_optional_label')}</Label>
              <Input
                value={footerText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setFooterText(nextValue);
                  maybeOpenDraftShortcuts(nextValue, 'footerText');
                }}
                placeholder={t('enter_footer_text_placeholder')}
              />
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <Label>{t('buttons_label', { count: buttons.length })}</Label>
                  <Button variant="outline" size="sm" onClick={addButton} disabled={typeof buttonsFieldMeta?.max === 'number' && buttons.length >= buttonsFieldMeta.max} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> {t('add_button_btn')}
                  </Button>
                </div>
                <div className="space-y-3">
                  {buttons.map((btn, idx) => (
                    <div key={idx} className="space-y-2 p-3 bg-muted/50 rounded border border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold">{t('button_x_span', { count: idx + 1})}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeButton(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <div className="space-y-1">
                         <Label className="text-[10px] text-muted-foreground">{t('button_text_required_label')}</Label>
                        <Input placeholder={t('button_text_max_chars_placeholder')} value={btn.text} onChange={(e) => updateButton(idx, 'text', e.target.value)} className="h-8 text-xs" maxLength={20} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{t('value_required_label')}</Label>
                        <Input placeholder={t('payload_value_placeholder')} value={btn.value} onChange={(e) => updateButton(idx, 'value', e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </div>
        )}

        {selectedNode.type === 'media' && (
          <div className="space-y-4">
             <div className="space-y-2">
                <Label>{t('media_type_label')}</Label>
                <Select value={mediaType} onValueChange={(value) => setMediaType(value as NonNullable<MediaNodeData['mediaType']>)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">{t('image_select_item')}</SelectItem>
                    <SelectItem value="video">{t('video_select_item')}</SelectItem>
                    <SelectItem value="audio">{t('audio_select_item')}</SelectItem>
                    <SelectItem value="document">{t('document_select_item')}</SelectItem>
                  </SelectContent>
                </Select>
             </div>

             <div className="space-y-2">
                <Label>{t('file_upload_label')}</Label>
                <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />}
                            <p className="text-xs text-muted-foreground">
                                {fileName ? fileName : t('click_to_upload_placeholder')}
                            </p>
                        </div>
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
             </div>

             {mediaType !== 'audio' && (
                  <div className="space-y-2">
                    <Label>{t('caption_label')}</Label>
                    <Input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} placeholder={t('optional_caption_placeholder')} maxLength={mediaCaptionFieldMeta?.max} />
                 </div>
             )}
          </div>
        )}

        {selectedNode.type === 'collect' && (
          <div className="space-y-2 pt-2 border-t border-border">
            <Label>{t('variable_name_label')}</Label>
            <Input 
              value={variable} 
              onChange={(e) => {
                setVariable(e.target.value);
                markDirty();
              }}
              placeholder={t('variable_name_placeholder')}
            />
            <p className="text-xs text-muted-foreground">{t('save_user_answer_desc')}</p>
          </div>
        )}

        {selectedNode.type === 'save_contact' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('name_variable_label')}</Label>
              <Input 
                value={saveNameVar} 
                onChange={(e) => {
                  setSaveNameVar(e.target.value);
                  markDirty();
                }}
                placeholder={t('contact_name_placeholder')}
              />
              <p className="text-xs text-muted-foreground">{t('variable_to_use_contact_name_desc')}</p>
            </div>
            <div className="space-y-2">
                <Label>{t('assign_to_agent_label')}</Label>
                <Select value={saveAgentId} onValueChange={setSaveAgentId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{agents?.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.name || a.email}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>{t('assign_to_department_label')}</Label>
                <Select value={saveDepartmentId} onValueChange={setSaveDepartmentId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{departmentsList?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>{t('set_funnel_stage_label')}</Label>
                <Select value={saveFunnelId} onValueChange={setSaveFunnelId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{funnelStages?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>{t('add_tag_label')}</Label>
                <Select value={saveTagId} onValueChange={setSaveTagId}>
                  <SelectTrigger><SelectValue placeholder={t('no_change_select')} /></SelectTrigger>
                  <SelectContent><SelectItem value="null">{t('no_change_select')}</SelectItem>{tags?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>

            {customFields && customFields.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border">
                    <Label className="text-sm font-semibold text-muted-foreground uppercase">{t('custom_fields_title')}</Label>
                    <div className="space-y-3">
                        {customFields.map((cf: any) => (
                            <div key={cf.id} className="space-y-1">
                                <Label className="text-xs font-normal">{cf.name}</Label>
                                <Input 
                                    value={saveCustomFields[cf.key] || ''} 
                                    onChange={(e) => {
                                      setSaveCustomFields(prev => ({ ...prev, [cf.key]: e.target.value }));
                                      markDirty();
                                    }}
                                    placeholder={cf.type === 'boolean' ? "true/false or {{var}}" : "Value or {{var}}"}
                                    className="h-8 text-xs"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
        )}

        {selectedNode.type === 'options' && (
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex justify-between items-center"><Label>{t('menu_options_label')}</Label><Button variant="outline" size="sm" onClick={addOption} disabled={typeof optionsFieldMeta?.max === 'number' && options.length >= optionsFieldMeta.max} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" /> {t('add_option_btn')}</Button></div>
            <div className="space-y-2">{options.map((opt, idx) => (<div key={idx} className="flex gap-2"><Input value={opt} onChange={(e) => updateOption(idx, e.target.value)} className="h-8 text-sm" /><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOption(idx)}><Trash2 className="h-3 w-3" /></Button></div>))}</div>
          </div>
        )}

        {selectedNode.type === 'start' && (
          <div className="space-y-6">
            <div className="space-y-3"><Label>{t('trigger_type_label')}</Label><Select value={triggerType} onValueChange={(value) => setTriggerType(value as NonNullable<StartNodeData['triggerType']>)}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="exact_match">{t('exact_match_select')}</SelectItem><SelectItem value="contains">{t('message_contains_select')}</SelectItem><SelectItem value="first_message">{t('first_message_select')}</SelectItem><SelectItem value="fallback">{t('fallback_select')}</SelectItem></SelectContent></Select></div>
            {['exact_match', 'contains'].includes(triggerType) && (<div className="space-y-3"><Label>{t('keywords_label')}</Label><div className="flex gap-2"><Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder={t('add_keyword_placeholder')} onKeyDown={(e) => e.key === 'Enter' && addKeyword()} /><Button size="icon" onClick={addKeyword} variant="secondary"><Plus className="h-4 w-4" /></Button></div><div className="flex flex-wrap gap-2 mt-2">{keywords.map(k => (<Badge key={k} variant="outline" className="gap-1 pr-1">{k}<X className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => removeKeyword(k)}/></Badge>))}</div></div>)}
            <div className="space-y-4 pt-4 border-t border-border"><h3 className="text-sm font-medium text-foreground">{t('conditions_title')}</h3><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('stage_label')}</Label><Select value={conditionStage} onValueChange={setConditionStage}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{funnelStages?.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('tag_label')}</Label><Select value={conditionTag} onValueChange={setConditionTag}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{tags?.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('agent_label')}</Label><Select value={conditionAgent} onValueChange={setConditionAgent}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{agents?.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.name || a.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs text-muted-foreground">{t('department_label')}</Label><Select value={conditionDepartment} onValueChange={setConditionDepartment}><SelectTrigger><SelectValue placeholder={t('any_select')} /></SelectTrigger><SelectContent><SelectItem value="null">{t('any_select')}</SelectItem>{departmentsList?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent></Select></div></div>
          </div>
        )}

        {selectedNode.type === 'end' && (
            <div className="p-4 bg-muted/30 rounded text-xs text-center text-muted-foreground">
                {t('end_node_desc')}
            </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-muted/30 shrink-0">
        <Button className="w-full" onClick={handleSave}><Save className="h-4 w-4 mr-2" /> {t('save_changes_btn')}</Button>
      </div>

      {/* Confirmation dialog when exiting with unsaved edits */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Guardar los cambios?</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar en este nodo. ¿Quieres guardarlos antes de salir?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => confirmClose(false)}>
              Descartar
            </Button>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => confirmClose(true)}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DraftShortcutsModal
        open={draftShortcutsOpen}
        onOpenChange={handleDraftModalOpenChange}
        drafts={drafts ?? []}
        initialQuery={draftShortcutQuery}
        onInsertDraft={handleInsertDraft}
      />
    </aside>
  );
}
