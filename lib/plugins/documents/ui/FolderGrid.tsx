'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, FilePlus2, FileText, FolderClosed, FolderPlus, Home, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentSummary, FolderNode } from './tree';

const VIEW_MODE_KEY = 'documents:viewMode';
type ViewMode = 'icons' | 'list';

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
  onCreateFolder: (parentId: number | null) => void;
};

/**
 * Vista de navegación del panel principal: se muestra cuando no hay un documento
 * abierto. Reemplaza al viejo "documentos recientes" por un explorador real de la
 * carpeta actual, con dos modos intercambiables (grilla de íconos / lista simple),
 * en el mismo lenguaje visual ToDoS que Tareas.
 */
export function FolderGrid({
  folder,
  breadcrumb,
  subfolders,
  documents,
  onOpenFolder,
  onOpenDocument,
  onCreateDocument,
  onCreateFolder,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('icons');

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

  const isEmpty = subfolders.length === 0 && documents.length === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => onOpenFolder(null)}
            className="flex items-center gap-1 rounded-lg px-1.5 py-1 font-medium transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            Documentos
          </button>
          {breadcrumb.map((node) => (
            <span key={node.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
              <button
                type="button"
                onClick={() => onOpenFolder(node.id)}
                className={cn(
                  'truncate rounded-lg px-1.5 py-1 font-medium transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white',
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
          <div>
            <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-3xl">
              {folder ? `${folder.emoji ? folder.emoji + ' ' : ''}${folder.name}` : 'Documentos'}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {isEmpty
                ? 'Esta carpeta todavía está vacía.'
                : `${subfolders.length} ${subfolders.length === 1 ? 'carpeta' : 'carpetas'} · ${documents.length} ${documents.length === 1 ? 'documento' : 'documentos'}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
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
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-neutral-100 text-neutral-500 transition-all duration-200 hover:border-indigo-500/40 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onCreateDocument(folder?.id ?? null)}
              className="flex h-9 items-center gap-1.5 rounded-2xl bg-indigo-500 px-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:bg-indigo-600 dark:shadow-none"
            >
              <FilePlus2 className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo documento</span>
            </button>
          </div>
        </div>

        {/* Contenido */}
        {isEmpty ? (
          <div className="mt-10 rounded-[2rem] border-2 border-dashed border-neutral-200 p-10 text-center dark:border-neutral-700">
            <FolderClosed className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-3 text-sm font-bold text-neutral-700 dark:text-neutral-200">Nada por acá todavía</p>
            <p className="mt-1 text-sm text-neutral-400">Creá una carpeta o un documento para empezar.</p>
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
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-2xl">
                  {sub.emoji || <FolderClosed className="h-6 w-6 text-indigo-500" />}
                </div>
                <span className="line-clamp-2 text-xs font-bold text-neutral-800 dark:text-neutral-100">{sub.name}</span>
                {sub.documents.length + sub.children.length > 0 ? (
                  <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                    {sub.documents.length + sub.children.length}
                  </span>
                ) : null}
              </button>
            ))}
            {documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onOpenDocument(doc.id)}
                className="flex flex-col items-center gap-2 rounded-3xl border border-neutral-100 bg-white p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-2xl dark:bg-neutral-900">
                  {doc.emoji || <FileText className="h-6 w-6 text-neutral-400" />}
                </div>
                <span className="line-clamp-2 text-xs font-bold text-neutral-800 dark:text-neutral-100">{doc.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {subfolders.length > 0 && (
              <section>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
                  Carpetas
                </p>
                <div className="space-y-1">
                  {subfolders.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => onOpenFolder(sub.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    >
                      {sub.emoji ? (
                        <span className="text-base leading-none">{sub.emoji}</span>
                      ) : (
                        <FolderClosed className="h-4 w-4 shrink-0 text-indigo-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-bold text-neutral-900 dark:text-neutral-100">{sub.name}</span>
                      {sub.documents.length + sub.children.length > 0 ? (
                        <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          {sub.documents.length + sub.children.length}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {documents.length > 0 && (
              <section>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
                  Documentos
                </p>
                <div className="space-y-1">
                  {documents.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onOpenDocument(doc.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    >
                      {doc.emoji ? (
                        <span className="text-base leading-none">{doc.emoji}</span>
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-bold text-neutral-900 dark:text-neutral-100">{doc.title}</span>
                      {doc.excerpt ? (
                        <span className="hidden max-w-[16rem] truncate text-xs text-neutral-400 sm:block">{doc.excerpt}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
