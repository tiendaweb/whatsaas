'use client';

import { ExternalLink } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { chatHrefFor } from '@/lib/plugins/radar/shared/chat-link';
import { PRIORIDAD_BADGE } from '../labels';
import { BlockEmpty, BlockHeader, Chip } from './primitives';

export type ContactsBlockData = Extract<RadarBlock, { type: 'contacts' }>;

/**
 * Lista de contactos con acceso al chat. La IA manda el `remoteJid` crudo y la
 * ruta la arma `chatHrefFor` — si la armara la IA volveríamos al bug del
 * `@s.whatsapp.net` duplicado.
 */
export function ContactsBlock({
  block,
  onSelect,
}: {
  block: ContactsBlockData;
  /** Si se provee, tocar el contacto abre su ficha Radar en vez de navegar. */
  onSelect?: (contactId: number) => void;
}) {
  const items = block.items ?? [];

  return (
    <>
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {items.length === 0 ? (
        <BlockEmpty text="No hay contactos para mostrar." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const href = chatHrefFor(item.remoteJid, item.instanceId);
            const badge = item.priority ? PRIORIDAD_BADGE[item.priority] : null;
            return (
              <div
                key={item.contactId}
                className="flex flex-col gap-2 rounded-2xl border border-neutral-100 bg-white p-3 transition-all duration-200 hover:border-indigo-300 dark:border-neutral-800 dark:bg-neutral-800/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  onClick={onSelect ? () => onSelect(item.contactId) : undefined}
                  disabled={!onSelect}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-neutral-900 dark:text-white">{item.name}</span>
                    {badge && (
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                    {typeof item.score === 'number' && <Chip label={`Score ${item.score}`} tone="neutral" />}
                    {item.badges?.map((chip, index) => (
                      <Chip key={`${chip.label}-${index}`} label={chip.label} tone={chip.tone} />
                    ))}
                  </div>
                  {item.detail && (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{item.detail}</p>
                  )}
                </button>

                {href ? (
                  <a
                    href={href}
                    className="flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400 sm:self-auto"
                  >
                    Abrir chat <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span
                    title="Este contacto no tiene un chat vinculado"
                    className="shrink-0 self-start rounded-xl border border-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-300 dark:border-neutral-700 dark:text-neutral-600 sm:self-auto"
                  >
                    Sin chat
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
