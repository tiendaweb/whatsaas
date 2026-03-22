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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Trash2, Pencil, UploadCloud, FileText, Image as ImageIcon, Mic, GitBranch, UserPlus, FormInput, ChevronDown, StickyNote, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { createAiTool, updateAiTool, deleteAiTool, getAiTools } from '@/app/[locale]/(dashboard)/settings/ai/tools-actions';
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
  type: 'media' | 'crm_funnel_stage' | 'assign_agent' | 'set_custom_field' | 'add_note' | 'add_tag';
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
};

const apiFetcher = (url: string) => fetch(url).then(r => r.json());

export function ToolsManager() {
  const t = useTranslations('AiTools');
  const { data: tools, mutate } = useSWR('ai-tools', getAiTools);
  const { data: funnelStages } = useSWR<FunnelStage[]>('/api/funnel-stages', apiFetcher);
  const { data: teamData } = useSWR<TeamData>('/api/team', apiFetcher);
  const { data: customFieldsList } = useSWR<CustomField[]>('/api/custom-fields', apiFetcher);
  const { data: tagsList } = useSWR<TagItem[]>('/api/tags', apiFetcher);
  const agents = teamData?.teamMembers?.map(tm => tm.user) || [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
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
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('confirmationMessage', confirmationMessage);

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
    setName(''); setDescription(''); setConfirmationMessage('');
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
                  <Input placeholder="e.g. interest_action" value={name} onChange={e => setName(e.target.value.replace(/\s+/g, '_').toLowerCase())} />
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
                          {action.type === 'media' ? t('type_media') : action.type === 'assign_agent' ? t('type_assign_agent') : action.type === 'set_custom_field' ? t('type_custom_field') : action.type === 'add_note' ? t('type_add_note') : action.type === 'add_tag' ? t('type_add_tag') : t('type_funnel_stage')}
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
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>{t('confirmation_label')}</Label>
                  <Input
                    placeholder={t('confirmation_placeholder_combo')}
                    value={confirmationMessage}
                    onChange={e => setConfirmationMessage(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">{t('confirmation_hint')}</p>
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
