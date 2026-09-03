'use client';

import { ArrowRight, Banknote, Flame, Inbox, MessageCircle, Trash2, UserCheck, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { OverviewPayload } from '../../shared/api-types';
import { GATES } from '../../shared/taxonomy';
import { CashGoalBar } from '../components/CashGoalBar';
import { GATE_BAR_TONES } from '../components/GateBadge';
import type { Vista } from '../components/vistas';
import { fmtInt } from '../components/format';
import { Anillo } from './Anillo';
import { CH, TONOS, type Tono } from './estilo';

type Props = { data: OverviewPayload; onChangeVista: (vista: Vista) => void };

const KPIS: Array<{ label: string; hint: string; icon: LucideIcon; tono: Tono; vista: Vista; valor: (c: OverviewPayload['counters']) => number }> = [
  { label: 'Dinero ahora', hint: 'G8–G10', icon: Banknote, tono: 'emerald', vista: 'dinero', valor: (c) => c.moneyNow },
  { label: 'Respondieron hoy', hint: 'señales del radar', icon: MessageCircle, tono: 'violet', vista: 'respuestas', valor: (c) => c.respondedToday },
  { label: 'Oportunidades', hint: 'G4–G7', icon: Flame, tono: 'amber', vista: 'oportunidades', valor: (c) => c.opportunities },
  { label: 'Barrido', hint: 'G0–G3', icon: Waves, tono: 'sky', vista: 'barrido', valor: (c) => c.sweep },
  { label: 'Pre-descarte', hint: 'para limpiar', icon: Trash2, tono: 'rose', vista: 'limpieza', valor: (c) => c.preDiscard },
  { label: 'Clientes', hint: 'G11', icon: UserCheck, tono: 'indigo', vista: 'clientes', valor: (c) => c.customers },
];

/**
 * El tablero de Hoy: plata, auditoría y volumen por etapa.
 *
 * Antes eran seis cajitas iguales de 12 px donde el número más importante del
 * día (cuánto se cobró) pesaba lo mismo que "pre-descarte". Acá cada dato tiene
 * el tamaño de su importancia y cada bloque su color, que es lo que hace que
 * Tareas OS se lea de una pasada.
 */
export function PanelHoy({ data, onChangeVista }: Props) {
  const { audit } = data;
  const cobertura = audit.total > 0 ? audit.analyzed / audit.total : 0;
  const sinProcesar = Math.max(0, audit.total - audit.analyzed);
  const maxGate = Math.max(1, ...GATES.map((g) => data.distribution[g] ?? 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <CashGoalBar cash={data.cash} />

        <section className={cn('flex items-center gap-4 p-5', CH.card)} aria-label="Auditoría">
          <Anillo valor={cobertura} className="text-primary">
            <span className="text-xl font-black tabular-nums leading-none">{Math.round(cobertura * 100)}%</span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">auditado</span>
          </Anillo>
          <div className="min-w-0 flex-1">
            <h2 className={CH.rotulo}>Auditoría</h2>
            <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
              {fmtInt(audit.analyzed)} <span className="font-medium text-muted-foreground">de {fmtInt(audit.total)} chats</span>
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <Dato n={sinProcesar} texto="sin procesar" />
              <Dato n={audit.stale} texto="desactualizados" />
              <Dato n={audit.toReview} texto="para revisar" />
              <Dato n={audit.audiosQueued} texto="audios en cola" />
              <Dato n={audit.connectorPending} texto="esperan conector" />
            </ul>
            {sinProcesar > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1.5 h-7 gap-1 px-2 text-[11px] font-bold"
                onClick={() => onChangeVista('clientes')}
              >
                <Inbox className="size-3.5" aria-hidden />
                Dejar en cola los sin procesar
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {KPIS.map(({ label, hint, icon: Icon, tono, vista, valor }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChangeVista(vista)}
            className={cn(
              'flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              CH.card,
            )}
          >
            <span className={cn(CH.iconoCaja, TONOS[tono])}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate', CH.rotulo)}>{label}</span>
              <span className="mt-1 block text-2xl font-black tabular-nums leading-none tracking-tight text-foreground">
                {fmtInt(valor(data.counters))}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <section className={cn('p-5', CH.card)} aria-label="Distribución por gate">
        <h2 className={CH.rotulo}>Distribución por etapa</h2>
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {GATES.map((g) => {
            const n = data.distribution[g] ?? 0;
            const w = Math.max(n > 0 ? 2 : 0, Math.round((n / maxGate) * 100));
            return (
              <li key={g} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">{g}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn('block h-full rounded-full', GATE_BAR_TONES[g])} style={{ width: `${w}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground">{fmtInt(n)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Dato({ n, texto }: { n: number; texto: string }) {
  return (
    <li className={cn(n === 0 && 'opacity-50')}>
      <span className="font-bold tabular-nums text-foreground">{fmtInt(n)}</span> {texto}
    </li>
  );
}
