'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Home,
  LayoutGrid,
  List,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentSummary, FolderNode } from './tree';

const VIEW_MODE_KEY = 'documents:viewMode';
type ViewMode = 'icons' | 'list';
type FormatFilter = 'all' | 'markdown' | 'html';

type Props = {
  /** Carpeta actual (null = raíz). */
  folder: FolderNode | null;
  /** Camino raíz→carpeta actual, para el breadcrumb. */
  breadcrumb: FolderNode[];
  subfolders: FolderNode[];
  documents: DocumentSummary[];
  onOpenFolder: (folderId: number | null) => void;
  onOpenDocument: (id: number) => void;
  onCreateDocument: (folderId: number | null) => void;
  onCreateHtmlDocument: (folderId: number | null, title: string, htmlContent: string) => void;
  onCreateFolder: (parentId: number | null) => void;
};

const matchesFilter = (doc: DocumentSummary, filter: FormatFilter) =>
  filter === 'all' || doc.format === filter;

/**
 * Vista de navegación del panel principal: se muestra cuando no hay un documento
 * abierto. Dos modos intercambiables:
 * - íconos: grilla tipo explorador, clic en una carpeta navega adentro (sin cambios
 *   respecto de como estaba).
 * - lista: árbol desplegable in-place — clic en una carpeta la expande/colapsa ahí
 *   mismo, no navega, para no perder el contexto de las carpetas hermanas.
 */
export function FolderGrid({
  folder,
  breadcrumb,
  subfolders,
  documents,
  onOpenFolder,
  onOpenDocument,
  onCreateDocument,
  onCreateHtmlDocument,
  onCreateFolder,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('icons');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [openFolderIds, setOpenFolderIds] = useState<Set<number>>(() => new Set());
  const htmlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_KEY);
      if (stored === 'icons' || stored === 'list') setViewMode(stored);
    } catch {
      // localStorage puede fallar en modo privado: no es motivo para romper la app.
    }
  }, []);

  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ídem */
    }
  };

  const toggleFolderOpen = (id: number) => {
    setOpenFolderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePickHtmlFile = () => htmlInputRef.current?.click();

  const handleHtmlFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const html = typeof reader.result === 'string' ? reader.result : '';
      if (!html.trim()) return;
      const title = file.name.replace(/\.html?$/i, '') || 'Informe HTML';
      onCreateHtmlDocument(folder?.id ?? null, title, html);
    };
    reader.readAsText(file);
  };

  const filteredDocuments = documents.filter((doc) => matchesFilter(doc, formatFilter));
  const isEmpty = subfolders.length === 0 && filteredDocuments.length === 0;
  const hasAnyContent = subfolders.length > 0 || documents.length > 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => onOpenFolder(null)}
            className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 font-medium transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            Documentos
          </button>
          {breadcrumb.map((node) => (
            <span key={node.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
              <button
                type="button"
                onClick={() => onOpenFolder(node.id)}
                className={cn(
                  'min-w-0 max-w-[10rem] truncate rounded-lg px-1.5 py-1 font-medium transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white sm:max-w-none',
                  node.id === folder?.id && 'text-neutral-900 dark:text-white',
                )}
              >
                {node.emoji ? `${node.emoji} ` : ''}
                {node.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Cabecera */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-3xl">
              {folder ? `${folder.emoji ? folder.emoji + ' ' : ''}${folder.name}` : 'Documentos'}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {isEmpty && formatFilter === 'all'
                ? 'Esta carpeta todavía está vacía.'
                : `${subfolders.length} ${subfolders.length === 1 ? 'carpeta' : 'carpetas'} · ${filteredDocuments.length} ${filteredDocuments.length === 1 ? 'documento' : 'documentos'}`}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Filtro por tipo de documento */}
            {hasAnyContent && (
              <div className="flex items-center gap-0.5 rounded-2xl border border-neutral-100 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-900">
                {(
                  [
                    { key: 'all' as const, label: 'Todos' },
                    { key: 'markdown' as const, label: 'Markdown' },
                    { key: 'html' as const, label: 'HTML' },
                  ]
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFormatFilter(option.key)}
                    aria-pressed={formatFilter === option.key}
                    className={cn(
                      'rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all duration-200',
                      formatFilter === option.key
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-0.5 rounded-2xl border border-neutral-100 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-900">
              <button
                type="button"
                onClick={() => setMode('icons')}
                title="Vista en íconos"
                aria-pressed={viewMode === 'icons'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200',
                  viewMode === 'icons'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMode('list')}
                title="Vista en lista"
                aria-pressed={viewMode === 'list'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200',
                  viewMode === 'list'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onCreateFolder(folder?.id ?? null)}
              title="Nueva carpeta"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-neutral-100 text-neutral-500 transition-all duration-200 hover:border-indigo-500/40 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onCreateDocument(folder?.id ?? null)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-2xl bg-indigo-500 px-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:bg-indigo-600 dark:shadow-none"
            >
              <FilePlus2 className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo documento</span>
            </button>
            <button
              type="button"
              onClick={handlePickHtmlFile}
              title="Subir un informe HTML"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-neutral-100 px-3.5 text-sm font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500/40 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Subir HTML</span>
            </button>
            <input
              ref={htmlInputRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={handleHtmlFileChange}
            />
          </div>
        </div>

        {/* Contenido */}
        {isEmpty ? (
          <div className="mt-10 rounded-[2rem] border-2 border-dashed border-neutral-200 p-10 text-center dark:border-neutral-700">
            <FolderClosed className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-3 text-sm font-bold text-neutral-700 dark:text-neutral-200">
              {formatFilter === 'all' ? 'Nada por acá todavía' : 'Nada con este filtro'}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {formatFilter === 'all'
                ? 'Creá una carpeta o un documento para empezar.'
                : 'Probá con otro filtro o creá un documento nuevo.'}
            </p>
          </div>
        ) : viewMode === 'icons' ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {subfolders.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => onOpenFolder(sub.id)}
                className="flex flex-col items-center gap-2 rounded-3xl border border-neutral-100 bg-white p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-2xl">
                  {sub.emoji || <FolderClosed className="h-6 w-6 text-indigo-500" />}
                </div>
                <span className="line-clamp-2 w-full text-xs font-bold text-neutral-800 dark:text-neutral-100">{sub.name}</span>
                {sub.documents.length + sub.children.length > 0 ? (
                  <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                    {sub.documents.length + sub.children.length}
                  </span>
                ) : null}
              </button>
            ))}
            {filteredDocuments.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onOpenDocument(doc.id)}
                className="flex flex-col items-center gap-2 rounded-3xl border border-neutral-100 bg-white p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-2xl dark:bg-neutral-900">
                  {doc.emoji || (doc.format === 'html' ? (
                    <Code2 className="h-6 w-6 text-indigo-400" />
                  ) : (
                    <FileText className="h-6 w-6 text-neutral-400" />
                  ))}
                </div>
                <span className="line-clamp-2 w-full text-xs font-bold text-neutral-800 dark:text-neutral-100">{doc.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-1">
            {subfolders.map((sub) => (
              <FolderAccordionRow
                key={sub.id}
                node={sub}
                isOpen={openFolderIds.has(sub.id)}
                openFolderIds={openFolderIds}
                formatFilter={formatFilter}
                onToggle={toggleFolderOpen}
                onOpenDocument={onOpenDocument}
              />
            ))}
            {filteredDocuments.length > 0 && (
              <div className="space-y-1 pt-2">
                {subfolders.length > 0 && (
                  <p className="mb-2 mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
                    Documentos
                  </p>
                )}
                {filteredDocuments.map((doc) => (
                  <DocumentListRow key={doc.id} doc={doc} depth={0} onOpen={onOpenDocument} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Fila de carpeta desplegable (vista lista): clic expande/colapsa in-place, nunca navega. */
function FolderAccordionRow({
  node,
  isOpen,
  openFolderIds,
  formatFilter,
  onToggle,
  onOpenDocument,
}: {
  node: FolderNode;
  isOpen: boolean;
  openFolderIds: Set<number>;
  formatFilter: FormatFilter;
  onToggle: (id: number) => void;
  onOpenDocument: (id: number) => void;
}) {
  // (depth - 1) porque `depth` en el árbol arranca en 1 para las carpetas raíz —
  // misma fórmula que ya usa el árbol lateral (FolderTree.tsx) para consistencia visual.
  const paddingLeft = (node.depth - 1) * 16 + 12;
  const filteredDocs = node.documents.filter((doc) => matchesFilter(doc, formatFilter));
  const childCount = node.documents.length + node.children.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        style={{ paddingLeft }}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl py-2.5 pr-3 text-left text-sm transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        )}
        {node.emoji ? (
          <span className="shrink-0 text-base leading-none">{node.emoji}</span>
        ) : isOpen ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-indigo-500" />
        ) : (
          <FolderClosed className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <span className="min-w-0 flex-1 truncate font-bold text-neutral-900 dark:text-neutral-100">{node.name}</span>
        {childCount > 0 ? (
          <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {childCount}
          </span>
        ) : null}
      </button>

      {isOpen && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <FolderAccordionRow
              key={child.id}
              node={child}
              isOpen={openFolderIds.has(child.id)}
              openFolderIds={openFolderIds}
              formatFilter={formatFilter}
              onToggle={onToggle}
              onOpenDocument={onOpenDocument}
            />
          ))}
          {filteredDocs.map((doc) => (
            <DocumentListRow key={doc.id} doc={doc} depth={node.depth} onOpen={onOpenDocument} />
          ))}
          {!node.children.length && !filteredDocs.length ? (
            <p
              style={{ paddingLeft: node.depth * 16 + 12 }}
              className="py-1.5 text-xs text-neutral-400"
            >
              Carpeta vacía.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DocumentListRow({
  doc,
  depth,
  onOpen,
}: {
  doc: DocumentSummary;
  depth: number;
  onOpen: (id: number) => void;
}) {
  const paddingLeft = depth * 16 + 12;

  return (
    <button
      type="button"
      onClick={() => onOpen(doc.id)}
      style={{ paddingLeft }}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-xl py-2.5 pr-3 text-left text-sm transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
    >
      {doc.emoji ? (
        <span className="shrink-0 text-base leading-none">{doc.emoji}</span>
      ) : doc.format === 'html' ? (
        <Code2 className="h-4 w-4 shrink-0 text-indigo-400" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
      )}
      <span className="min-w-0 flex-1 truncate font-bold text-neutral-900 dark:text-neutral-100">{doc.title}</span>
      {doc.format === 'html' ? (
        <span className="hidden shrink-0 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-500 sm:block">
          HTML
        </span>
      ) : null}
      {doc.excerpt ? (
        <span className="hidden max-w-[16rem] shrink-0 truncate text-xs text-neutral-400 sm:block">{doc.excerpt}</span>
      ) : null}
    </button>
  );
}
