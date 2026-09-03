'use client';

import { FileCode2, FileText } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip } from './primitives';
import { useRadarDocumentOpener } from './radar-context';

export type DocumentsBlockData = Extract<RadarBlock, { type: 'documents' }>;

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('es-AR');
}

/**
 * Informes y documentos vinculados. Si hay un visor disponible en el árbol
 * (ver `radar-context`), se abren adentro del panel; si no, enlazan al plugin
 * Documentos.
 */
export function DocumentsBlock({ block }: { block: DocumentsBlockData }) {
  const openDocument = useRadarDocumentOpener();
  const items = block.items ?? [];

  return (
    <>
      <BlockHeader icon={block.icon ?? 'ScrollText'} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {items.length === 0 ? (
        <BlockEmpty text="Todavía no hay informes acá." />
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const Icon = item.format === 'html' ? FileCode2 : FileText;
            const updated = formatDate(item.updatedAt);
            const content = (
              <>
                <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate text-left font-bold text-neutral-800 dark:text-neutral-100">
                  {item.emoji ? `${item.emoji} ` : ''}
                  {item.title}
                </span>
                {item.folder && <span className="hidden shrink-0 text-xs text-neutral-400 sm:block">{item.folder}</span>}
                {item.format === 'html' && <Chip label="HTML" tone="indigo" />}
                {updated && <span className="hidden shrink-0 text-xs text-neutral-400 sm:block">{updated}</span>}
              </>
            );
            const className =
              'flex w-full items-center gap-2.5 rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm transition-all duration-200 hover:border-indigo-500 dark:border-neutral-800 dark:bg-neutral-800/60';

            return openDocument ? (
              <button key={item.id} type="button" onClick={() => openDocument(item.id)} className={className}>
                {content}
              </button>
            ) : (
              <a
                key={item.id}
                href={`/plugins/documents/doc/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {content}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
