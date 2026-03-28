'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftItem | null>(null);

  const { data: drafts, isLoading: loadingDrafts } = useSWR<DraftItem[]>('/api/drafts', fetcher);
  const { data: categories } = useSWR<DraftCategory[]>('/api/drafts/categories', fetcher);
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
      if (query.trim()) {
        const text = `${draft.title} ${draft.content}`.toLowerCase();
        if (!text.includes(query.toLowerCase())) return false;
      }

      if (categoryFilter !== 'all' && String(draft.categoryId) !== categoryFilter) {
        return false;
      }

      if (tagFilter !== 'all') {
        const hasTag = draft.tags.some((tag) => String(tag.id) === tagFilter);
        if (!hasTag) return false;
      }

      return true;
    });
  }, [categoryFilter, drafts, query, tagFilter]);

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

  return (
    <div className="flex flex-col h-full bg-muted p-6 overflow-hidden">
      <header className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Borradores</h1>
          <p className="text-sm text-muted-foreground">
            Biblioteca de mensajes reutilizables con edición rápida y preview dinámico.
          </p>
        </div>
        <Button onClick={handleModalCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo borrador
        </Button>
      </header>

      <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 bg-background"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título o contenido"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[220px] bg-background">
            <SelectValue placeholder="Filtrar por categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {ensureArray<DraftCategory>(categories).map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[220px] bg-background">
            <SelectValue placeholder="Filtrar por etiqueta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etiquetas</SelectItem>
            {ensureArray<DraftTag>(tags).map((tag) => (
              <SelectItem key={tag.id} value={String(tag.id)}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-background p-4 space-y-3">
        {loadingDrafts ? (
          <div className="h-40 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-2 opacity-30" />
            <p>No hay borradores para este filtro.</p>
          </div>
        ) : (
          filteredDrafts.map((draft) => (
            <DraftPreviewCard key={draft.id} draft={draft} onEdit={handleModalEdit} />
          ))
        )}
      </div>

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
