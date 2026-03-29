'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { FileText, Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      if (!query.trim()) return true;
      const text = `${draft.title} ${draft.content}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });
  }, [drafts, query]);

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

  return (
    <div className="flex flex-col h-full bg-muted/40 p-4 md:p-6 overflow-hidden">
      <header className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Borradores</h1>
          <p className="text-sm text-muted-foreground">
            Biblioteca de respuestas con vista previa y variables dinámicas.
          </p>
        </div>
        <Button onClick={handleModalCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo borrador
        </Button>
      </header>

      <section className="flex-1 min-h-0 rounded-xl border bg-background overflow-hidden">
        <div className="h-full grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-r bg-card/40 p-3 md:p-4 min-h-0">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar borrador..."
              />
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-290px)] pr-1">
              {loadingDrafts ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredDrafts.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-center px-2">
                  <FileText className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No hay borradores.</p>
                </div>
              ) : (
                filteredDrafts.map((draft) => {
                  const selected = draft.id === selectedDraftId;
                  return (
                    <button
                      key={draft.id}
                      type="button"
                      onClick={() => setSelectedDraftId(draft.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <p className="text-sm font-semibold truncate">{draft.title}</p>
                      <p className="text-xs text-muted-foreground truncate mt-1">{draft.content}</p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="p-3 md:p-5 overflow-y-auto min-h-0 bg-muted/30">
            {!selectedDraft ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-muted-foreground">
                <FileText className="h-12 w-12 opacity-30 mb-2" />
                <p>Selecciona un borrador para ver el detalle.</p>
              </div>
            ) : (
              <DraftPreviewCard draft={selectedDraft} onEdit={handleModalEdit} />
            )}
          </main>
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
