'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProductionOrder } from '@/lib/plugins/tasks/server/production-os';
import { HANDOFF_ITEMS, PAYMENT_STATES, PAYMENT_STATE_META, exigeHandoff, exigePago, type HandoffEstado } from '@/lib/plugins/tasks/shared/produccion';
import { CATALOGO_AAPP, REFERENCIA_ARS_POR_USD, WIP_MAXIMO, catalogoVigente, type NivelOportunidad } from '@/lib/plugins/tasks/shared/catalogo';

/**
 * Lo que el Protocolo Maestro pide de cada pedido y las dos pantallas de
 * producción muestran igual: ticket y pago, la ficha de handoff y el tiempo
 * trabajado. Vive en un archivo propio porque `ProduccionOS` importa a
 * `ProductionFocusView` y meterlo en cualquiera de los dos armaría un ciclo.
 *
 * Todo se guarda con el mismo `PATCH` del pedido; el tiempo a mano va a la
 * ruta de sesiones. Sin lógica de negocio acá: las reglas viven en
 * `shared/produccion.ts` y el servidor las repite.
 */

/** `Intl` con datos sucios tira `RangeError` y tumba la pantalla; acá nunca. */
export function formatoDinero(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null || !currency) return '—';
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(0)}`;
  }
}

const NIVEL_TONE: Record<NivelOportunidad | 'sin', string> = {
  alta: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  revisar: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  segundo_plano: 'border-destructive/30 bg-destructive/10 text-destructive',
  sin: 'border-border bg-muted text-muted-foreground',
};

/** El chip de US$/h con el color del Evaluador del catálogo. Sin horas, muestra «—» y explica por qué en el title. */
export function ChipUsdHora({ order, className }: { order: ProductionOrder; className?: string }) {
  const nivel = order.evaluacion.nivel ?? 'sin';
  return (
    <span
      data-testid={`produccion-usd-hora-${order.id}`}
      data-nivel={nivel}
      title={order.evaluacion.motivo}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums', NIVEL_TONE[nivel], className)}
    >
      {order.evaluacion.usdPorHora != null ? `US$ ${Math.round(order.evaluacion.usdPorHora)}/h` : 'US$ —/h'}
    </span>
  );
}

export function ChipHoras({ order, className }: { order: ProductionOrder; className?: string }) {
  return (
    <span data-testid={`produccion-horas-${order.id}`} data-horas={order.horas} title={`${order.sesiones} sesiones de trabajo${order.sesionAbierta ? ' · una abierta ahora' : ''}`} className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-bold tabular-nums text-[var(--t-text-secondary)]', className)}>
      <Clock3 className="size-3" aria-hidden /> {order.horas} h
    </span>
  );
}

/** `POST …/sessions`. Devuelve false si falló; el error ya se mostró. */
export async function postSesion(taskId: number, body: { action: 'open' | 'close' | 'manual'; kind?: 'foco' | 'descanso'; minutes?: number; note?: string }): Promise<boolean> {
  try {
    const response = await fetch(`/api/plugins/tasks/production/${taskId}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: body.action === 'close' });
    return response.ok;
  } catch {
    return false;
  }
}

const HANDOFF_ESTADOS: Array<{ value: HandoffEstado; label: string; tone: string }> = [
  { value: 'ok', label: 'Está', tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  { value: 'ia', label: 'Con IA', tone: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { value: 'falta', label: 'Falta', tone: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300' },
];

export function PedidoProtocolo({ order, busy, onPatch, onChanged, compact = false }: {
  order: ProductionOrder;
  busy: boolean;
  onPatch: (payload: Record<string, unknown>, success: string) => Promise<unknown> | void;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [ticket, setTicket] = useState(order.ticketAmount != null ? String(order.ticketAmount / 100) : '');
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(order.ticketCurrency === 'USD' ? 'USD' : 'ARS');
  const [minutos, setMinutos] = useState('');
  const [nota, setNota] = useState('');
  const [registrando, setRegistrando] = useState(false);
  useEffect(() => {
    setTicket(order.ticketAmount != null ? String(order.ticketAmount / 100) : '');
    setMoneda(order.ticketCurrency === 'USD' ? 'USD' : 'ARS');
  }, [order.id, order.ticketAmount, order.ticketCurrency]);

  const guardarTicket = () => {
    const unidades = Number(ticket.replace(',', '.'));
    if (!ticket.trim() || !Number.isFinite(unidades) || unidades < 0) return;
    void onPatch({ ticketAmount: Math.round(unidades * 100), ticketCurrency: moneda }, 'Ticket guardado.');
  };

  const registrarTiempo = async () => {
    const n = Number(minutos);
    if (!Number.isInteger(n) || n < 1 || n > 600) return;
    setRegistrando(true);
    const ok = await postSesion(order.id, { action: 'manual', minutes: n, note: nota.trim() || undefined });
    setRegistrando(false);
    if (ok) { setMinutos(''); setNota(''); onChanged(); }
  };

  const rondas = order.revisionRoundsIncluded != null ? `${order.revisionRoundsUsed} de ${order.revisionRoundsIncluded}` : `${order.revisionRoundsUsed} (sin límite cargado)`;
  const pagoRige = exigePago(order.workKind);
  const handoffRige = exigeHandoff(order.workKind);
  const control = 'h-9 w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-surface-2)] px-2.5 text-sm text-[var(--t-text)] outline-none focus:ring-2 focus:ring-primary/30';
  const rotulo = 'text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t-muted)]';

  return (
    <div className={cn('space-y-3', compact ? 'mt-4' : 'mt-5')} data-testid="produccion-protocolo" data-pedido={order.id}>
      {/* ── Ticket y pago ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4" data-testid="produccion-ticket">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black text-[var(--t-text)]"><Receipt className="size-4 text-primary" aria-hidden /> Ticket y pago</h3>
          <div className="flex items-center gap-2">
            <ChipHoras order={order} />
            <ChipUsdHora order={order} />
          </div>
        </div>
        <div className={cn('mt-3 grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4')}>
          <label className="space-y-1">
            <span className={rotulo}>Producto del catálogo</span>
            <select data-testid="produccion-campo-catalogo" value={order.catalogKey ?? ''} disabled={busy} onChange={(event) => void onPatch({ catalogKey: event.target.value || null }, 'Producto del catálogo guardado: ticket y rondas se completan solos si estaban vacíos.')} className={control}>
              <option value="">Sin producto del catálogo</option>
              {CATALOGO_AAPP.filter((item) => item.workKind).map((item) => <option key={item.key} value={item.key}>{item.nombre} · US$ {item.precioUsd}{item.desincentivado ? ' · no prioritario' : ''}</option>)}
            </select>
          </label>
          <div className="space-y-1">
            <span className={rotulo}>Ticket (en {moneda === 'ARS' ? 'pesos' : 'dólares'})</span>
            <div className="flex gap-1.5">
              <input data-testid="produccion-campo-ticket" inputMode="decimal" value={ticket} onChange={(event) => setTicket(event.target.value)} onBlur={guardarTicket} onKeyDown={(event) => { if (event.key === 'Enter') guardarTicket(); }} placeholder="0" className={cn(control, 'min-w-0 flex-1 tabular-nums')} />
              <select data-testid="produccion-campo-moneda" value={moneda} onChange={(event) => setMoneda(event.target.value as 'ARS' | 'USD')} className={cn(control, 'w-20')}><option value="ARS">ARS</option><option value="USD">USD</option></select>
            </div>
            <p className="text-[11px] text-[var(--t-muted)]">{order.ticketUsd != null ? `≈ US$ ${order.ticketUsd.toFixed(0)} · ref. ARS ${REFERENCIA_ARS_POR_USD}` : 'Sin ticket no hay US$/h.'}</p>
          </div>
          <label className="space-y-1">
            <span className={rotulo}>Pago {pagoRige && <span className="text-amber-600">· habilita la cola</span>}</span>
            <select data-testid="produccion-campo-pago" value={order.paymentState ?? ''} disabled={busy} onChange={(event) => void onPatch({ paymentState: event.target.value || null }, 'Estado del pago guardado.')} className={control}>
              <option value="">Sin registrar</option>
              {PAYMENT_STATES.map((value) => <option key={value} value={value}>{PAYMENT_STATE_META[value].label}</option>)}
            </select>
          </label>
          <div className="space-y-1">
            <span className={rotulo}>Rondas de revisión</span>
            <div className={cn(control, 'flex items-center justify-between')} data-testid="produccion-rondas" data-usadas={order.revisionRoundsUsed}>
              <span className="tabular-nums font-bold">{rondas}</span>
              {order.fueraDeAlcance && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-destructive"><AlertTriangle className="size-3" aria-hidden /> Extra = presupuesto</span>}
            </div>
          </div>
        </div>
        {order.fueraDeAlcance && <p className="mt-2 text-xs font-semibold text-destructive" data-testid="produccion-aviso-fuera-de-alcance">Superó las rondas incluidas. Lo que cambia lo que compró se cotiza: ventas presupuesta antes de que producción lo haga.</p>}
        {!catalogoVigente() && <p className="mt-2 text-[11px] text-[var(--t-muted)]">El catálogo venció el 04/10/2026: los precios siguen siendo la referencia, pero hay que revisarlos.</p>}
        {order.estimatedMinutes != null && order.horas > order.estimatedMinutes / 60 && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Lleva {order.horas} h contra {(order.estimatedMinutes / 60).toFixed(1)} h estimadas.</p>}
      </section>

      {/* ── Handoff ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4" data-testid="produccion-handoff" data-completo={order.handoffCompleto}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-[var(--t-text)]">Handoff {handoffRige && <span className="text-[10px] font-black uppercase tracking-wide text-amber-600">· sin esto no arranca</span>}</h3>
          <span className={cn('text-xs font-bold tabular-nums', order.handoffCompleto ? 'text-emerald-600' : 'text-[var(--t-muted)]')}>{HANDOFF_ITEMS.length - order.handoffFaltantes.length} de {HANDOFF_ITEMS.length}</span>
        </div>
        <div className={cn('mt-3 grid gap-1.5', compact ? '' : 'sm:grid-cols-2')}>
          {HANDOFF_ITEMS.map((item) => {
            const estado = order.handoff[item.id];
            return (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--t-hover)]" title={item.ayuda}>
                <span className={cn('min-w-0 truncate text-sm', estado === 'ok' || estado === 'ia' ? 'text-[var(--t-text)]' : 'font-semibold text-[var(--t-text)]')}>{item.label}</span>
                <div className="flex shrink-0 gap-1">
                  {HANDOFF_ESTADOS.map((opcion) => (
                    <button
                      key={opcion.value}
                      type="button"
                      data-testid={`produccion-handoff-${item.id}-${opcion.value}`}
                      aria-pressed={estado === opcion.value}
                      disabled={busy}
                      onClick={() => void onPatch({ handoff: { [item.id]: opcion.value } }, `${item.label}: ${opcion.label.toLocaleLowerCase('es')}.`)}
                      className={cn('rounded-full border px-2 py-0.5 text-[10px] font-black', estado === opcion.value ? opcion.tone : 'border-transparent text-[var(--t-muted)] hover:border-[var(--t-border)]')}
                    >
                      {opcion.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Tiempo ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4" data-testid="produccion-tiempo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-[var(--t-text)]">Tiempo trabajado</h3>
          <p className="text-xs text-[var(--t-muted)]"><span className="font-black tabular-nums text-[var(--t-text)]">{order.horas} h</span> en {order.sesiones} {order.sesiones === 1 ? 'sesión' : 'sesiones'}{order.sesionAbierta ? ' · una abierta ahora' : ''}{order.estimatedMinutes != null ? ` · estimado ${(order.estimatedMinutes / 60).toFixed(1)} h` : ''}</p>
        </div>
        <p className="mt-1 text-[11px] text-[var(--t-muted)]">Los bloques del reloj se registran solos mientras este pedido está abierto en el Focus. Lo que se hizo sin reloj se anota acá.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input data-testid="produccion-campo-minutos" inputMode="numeric" value={minutos} onChange={(event) => setMinutos(event.target.value.replace(/\D/g, ''))} placeholder="Minutos" className={cn(control, 'w-24 tabular-nums')} />
          <input data-testid="produccion-campo-nota-tiempo" value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Qué se hizo (opcional)" maxLength={200} className={cn(control, 'min-w-40 flex-1')} />
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" data-testid="produccion-accion-registrar-tiempo" disabled={registrando || !minutos} onClick={() => void registrarTiempo()}>
            {registrando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />} Registrar tiempo
          </Button>
        </div>
      </section>
    </div>
  );
}

/** Texto del KPI de WIP: «2 / 3», y en rojo cuando el cuarto trabajo ya entró. */
export function wipTexto(wip: number, maximo: number = WIP_MAXIMO) {
  return { texto: `${wip} / ${maximo}`, excedido: wip > maximo };
}
