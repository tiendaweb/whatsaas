'use client';

import { useEffect, useState } from 'react';
import { Radar as RadarIcon, X } from 'lucide-react';
import './radar.css';
import { RadarClientPanel } from './RadarClientPanel';
import { RadarDocumentViewer } from './RadarDocumentViewer';
import { RadarDocumentProvider } from './blocks/radar-context';

/**
 * Radar a pantalla completa desde el chat. El panel lateral tiene 18rem y los
 * gráficos y tablas no entran; acá se ve la ficha entera con el mismo
 * componente que usa el tablero.
 */
export function RadarFullscreen({
  contactId,
  remoteJid,
  instanceId,
  onClose,
}: {
  contactId: number;
  remoteJid?: string | null;
  instanceId?: number | null;
  onClose: () => void;
}) {
  const [documentId, setDocumentId] = useState<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <RadarDocumentProvider open={setDocumentId}>
      <div
        className="radar-ui fixed inset-0 z-[85] flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
        role="dialog"
        aria-modal="true"
        aria-label="Radar en pantalla completa"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-neutral-100 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white">
            <RadarIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black tracking-tight text-neutral-900 dark:text-white">Radar</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">Ficha completa del cliente</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar pantalla completa"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-7">
          <div className="mx-auto max-w-[72rem]">
            <RadarClientPanel contactId={contactId} remoteJid={remoteJid} instanceId={instanceId} />
          </div>
        </div>

        {documentId !== null && <RadarDocumentViewer documentId={documentId} onClose={() => setDocumentId(null)} />}
      </div>
    </RadarDocumentProvider>
  );
}
