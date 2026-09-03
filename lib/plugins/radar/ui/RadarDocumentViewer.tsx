'use client';

import useSWR from 'swr';
import { ExternalLink, Loader2, ScrollText, X } from 'lucide-react';
import { DocumentContent } from './DocumentContent';

type DocumentPayload = {
  id: number;
  title: string;
  emoji: string | null;
  format: 'markdown' | 'html';
  htmlContent: string | null;
  content: unknown;
  updatedAt: string;
  breadcrumbs: Array<{ id: number; name: string; emoji: string | null }>;
  error?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Visor de informes dentro del panel de Radar. Los informes SON documentos del
 * plugin Documentos: acá se leen sin salir de Radar en vez de abrir otra
 * pestaña. El HTML va en un iframe con el mismo sandbox que usa el editor
 * (`allow-scripts` sin `allow-same-origin`): los informes generados por IA
 * suelen traer gráficos con JS, pero no pueden tocar la sesión de la app.
 */
export function RadarDocumentViewer({
  documentId,
  onClose,
}: {
  documentId: number;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useSWR<DocumentPayload>(
    `/api/plugins/documents/documents/${documentId}`,
    fetcher,
  );

  const failed = Boolean(error || data?.error);
  const title = data?.title || 'Informe';
  const path = data?.breadcrumbs?.map((crumb) => crumb.name).join(' / ');

  return (
    <div className="fixed inset-0 z-[90] flex" role="dialog" aria-modal="true" aria-label={`Informe ${title}`}>
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label="Cerrar informe" />

      <div className="radar-ui flex h-full w-full max-w-3xl flex-col bg-neutral-50 shadow-2xl dark:bg-neutral-900 sm:w-[min(92vw,48rem)]">
        <header className="flex items-center gap-2.5 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white">
            <ScrollText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">
              {data?.emoji ? `${data.emoji} ` : ''}
              {title}
            </p>
            {path && <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">{path}</p>}
          </div>
          <a
            href={`/plugins/documents/doc/${documentId}`}
            target="_blank"
            rel="noreferrer"
            className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400 sm:flex"
          >
            Editar <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar informe"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando el informe…
            </div>
          )}

          {!isLoading && failed && (
            <p className="px-6 py-24 text-center text-sm text-neutral-400">No se pudo abrir este informe.</p>
          )}

          {!isLoading && !failed && data?.format === 'html' && (
            <iframe
              title={title}
              srcDoc={data.htmlContent ?? ''}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-scripts"
            />
          )}

          {!isLoading && !failed && data && data.format !== 'html' && (
            <div className="h-full overflow-y-auto px-5 py-6 sm:px-8">
              <DocumentContent content={data.content} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
