'use client';

import { useMemo } from 'react';
import type { RadarBlock, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { humanize, OBJECION_LABEL, RECUPERABILIDAD_LABEL } from '../labels';
import { RadarBlocks } from '../blocks/RadarBlockView';
import { BlockEmpty, BlockLabel } from '../blocks/primitives';
import { SectionShell } from './SectionShell';
import type { RadarOverview } from './types';

/**
 * El resumen se arma con los MISMOS bloques que puede usar una IA. No hay una
 * vista "privilegiada" hecha a mano: si un bloque se ve bien acá, se ve igual
 * dentro de un widget generado por el conector.
 */
export function ResumenSection({ overview, editing }: { overview?: RadarOverview; editing: boolean }) {
  const blocks = useMemo<RadarBlock[]>(() => {
    if (!overview) return [];
    const { counts, priorityContacts, lastAnalysisAt } = overview;

    const objecciones = tally(priorityContacts.map((contact) => contact.objecion), OBJECION_LABEL);
    const recuperabilidad = tally(priorityContacts.map((contact) => contact.recuperabilidad), RECUPERABILIDAD_LABEL);
    const scores = priorityContacts.map((contact) => contact.score).filter((value): value is number => typeof value === 'number');
    const scorePromedio = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;

    const result: RadarBlock[] = [
      {
        type: 'kpi',
        columns: 4,
        items: [
          { label: 'Analizados', value: counts.analyzed, icon: 'Users', tone: 'indigo' },
          { label: 'P1 · Hoy', value: counts.p1, icon: 'AlertTriangle', tone: 'rose' },
          { label: 'P2 · Semana', value: counts.p2, icon: 'Clock', tone: 'amber' },
          { label: 'P3 · Nutrición', value: counts.p3, icon: 'TrendingUp', tone: 'neutral' },
          { label: 'Para revisar', value: counts.needsReview, icon: 'Gauge', tone: 'violet', hint: 'Confianza del análisis por debajo de 70' },
          { label: 'Descartados', value: counts.descartado, icon: 'Ban', tone: 'slate' },
          { label: 'Score promedio', value: scorePromedio, unit: '/100', icon: 'Target', tone: 'emerald' },
          {
            label: 'Último análisis',
            value: lastAnalysisAt ? new Date(lastAnalysisAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—',
            icon: 'History',
            tone: 'sky',
          },
        ],
      },
      {
        type: 'meter',
        title: 'Cómo está repartido el embudo',
        icon: 'Layers',
        tone: 'indigo',
        showValues: true,
        segments: ([
          { label: 'P1', value: counts.p1, tone: 'rose' },
          { label: 'P2', value: counts.p2, tone: 'amber' },
          { label: 'P3', value: counts.p3, tone: 'sky' },
          { label: 'Descartado', value: counts.descartado, tone: 'neutral' },
        ] satisfies Array<{ label: string; value: number; tone: RadarTone }>).filter((segment) => segment.value > 0),
      },
    ];

    if (objecciones.length) {
      result.push({
        type: 'barChart',
        title: 'Objeciones más frecuentes',
        subtitle: 'Qué frena a los leads, según los análisis de Radar',
        icon: 'ShieldAlert',
        tone: 'amber',
        orientation: 'horizontal',
        points: objecciones,
      });
    }

    if (recuperabilidad.length) {
      result.push({
        type: 'pieChart',
        variant: 'donut',
        title: 'Recuperabilidad',
        icon: 'Repeat',
        tone: 'teal',
        centerLabel: 'Leads',
        centerValue: counts.analyzed,
        points: recuperabilidad,
      });
    }

    const p1 = priorityContacts
      .filter((contact) => contact.priority === 'P1')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 8);

    if (p1.length) {
      result.push({
        type: 'contacts',
        title: 'Trabajar hoy',
        subtitle: `${p1.length} contacto${p1.length === 1 ? '' : 's'} en prioridad P1`,
        icon: 'Flame',
        tone: 'rose',
        items: p1.map((contact) => ({
          contactId: contact.contactId,
          name: contact.contactName,
          remoteJid: contact.remoteJid,
          priority: contact.priority,
          score: contact.score,
          detail: contact.estrategia ?? undefined,
        })),
      });
    }

    return result;
  }, [overview]);

  return (
    <SectionShell section="resumen" editing={editing}>
      <section className="space-y-3">
        <BlockLabel>Panorama</BlockLabel>
        {blocks.length ? <RadarBlocks blocks={blocks} /> : <BlockEmpty text="Radar todavía no analizó ningún contacto." />}
      </section>
    </SectionShell>
  );
}

/** Cuenta ocurrencias de un valor cerrado y las devuelve como puntos de gráfico. */
function tally(values: Array<string | null>, labels: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ label: humanize(labels, key) ?? key, value }));
}
