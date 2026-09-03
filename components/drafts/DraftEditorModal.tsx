'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Variable, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DraftWorkflowCanvas } from './DraftWorkflowCanvas';
import { extractEditorPlaceholders, normalizePlaceholderName } from '@/lib/drafts/utils';
import type {
  DraftAgent,
  DraftAiMetadata,
  DraftCategory,
  DraftContact,
  DraftDepartment,
  DraftItem,
  DraftTag,
  DraftType,
  DraftWorkflow,
} from './types';

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  draft?: DraftItem | null;
  categories: DraftCategory[];
  tags: DraftTag[];
  contacts: DraftContact[];
  agents: DraftAgent[];
  departments: DraftDepartment[];
  onSaved: () => void;
};

const emptyWorkflow: DraftWorkflow = { stages: [], tasks: [] };

export function DraftEditorModal({
  open,
  onOpenChange,
  draft,
  categories,
  tags,
  contacts,
  agents,
  departments,
  onSaved,
}: Props) {
  const isEditMode = Boolean(draft);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [draftType, setDraftType] = useState<DraftType>('static');
  const [aiMetadata, setAiMetadata] = useState<DraftAiMetadata>(null);
  const [aiMode, setAiMode] = useState<'create' | 'rewrite' | 'variables'>('create');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [placeholderEditor, setPlaceholderEditor] = useState('');
  const [categoryId, setCategoryId] = useState<string>('none');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [contactId, setContactId] = useState<string>('none');
  const [assignedUserId, setAssignedUserId] = useState<string>('none');
  const [departmentId, setDepartmentId] = useState<string>('none');
  const [workflow, setWorkflow] = useState<DraftWorkflow>(emptyWorkflow);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(draft?.title ?? '');
    setContent(draft?.content ?? '');
    setDraftType(draft?.draftType ?? 'static');
    setAiMetadata(draft?.aiMetadata ?? null);
    setAiMode(draft?.draftType === 'dynamic' ? 'variables' : 'create');
    setAiPrompt('');

    const initial = extractEditorPlaceholders(draft?.content ?? '');
    setPlaceholderEditor(initial.join('\n'));

    setCategoryId(draft?.categoryId ? String(draft.categoryId) : 'none');
    setSelectedTagIds(draft?.tags?.map((tag) => tag.id) ?? []);

    const hasAdvanced = Boolean(
      draft?.contactId || draft?.assignedUserId || draft?.departmentId ||
      (draft?.stages && ((draft.stages.stages?.length ?? 0) > 0 || (draft.stages.tasks?.length ?? 0) > 0))
    );
    setAdvancedMode(hasAdvanced);

    setContactId(draft?.contactId ? String(draft.contactId) : 'none');
    setAssignedUserId(draft?.assignedUserId ? String(draft.assignedUserId) : 'none');
    setDepartmentId(draft?.departmentId ? String(draft.departmentId) : 'none');
    setWorkflow(draft?.stages ?? emptyWorkflow);
  }, [draft, open]);

  const detectedPlaceholders = useMemo(() => extractEditorPlaceholders(content), [content]);

  useEffect(() => {
    if (draftType !== 'dynamic') return;
    setPlaceholderEditor((prev) => {
      const currentNormalized = prev.split('\n').map(normalizePlaceholderName).filter(Boolean).join('\n');
      const detectedNormalized = detectedPlaceholders.map(normalizePlaceholderName).join('\n');
      return currentNormalized || detectedNormalized;
    });
  }, [detectedPlaceholders, draftType]);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  };

  const handleNormalizeDynamicContent = () => {
    const names = placeholderEditor.split('\n').map(normalizePlaceholderName).filter(Boolean);
    if (names.length === 0) {
      toast.error('Define al menos una variable.');
      return false;
    }
    const uniqueNames = Array.from(new Set(names));
    const foundInContent = extractEditorPlaceholders(content);
    let nextContent = content;
    if (foundInContent.length > 0) {
      foundInContent.forEach((placeholder, index) => {
        const replacement = uniqueNames[index] ?? placeholder;
        const from = new RegExp(`\\[\\[${placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g');
        nextContent = nextContent.replace(from, `[[${replacement}]]`);
      });
    } else {
      nextContent = `${content.trim()}\n\n${uniqueNames.map((name) => `[[${name}]]`).join('\n')}`.trim();
    }
    setContent(nextContent);
    setPlaceholderEditor(uniqueNames.join('\n'));
    return true;
  };

  const handleGenerateWithAi = async () => {
    if (!aiPrompt.trim()) { toast.error('Escribe un prompt.'); return; }
    setIsGenerating(true);
    try {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim(), mode: aiMode, baseContent: content, draftType }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Error IA');
      setContent(result.content ?? '');
      setAiMetadata(result.metadata ?? null);
      toast.success('Contenido generado con IA.');
    } catch (error: any) { toast.error(error?.message); } finally { setIsGenerating(false); }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) { toast.error('Título y contenido son requeridos.'); return; }
    if (draftType === 'dynamic' && !handleNormalizeDynamicContent()) return;

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        draftType,
        aiMetadata,
        categoryId: categoryId === 'none' ? null : Number(categoryId),
        tagIds: selectedTagIds,
        contactId: advancedMode && contactId !== 'none' ? Number(contactId) : null,
        assignedUserId: advancedMode && assignedUserId !== 'none' ? Number(assignedUserId) : null,
        departmentId: advancedMode && departmentId !== 'none' ? Number(departmentId) : null,
        stages: advancedMode ? workflow : null,
      };
      const response = await fetch(draft ? `/api/drafts/${draft.id}` : '/api/drafts', {
        method: draft ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Error al guardar');
      toast.success('Borrador guardado');
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft) return;
    if (!confirm('¿Eliminar este borrador?')) return;
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Borrador eliminado');
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const dynamicVars = draftType === 'dynamic' ? extractEditorPlaceholders(content) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-12px)] max-w-3xl max-h-[96dvh] p-0 flex flex-col gap-0 rounded-3xl overflow-hidden border shadow-xl">
        {/* Minimal modern header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-background flex-row items-center gap-4">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {isEditMode ? 'Editar borrador' : 'Nuevo borrador'}
          </DialogTitle>
          {isEditMode && (
            <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:bg-destructive/10 h-8 px-3 rounded-2xl" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 bg-muted/20">
          {/* Title + Content — clean OS focus */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1.5 block">Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre descriptivo del mensaje"
                className="h-12 text-lg font-medium bg-background rounded-3xl border"
              />
            </div>

            <div>
              <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1.5 block">Contenido</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={9}
                className="resize-y min-h-[170px] font-mono text-[15px] leading-relaxed bg-background rounded-3xl border p-5"
                placeholder="Escribe el mensaje. Usa [[variable]] para contenido dinámico."
              />
            </div>
          </div>

          {/* Type + Category + Tags row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-widest mb-1.5 block font-medium text-muted-foreground">Tipo</Label>
              <Select value={draftType} onValueChange={(v: any) => setDraftType(v)}>
                <SelectTrigger className="bg-background rounded-2xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Estático (fijo)</SelectItem>
                  <SelectItem value="dynamic">Dinámico (variables)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-widest mb-1.5 block font-medium text-muted-foreground">Categoría</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="bg-background rounded-2xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-widest mb-1.5 block font-medium text-muted-foreground">Etiquetas</Label>
              <div className="flex flex-wrap gap-1.5 min-h-11 rounded-2xl border bg-background p-2">
                {tags.length === 0 && <span className="text-xs text-muted-foreground px-1">Sin etiquetas</span>}
                {tags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                    onClick={() => toggleTag(tag.id)}
                    className="cursor-pointer rounded-full text-xs px-3 active:scale-95 transition"
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Dynamic variables — clean chips + editor */}
          {draftType === 'dynamic' && (
            <div className="rounded-3xl border bg-background p-5">
              <div className="flex items-center gap-2 mb-3">
                <Variable className="h-4 w-4" />
                <div className="font-semibold text-sm">Variables dinámicas</div>
              </div>

              {dynamicVars.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {dynamicVars.map(v => (
                    <Badge key={v} variant="secondary" className="rounded-full px-3 py-px text-xs font-mono">[[{v}]]</Badge>
                  ))}
                </div>
              )}

              <Textarea
                value={placeholderEditor}
                onChange={(e) => setPlaceholderEditor(e.target.value)}
                placeholder="variable1&#10;variable2"
                className="font-mono text-xs bg-muted/50 border-0 rounded-2xl min-h-[64px]"
              />
              <Button size="sm" variant="secondary" className="mt-3 rounded-2xl" onClick={handleNormalizeDynamicContent}>
                Sincronizar variables con el contenido
              </Button>
            </div>
          )}

          {/* AI Assistant — subtle modern */}
          <div className="rounded-3xl border bg-background p-5">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> Asistente IA
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={aiMode} onValueChange={(v: any) => setAiMode(v)}>
                <SelectTrigger className="w-full sm:w-[140px] bg-muted/40 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Crear</SelectItem>
                  <SelectItem value="rewrite">Reescribir</SelectItem>
                  <SelectItem value="variables">Detectar vars</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1 flex gap-2">
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe lo que necesitas…"
                  className="bg-muted/40 rounded-2xl"
                />
                <Button onClick={handleGenerateWithAi} disabled={isGenerating} className="rounded-2xl px-4">
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar'}
                </Button>
              </div>
            </div>
          </div>

          {/* Advanced toggle */}
          <div className="pt-2">
            <div className="flex items-center justify-between rounded-2xl border bg-background px-4 py-3">
              <div>
                <div className="text-sm font-medium">Opciones avanzadas</div>
                <div className="text-[11px] text-muted-foreground">Asociar contacto, agente o flujo</div>
              </div>
              <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
            </div>

            {advancedMode && (
              <div className="mt-4 grid gap-4 md:grid-cols-3 bg-background border rounded-3xl p-4">
                {[
                  { label: 'Contacto', state: contactId, setter: setContactId, items: contacts },
                  { label: 'Agente', state: assignedUserId, setter: setAssignedUserId, items: agents },
                  { label: 'Departamento', state: departmentId, setter: setDepartmentId, items: departments },
                ].map((row, idx) => (
                  <div key={idx}>
                    <Label className="text-[10px] uppercase text-muted-foreground tracking-widest mb-1 block">{row.label}</Label>
                    <Select value={row.state} onValueChange={row.setter}>
                      <SelectTrigger className="rounded-2xl bg-muted/30 h-10"><SelectValue placeholder={`Sin ${row.label.toLowerCase()}`} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ninguno</SelectItem>
                        {row.items.map((item: any) => (
                          <SelectItem key={item.id} value={String(item.id)}>{item.name || item.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow (only when editing + advanced) */}
          {isEditMode && advancedMode && (
            <div className="border rounded-3xl p-4 bg-background">
              <div className="uppercase text-[10px] tracking-widest mb-3 text-muted-foreground">Workflow</div>
              <DraftWorkflowCanvas value={workflow} onChange={setWorkflow} departments={departments} />
            </div>
          )}
        </div>

        {/* Clean bottom bar */}
        <DialogFooter className="p-4 border-t bg-background flex-row gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-2xl flex-1 sm:flex-none">Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving} className="rounded-2xl flex-1 sm:flex-none min-w-[128px]">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
