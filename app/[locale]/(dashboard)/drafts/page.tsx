'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  FileText, Loader2, Plus, Search, Edit3, Trash2, Copy, Tag as TagIcon,
  Folder, X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DraftEditorModal } from '@/components/drafts/DraftEditorModal';
import { DraftContentPreview } from '@/components/drafts/DraftContentPreview';
import type {
  DraftAgent,
  DraftCategory,
  DraftContact,
  DraftDepartment,
  DraftItem,
  DraftTag,
} from '@/components/drafts/types';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

function ensureArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? v : [];
}

export default function DraftsPage() {
  const [query, setQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null); // null = all
  const [typeFilter, setTypeFilter] = useState<'all' | 'static' | 'dynamic'>('all');

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftItem | null>(null);

  // Category management UI
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const { data: drafts = [], isLoading: loadingDrafts } = useSWR<DraftItem[]>('/api/drafts', fetcher);
  const { data: categories = [], mutate: mutateCategories } = useSWR<DraftCategory[]>('/api/drafts/categories', fetcher);
  const { data: tags = [] } = useSWR<DraftTag[]>('/api/drafts/tags', fetcher);
  const { data: contacts = [] } = useSWR<DraftContact[]>('/api/contacts/list', fetcher);
  const { data: departments = [] } = useSWR<any[]>('/api/departments', fetcher);
  const { data: teamMembers = [] } = useSWR<any[]>('/api/team/members', fetcher);

  const normalizedDepartments: DraftDepartment[] = useMemo(
    () => ensureArray<any>(departments).map(d => ({ id: d.id, name: d.name })),
    [departments]
  );
  const normalizedAgents: DraftAgent[] = useMemo(() => {
    const members = ensureArray<any>(teamMembers).map(m => ({
      id: m.user.id, name: m.user.name, email: m.user.email,
    }));
    return Array.from(new Map(members.map(a => [a.id, a])).values());
  }, [teamMembers]);

  const sortedCategories = useMemo(
    () => [...ensureArray<DraftCategory>(categories)].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [categories]
  );

  // Filter logic (modern, clean)
  const filteredDrafts = useMemo(() => {
    let result = ensureArray<DraftItem>(drafts);

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(d =>
        d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
      );
    }

    if (activeCategoryId !== null) {
      result = result.filter(d => d.categoryId === activeCategoryId);
    }

    if (typeFilter !== 'all') {
      result = result.filter(d => d.draftType === typeFilter);
    }

    return result;
  }, [drafts, query, activeCategoryId, typeFilter]);

  const draftsByCategory = useMemo(() => {
    const map = new Map<number | null, number>();
    ensureArray<DraftItem>(drafts).forEach(d => {
      const key = d.categoryId ?? null;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [drafts]);

  const totalCount = ensureArray<DraftItem>(drafts).length;

  const handleCreateDraft = () => {
    setEditingDraft(null);
    setIsEditorOpen(true);
  };

  const handleEditDraft = (draft: DraftItem) => {
    setEditingDraft(draft);
    setIsEditorOpen(true);
  };

  const refresh = () => {
    mutate('/api/drafts');
  };

  const handleDeleteDraft = async (draft: DraftItem) => {
    if (!confirm(`¿Eliminar el borrador "${draft.title}"?`)) return;

    const res = await fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err?.error || 'No se pudo eliminar el borrador');
      return;
    }
    toast.success('Borrador eliminado');
    refresh();
  };

  const handleCopyDraft = async (draft: DraftItem) => {
    await navigator.clipboard.writeText(draft.content);
    toast.success('Contenido copiado al portapapeles');
  };

  // Category management (clean, no ugly prompts)
  const handleCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;

    const res = await fetch('/api/drafts/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload?.error || 'Error creando categoría');
      return;
    }
    toast.success('Categoría creada');
    setNewCatName('');
    mutateCategories();
  };

  const handleRenameCategory = async (cat: DraftCategory) => {
    const name = prompt('Nuevo nombre de categoría', cat.name)?.trim();
    if (!name || name === cat.name) return;

    const res = await fetch('/api/drafts/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', id: cat.id, name }),
    });
    if (!res.ok) {
      toast.error('No se pudo renombrar');
      return;
    }
    toast.success('Categoría renombrada');
    mutateCategories();
  };

  const handleDeleteCategory = async (cat: DraftCategory) => {
    if (!confirm(`¿Eliminar "${cat.name}"? Los borradores pasarán a Sin categoría.`)) return;

    const res = await fetch(`/api/drafts/categories?id=${cat.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar la categoría');
      return;
    }
    toast.success('Categoría eliminada');
    if (activeCategoryId === cat.id) setActiveCategoryId(null);
    mutateCategories();
    refresh();
  };

  const allCategoryPills = [
    { id: null as number | null, name: 'Todos', count: totalCount },
    { id: -1 as number | null, name: 'Sin categoría', count: draftsByCategory.get(null) ?? 0 },
    ...sortedCategories.map(c => ({
      id: c.id,
      name: c.name,
      count: draftsByCategory.get(c.id) ?? 0,
    })),
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Ultra modern minimal header — OS style */}
      <header className="flex flex-col gap-3 border-b bg-background/95 backdrop-blur px-4 md:px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[21px] font-semibold tracking-[-0.2px]">Borradores</h1>
            <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">
              Biblioteca de mensajes reutilizables. Usa <span className="font-mono text-xs bg-muted px-1 rounded">##</span> en chats.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-2xl hidden sm:flex"
              onClick={() => setIsCatManagerOpen(true)}
            >
              <Folder className="h-4 w-4 mr-2" /> Categorías
            </Button>
            <Button onClick={handleCreateDraft} className="rounded-2xl h-10 px-5">
              <Plus className="h-4 w-4 mr-2" /> Nuevo borrador
            </Button>
          </div>
        </div>

        {/* Search + filters — very clean */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar borradores…"
              className="pl-11 h-11 bg-muted/40 border-none rounded-3xl text-base"
            />
          </div>

          {/* Type filter pills */}
          <div className="flex gap-1 bg-muted/50 p-1 rounded-3xl shrink-0 self-start md:self-auto">
            {[
              { v: 'all' as const, l: 'Todos' },
              { v: 'static' as const, l: 'Estáticos' },
              { v: 'dynamic' as const, l: 'Dinámicos' },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => setTypeFilter(opt.v)}
                className={cn(
                  "px-4 py-1 text-sm rounded-[20px] transition-all font-medium",
                  typeFilter === opt.v
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Category pills — horizontal scroll on mobile, OS clean */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {allCategoryPills.map(pill => {
            const isActive = activeCategoryId === pill.id;
            const isAll = pill.id === null;
            return (
              <button
                key={pill.id ?? 'all'}
                onClick={() => setActiveCategoryId(pill.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl border px-4 py-1 text-sm transition-all shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background hover:bg-muted border-border text-foreground"
                )}
              >
                {pill.name}
                <span className={cn(
                  "text-[10px] px-1.5 py-px rounded-full font-mono",
                  isActive ? "bg-white/20" : "bg-muted text-muted-foreground"
                )}>
                  {pill.count}
                </span>
                {pill.id && pill.id > 0 && isActive && (
                  <span
                    onClick={(e) => { e.stopPropagation(); handleRenameCategory(sortedCategories.find(c => c.id === pill.id)!); }}
                    className="ml-1 opacity-70 hover:opacity-100"
                    title="Renombrar"
                  >
                    <Edit3 className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 rounded-2xl text-xs h-8 text-muted-foreground"
            onClick={() => setIsCatManagerOpen(true)}
          >
            Gestionar
          </Button>
        </div>
      </header>

      {/* Content grid — ultra modern clean cards */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loadingDrafts ? (
          <div className="flex h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
            <div className="mb-4 rounded-full bg-muted p-5">
              <FileText className="h-9 w-9 opacity-60" />
            </div>
            <p className="text-lg font-medium text-foreground mb-1">No hay borradores</p>
            <p className="max-w-xs text-sm">
              Crea tu primer mensaje reutilizable. Aparecerá aquí y estará disponible con <span className="font-mono">##</span>.
            </p>
            <Button onClick={handleCreateDraft} className="mt-6 rounded-2xl" variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Crear borrador
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDrafts.map((draft) => (
              <div
                key={draft.id}
                className="group rounded-3xl border bg-card p-5 flex flex-col shadow-sm hover:shadow transition-all active:scale-[0.985]"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base truncate tracking-[-0.1px]">{draft.title}</h3>
                      {draft.draftType === 'dynamic' && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-px rounded-full border-primary/40 text-primary">Dinámico</Badge>
                      )}
                    </div>
                    {draft.category && (
                      <div className="text-[11px] text-muted-foreground">{draft.category.name}</div>
                    )}
                  </div>

                  <div className="flex gap-px opacity-70 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-2xl" onClick={() => handleCopyDraft(draft)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-2xl" onClick={() => handleEditDraft(draft)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-2xl text-destructive/80 hover:text-destructive"
                      onClick={() => handleDeleteDraft(draft)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Preview using enhanced component */}
                <div className="flex-1 text-sm text-muted-foreground line-clamp-4 mb-3">
                  <DraftContentPreview content={draft.content} clampLines={3} />
                </div>

                {/* Tags */}
                {draft.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                    {draft.tags.slice(0, 3).map(tag => (
                      <Badge key={tag.id} variant="secondary" className="text-[10px] px-2 py-px rounded-full font-normal">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal (will be redesigned next) */}
      <DraftEditorModal
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        draft={editingDraft}
        categories={sortedCategories}
        tags={ensureArray<DraftTag>(tags)}
        contacts={ensureArray<DraftContact>(contacts).map(c => ({ id: c.id, name: c.name }))}
        departments={normalizedDepartments}
        agents={normalizedAgents}
        onSaved={() => { refresh(); }}
      />

      {/* Minimal Category Manager — clean OS dialog */}
      <Dialog open={isCatManagerOpen} onOpenChange={setIsCatManagerOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-lg">Categorías</DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-4 space-y-3">
            {/* Create new */}
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nombre de nueva categoría"
                className="rounded-2xl h-11"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              />
              <Button onClick={handleCreateCategory} disabled={!newCatName.trim()} className="rounded-2xl px-5">
                Crear
              </Button>
            </div>

            <div className="border-t pt-3 space-y-1 max-h-[240px] overflow-auto text-sm">
              {sortedCategories.length === 0 && (
                <div className="text-xs text-muted-foreground py-2">Sin categorías personalizadas</div>
              )}
              {sortedCategories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between py-2 px-3 rounded-2xl hover:bg-muted group">
                  <div className="flex items-center gap-2">
                    <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{cat.name}</span>
                  </div>
                  <div className="flex gap-1 opacity-60 group-hover:opacity-100">
                    <Button variant="ghost" size="sm" className="h-7 px-2 rounded-xl" onClick={() => handleRenameCategory(cat)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 rounded-xl text-destructive" onClick={() => handleDeleteCategory(cat)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" className="rounded-2xl" onClick={() => setIsCatManagerOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
