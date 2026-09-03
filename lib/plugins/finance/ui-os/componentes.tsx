'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { F, TONOS, type Tono } from './estilo';
import { fmtMoney, fmtMonth } from './format';

export function Metrica({ icon: Icon, tono, rotulo, children, pie }: { icon: LucideIcon; tono: Tono; rotulo: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <div className={`${F.card} flex flex-col gap-3 p-4`}>
      <div className="flex items-center gap-3">
        <span className={`${F.iconoCaja} ${TONOS[tono]}`}>
          <Icon className="size-5" />
        </span>
        <span className={F.rotulo}>{rotulo}</span>
      </div>
      <div className="space-y-1">{children}</div>
      {pie ? <div className="text-[11px] font-bold text-muted-foreground">{pie}</div> : null}
    </div>
  );
}

/** Un renglón grande por moneda: la regla es no mezclar monedas jamás. */
export function DineroPorMoneda({ map, signo }: { map: Record<string, number> | undefined | null; signo?: boolean }) {
  const entries = Object.entries(map ?? {}).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className={F.numero}>—</p>;
  return (
    <div className="space-y-1">
      {entries.map(([cur, cents]) => (
        <p key={cur} className={`${F.numero} ${signo && cents < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
          {signo && cents > 0 ? '+' : ''}
          {fmtMoney(cents, cur)}
        </p>
      ))}
    </div>
  );
}

const ESTADOS: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  overdue: { label: 'Vencido', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground' },
  active: { label: 'Activa', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  expired: { label: 'Vencida', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
  confirmed: { label: 'Confirmada', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
  SUCCESS: { label: 'Acreditado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  PENDING: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
};

export function EstadoBadge({ estado, overdue }: { estado: string; overdue?: boolean }) {
  const key = overdue && estado === 'pending' ? 'overdue' : estado;
  const def = ESTADOS[key] ?? { label: estado, cls: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex rounded-xl px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${def.cls}`}>{def.label}</span>;
}

export function EstadoVacio({ children }: { children: ReactNode }) {
  return <div className={`${F.card} p-8 text-center text-sm font-bold text-muted-foreground`}>{children}</div>;
}

export function Paginador({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(Math.ceil(total / perPage), 1);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2 text-xs font-bold text-muted-foreground">
      <span>
        {total} resultados · página {page} de {pages}
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={`${F.btn} ${F.btnSuave} disabled:opacity-40`}>
          Anterior
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={`${F.btn} ${F.btnSuave} disabled:opacity-40`}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

/**
 * Barras mensuales ingresos vs egresos para UNA moneda. SVG a mano: sin
 * dependencias nuevas y el gráfico entiende centavos.
 */
export function BarrasMensuales({ serie, currency }: { serie: Array<{ month: string; income: Record<string, number>; expense: Record<string, number> }>; currency: string }) {
  const datos = serie.map((p) => ({ month: p.month, income: p.income[currency] ?? 0, expense: p.expense[currency] ?? 0 }));
  const max = Math.max(...datos.map((d) => Math.max(d.income, d.expense)), 1);
  const alto = 120;
  return (
    <div>
      <div className="flex h-[140px] items-end gap-2">
        {datos.map((d) => (
          <div key={d.month} className="group flex flex-1 flex-col items-center gap-1" title={`${fmtMonth(d.month)}: +${fmtMoney(d.income, currency)} / -${fmtMoney(d.expense, currency)}`}>
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: alto }}>
              <div className="w-2/5 rounded-t-md bg-emerald-500/80 transition-all group-hover:bg-emerald-500" style={{ height: Math.max((d.income / max) * alto, d.income > 0 ? 3 : 0) }} />
              <div className="w-2/5 rounded-t-md bg-rose-400/70 transition-all group-hover:bg-rose-400" style={{ height: Math.max((d.expense / max) * alto, d.expense > 0 ? 3 : 0) }} />
            </div>
            <span className="text-[9px] font-black uppercase text-muted-foreground">{fmtMonth(d.month)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Ingresos</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rose-400" /> Egresos</span>
      </div>
    </div>
  );
}
