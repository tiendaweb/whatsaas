'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Variable, Type, Layout, Settings2, Tag as TagIcon } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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

  // --- Lógica original mantenida ---
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
      (draft?.stages && ((draft.stages.stages?.length ?? 0) > 0 || (draft.stages.tasks?.length ?? 0) > 0))
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
    const foundInContent = extractPlaceholders(content);
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
      toast.success('Contenido generado.');
    } catch (error: any) { toast.error(error?.message); } finally { setIsGenerating(false); }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) { toast.error('Faltan campos.'); return; }
    if (draftType === 'dynamic' && !handleNormalizeDynamicContent()) return;
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(), content: content.trim(), draftType, aiMetadata,
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
      toast.success('Guardado.');
      onOpenChange(false);
      onSaved();
    } catch (error: any) { toast.error(error?.message); } finally { setIsSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95dvh] overflow-hidden p-0 flex flex-col gap-0 border-none shadow-2xl">
        
        {/* HEADER ESTILO PREMIUM */}
        <DialogHeader className="p-6 bg-primary text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Type className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">{isEditMode ? 'Editar Borrador' : 'Crear Nuevo Borrador'}</DialogTitle>
              <DialogDescription className="text-primary-foreground/80">
                Configura la estructura y lógica del mensaje para {isEditMode ? title : 'tu equipo'}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-secondary/5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">

            {/* COLUMNA IZQUIERDA: CONTENIDO Y EDITOR */}
            <div className="lg:col-span-7 p-4 space-y-4 border-r border-border/50">
              
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <Layout className="h-3 w-3" /> Cuerpo del Mensaje
                </div>

                <div className="space-y-3 bg-background p-3 rounded-lg border shadow-sm">
                  <div className="space-y-1">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Título</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ej: Bienvenida Cliente"
                      className="h-8 text-sm bg-secondary/20 border-none focus-visible:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Contenido</Label>
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[180px] font-mono text-xs leading-relaxed bg-secondary/10 border-none focus-visible:ring-primary resize-none"
                      placeholder="Escribe tu mensaje aquí..."
                    />
                  </div>
                </div>
              </section>

              {/* GENERADOR IA INTEGRADO */}
              <section className="bg-primary/5 rounded-lg border border-primary/20 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase">
                  <Sparkles className="h-3 w-3" /> IA
                </div>
                <div className="flex gap-2 items-center">
                  <Select value={aiMode} onValueChange={(v: any) => setAiMode(v)}>
                    <SelectTrigger className="w-[100px] h-8 bg-background text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="create">Crear</SelectItem>
                      <SelectItem value="rewrite">Reescribir</SelectItem>
                      <SelectItem value="variables">Variables</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Instrucción..."
                    className="h-8 flex-1 text-xs bg-background"
                  />
                  <Button onClick={handleGenerateWithAi} disabled={isGenerating} size="sm" className="h-8 px-2">
                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  </Button>
                </div>
              </section>
            </div>

            {/* COLUMNA DERECHA: CONFIGURACIÓN Y VARIABLES */}
            <div className="lg:col-span-5 p-4 space-y-4 bg-background">

              {/* TIPO Y CATEGORÍA */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <Settings2 className="h-3 w-3" /> Config
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold">Tipo</Label>
                    <Select value={draftType} onValueChange={(v: any) => setDraftType(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="static">Estática</SelectItem>
                        <SelectItem value="dynamic">Dinámica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold">Categoría</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="none">Sin Categoría</SelectItem>
                        {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold flex items-center gap-1">
                    <TagIcon className="h-3 w-3" /> Etiquetas
                  </Label>
                  <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-secondary/5">
                    {tags.map(tag => (
                      <Badge
                        key={tag.id}
                        variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                        className="cursor-pointer transition-all"
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </section>

              {/* SECCIÓN DINÁMICA: VARIABLES */}
              {draftType === 'dynamic' && (
                <section className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-600 uppercase">
                      <Variable className="h-4 w-4" /> Variables Dinámicas
                    </div>
                  </div>
                  <Textarea
                    value={placeholderEditor}
                    onChange={(e) => setPlaceholderEditor(e.target.value)}
                    className="min-h-[80px] text-xs font-mono"
                    placeholder="nombre_cliente&#10;monto_pago"
                  />
                  <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={handleNormalizeDynamicContent}>
                    Vincular Variables al Texto
                  </Button>
                </section>
              )}

              {/* MODO AVANZADO (Switch) */}
              <section className="pt-4 border-t">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-secondary/10">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Modo Flujos</Label>
                    <p className="text-[10px] text-muted-foreground uppercase">Workflows & CRM</p>
                  </div>
                  <Switch checked={advancedMode} onCheckedChange={setAdvancedMode} />
                </div>

                {advancedMode && (
  <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
    {/* Selector de Contacto */}
    <div className="space-y-1">
      <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Contacto Vinculado</Label>
      <Select value={contactId} onValueChange={setContactId}>
        <SelectTrigger className="h-8 text-xs bg-background">
          <SelectValue placeholder="Seleccionar contacto" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          <SelectItem value="none">Sin contacto</SelectItem>
          {contacts.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Selector de Agente/Usuario */}
    <div className="space-y-1">
      <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Agente Asignado</Label>
      <Select value={assignedUserId} onValueChange={setAssignedUserId}>
        <SelectTrigger className="h-8 text-xs bg-background">
          <SelectValue placeholder="Seleccionar agente" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          <SelectItem value="none">Sin agente</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name ?? a.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Selector de Departamento */}
    <div className="space-y-1">
      <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Departamento</Label>
      <Select value={departmentId} onValueChange={setDepartmentId}>
        <SelectTrigger className="h-8 text-xs bg-background">
          <SelectValue placeholder="Seleccionar departamento" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          <SelectItem value="none">Sin departamento</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
)}
              </section>
            </div>
          </div>
        </div>

        {/* WORKFLOW CANVAS (Si aplica) */}
        {isEditMode && advancedMode && (
          <div className="border-t bg-secondary/5 p-4 max-h-[300px] overflow-y-auto">
            <DraftWorkflowCanvas value={workflow} onChange={setWorkflow} departments={departments} />
          </div>
        )}

        <DialogFooter className="p-4 border-t bg-background shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving} className="min-w-[120px]">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : 'Guardar Borrador'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
