'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Trash2, Pencil, UploadCloud, FileText, Image as ImageIcon, Mic, GitBranch, UserPlus, FormInput, ChevronDown, StickyNote, Tag, Zap, ListTodo, TrendingUp, LifeBuoy, Clock, CalendarPlus, UserCheck, BadgeCheck, Banknote, ShoppingCart, ContactRound, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { createAiTool, updateAiTool, deleteAiTool, getAiTools } from '@/app/[locale]/(dashboard)/settings/ai/tools-actions';
import { getBuiltinAiTools } from '@/app/[locale]/(dashboard)/settings/ai/builtin-tools-actions';
import { getAutomations } from '@/app/[locale]/(dashboard)/automation/actions';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';

type FunnelStage = {
  id: number;
  name: string;
  emoji: string;
  order: number;
};

type TeamMember = {
  user: { id: number; name: string | null; email: string };
};

type TeamData = {
  teamMembers: TeamMember[];
};

type CustomField = {
  id: number;
  name: string;
  key: string;
  type: string;
};

type TagItem = {
  id: number;
  name: string;
  color: string;
};

type ToolAction = {
  type:
    | 'media' | 'crm_funnel_stage' | 'assign_agent' | 'set_custom_field' | 'add_note' | 'add_tag'
    // Acciones de apps: sólo se ofrecen si la app está activa para el equipo.
    | 'trigger_automation' | 'create_task' | 'create_deal' | 'open_ticket' | 'schedule_message'
    | 'book_appointment' | 'register_customer' | 'register_membership' | 'report_payment' | 'register_sale'
    | 'update_contact';
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  fileName?: string;
  funnelStageId?: number;
  agentId?: number;
  fieldId?: number;
  fieldKey?: string;
  fieldLabel?: string;
  tagId?: number;
  automationId?: number;
  taskTitle?: string;
  dealTitle?: string;
  currency?: string;
  priority?: string;
  category?: string;
  message?: string;
  delayHours?: number;
  durationMinutes?: number;
  kind?: string;
  planId?: number;
  paymentMethod?: string;
};

type MembershipPlan = { id: number; name: string; currency: string; price: number; status: string };

const CURRENCIES = ['ARS', 'PYG', 'USD', 'EUR', 'BRL'];

// Acciones de apps: ícono con el que se resumen en la tabla y en el editor.
const APP_ACTION_ICONS: Partial<Record<ToolAction['type'], React.ComponentType<{ className?: string }>>> = {
  create_task: ListTodo,
  create_deal: TrendingUp,
  open_ticket: LifeBuoy,
  schedule_message: Clock,
  book_appointment: CalendarPlus,
  register_customer: UserCheck,
  register_membership: BadgeCheck,
  report_payment: Banknote,
  register_sale: ShoppingCart,
  update_contact: ContactRound,
};

const apiFetcher = (url: string) => fetch(url).then(r => r.json());

export function ToolsManager() {
  const t = useTranslations('AiTools');
  const { data: tools, mutate } = useSWR('ai-tools', getAiTools);
  const { data: funnelStages } = useSWR<FunnelStage[]>('/api/funnel-stages', apiFetcher);
  const { data: teamData } = useSWR<TeamData>('/api/team', apiFetcher);
  const { data: customFieldsList } = useSWR<CustomField[]>('/api/custom-fields', apiFetcher);
  const { data: tagsList } = useSWR<TagItem[]>('/api/tags', apiFetcher);
  const { data: automationsList } = useSWR('ai-tools-automations', () => getAutomations());
  // El catálogo de funciones integradas ya sabe qué app está activa: se reusa
  // para decidir qué acciones de apps ofrecer en el menú.
  const { data: builtinCatalog } = useSWR('ai-builtin-tools', getBuiltinAiTools);
  const appActive = (pluginId: string) => (builtinCatalog ?? []).some(t => t.pluginId === pluginId && t.pluginActive);
  const { data: membershipPlans } = useSWR<MembershipPlan[]>(appActive('memberships') ? '/api/plugins/memberships/plans' : null, apiFetcher);
  const activePlans = Array.isArray(membershipPlans) ? membershipPlans.filter(p => p.status === 'active') : [];
  const agents = teamData?.teamMembers?.map(tm => tm.user) || [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  // Silenciosa: se ejecuta por detrás y el cliente no lee ninguna confirmación.
  const [silent, setSilent] = useState(false);
  const [actions, setActions] = useState<ToolAction[]>([]);

  const addAction = (type: ToolAction['type']) => {
    if (type === 'media') {
      setActions(prev => [...prev, { type: 'media', mediaUrl: '', mediaType: 'image', caption: '' }]);
    } else if (type === 'crm_funnel_stage') {
      setActions(prev => [...prev, { type: 'crm_funnel_stage' }]);
    } else if (type === 'assign_agent') {
      setActions(prev => [...prev, { type: 'assign_agent' }]);
    } else if (type === 'set_custom_field') {
      setActions(prev => [...prev, { type: 'set_custom_field' }]);
    } else if (type === 'add_note') {
      setActions(prev => [...prev, { type: 'add_note' }]);
    } else if (type === 'add_tag') {
      setActions(prev => [...prev, { type: 'add_tag' }]);
    } else if (type === 'trigger_automation') {
      setActions(prev => [...prev, { type: 'trigger_automation' }]);
    } else if (type === 'create_task') {
      setActions(prev => [...prev, { type: 'create_task', taskTitle: '' }]);
    } else if (type === 'create_deal') {
      setActions(prev => [...prev, { type: 'create_deal', currency: 'ARS' }]);
    } else if (type === 'open_ticket') {
      setActions(prev => [...prev, { type: 'open_ticket', priority: 'normal', category: '' }]);
    } else if (type === 'schedule_message') {
      setActions(prev => [...prev, { type: 'schedule_message', delayHours: 24, message: '' }]);
    } else if (type === 'book_appointment') {
      setActions(prev => [...prev, { type: 'book_appointment', durationMinutes: 60, kind: 'meeting' }]);
    } else if (type === 'register_customer') {
      setActions(prev => [...prev, { type: 'register_customer' }]);
    } else if (type === 'register_membership') {
      setActions(prev => [...prev, { type: 'register_membership' }]);
    } else if (type === 'report_payment') {
      setActions(prev => [...prev, { type: 'report_payment', currency: 'ARS', paymentMethod: '' }]);
    } else if (type === 'register_sale') {
      setActions(prev => [...prev, { type: 'register_sale', currency: 'ARS' }]);
    } else if (type === 'update_contact') {
      setActions(prev => [...prev, { type: 'update_contact' }]);
    }
  };

  const removeAction = (index: number) => {
    setActions(prev => prev.filter((_, i) => i !== index));
  };

  const updateActionAt = (index: number, updates: Partial<ToolAction>) => {
    setActions(prev => prev.map((a, i) => i === index ? { ...a, ...updates } : a));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, actionIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/automation/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        const mime = data.mimetype || '';
        let detectedType = 'document';
        if (mime.startsWith('image')) detectedType = 'image';
        else if (mime.startsWith('video')) detectedType = 'video';
        else if (mime.startsWith('audio')) detectedType = 'audio';

        updateActionAt(actionIndex, {
          mediaUrl: data.url,
          mediaType: detectedType,
          fileName: data.filename,
        });
        toast.success(t('file_uploaded'));
      }
    } catch {
      toast.error(t('upload_failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const openEditDialog = (tool: any) => {
    setEditingId(tool.id);
    setName(tool.name);
    setDescription(tool.description);
    setConfirmationMessage(tool.confirmationMessage || '');
    setSilent((tool.actionData as any)?.silent === true);

    const toolActions = getToolActions(tool);
    setActions(toolActions as ToolAction[]);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name || !description) {
      toast.error(t('name_desc_required'));
      return;
    }

    if (actions.length === 0) {
      toast.error(t('actions_required'));
      return;
    }

    for (const action of actions) {
      if (action.type === 'media' && !action.mediaUrl) {
        toast.error(t('file_required'));
        return;
      }
      if (action.type === 'crm_funnel_stage' && !action.funnelStageId) {
        toast.error(t('funnel_stage_required'));
        return;
      }
      if (action.type === 'assign_agent' && !action.agentId) {
        toast.error(t('agent_required'));
        return;
      }
      if (action.type === 'set_custom_field' && !action.fieldId) {
        toast.error(t('custom_field_required'));
        return;
      }
      if (action.type === 'add_tag' && !action.tagId) {
        toast.error(t('tag_required'));
        return;
      }
      if (action.type === 'trigger_automation' && !action.automationId) {
        toast.error(t('automation_required'));
        return;
      }
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('confirmationMessage', confirmationMessage);
    formData.append('silent', silent ? 'true' : 'false');

    const cleanActions = actions.map(({ fileName, ...rest }) => rest);
    formData.append('actions', JSON.stringify(cleanActions));

    const result = editingId
      ? await updateAiTool(editingId, formData)
      : await createAiTool(formData);

    if (result.success) {
      toast.success(editingId ? t('tool_updated') : t('tool_created'));
      mutate();
      setIsDialogOpen(false);
      resetForm();
    } else {
      toast.error(result.error);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('confirm_delete'))) return;
    await deleteAiTool(id);
    mutate();
    toast.success(t('tool_removed'));
  };

  const resetForm = () => {
    setEditingId(null);
    setName(''); setDescription(''); setConfirmationMessage(''); setSilent(false);
    setActions([]);
  };

  const getToolActions = (tool: any): any[] => {
    const acts = (tool.actionData as any)?.actions;
    if (Array.isArray(acts) && acts.length > 0) return acts;

    const type = tool.type || 'media';
    if (type === 'media' && tool.mediaUrl) {
      return [{ type: 'media', mediaUrl: tool.mediaUrl, mediaType: tool.mediaType, caption: tool.caption }];
    }
    if (type === 'crm_funnel_stage') {
      return [{ type: 'crm_funnel_stage', funnelStageId: (tool.actionData as any)?.funnelStageId }];
    }
    return [];
  };

  const actionTypeLabel = (type: ToolAction['type']) => {
    switch (type) {
      case 'media': return t('type_media');
      case 'assign_agent': return t('type_assign_agent');
      case 'set_custom_field': return t('type_custom_field');
      case 'add_note': return t('type_add_note');
      case 'add_tag': return t('type_add_tag');
      case 'trigger_automation': return t('type_trigger_automation');
      case 'create_task': return t('type_create_task');
      case 'create_deal': return t('type_create_deal');
      case 'open_ticket': return t('type_open_ticket');
      case 'schedule_message': return t('type_schedule_message');
      case 'book_appointment': return t('type_book_appointment');
      case 'register_customer': return t('type_register_customer');
      case 'register_membership': return t('type_register_membership');
      case 'report_payment': return t('type_report_payment');
      case 'register_sale': return t('type_register_sale');
      case 'update_contact': return t('type_update_contact');
      default: return t('type_funnel_stage');
    }
  };

  const getActionBadges = (tool: any) => {
    const toolActions = getToolActions(tool);
    return (
      <div className="flex flex-wrap gap-1">
        {toolActions.map((action: any, i: number) => {
          if (action.type === 'crm_funnel_stage') {
            const stage = funnelStages?.find(s => s.id === action.funnelStageId);
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <GitBranch className="h-3 w-3" />
                {stage ? `${stage.emoji} ${stage.name}` : t('funnel_stage')}
              </Badge>
            );
          }
          if (action.type === 'assign_agent') {
            const agent = agents.find(a => a.id === action.agentId);
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <UserPlus className="h-3 w-3" />
                {agent ? (agent.name || agent.email) : t('type_assign_agent')}
              </Badge>
            );
          }
          if (action.type === 'set_custom_field') {
            const field = customFieldsList?.find(f => f.id === action.fieldId);
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <FormInput className="h-3 w-3" />
                {field ? field.name : (action.fieldLabel || t('type_custom_field'))}
              </Badge>
            );
          }
          if (action.type === 'add_note') {
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <StickyNote className="h-3 w-3" />
                {t('type_add_note')}
              </Badge>
            );
          }
          if (action.type === 'trigger_automation') {
            const auto = (automationsList as any[])?.find((a: any) => a.id === action.automationId);
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <Zap className="h-3 w-3" />
                {auto ? auto.name : t('type_trigger_automation')}
              </Badge>
            );
          }
          const AppIcon = APP_ACTION_ICONS[action.type as ToolAction['type']];
          if (AppIcon) {
            const Icon = AppIcon;
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <Icon className="h-3 w-3" />
                {actionTypeLabel(action.type)}
              </Badge>
            );
          }
          if (action.type === 'add_tag') {
            const tag = tagsList?.find(t => t.id === action.tagId);
            return (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <Tag className="h-3 w-3" />
                {tag ? tag.name : t('type_add_tag')}
              </Badge>
            );
          }
          return (
            <Badge key={i} variant="outline" className="text-xs gap-1">
              {action.mediaType === 'image' && <ImageIcon className="h-3 w-3 text-blue-500" />}
              {action.mediaType === 'document' && <FileText className="h-3 w-3 text-orange-500" />}
              {action.mediaType === 'audio' && <Mic className="h-3 w-3 text-purple-500" />}
              {action.mediaType === 'video' && <FileText className="h-3 w-3 text-green-500" />}
              {t(`file_type_${action.mediaType}` as any)}
            </Badge>
          );
        })}
      </div>
    );
  };

  const isSubmitDisabled = isSubmitting || isUploading || actions.length === 0;

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="mr-2 h-4 w-4" /> {t('new_tool')}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? t('edit_title') : t('create_title')}</DialogTitle>
                <DialogDescription>{t('create_description')}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>{t('function_name_label')}</Label>
                  <Input placeholder={t('function_name_placeholder')} value={name} onChange={e => setName(e.target.value.replace(/\s+/g, '_').toLowerCase())} />
                  <p className="text-[10px] text-muted-foreground">{t('function_name_hint')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('description_label')} <span className="text-red-500">*</span></Label>
                  <Textarea
                    placeholder={t('description_placeholder_combo')}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t('actions_label')} <span className="text-red-500">*</span></Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm">
                          <Plus className="h-3 w-3 mr-1" /> {t('add_action')} <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => addAction('media')}>
                          <FileText className="h-4 w-4 mr-2" /> {t('type_media')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addAction('crm_funnel_stage')}>
                          <GitBranch className="h-4 w-4 mr-2" /> {t('type_funnel_stage')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addAction('assign_agent')}>
                          <UserPlus className="h-4 w-4 mr-2" /> {t('type_assign_agent')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addAction('set_custom_field')}>
                          <FormInput className="h-4 w-4 mr-2" /> {t('type_custom_field')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addAction('add_note')}>
                          <StickyNote className="h-4 w-4 mr-2" /> {t('type_add_note')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addAction('add_tag')}>
                          <Tag className="h-4 w-4 mr-2" /> {t('type_add_tag')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addAction('update_contact')}>
                          <ContactRound className="h-4 w-4 mr-2" /> {t('type_update_contact')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t('apps_actions_separator')}
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => addAction('trigger_automation')}>
                          <Zap className="h-4 w-4 mr-2" /> {t('type_trigger_automation')}
                        </DropdownMenuItem>
                        {appActive('tasks') && (
                          <DropdownMenuItem onClick={() => addAction('create_task')}>
                            <ListTodo className="h-4 w-4 mr-2" /> {t('type_create_task')}
                          </DropdownMenuItem>
                        )}
                        {appActive('deals') && (
                          <DropdownMenuItem onClick={() => addAction('create_deal')}>
                            <TrendingUp className="h-4 w-4 mr-2" /> {t('type_create_deal')}
                          </DropdownMenuItem>
                        )}
                        {appActive('support') && (
                          <DropdownMenuItem onClick={() => addAction('open_ticket')}>
                            <LifeBuoy className="h-4 w-4 mr-2" /> {t('type_open_ticket')}
                          </DropdownMenuItem>
                        )}
                        {appActive('scheduled-messages') && (
                          <DropdownMenuItem onClick={() => addAction('schedule_message')}>
                            <Clock className="h-4 w-4 mr-2" /> {t('type_schedule_message')}
                          </DropdownMenuItem>
                        )}
                        {appActive('calendar') && (
                          <DropdownMenuItem onClick={() => addAction('book_appointment')}>
                            <CalendarPlus className="h-4 w-4 mr-2" /> {t('type_book_appointment')}
                          </DropdownMenuItem>
                        )}
                        {appActive('customers') && (
                          <DropdownMenuItem onClick={() => addAction('register_customer')}>
                            <UserCheck className="h-4 w-4 mr-2" /> {t('type_register_customer')}
                          </DropdownMenuItem>
                        )}
                        {appActive('memberships') && (
                          <DropdownMenuItem onClick={() => addAction('register_membership')}>
                            <BadgeCheck className="h-4 w-4 mr-2" /> {t('type_register_membership')}
                          </DropdownMenuItem>
                        )}
                        {appActive('sales') && (
                          <DropdownMenuItem onClick={() => addAction('register_sale')}>
                            <ShoppingCart className="h-4 w-4 mr-2" /> {t('type_register_sale')}
                          </DropdownMenuItem>
                        )}
                        {appActive('finance') && (
                          <DropdownMenuItem onClick={() => addAction('report_payment')}>
                            <Banknote className="h-4 w-4 mr-2" /> {t('type_report_payment')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {actions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                      {t('actions_empty')}
                    </p>
                  )}

                  {actions.map((action, index) => (
                    <div key={index} className="border rounded-lg p-2 space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {actionTypeLabel(action.type)}
                        </Badge>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeAction(index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {action.type === 'media' && (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <Select value={action.mediaType || 'image'} onValueChange={(v) => updateActionAt(index, { mediaType: v })}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="image">{t('file_type_image')}</SelectItem>
                                <SelectItem value="document">{t('file_type_document')}</SelectItem>
                                <SelectItem value="audio">{t('file_type_audio')}</SelectItem>
                                <SelectItem value="video">{t('file_type_video')}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input className="h-7 text-xs col-span-2" placeholder={t('caption_placeholder')} value={action.caption || ''} onChange={e => updateActionAt(index, { caption: e.target.value })} />
                          </div>
                          <label className="flex items-center gap-2 w-full h-10 border border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors px-3">
                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" /> : <UploadCloud className="h-4 w-4 text-muted-foreground shrink-0" />}
                            <span className="text-xs text-muted-foreground truncate">
                              {action.fileName || (action.mediaUrl ? t('file_uploaded') : t('upload_placeholder'))}
                            </span>
                            <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, index)} />
                          </label>
                        </>
                      )}

                      {action.type === 'crm_funnel_stage' && (
                        <div>
                          <Select value={action.funnelStageId?.toString() || ''} onValueChange={(v) => updateActionAt(index, { funnelStageId: parseInt(v) })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('select_stage_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {funnelStages?.map((stage) => (
                                <SelectItem key={stage.id} value={stage.id.toString()}>
                                  {stage.emoji} {stage.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === 'assign_agent' && (
                        <div>
                          <Select value={action.agentId?.toString() || ''} onValueChange={(v) => updateActionAt(index, { agentId: parseInt(v) })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('select_agent_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id.toString()}>
                                  {agent.name || agent.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === 'set_custom_field' && (
                        <div>
                          <Select value={action.fieldId?.toString() || ''} onValueChange={(v) => {
                            const field = customFieldsList?.find(f => f.id === parseInt(v));
                            if (field) updateActionAt(index, { fieldId: field.id, fieldKey: field.key, fieldLabel: field.name });
                          }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('select_field_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {customFieldsList?.map((field) => (
                                <SelectItem key={field.id} value={field.id.toString()}>
                                  {field.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === 'add_tag' && (
                        <div>
                          <Select value={action.tagId?.toString() || ''} onValueChange={(v) => updateActionAt(index, { tagId: parseInt(v) })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('select_tag_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {tagsList?.map((tag) => (
                                <SelectItem key={tag.id} value={tag.id.toString()}>
                                  {tag.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === 'trigger_automation' && (
                        <div>
                          <Select value={action.automationId?.toString() || ''} onValueChange={(v) => updateActionAt(index, { automationId: parseInt(v) })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('select_automation_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {(automationsList as any[])?.map((auto: any) => (
                                <SelectItem key={auto.id} value={auto.id.toString()}>
                                  {auto.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === 'create_task' && (
                        <Input className="h-7 text-xs" placeholder={t('task_title_placeholder')} value={action.taskTitle || ''} onChange={e => updateActionAt(index, { taskTitle: e.target.value })} />
                      )}

                      {action.type === 'create_deal' && (
                        <Select value={action.currency || 'ARS'} onValueChange={(v) => updateActionAt(index, { currency: v })}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder={t('deal_currency_placeholder')} /></SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {action.type === 'open_ticket' && (
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={action.priority || 'normal'} onValueChange={(v) => updateActionAt(index, { priority: v })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">{t('priority_low')}</SelectItem>
                              <SelectItem value="normal">{t('priority_normal')}</SelectItem>
                              <SelectItem value="high">{t('priority_high')}</SelectItem>
                              <SelectItem value="urgent">{t('priority_urgent')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input className="h-7 text-xs" placeholder={t('ticket_category_placeholder')} value={action.category || ''} onChange={e => updateActionAt(index, { category: e.target.value })} />
                        </div>
                      )}

                      {action.type === 'schedule_message' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-muted-foreground whitespace-nowrap">{t('schedule_hours_label')}</Label>
                            <Input className="h-7 text-xs w-24" type="number" min={1} max={720} value={action.delayHours ?? 24} onChange={e => updateActionAt(index, { delayHours: Math.max(parseInt(e.target.value) || 24, 1) })} />
                          </div>
                          <Textarea className="text-xs" rows={2} placeholder={t('schedule_message_placeholder')} value={action.message || ''} onChange={e => updateActionAt(index, { message: e.target.value })} />
                        </div>
                      )}

                      {action.type === 'book_appointment' && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] text-muted-foreground whitespace-nowrap">{t('appointment_duration_label')}</Label>
                          <Input className="h-7 text-xs w-24" type="number" min={15} max={480} step={15} value={action.durationMinutes ?? 60} onChange={e => updateActionAt(index, { durationMinutes: Math.min(Math.max(parseInt(e.target.value) || 60, 15), 480) })} />
                          <Select value={action.kind || 'meeting'} onValueChange={(v) => updateActionAt(index, { kind: v })}>
                            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="meeting">{t('appointment_kind_meeting')}</SelectItem>
                              <SelectItem value="call">{t('appointment_kind_call')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {action.type === 'register_customer' && (
                        <p className="text-[10px] text-muted-foreground">{t('register_customer_hint')}</p>
                      )}

                      {action.type === 'register_membership' && (
                        <Select value={action.planId?.toString() || 'ai'} onValueChange={(v) => updateActionAt(index, { planId: v === 'ai' ? undefined : parseInt(v) })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('select_plan_placeholder')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ai">{t('plan_chosen_by_ai')}</SelectItem>
                            {activePlans.map((plan) => (
                              <SelectItem key={plan.id} value={plan.id.toString()}>
                                {plan.name} · {plan.currency} {(plan.price / 100).toLocaleString()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {action.type === 'report_payment' && (
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={action.currency || 'ARS'} onValueChange={(v) => updateActionAt(index, { currency: v })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('deal_currency_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input className="h-7 text-xs" placeholder={t('payment_method_placeholder')} value={action.paymentMethod || ''} onChange={e => updateActionAt(index, { paymentMethod: e.target.value })} />
                        </div>
                      )}

                      {action.type === 'register_sale' && (
                        <div className="flex items-center gap-2">
                          <Select value={action.currency || 'ARS'} onValueChange={(v) => updateActionAt(index, { currency: v })}>
                            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder={t('deal_currency_placeholder')} /></SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground">{t('register_sale_hint')}</p>
                        </div>
                      )}

                      {action.type === 'update_contact' && (
                        <p className="text-[10px] text-muted-foreground">{t('update_contact_hint')}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>{t('confirmation_label')}</Label>
                  <Input
                    placeholder={t('confirmation_placeholder_combo')}
                    value={confirmationMessage}
                    onChange={e => setConfirmationMessage(e.target.value)}
                    disabled={silent}
                  />
                  <p className="text-[10px] text-muted-foreground">{t('confirmation_hint')}</p>
                </div>

                {/* Silenciosa: sin esto toda herramienta termina en un "listo, ya
                    lo registré" por algo que era interno. */}
                <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-1.5">
                      <VolumeX className="h-3.5 w-3.5" />
                      Silenciosa
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      El cliente no se entera: no se le confirma nada y la conversación sigue como si nada.
                      El equipo igual ve lo que se hizo en el chat.
                    </p>
                  </div>
                  <Switch checked={silent} onCheckedChange={setSilent} aria-label="Herramienta silenciosa" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>{t('cancel')}</Button>
                <Button onClick={handleSubmit} disabled={isSubmitDisabled}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? t('save_btn') : t('create_btn'))}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('col_function')}</TableHead>
              <TableHead>{t('col_actions')}</TableHead>
              <TableHead>{t('col_description')}</TableHead>
              <TableHead className="text-right">{t('col_action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools?.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-24">{t('no_tools')}</TableCell></TableRow>
            ) : (
              tools?.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell className="font-mono text-xs">{tool.name}</TableCell>
                  <TableCell>{getActionBadges(tool)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" title={tool.description}>{tool.description}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(tool)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(tool.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
