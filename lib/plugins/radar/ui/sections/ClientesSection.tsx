'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Loader2, ScrollText, Search } from 'lucide-react';
import { chatHrefFor } from '@/lib/plugins/radar/shared/chat-link';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, PRIORIDAD_BADGE } from '../labels';
import { BlockEmpty, BlockLabel, Chip } from '../blocks/primitives';
import { RadarClientPanel } from '../RadarClientPanel';
import { SectionShell } from './SectionShell';
import type { RadarClient, RadarClientsResponse } from './types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Panel de clientes analizados. Cada cliente es una card viva con su prioridad,
 * score, cuántos informes tiene y cuántas tareas abiertas; al abrirla se ve la
 * ficha Radar completa.
 */
export function ClientesSection({ editing }: { editing: boolean }) {
  const [query, setQuery] = useState('');
  const [onlyWithReports, setOnlyWithReports] = useState(false);
  const [selected, setSelected] = useState<RadarClient | null>(null);

  const { data, isLoading } = useSWR<RadarClientsResponse>('/api/plugins/radar/clients', fetcher);
  const clients = data?.clients ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (onlyWithReports && !client.hasReports) return false;
      if (!needle) return true;
      return client.contactName.toLowerCase().includes(needle);
    });
  }, [clients, query, onlyWithReports]);

  if (selected) {
    return (
      <RadarClientPanel
        contactId={selected.contactId}
        remoteJid={selected.remoteJid}
        instanceId={selected.instanceId}
        editing={editing}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <SectionShell section="clientes" editing={editing} onSelectContact={(contactId) => {
      const client = clients.find((item) => item.contactId === contactId);
      if (client) setSelected(client);
    }}>
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-neutral-400" />
            <span className="sr-only">Buscar cliente</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar un cliente analizado…"
              className="w-full rounded-2xl border border-neutral-100 bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-800 outline-none transition-all duration-200 placeholder:text-neutral-400 focus:border-indigo-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-100"
            />
          </label>
          <button
            type="button"
            onClick={() => setOnlyWithReports((value) => !value)}
            aria-pressed={onlyWithReports}
            className={`flex shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 py-2.5 text-xs font-bold transition-all duration-200 ${
              onlyWithReports
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'border-neutral-100 bg-white text-neutral-500 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400'
            }`}
          >
            <ScrollText className="h-3.5 w-3.5" />
            Solo con informe
          </button>
        </div>

        <BlockLabel>
          {filtered.length} de {clients.length} clientes analizados
          {data ? ` · ${data.counts.withReports} con informe` : ''}
        </BlockLabel>

        {isLoading && (
          <div className="flex items-center gap-2 py-10 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando clientes…
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <BlockEmpty text={clients.length ? 'Ningún cliente coincide con la búsqueda.' : 'Radar todavía no analizó ningún cliente.'} />
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtered.map((client) => (
              <ClientCard key={client.contactId} client={client} onOpen={() => setSelected(client)} />
            ))}
          </div>
        )}
      </section>
    </SectionShell>
  );
}

function ClientCard({ client, onOpen }: { client: RadarClient; onOpen: () => void }) {
  const badge = client.priority ? PRIORIDAD_BADGE[client.priority] : null;
  const chatHref = chatHrefFor(client.remoteJid, client.instanceId);
  const detail = [
    client.intencion ? humanize(INTENCION_LABEL, client.intencion) : null,
    client.objecion ? humanize(OBJECION_LABEL, client.objecion) : null,
  ].filter(Boolean).join(' · ');

  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-neutral-100 bg-white p-4 transition-all duration-200 hover:border-indigo-300 dark:border-neutral-800 dark:bg-neutral-800/60">
      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-bold text-neutral-900 dark:text-white">{client.contactName}</span>
          {badge && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>}
          {client.needsReview && <Chip label="Revisar" tone="violet" solid />}
        </div>
        {detail && <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>}
        {client.estrategia && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{client.estrategia}</p>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        {client.score !== null && <Chip label={`Score ${client.score}`} tone="indigo" />}
        {client.confianza !== null && <Chip label={`Confianza ${client.confianza}`} tone="slate" />}
        {client.reportCount > 0 && <Chip label={`${client.reportCount} informe${client.reportCount === 1 ? '' : 's'}`} tone="violet" />}
        {client.openTaskCount > 0 && <Chip label={`${client.openTaskCount} tarea${client.openTaskCount === 1 ? '' : 's'}`} tone="amber" />}
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-xl bg-indigo-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-all duration-200 hover:bg-indigo-600"
          >
            Ver ficha
          </button>
          {chatHref && (
            <a
              href={chatHref}
              className="flex items-center gap-1 rounded-xl border border-neutral-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 dark:border-neutral-700 dark:text-neutral-400"
            >
              Chat <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      </div>
    </article>
  );
}
