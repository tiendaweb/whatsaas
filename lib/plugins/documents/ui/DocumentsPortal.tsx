'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import useSWR from 'swr';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileCode2,
  Files,
  FileStack,
  FileText,
  FolderKanban,
  Home,
  LayoutGrid,
  Loader2,
  Menu,
  PanelLeft,
  PencilLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_PORTAL_ACCENTS,
  DOCUMENT_PORTAL_ICONS,
  type DocumentPortalDefinition,
  type DocumentPortalSection,
} from '../shared/portal';
import type { DocumentSummary, FolderSummary } from './tree';

type PortalResponse = {
  definition: DocumentPortalDefinition;
  version: number;
  updatedAt: string | null;
  isDefault: boolean;
  views: Array<Omit<DocumentPortalDefinition['views'][number], 'sections'> & {
    sections: Array<DocumentPortalSection & { documents: DocumentSummary[] }>;
  }>;
};

type Props = {
  documents: DocumentSummary[];
  folders: FolderSummary[];
  onOpenDocument: (id: number) => void;
  onCreateDocument: () => void;
  onOpenLibrary: () => void;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'No se pudo cargar el portal.');
  return body;
};

const icons: Record<(typeof DOCUMENT_PORTAL_ICONS)[number], ComponentType<{ className?: string }>> = {
  home: Home,
  'book-open': BookOpen,
  briefcase: BriefcaseBusiness,
  chart: BarChart3,
  files: Files,
  'folder-kanban': FolderKanban,
  sparkles: Sparkles,
  users: Users,
};

const accentStyles = {
  green: { strong: 'bg-emerald-600 text-white hover:bg-emerald-700', soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/30', wash: 'bg-emerald-50/70 dark:bg-emerald-950/20' },
  indigo: { strong: 'bg-indigo-600 text-white hover:bg-indigo-700', soft: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', border: 'border-indigo-500/30', wash: 'bg-indigo-50/70 dark:bg-indigo-950/20' },
  violet: { strong: 'bg-violet-600 text-white hover:bg-violet-700', soft: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', border: 'border-violet-500/30', wash: 'bg-violet-50/70 dark:bg-violet-950/20' },
  amber: { strong: 'bg-amber-500 text-neutral-950 hover:bg-amber-600', soft: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', border: 'border-amber-500/30', wash: 'bg-amber-50/70 dark:bg-amber-950/20' },
  rose: { strong: 'bg-rose-600 text-white hover:bg-rose-700', soft: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', border: 'border-rose-500/30', wash: 'bg-rose-50/70 dark:bg-rose-950/20' },
  sky: { strong: 'bg-sky-600 text-white hover:bg-sky-700', soft: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', border: 'border-sky-500/30', wash: 'bg-sky-50/70 dark:bg-sky-950/20' },
} as const;

const accentLabels: Record<(typeof DOCUMENT_PORTAL_ACCENTS)[number], string> = {
  green: 'Verde', indigo: 'Índigo', violet: 'Violeta', amber: 'Ámbar', rose: 'Rosa', sky: 'Celeste',
};

function slugify(value: string, fallback: string) {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
  return slug.length >= 2 ? slug : fallback;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function DocumentsPortal({ documents, folders, onOpenDocument, onCreateDocument, onOpenLibrary }: Props) {
  const { data, error, isLoading, mutate } = useSWR<PortalResponse>('/api/plugins/documents/portal', fetcher);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DocumentPortalDefinition | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [documentQuery, setDocumentQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setActiveViewId((current) => data.definition.views.some((view) => view.id === current) ? current : data.definition.defaultViewId);
  }, [data]);

  const definition = data?.definition;
  const accent = accentStyles[definition?.accent ?? 'green'];
  const activeView = data?.views.find((view) => view.id === activeViewId) ?? data?.views[0];

  const startEditing = () => {
    if (!data) return;
    const next = structuredClone(data.definition);
    setDraft(next);
    setSelectedViewId(activeViewId ?? next.defaultViewId);
    const view = next.views.find((item) => item.id === (activeViewId ?? next.defaultViewId)) ?? next.views[0];
    setSelectedSectionId(view.sections[0]?.id ?? null);
    setEditing(true);
  };

  const closeEditing = () => {
    setEditing(false);
    setDraft(null);
    setDocumentQuery('');
  };

  const save = async () => {
    if (!draft || !data) return;
    setSaving(true);
    try {
      const response = await fetch('/api/plugins/documents/portal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: draft, version: data.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'No se pudo guardar el portal.');
      await mutate(body, { revalidate: false });
      setActiveViewId(body.definition.defaultViewId);
      closeEditing();
      toast.success('Portal actualizado. Los conectores ya ven esta versión.');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'No se pudo guardar el portal.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></div>;
  }

  if (error || !data || !definition || !activeView) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm dark:border-rose-900/50 dark:bg-neutral-900">
          <p className="font-bold">No se pudo abrir el portal de Documentos.</p>
          <p className="mt-2 text-sm text-neutral-500">{error instanceof Error ? error.message : 'Probá nuevamente en unos segundos.'}</p>
        </div>
      </div>
    );
  }

  const navigation = (
    <nav aria-label="Vistas del portal" className={cn(
      definition.navigation === 'tabs' ? 'flex gap-1 overflow-x-auto' : 'space-y-1',
    )}>
      {data.views.map((view) => {
        const Icon = icons[view.icon];
        const selected = view.id === activeView.id;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => setActiveViewId(view.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors',
              selected ? accent.soft : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white',
              definition.navigation === 'sidebar' && 'w-full',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{view.name}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="relative flex h-full min-h-0 bg-[#f7f8f7] dark:bg-neutral-950">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-5 sm:px-7 lg:px-10 lg:pt-8">
          <header className={cn('relative overflow-hidden rounded-[28px] border bg-white p-5 shadow-sm dark:bg-neutral-900 sm:p-7 lg:p-9', accent.border)}>
            <div className={cn('absolute inset-y-0 left-0 w-1.5', accent.strong.split(' ')[0])} />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 flex items-center gap-2">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', accent.soft)}><FileStack className="h-4 w-4" /></span>
                  <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-neutral-400">Portal de conocimiento</span>
                </div>
                <h1 className="text-3xl font-black tracking-[-0.04em] text-neutral-950 dark:text-white sm:text-4xl lg:text-5xl">{definition.title}</h1>
                {definition.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400 sm:text-base">{definition.description}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={onOpenLibrary} className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  <LayoutGrid className="h-4 w-4" /> Biblioteca
                </button>
                <button type="button" onClick={startEditing} className={cn('flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors', accent.strong)}>
                  <PencilLine className="h-4 w-4" /> Personalizar
                </button>
              </div>
            </div>
            {definition.navigation === 'tabs' ? <div className="relative mt-7 border-t border-neutral-100 pt-3 dark:border-neutral-800">{navigation}</div> : null}
          </header>

          <div className={cn('mt-5 min-w-0', definition.navigation === 'sidebar' && 'grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]')}>
            {definition.navigation === 'sidebar' ? (
              <aside className="h-fit rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 lg:sticky lg:top-5">
                <div className="mb-1 flex items-center gap-2 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-neutral-400"><PanelLeft className="h-3.5 w-3.5" /> Vistas</div>
                {navigation}
              </aside>
            ) : null}

            <main className="min-w-0">
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-neutral-950 dark:text-white">{activeView.name}</h2>
                  {activeView.description ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{activeView.description}</p> : null}
                </div>
                <button type="button" onClick={onCreateDocument} className="flex h-9 w-fit items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  <Plus className="h-4 w-4" /> Nuevo documento
                </button>
              </div>

              <div className={cn('space-y-8', definition.density === 'compact' && 'space-y-5')}>
                {activeView.sections.map((section) => (
                  <section key={section.id}>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <h3 className="text-base font-extrabold text-neutral-900 dark:text-white">{section.title}</h3>
                        {section.description ? <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{section.description}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-neutral-400">{section.documents.length} {section.documents.length === 1 ? 'documento' : 'documentos'}</span>
                    </div>

                    {section.documents.length ? (
                      <div className={cn(
                        section.layout === 'list' ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
                        section.layout === 'featured' && 'xl:grid-cols-4',
                      )}>
                        {section.documents.map((document, index) => (
                          <PortalDocumentCard
                            key={document.id}
                            document={document}
                            featured={section.layout === 'featured' && index === 0}
                            list={section.layout === 'list'}
                            compact={definition.density === 'compact'}
                            accent={accent}
                            onOpen={() => onOpenDocument(document.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <button type="button" onClick={startEditing} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-5 py-8 text-sm font-bold text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:text-neutral-200">
                        <Plus className="h-4 w-4" /> Configurar esta sección
                      </button>
                    )}
                  </section>
                ))}
              </div>
            </main>
          </div>
        </div>
      </div>

      {editing && draft ? (
        <PortalEditor
          draft={draft}
          setDraft={setDraft}
          documents={documents}
          folders={folders}
          selectedViewId={selectedViewId}
          setSelectedViewId={setSelectedViewId}
          selectedSectionId={selectedSectionId}
          setSelectedSectionId={setSelectedSectionId}
          documentQuery={documentQuery}
          setDocumentQuery={setDocumentQuery}
          saving={saving}
          onSave={save}
          onClose={closeEditing}
        />
      ) : null}
    </div>
  );
}

function PortalDocumentCard({ document, featured, list, compact, accent, onOpen }: {
  document: DocumentSummary;
  featured: boolean;
  list: boolean;
  compact: boolean;
  accent: (typeof accentStyles)[keyof typeof accentStyles];
  onOpen: () => void;
}) {
  const Icon = document.format === 'html' ? FileCode2 : FileText;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group min-w-0 rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
        list ? 'flex items-center gap-3 p-3' : compact ? 'p-4' : 'p-5',
        featured && 'sm:col-span-2 xl:col-span-2 xl:row-span-2',
      )}
    >
      <span className={cn('flex shrink-0 items-center justify-center rounded-xl', accent.soft, list ? 'h-9 w-9' : featured ? 'h-12 w-12' : 'h-10 w-10')}>
        {document.emoji ? <span className={featured ? 'text-2xl' : 'text-lg'}>{document.emoji}</span> : <Icon className="h-4 w-4" />}
      </span>
      <span className={cn('min-w-0', list ? 'flex flex-1 items-center gap-3' : 'mt-4 block')}>
        <span className={cn('block min-w-0 flex-1 truncate font-extrabold text-neutral-900 dark:text-white', featured && !list ? 'text-xl' : 'text-sm')}>{document.title}</span>
        {document.excerpt && !list ? <span className={cn('mt-2 block text-sm leading-6 text-neutral-500 dark:text-neutral-400', featured ? 'line-clamp-5' : 'line-clamp-2')}>{document.excerpt}</span> : null}
        <span className={cn('text-xs font-medium text-neutral-400', list ? 'shrink-0' : 'mt-4 flex items-center justify-between')}>
          <span>{document.format === 'html' ? 'Informe HTML' : 'Documento'}</span>
          <span>{formatUpdated(document.updatedAt)}</span>
        </span>
      </span>
      {list ? <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5" /> : null}
    </button>
  );
}

function PortalEditor({ draft, setDraft, documents, folders, selectedViewId, setSelectedViewId, selectedSectionId, setSelectedSectionId, documentQuery, setDocumentQuery, saving, onSave, onClose }: {
  draft: DocumentPortalDefinition;
  setDraft: (definition: DocumentPortalDefinition) => void;
  documents: DocumentSummary[];
  folders: FolderSummary[];
  selectedViewId: string | null;
  setSelectedViewId: (id: string | null) => void;
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;
  documentQuery: string;
  setDocumentQuery: (value: string) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const viewIndex = Math.max(0, draft.views.findIndex((view) => view.id === selectedViewId));
  const view = draft.views[viewIndex];
  const sectionIndex = Math.max(0, view.sections.findIndex((section) => section.id === selectedSectionId));
  const section = view.sections[sectionIndex];
  const filteredDocuments = useMemo(() => {
    const term = documentQuery.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((document) => `${document.title} ${document.excerpt}`.toLowerCase().includes(term));
  }, [documentQuery, documents]);

  const updateView = (patch: Partial<typeof view>) => {
    const views = [...draft.views];
    views[viewIndex] = { ...view, ...patch };
    setDraft({ ...draft, views });
  };

  const updateSection = (patch: Partial<typeof section>) => {
    const sections = [...view.sections];
    sections[sectionIndex] = { ...section, ...patch };
    updateView({ sections });
  };

  const addView = () => {
    const name = window.prompt('Nombre de la nueva vista');
    if (!name?.trim()) return;
    let id = slugify(name, `vista-${draft.views.length + 1}`);
    while (draft.views.some((item) => item.id === id)) id = `${id}-${draft.views.length + 1}`;
    const nextView: DocumentPortalDefinition['views'][number] = {
      id,
      name: name.trim(),
      icon: 'files',
      sections: [{ id: 'principal', title: 'Documentos', layout: 'grid', source: { kind: 'manual', documentIds: [] } }],
    };
    setDraft({ ...draft, views: [...draft.views, nextView] });
    setSelectedViewId(id);
    setSelectedSectionId('principal');
  };

  const removeView = () => {
    if (draft.views.length === 1) return toast.error('El portal necesita al menos una vista.');
    if (!window.confirm(`¿Eliminar la vista «${view.name}»?`)) return;
    const views = draft.views.filter((item) => item.id !== view.id);
    const fallback = views[0];
    setDraft({ ...draft, views, defaultViewId: draft.defaultViewId === view.id ? fallback.id : draft.defaultViewId });
    setSelectedViewId(fallback.id);
    setSelectedSectionId(fallback.sections[0].id);
  };

  const addSection = () => {
    const name = window.prompt('Nombre de la nueva sección');
    if (!name?.trim()) return;
    let id = slugify(name, `seccion-${view.sections.length + 1}`);
    while (view.sections.some((item) => item.id === id)) id = `${id}-${view.sections.length + 1}`;
    updateView({ sections: [...view.sections, { id, title: name.trim(), layout: 'grid', source: { kind: 'manual', documentIds: [] } }] });
    setSelectedSectionId(id);
  };

  const removeSection = () => {
    if (view.sections.length === 1) return toast.error('Cada vista necesita al menos una sección.');
    if (!window.confirm(`¿Eliminar la sección «${section.title}»?`)) return;
    const sections = view.sections.filter((item) => item.id !== section.id);
    updateView({ sections });
    setSelectedSectionId(sections[0].id);
  };

  const setSourceKind = (kind: 'manual' | 'recent' | 'folder') => {
    if (kind === 'manual') updateSection({ source: { kind, documentIds: [] } });
    if (kind === 'recent') updateSection({ source: { kind, limit: 8 } });
    if (kind === 'folder') {
      if (!folders.length) return toast.error('Creá una carpeta antes de usar esta fuente.');
      updateSection({ source: { kind, folderId: folders[0].id, limit: 12 } });
    }
  };

  const toggleDocument = (documentId: number) => {
    if (section.source.kind !== 'manual') return;
    const ids = section.source.documentIds.includes(documentId)
      ? section.source.documentIds.filter((id) => id !== documentId)
      : [...section.source.documentIds, documentId];
    updateSection({ source: { ...section.source, documentIds: ids } });
  };

  const moveDocument = (index: number, direction: -1 | 1) => {
    if (section.source.kind !== 'manual') return;
    updateSection({ source: { ...section.source, documentIds: moveItem(section.source.documentIds, index, direction) } });
  };

  const updateRecentLimit = (limit: number) => {
    if (section.source.kind !== 'recent') return;
    updateSection({ source: { kind: 'recent', limit } });
  };

  const updateFolderSource = (patch: { folderId?: number; limit?: number }) => {
    if (section.source.kind !== 'folder') return;
    updateSection({ source: { kind: 'folder', folderId: patch.folderId ?? section.source.folderId, limit: patch.limit ?? section.source.limit } });
  };

  const manualDocumentIds = section.source.kind === 'manual' ? section.source.documentIds : [];

  return (
    <div className="absolute inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Personalizar portal">
      <button type="button" aria-label="Cerrar personalización" className="absolute inset-0" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-6">
          <div>
            <h2 className="font-black text-neutral-950 dark:text-white">Personalizar portal</h2>
            <p className="text-xs text-neutral-500">Vistas, secciones y fuentes que también pueden actualizar los conectores.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <fieldset className="space-y-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <legend className="px-2 text-xs font-extrabold uppercase tracking-[0.14em] text-neutral-400">Identidad</legend>
            <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300">Título<Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1.5" /></label>
            <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300">Descripción<textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Navegación<select value={draft.navigation} onChange={(event) => setDraft({ ...draft, navigation: event.target.value as DocumentPortalDefinition['navigation'] })} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><option value="tabs">Pestañas</option><option value="sidebar">Barra lateral</option></select></label>
              <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Densidad<select value={draft.density} onChange={(event) => setDraft({ ...draft, density: event.target.value as DocumentPortalDefinition['density'] })} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><option value="comfortable">Cómoda</option><option value="compact">Compacta</option></select></label>
            </div>
            <div><p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Color</p><div className="mt-2 flex flex-wrap gap-2">{DOCUMENT_PORTAL_ACCENTS.map((color) => <button key={color} type="button" onClick={() => setDraft({ ...draft, accent: color })} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold', draft.accent === color ? `${accentStyles[color].border} ${accentStyles[color].soft}` : 'border-neutral-200 text-neutral-500 dark:border-neutral-700')}><span className={cn('h-3 w-3 rounded-full', accentStyles[color].strong.split(' ')[0])} />{accentLabels[color]}{draft.accent === color ? <Check className="h-3 w-3" /> : null}</button>)}</div></div>
          </fieldset>

          <section className="mt-5 rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-200 p-3 dark:border-neutral-800"><div><h3 className="text-sm font-black">Vistas</h3><p className="text-xs text-neutral-500">La navegación respeta este orden.</p></div><button type="button" onClick={addView} className="flex h-8 items-center gap-1 rounded-lg bg-neutral-900 px-2.5 text-xs font-bold text-white dark:bg-white dark:text-neutral-900"><Plus className="h-3.5 w-3.5" /> Vista</button></div>
            <div className="flex gap-1 overflow-x-auto p-2">{draft.views.map((item, index) => { const Icon = icons[item.icon]; return <div key={item.id} className={cn('flex shrink-0 items-center rounded-xl border', item.id === view.id ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900' : 'border-neutral-200 dark:border-neutral-800')}><button type="button" onClick={() => { setSelectedViewId(item.id); setSelectedSectionId(item.sections[0].id); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold"><Icon className="h-3.5 w-3.5" />{item.name}</button><button type="button" disabled={index === 0} onClick={() => setDraft({ ...draft, views: moveItem(draft.views, index, -1) })} className="p-1 disabled:opacity-20"><ArrowLeft className="h-3 w-3" /></button></div>; })}</div>
            <div className="grid gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-[1fr_150px]">
              <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Nombre<Input value={view.name} onChange={(event) => updateView({ name: event.target.value })} className="mt-1.5" /></label>
              <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Icono<select value={view.icon} onChange={(event) => updateView({ icon: event.target.value as typeof view.icon })} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal">{DOCUMENT_PORTAL_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label>
              <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300 sm:col-span-2">Descripción<Input value={view.description ?? ''} onChange={(event) => updateView({ description: event.target.value })} className="mt-1.5" /></label>
              <label className="flex items-center gap-2 text-xs font-bold"><input type="radio" checked={draft.defaultViewId === view.id} onChange={() => setDraft({ ...draft, defaultViewId: view.id })} /> Abrir esta vista primero</label>
              <button type="button" onClick={removeView} className="flex items-center justify-self-end gap-1 text-xs font-bold text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Eliminar vista</button>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-200 p-3 dark:border-neutral-800"><div><h3 className="text-sm font-black">Secciones de {view.name}</h3><p className="text-xs text-neutral-500">Cada sección resuelve su propia fuente.</p></div><button type="button" onClick={addSection} className="flex h-8 items-center gap-1 rounded-lg border border-neutral-200 px-2.5 text-xs font-bold dark:border-neutral-700"><Plus className="h-3.5 w-3.5" /> Sección</button></div>
            <div className="space-y-1 p-2">{view.sections.map((item, index) => <div key={item.id} className={cn('flex items-center rounded-xl', item.id === section.id ? 'bg-neutral-100 dark:bg-neutral-800' : '')}><button type="button" onClick={() => setSelectedSectionId(item.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs font-bold">{item.title}</button><button type="button" disabled={index === 0} onClick={() => updateView({ sections: moveItem(view.sections, index, -1) })} className="p-1.5 disabled:opacity-20"><ArrowUp className="h-3 w-3" /></button><button type="button" disabled={index === view.sections.length - 1} onClick={() => updateView({ sections: moveItem(view.sections, index, 1) })} className="p-1.5 disabled:opacity-20"><ArrowDown className="h-3 w-3" /></button></div>)}</div>
            <div className="space-y-3 border-t border-neutral-200 p-4 dark:border-neutral-800">
              <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300">Título<Input value={section.title} onChange={(event) => updateSection({ title: event.target.value })} className="mt-1.5" /></label>
              <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300">Descripción<Input value={section.description ?? ''} onChange={(event) => updateSection({ description: event.target.value })} className="mt-1.5" /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Diseño<select value={section.layout} onChange={(event) => updateSection({ layout: event.target.value as typeof section.layout })} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><option value="featured">Destacada</option><option value="grid">Grilla</option><option value="list">Lista</option></select></label><label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Fuente<select value={section.source.kind} onChange={(event) => setSourceKind(event.target.value as 'manual' | 'recent' | 'folder')} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal"><option value="manual">Documentos elegidos</option><option value="recent">Actualizados recientemente</option><option value="folder">Carpeta</option></select></label></div>
              {section.source.kind === 'recent' ? <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-300">Cantidad<Input type="number" min={1} max={24} value={section.source.limit} onChange={(event) => updateRecentLimit(Number(event.target.value))} className="mt-1.5" /></label> : null}
              {section.source.kind === 'folder' ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Carpeta<select value={section.source.folderId} onChange={(event) => updateFolderSource({ folderId: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal">{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.emoji ? `${folder.emoji} ` : ''}{folder.name}</option>)}</select></label><label className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Cantidad<Input type="number" min={1} max={50} value={section.source.limit} onChange={(event) => updateFolderSource({ limit: Number(event.target.value) })} className="mt-1.5" /></label></div> : null}
              {section.source.kind === 'manual' ? <div><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" /><Input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Buscar documentos para vincular…" className="pl-9" /></div><div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800">{filteredDocuments.map((document) => { const selected = manualDocumentIds.includes(document.id); const position = manualDocumentIds.indexOf(document.id); return <div key={document.id} className="flex items-center gap-2 border-b border-neutral-100 px-2 py-2 last:border-0 dark:border-neutral-800"><button type="button" onClick={() => toggleDocument(document.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 dark:border-neutral-700')}>{selected ? <Check className="h-3 w-3" /> : null}</span><span className="min-w-0 truncate text-xs font-bold">{document.emoji ? `${document.emoji} ` : ''}{document.title}</span></button>{selected ? <><span className="text-[10px] font-bold text-neutral-400">{position + 1}</span><button type="button" disabled={position === 0} onClick={() => moveDocument(position, -1)} className="p-1 disabled:opacity-20"><ArrowUp className="h-3 w-3" /></button><button type="button" disabled={position === manualDocumentIds.length - 1} onClick={() => moveDocument(position, 1)} className="p-1 disabled:opacity-20"><ArrowDown className="h-3 w-3" /></button></> : null}</div>; })}</div></div> : null}
              <button type="button" onClick={removeSection} className="flex items-center gap-1 text-xs font-bold text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Eliminar sección</button>
            </div>
          </section>

          <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <strong>Conectores WhatsPro:</strong> esta misma definición puede leerse y actualizarse con <code>whatspro_documents_portal_get</code> y <code>whatspro_documents_portal_update</code>.
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950 sm:px-6">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-bold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">Cancelar</button>
          <button type="button" onClick={onSave} disabled={saving} className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar portal</button>
        </footer>
      </aside>
    </div>
  );
}
