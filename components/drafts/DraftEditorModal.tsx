'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { DraftWorkflowCanvas } from './DraftWorkflowCanvas';
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

const PLACEHOLDER_REGEX = /\[\[([\w\-. ]+)\]\]/g;

const emptyWorkflow: DraftWorkflow = { stages: [], tasks: [] };

function extractPlaceholders(content: string): string[] {
  const set = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
    const key = match[1]?.trim();
    if (key) set.add(key);
  }
  return Array.from(set);
}

function normalizePlaceholderName(raw: string) {
  return raw.trim().replace(/\s+/g, '_');
}

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
    const initialPlaceholders = extractPlaceholders(draft?.content ?? '');
    setPlaceholderEditor(initialPlaceholders.join('\n'));

    setCategoryId(draft?.categoryId ? String(draft.categoryId) : 'none');
    setSelectedTagIds(draft?.tags?.map((tag) => tag.id) ?? []);

    const hasAdvanced = Boolean(
      draft?.contactId ||
        draft?.assignedUserId ||
        draft?.departmentId ||
        (draft?.stages && ((draft.stages.stages?.length ?? 0) > 0 || (draft.stages.tasks?.length ?? 0) > 0)),
    );

    setAdvancedMode(hasAdvanced);
    setContactId(draft?.contactId ? String(draft.contactId) : 'none');
    setAssignedUserId(draft?.assignedUserId ? String(draft.assignedUserId) : 'none');
    setDepartmentId(draft?.departmentId ? String(draft.departmentId) : 'none');
    setWorkflow(draft?.stages ?? emptyWorkflow);
  }, [draft, open]);

  const detectedPlaceholders = useMemo(() => extractPlaceholders(content), [content]);

  useEffect(() => {
    if (draftType !== 'dynamic') return;
    setPlaceholderEditor((prev) => {
      const currentNormalized = prev
        .split('\n')
        .map((entry) => normalizePlaceholderName(entry))
        .filter(Boolean)
        .join('\n');
      const detectedNormalized = detectedPlaceholders.map((entry) => normalizePlaceholderName(entry)).join('\n');
      return currentNormalized || detectedNormalized;
    });
  }, [detectedPlaceholders, draftType]);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleNormalizeDynamicContent = () => {
    const names = placeholderEditor
      .split('\n')
      .map((entry) => normalizePlaceholderName(entry))
      .filter(Boolean);

    if (names.length === 0) {
      toast.error('Para borradores dinámicos define al menos una variable.');
      return false;
    }

    const uniqueNames = Array.from(new Set(names));
    const foundInContent = extractPlaceholders(content);

    let nextContent = content;
    if (foundInContent.length > 0) {
      foundInContent.forEach((placeholder, index) => {
        const replacement = uniqueNames[index] ?? placeholder;
        const from = new RegExp(`\\[\\[${placeholder.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]\\]`, 'g');
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
    if (!aiPrompt.trim()) {
      toast.error('Escribe un prompt para generar con IA.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          mode: aiMode,
          baseContent: content,
          draftType,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'No se pudo generar el borrador.');
      }

      setContent(result.content ?? '');
      setAiMetadata(result.metadata ?? null);
      toast.success('Contenido generado con IA.');
    } catch (error: any) {
      console.error('drafts.generate.ai.error', error);
      toast.error(error?.message || 'Error generando contenido con IA.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Título y contenido son obligatorios.');
      return;
    }

    if (draftType === 'dynamic') {
      const ok = handleNormalizeDynamicContent();
      if (!ok) return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        draftType,
        aiMetadata,
        categoryId: isEditMode ? (categoryId === 'none' ? null : Number(categoryId)) : null,
        tagIds: isEditMode ? selectedTagIds : [],
        contactId: isEditMode && advancedMode && contactId !== 'none' ? Number(contactId) : null,
        assignedUserId: isEditMode && advancedMode && assignedUserId !== 'none' ? Number(assignedUserId) : null,
        departmentId: isEditMode && advancedMode && departmentId !== 'none' ? Number(departmentId) : null,
        stages: isEditMode && advancedMode ? workflow : null,
      };

      const endpoint = draft ? `/api/drafts/${draft.id}` : '/api/drafts';
      const method = draft ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'No se pudo guardar el borrador.');
      }

      toast.success(draft ? 'Borrador actualizado.' : 'Borrador creado.');
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error('drafts.save.error', error);
      toast.error(error?.message || 'Error guardando borrador.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90dvh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 pt-6 pb-3">
          <DialogTitle>{isEditMode ? 'Editar borrador' : 'Nuevo borrador'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Edita título, contenido y todos los metadatos del borrador.'
              : 'Crea un borrador rápido con título, tipo y contenido.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de nota</Label>
              <Select value={draftType} onValueChange={(value) => setDraftType(value as DraftType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Nota estática</SelectItem>
                  <SelectItem value="dynamic">Nota dinámica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Generar con IA</Label>
              <div className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
                <Select value={aiMode} onValueChange={(value) => setAiMode(value as 'create' | 'rewrite' | 'variables')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">Crear</SelectItem>
                    <SelectItem value="rewrite">Reescribir</SelectItem>
                    <SelectItem value="variables">Variables</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder="Describe qué quieres generar"
                />
                <Button type="button" variant="secondary" onClick={handleGenerateWithAi} disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generar con IA
                </Button>
              </div>
              {aiMetadata && (
                <p className="text-xs text-muted-foreground">
                  Última generación IA: {new Date(aiMetadata.generatedAt).toLocaleString()} · modo {aiMetadata.mode}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Contenido</Label>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[220px] max-h-[360px] resize-y"
              />
              <p className="text-xs text-muted-foreground">
                {draftType === 'dynamic'
                  ? 'Usa placeholders con formato [[nombre_variable]].'
                  : 'Contenido final estático, listo para insertar.'}
              </p>
            </div>
          </div>

          {draftType === 'dynamic' && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium">Variables dinámicas detectadas/editar</p>
              <Textarea
                value={placeholderEditor}
                onChange={(event) => setPlaceholderEditor(event.target.value)}
                className="min-h-[96px]"
                placeholder={'nombre_cliente\nfecha_vencimiento\nlink_pago'}
              />
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handleNormalizeDynamicContent}>
                  Aplicar placeholders al contenido
                </Button>
              </div>
            </div>
          )}

          {isEditMode && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2.5">
                <Label>Etiquetas</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Button
                      key={tag.id}
                      size="sm"
                      variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isEditMode && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Modo avanzado</p>
                  <p className="text-xs text-muted-foreground">
                    Guarda relaciones y workflow solo si está habilitado.
                  </p>
                </div>
                <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
              </div>

              {advancedMode && (
                <div className="grid grid-cols-1 gap-2">
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Contacto (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin contacto</SelectItem>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={String(contact.id)}>
                          {contact.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Agente (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin agente</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name ?? agent.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Departamento (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin departamento</SelectItem>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={String(department.id)}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {isEditMode && advancedMode && (
            <DraftWorkflowCanvas
              value={workflow}
              onChange={setWorkflow}
              departments={departments}
            />
          )}

          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium mb-2">Placeholders detectados</p>
            <div className="flex flex-wrap gap-2">
              {detectedPlaceholders.length === 0 ? (
                <span className="text-xs text-muted-foreground">No hay placeholders.</span>
              ) : (
                detectedPlaceholders.map((placeholder) => (
                  <code key={placeholder} className="text-xs bg-muted px-2 py-1 rounded">
                    [[{placeholder}]]
                  </code>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving || isGenerating}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
