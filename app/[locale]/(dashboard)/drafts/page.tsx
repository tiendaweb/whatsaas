'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DraftBoard } from '@/components/drafts/DraftBoard';
import { DraftEditorModal } from '@/components/drafts/DraftEditorModal';
import { DraftPreviewCard } from '@/components/drafts/DraftPreviewCard';
import type {
  DraftAgent,
  DraftCategory,
  DraftContact,
  DraftDepartment,
  DraftItem,
  DraftTag,
} from '@/components/drafts/types';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    console.error(`Failed to fetch ${url}:`, payload);
    return null;
  }

  return payload;
};

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export default function DraftsPage() {
  const [query, setQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftItem | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);

  const { data: drafts, isLoading: loadingDrafts } = useSWR<DraftItem[]>('/api/drafts', fetcher);
  const { data: categories, mutate: mutateCategories } = useSWR<DraftCategory[]>('/api/drafts/categories', fetcher);
  const { data: tags } = useSWR<DraftTag[]>('/api/drafts/tags', fetcher);
  const { data: contacts } = useSWR<DraftContact[]>('/api/contacts/list', fetcher);
  const { data: departments } = useSWR<any[]>('/api/departments', fetcher);
  const { data: teamMembers } = useSWR<any[]>('/api/team/members', fetcher);

  const normalizedDepartments: DraftDepartment[] = useMemo(() => {
    return ensureArray<any>(departments).map((department) => ({
      id: department.id,
      name: department.name,
    }));
  }, [departments]);

  const normalizedAgents: DraftAgent[] = useMemo(() => {
    const fromMembers = ensureArray<any>(teamMembers).map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
    }));

    return Array.from(new Map(fromMembers.map((agent) => [agent.id, agent])).values());
  }, [teamMembers]);

  const filteredDrafts = useMemo(() => {
    return ensureArray<DraftItem>(drafts).filter((draft) => {
      if (!query.trim()) return true;
      const text = `${draft.title} ${draft.content}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
  }, [drafts, query]);

  const sortedCategories = useMemo(() => {
    return [...ensureArray<DraftCategory>(categories)].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [categories]);

  const boardColumns = useMemo(() => {
    const byCategory = new Map<number | null, DraftItem[]>();

    for (const draft of filteredDrafts) {
      const key = draft.categoryId ?? null;
      byCategory.set(key, [...(byCategory.get(key) ?? []), draft]);
    }

    const categoryColumns = sortedCategories.map((category) => ({
      ...category,
      drafts: byCategory.get(category.id) ?? [],
    }));

    return [
      ...categoryColumns,
      {
        id: -1,
        name: 'Sin categoría',
        color: 'gray',
        position: categoryColumns.length,
        drafts: byCategory.get(null) ?? [],
      },
    ];
  }, [filteredDrafts, sortedCategories]);

  useEffect(() => {
    if (filteredDrafts.length === 0) {
      setSelectedDraftId(null);
      return;
    }

    const stillExists = filteredDrafts.some((draft) => draft.id === selectedDraftId);
    if (!stillExists) {
      setSelectedDraftId(filteredDrafts[0].id);
    }
  }, [filteredDrafts, selectedDraftId]);

  const selectedDraft = filteredDrafts.find((draft) => draft.id === selectedDraftId) ?? null;

  const handleModalCreate = () => {
    setEditingDraft(null);
    setIsModalOpen(true);
  };

  const handleModalEdit = (draft: DraftItem) => {
    setEditingDraft(draft);
    setIsModalOpen(true);
  };

  const refreshDrafts = () => {
    mutate('/api/drafts');
  };

  const handleCreateCategory = async () => {
    const name = window.prompt('Nombre de la nueva categoría/workspace:')?.trim();
    if (!name) return;

    const response = await fetch('/api/drafts/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload?.error || 'No se pudo crear la categoría.');
      return;
    }

    toast.success('Categoría creada.');
    mutateCategories();
  };

  const handleRenameCategory = async (category: DraftCategory) => {
    if (category.id < 0) return;

    const name = window.prompt('Nuevo nombre de categoría/workspace:', category.name)?.trim();
    if (!name || name === category.name) return;

    const response = await fetch('/api/drafts/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', id: category.id, name }),
    });

    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload?.error || 'No se pudo renombrar la categoría.');
      return;
    }

    toast.success('Categoría renombrada.');
    mutateCategories();
  };

  const handleDeleteCategory = async (category: DraftCategory) => {
    if (category.id < 0) return;

    const confirmed = window.confirm(`¿Eliminar la categoría "${category.name}"?`);
    if (!confirmed) return;

    const response = await fetch(`/api/drafts/categories?id=${category.id}`, { method: 'DELETE' });
    const payload = await response.json();

    if (!response.ok) {
      toast.error(payload?.error || 'No se pudo eliminar la categoría.');
      return;
    }

    toast.success('Categoría eliminada.');
    mutateCategories();
    refreshDrafts();
  };

  const handleReorderCategories = async (next: DraftCategory[]) => {
    const realCategories = next.filter((item) => item.id > 0);
    if (realCategories.length === 0) return;

    const response = await fetch('/api/drafts/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reorder',
        items: realCategories.map((category, index) => ({ id: category.id, position: index })),
      }),
    });

    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload?.error || 'No se pudo reordenar categorías.');
      return;
    }

    mutateCategories();
  };

  const handleMoveDraft = async (draft: DraftItem, categoryId: number | null) => {
    const response = await fetch(`/api/drafts/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title,
        content: draft.content,
        categoryId,
        tagIds: draft.tags.map((tag) => tag.id),
        contactId: draft.contactId,
        assignedUserId: draft.assignedUserId,
        departmentId: draft.departmentId,
        stages: draft.stages ?? null,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      toast.error(payload?.error || 'No se pudo mover el borrador.');
      return;
    }

    toast.success('Borrador movido.');
    refreshDrafts();
  };

  return (
    <div className="flex flex-col h-full bg-muted/40 p-4 md:p-6 overflow-hidden">
      <header className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Borradores</h1>
          <p className="text-sm text-muted-foreground">
            Biblioteca de respuestas con vista por categorías/workspaces.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCreateCategory}>
            <Plus className="h-4 w-4 mr-2" /> Nueva categoría
          </Button>
          <Button onClick={handleModalCreate}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo borrador
          </Button>
        </div>
      </header>

      <section className="flex-1 min-h-0 rounded-xl border bg-background overflow-hidden">
        <div className="h-full overflow-y-auto p-3 md:p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar borrador..."
            />
          </div>

          {loadingDrafts ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-center px-2">
              <FileText className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No hay borradores para los filtros actuales.</p>
            </div>
          ) : (
            <>
              <DraftBoard
                columns={boardColumns}
                categories={sortedCategories}
                selectedDraftId={selectedDraftId}
                onSelectDraft={setSelectedDraftId}
                onOpenDetail={handleModalEdit}
                onRenameCategory={handleRenameCategory}
                onDeleteCategory={handleDeleteCategory}
                onMoveDraft={handleMoveDraft}
                onReorderCategories={handleReorderCategories}
              />

              <div className="rounded-xl border bg-muted/30 p-3 md:p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-sm font-semibold">Detalle del borrador seleccionado</h2>
                </div>
                {!selectedDraft ? (
                  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-12 w-12 opacity-30 mb-2" />
                    <p>Selecciona un borrador para ver el detalle.</p>
                  </div>
                ) : (
                  <DraftPreviewCard draft={selectedDraft} onEdit={handleModalEdit} />
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <DraftEditorModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        draft={editingDraft}
        categories={ensureArray<DraftCategory>(categories)}
        tags={ensureArray<DraftTag>(tags)}
        contacts={ensureArray<DraftContact>(contacts).map((item) => ({ id: item.id, name: item.name }))}
        departments={normalizedDepartments}
        agents={normalizedAgents}
        onSaved={refreshDrafts}
      />
    </div>
  );
}
