'use client';

import { useMemo, useState } from 'react';
import type { RadarBlock, RadarIcon, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, RECUPERABILIDAD_LABEL } from '../labels';
import { RadarBlocks } from '../blocks/RadarBlockView';
import { BlockEmpty, BlockLabel } from '../blocks/primitives';
import { SectionShell } from './SectionShell';
import type { PriorityContact, RadarOverview, RadarPriorityValue } from './types';

type Filter = 'all' | RadarPriorityValue | 'revisar';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'P1', label: 'P1 · Hoy' },
  { key: 'P2', label: 'P2 · Semana' },
  { key: 'P3', label: 'P3 · Nutrición' },
  { key: 'descartado', label: 'Descartado' },
  { key: 'revisar', label: 'Para revisar' },
];

const GROUP_META: Record<RadarPriorityValue, { title: string; icon: RadarIcon; tone: RadarTone }> = {
  P1: { title: 'P1 · Trabajar hoy', icon: 'Flame', tone: 'rose' },
  P2: { title: 'P2 · Esta semana', icon: 'Clock', tone: 'amber' },
  P3: { title: 'P3 · Nutrición', icon: 'TrendingUp', tone: 'sky' },
  descartado: { title: 'Descartados', icon: 'Ban', tone: 'neutral' },
};

export function PrioridadesSection({ overview, editing }: { overview?: RadarOverview; editing: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const contacts = overview?.priorityContacts ?? [];

  const blocks = useMemo<RadarBlock[]>(() => {
    const filtered = filter === 'all'
      ? contacts
      : filter === 'revisar'
        ? contacts.filter((contact) => contact.needsReview)
        : contacts.filter((contact) => contact.priority === filter);

    const order: RadarPriorityValue[] = ['P1', 'P2', 'P3', 'descartado'];
    const result: RadarBlock[] = [];

    for (const priority of order) {
      const items = filtered.filter((contact) => contact.priority === priority);
      if (!items.length) continue;
      const meta = GROUP_META[priority];
      result.push({
        type: 'contacts',
        title: meta.title,
        subtitle: `${items.length} contacto${items.length === 1 ? '' : 's'}`,
        icon: meta.icon,
        tone: meta.tone,
        items: items.map(toContactItem),
      });
    }

    const sinPrioridad = filtered.filter((contact) => !contact.priority);
    if (sinPrioridad.length) {
      result.push({
        type: 'contacts',
        title: 'Sin prioridad asignada',
        subtitle: `${sinPrioridad.length} contacto${sinPrioridad.length === 1 ? '' : 's'}`,
        icon: 'CircleHelp',
        tone: 'slate',
        items: sinPrioridad.map(toContactItem),
      });
    }

    return result;
  }, [contacts, filter]);

  return (
    <SectionShell section="prioridades" editing={editing}>
      <section className="space-y-3">
        <BlockLabel>Filtrar</BlockLabel>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                filter === option.key
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'border-neutral-100 bg-white text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {contacts.length === 0 ? (
          <BlockEmpty text="Cuando Radar analice conversaciones, las prioridades aparecen acá." />
        ) : blocks.length === 0 ? (
          <BlockEmpty text="Nada con este filtro." />
        ) : (
          <RadarBlocks blocks={blocks} />
        )}
      </section>
    </SectionShell>
  );
}

function toContactItem(contact: PriorityContact) {
  const detail = [
    contact.intencion ? humanize(INTENCION_LABEL, contact.intencion) : null,
    contact.objecion ? humanize(OBJECION_LABEL, contact.objecion) : null,
    contact.recuperabilidad ? `Recuperabilidad ${humanize(RECUPERABILIDAD_LABEL, contact.recuperabilidad)}` : null,
    contact.confianza !== null ? `Confianza ${contact.confianza}/100` : null,
  ].filter(Boolean).join(' · ');

  return {
    contactId: contact.contactId,
    name: contact.contactName,
    remoteJid: contact.remoteJid,
    priority: contact.priority,
    score: contact.score,
    detail: detail || (contact.estrategia ?? undefined),
    badges: contact.needsReview ? [{ label: 'Revisar', tone: 'violet' as const }] : undefined,
  };
}
