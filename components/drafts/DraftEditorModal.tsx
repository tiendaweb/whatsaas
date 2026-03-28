'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  DraftCategory,
  DraftContact,
  DraftDepartment,
  DraftItem,
  DraftTag,
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
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
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

  const detectedPlaceholders = useMemo(() => {
    const set = new Set<string>();
    for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
      const key = match[1]?.trim();
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [content]);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Título y contenido son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        categoryId: categoryId === 'none' ? null : Number(categoryId),
        tagIds: selectedTagIds,
        advancedMode,
        contactId: advancedMode && contactId !== 'none' ? Number(contactId) : null,
        assignedUserId: advancedMode && assignedUserId !== 'none' ? Number(assignedUserId) : null,
        departmentId: advancedMode && departmentId !== 'none' ? Number(departmentId) : null,
        stages: advancedMode ? workflow : null,
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
      toast.error(error?.message || 'Error guardando borrador.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft ? 'Editar borrador' : 'Nuevo borrador'}</DialogTitle>
          <DialogDescription>
            Define título, contenido y metadatos. El modo avanzado es opcional.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Contenido</Label>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[220px]"
              />
            </div>
            <div className="space-y-1">
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
            <div className="space-y-2">
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

          <div className="space-y-3">
            <div className="rounded-lg border p-3 space-y-2">
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

            {advancedMode && (
              <DraftWorkflowCanvas
                value={workflow}
                onChange={setWorkflow}
                departments={departments}
              />
            )}

            <div className="rounded-lg border p-3">
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
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
