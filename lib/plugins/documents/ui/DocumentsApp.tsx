'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { FilePlus2, FolderPlus, Loader2, PanelLeftOpen, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import './documents.css';
import { FolderTree } from './FolderTree';
import { FolderGrid } from './FolderGrid';
import {
  buildTree,
  findFolderNode,
  getBreadcrumbPath,
  moveDocumentInTree,
  type DocumentSummary,
  type FolderNode,
  type TreeResponse,
} from './tree';

// El editor toca `window` al montar: fuera del SSR o hay error de hidratación.
const DocumentEditor = dynamic(() => import('./DocumentEditor').then((mod) => mod.DocumentEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const EXPANDED_KEY = 'documents:expanded';

export function DocumentsApp({ documentId }: { documentId?: number }) {
  const t = useTranslations('Documents');
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<TreeResponse>('/api/plugins/documents/tree', fetcher);

  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [isMovingDocument, setIsMovingDocument] = useState(false);
  const creatingDocumentRef = useRef(false);
  const movingDocumentRef = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(EXPANDED_KEY);
      if (stored) setExpanded(JSON.parse(stored));
    } catch {
      // localStorage puede fallar en modo privado: no es motivo para romper la app.
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  const toggleFolder = useCallback((folderId: number) => {
    setExpanded((current) => {
      const next = { ...current, [folderId]: !(current[folderId] ?? true) };
      try {
        window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {
        /* ídem */
      }
      return next;
    });
  }, []);

  const { roots, rootDocuments, documents } = useMemo(() => buildTree(data), [data]);

  const currentFolderNode = useMemo(() => findFolderNode(roots, currentFolderId), [roots, currentFolderId]);
  const breadcrumb = useMemo(() => getBreadcrumbPath(roots, currentFolderId), [roots, currentFolderId]);
  const gridSubfolders = currentFolderNode ? currentFolderNode.children : roots;
  const gridDocuments = currentFolderNode ? currentFolderNode.documents : rootDocuments;

  const openFolder = useCallback((folderId: number | null) => {
    setCurrentFolderId(folderId);
    setDrawerOpen(false);
  }, []);

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(term) || document.excerpt.toLowerCase().includes(term),
    );
  }, [documents, query]);

  const openDocument = useCallback(
    (id: number) => {
      setDrawerOpen(false);
      router.push(`/plugins/documents/doc/${id}`);
    },
    [router],
  );

  const createDocument = useCallback(
    async (folderId: number | null) => {
      if (creatingDocumentRef.current) return;
      creatingDocumentRef.current = true;

      try {
        const response = await fetch('/api/plugins/documents/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Documento sin título', folderId }),
        });
        const result = await response.json();
        if (!response.ok) {
          toast.error(result.error ?? 'No se pudo crear el documento.');
          return;
        }
        await mutate();
        openDocument(result.id);
      } catch {
        toast.error('No se pudo crear el documento.');
      } finally {
        creatingDocumentRef.current = false;
      }
    },
    [mutate, openDocument],
  );

  const createFolder = useCallback(
    async (parentId: number | null) => {
      const name = window.prompt(parentId ? 'Nombre de la subcarpeta' : 'Nombre de la carpeta');
      if (!name?.trim()) return;

      const response = await fetch('/api/plugins/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? 'No se pudo crear la carpeta.');
        return;
      }
      if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }));
      await mutate();
    },
    [mutate],
  );

  const renameFolder = useCallback(
    async (folder: FolderNode) => {
      const name = window.prompt('Nuevo nombre', folder.name);
      if (!name?.trim() || name === folder.name) return;

      const response = await fetch(`/api/plugins/documents/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        toast.error('No se pudo renombrar la carpeta.');
        return;
      }
      await mutate();
    },
    [mutate],
  );

  const deleteFolder = useCallback(
    async (folder: FolderNode) => {
      const confirmed = window.confirm(
        `¿Eliminar la carpeta «${folder.name}»?\n\nSus subcarpetas se eliminan también, pero los documentos NO: quedan sueltos en la raíz.`,
      );
      if (!confirmed) return;

      const response = await fetch(`/api/plugins/documents/folders/${folder.id}`, { method: 'DELETE' });
      if (!response.ok) {
        toast.error('No se pudo eliminar la carpeta.');
        return;
      }
      toast.success('Carpeta eliminada. Los documentos quedaron en la raíz.');
      await mutate();
    },
    [mutate],
  );

  const deleteDocument = useCallback(
    async (document: DocumentSummary) => {
      if (!window.confirm(`¿Eliminar «${document.title}»? Esta acción no se puede deshacer.`)) return;

      const response = await fetch(`/api/plugins/documents/documents/${document.id}`, { method: 'DELETE' });
      if (!response.ok) {
        toast.error('No se pudo eliminar el documento.');
        return;
      }
      await mutate();
      if (documentId === document.id) router.push('/plugins/documents');
    },
    [documentId, mutate, router],
  );

  const moveDocument = useCallback(
    async (movingDocumentId: number, folderId: number | null, position: number) => {
      if (!data || movingDocumentRef.current) return;
      movingDocumentRef.current = true;
      setIsMovingDocument(true);

      const previous = data;
      const optimistic = moveDocumentInTree(data, movingDocumentId, folderId, position);
      await mutate(optimistic, { revalidate: false });

      if (folderId !== null) {
        setExpanded((current) => {
          const next = { ...current, [folderId]: true };
          try {
            window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
          } catch {
            /* La vista sigue funcionando aunque no se pueda persistir la expansión. */
          }
          return next;
        });
      }

      try {
        const response = await fetch('/api/plugins/documents/documents/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: movingDocumentId, folderId, position }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? t('move_error'));
      } catch (error) {
        await mutate(previous, { revalidate: false });
        toast.error(error instanceof Error ? error.message : t('move_error'));
      } finally {
        movingDocumentRef.current = false;
        setIsMovingDocument(false);
        await mutate();
      }
    },
    [data, mutate, t],
  );

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-neutral-100 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">Documentos</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => createFolder(null)}
              title="Nueva carpeta"
              aria-label="Nueva carpeta"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => createDocument(null)}
              title="Nuevo documento"
              aria-label="Nuevo documento"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <FilePlus2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              title={t('hide_navigation')}
              aria-label={t('hide_navigation')}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar…"
            className="h-9 rounded-2xl border-neutral-100 bg-neutral-50 pl-9 text-sm shadow-none focus-visible:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        {!query ? <p className="text-xs text-neutral-400">{t('drag_hint')}</p> : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-6 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
            ))}
          </div>
        ) : searchResults ? (
          searchResults.length ? (
            <div className="space-y-0.5">
              {searchResults.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => openDocument(document.id)}
                  className={cn(
                    'block w-full rounded-xl px-2 py-1.5 text-left text-sm transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60',
                    documentId === document.id && 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
                  )}
                >
                  <span className="block truncate font-medium">
                    {document.emoji ? `${document.emoji} ` : ''}
                    {document.title}
                  </span>
                  {document.excerpt ? (
                    <span className="block truncate text-xs text-neutral-400">{document.excerpt}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="p-2 text-sm text-neutral-400">Sin resultados.</p>
          )
        ) : (
          <FolderTree
            nodes={roots}
            rootDocuments={rootDocuments}
            activeDocumentId={documentId ?? null}
            expanded={expanded}
            isMoving={isMovingDocument}
            onToggle={toggleFolder}
            onOpenFolder={openFolder}
            onOpenDocument={openDocument}
            onCreateDocument={createDocument}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onDeleteDocument={deleteDocument}
            onMoveDocument={moveDocument}
          />
        )}
      </nav>
    </div>
  );

  return (
    <div className="documentos-ui relative flex h-screen min-h-0 w-full overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      {/* Botón flotante: solo hace falta en mobile/tablet, en desktop el panel ya está fijo. */}
      {!drawerOpen ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          title={t('show_navigation')}
          aria-label={t('show_navigation')}
          aria-expanded="false"
          aria-controls="documents-navigation"
          className="absolute left-3 top-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:bg-indigo-600 dark:shadow-none lg:hidden"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      ) : null}

      {/* Overlay difuminado: solo en mobile/tablet, mientras el drawer está abierto. */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label={t('hide_navigation')}
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      {/* Un único panel: drawer deslizante en mobile/tablet, fijo y siempre visible en desktop (≥1024px). */}
      <aside
        id="documents-navigation"
        aria-label={t('navigation_label')}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-[85%] max-w-xs flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out dark:bg-neutral-900',
          'lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 lg:border-r lg:border-neutral-100 lg:shadow-none dark:lg:border-neutral-800',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebar}
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {documentId ? (
          <DocumentEditor
            key={documentId}
            documentId={documentId}
            onSaved={() => void mutate()}
            onOpenDocument={openDocument}
          />
        ) : (
          <FolderGrid
            folder={currentFolderNode}
            breadcrumb={breadcrumb}
            subfolders={gridSubfolders}
            documents={gridDocuments}
            onOpenFolder={openFolder}
            onOpenDocument={openDocument}
            onCreateDocument={createDocument}
            onCreateFolder={createFolder}
          />
        )}
      </main>
    </div>
  );
}
