'use client';

import { forwardRef, useMemo } from 'react';
import { AlertTriangle, Banknote, ChevronRight, Flame, Radar, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DetailPayload } from '../../shared/api-types';
import { GateBadge } from '../components/GateBadge';
import { humanize } from '../components/format';
import { AccionesTarjeta, type AccionesTarjetaHandle } from './AccionesTarjeta';
import { customString, dineroEnJuego, nosotrosLoFrenamos, razonesHumanas, traducirBloqueoDominante, traducirIntencion } from './traducciones';

type Detalle = DetailPayload & { header: { name: string; customData: Record<string, unknown> } };

export const TarjetaNoelia = forwardRef<AccionesTarjetaHandle, {
  chatId: number;
  detalle: Detalle;
  onContexto: () => void;
  onResuelto: (tipo: 'aprobado' | 'pospuesto') => void;
  onSaltar: () => void;
  onDetalleCambio: () => void;
}>(function TarjetaNoelia({ chatId, detalle, onContexto, onResuelto, onSaltar, onDetalleCambio }, ref) {
  const a = detalle.analysis;
  const custom = detalle.header.customData ?? {};
  const razones = useMemo(() => razonesHumanas(detalle, custom), [detalle, custom]);
  const critico = nosotrosLoFrenamos(detalle);
  const intencion = customString(custom, 'radar_intencion') || a?.intent;
  const bloqueo = customString(custom, 'radar_bloqueo_dominante') || a?.objectionType;
  const prioridadAlta = Boolean(critico || a?.paymentPending || (a?.priorityScore ?? 0) >= 70);

  return (
    <article className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {critico && (
        <div className="flex items-center gap-2 bg-amber-400 px-4 py-3 text-sm font-black text-amber-950" role="alert">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          Nosotros lo frenamos: hay algo que el equipo debe resolver.
        </div>
      )}

      <div className="space-y-5 p-4 sm:p-6">
        <header className="flex items-start gap-3">
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', prioridadAlta ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300' : 'bg-primary/10 text-primary')}>
            <Flame className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{prioridadAlta ? 'Oportunidad alta' : 'Decisión pendiente'}</span>
              <GateBadge gate={a?.currentGate} />
            </div>
            <h2 className="mt-1 truncate text-2xl font-black tracking-tight">{detalle.header.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-bold text-foreground">Quiere:</span> {a?.needDetail || humanize(a?.need)}</p>
            <p className="text-sm text-muted-foreground"><span className="font-bold text-foreground">Estado:</span> {a?.statusReason || humanize(a?.status)}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Dinero en juego</span>
            <strong className="mt-1 block text-sm text-foreground">{dineroEnJuego(a)}</strong>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Lectura icon={Radar} label="Radar dice" value={`${traducirIntencion(intencion)} · ${traducirBloqueoDominante(bloqueo)}`} tone="violet" />
          <Lectura icon={Target} label="Focus recomienda" value={a?.recommendedAction || 'Revisar el contexto antes de decidir.'} tone="emerald" />
        </div>

        <section className="rounded-2xl border border-border bg-muted/25 p-3.5" aria-label="Por qué">
          <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">¿Por qué?</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">{razones.map((razon) => <li key={razon} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /><span>{razon}</span></li>)}</ul>
        </section>

        <section aria-label="Mensaje listo">
          <div className="mb-2 flex items-center gap-2">
            <Banknote className="size-4 text-primary" aria-hidden />
            <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Mensaje listo</h3>
          </div>
          <AccionesTarjeta ref={ref} chatId={chatId} detalle={detalle} onResuelto={onResuelto} onSaltar={onSaltar} onDetalleCambio={onDetalleCambio} />
        </section>

        <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground" onClick={onContexto}>
          Más contexto
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </article>
  );
});

function Lectura({ icon: Icon, label, value, tone }: { icon: typeof Radar; label: string; value: string; tone: 'violet' | 'emerald' }) {
  return (
    <section className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center gap-2">
        <span className={cn('flex size-8 items-center justify-center rounded-xl', tone === 'violet' ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300')}><Icon className="size-4" aria-hidden /></span>
        <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</h3>
      </div>
      <p className="mt-2 text-sm font-semibold leading-relaxed">{value}</p>
    </section>
  );
}
