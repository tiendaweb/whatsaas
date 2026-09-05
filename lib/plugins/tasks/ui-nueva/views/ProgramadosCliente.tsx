'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PROGRAMADOS_API, programadosFetcher } from '@/lib/plugins/scheduled-messages/ui/swr';
import { Clock, Pause, Play, Plus, Save, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { ES } from '../i18n/es';

/**
 * Mensajes programados del cliente, desde su ficha.
 *
 * Vivían sólo en el plugin de Programados, que lista los de todo el equipo: si
 * querías saber qué le va a salir a ESTE cliente había que salir de Tareas,
 * abrir el otro plugin y buscar su número a mano. Acá se ven, se editan, se
 * pausan y se crean nuevos ya apuntados a su teléfono.
 */

type Programado = {
  id: number;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  instanceId: number | null;
  instanceName: string | null;
  targetNumbers: string[];
  scheduleType: 'once' | 'daily' | 'weekly';
  scheduledAt: string | null;
  hour: number | null;
  minute: number | null;
  weekdays: number[];
  actionType: 'message' | 'automation';
  message: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastError: string | null;
};

/** El programado guarda teléfonos sueltos; la ficha tiene un JID. */
function soloDigitos(value: string) {
  return (value ?? '').replace(/\D/g, '');
}

function fecha(iso: string | null) {
  if (!iso) return '—';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value);
}

/** `datetime-local` quiere hora local sin zona; `toISOString` da UTC. */
function paraInput(iso: string | null) {
  if (!iso) return '';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function badge(status: Programado['status']) {
  const estilos: Record<Programado['status'], string> = {
    active: 'bg-emerald-500/15 text-emerald-600',
    paused: 'bg-amber-500/15 text-amber-600',
    completed: 'bg-slate-500/15 text-slate-500',
    failed: 'bg-rose-500/15 text-rose-500',
  };
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', estilos[status])}>
      {ES.programados.estado[status]}
    </span>
  );
}

type Borrador = { id: number | null; name: string; message: string; scheduledAt: string };

export function ProgramadosCliente(props: {
  /** Teléfono del contacto, en cualquier formato: se normaliza a dígitos. */
  telefono: string | null;
  nombreCliente: string;
}) {
  // Clave y fetcher compartidos con la app de Programados y con el Command
  // Center: SWR cachea por clave, y dos fetchers con formas distintas sobre esta
  // URL se pisan (el que pierde la carrera recibe la forma del otro).
  const { data, isLoading, mutate } = useSWR(PROGRAMADOS_API, programadosFetcher<Programado>, { revalidateOnFocus: false });

  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telefono = soloDigitos(props.telefono ?? '');

  const propios = useMemo(() => {
    if (!telefono) return [];
    return (data?.rows ?? []).filter((item) =>
      (item.targetNumbers ?? []).some((numero) => soloDigitos(numero) === telefono));
  }, [data, telefono]);

  const guardar = async () => {
    if (!borrador || !borrador.name.trim() || !borrador.message.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = {
        name: borrador.name.trim(),
        message: borrador.message.trim(),
        scheduledAt: borrador.scheduledAt ? new Date(borrador.scheduledAt).toISOString() : null,
        scheduleType: 'once' as const,
        actionType: 'message' as const,
        targetNumbers: [telefono],
      };
      const res = await fetch(
        borrador.id ? `/api/plugins/scheduled-messages/${borrador.id}` : '/api/plugins/scheduled-messages',
        {
          method: borrador.id ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(borrador.id ? cuerpo : { ...cuerpo, status: 'active' }),
        },
      );
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        throw new Error(typeof detalle?.error === 'string' ? detalle.error : ES.programados.errorGuardar);
      }
      setBorrador(null);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : ES.programados.errorGuardar);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (item: Programado, status: 'active' | 'paused') => {
    await fetch(`/api/plugins/scheduled-messages/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await mutate();
  };

  const eliminar = async (item: Programado) => {
    if (!window.confirm(ES.programados.confirmarBorrado(item.name))) return;
    await fetch(`/api/plugins/scheduled-messages/${item.id}`, { method: 'DELETE' });
    await mutate();
  };

  if (!telefono) {
    return <p className="text-sm text-[var(--t-muted)]">{ES.programados.sinTelefono}</p>;
  }

  return (
    <div className="space-y-3">
      {isLoading && <p className="text-sm text-[var(--t-muted)]">{ES.carga}</p>}
      {!isLoading && propios.length === 0 && !borrador && (
        <p className="text-sm text-[var(--t-muted)]">{ES.programados.vacio}</p>
      )}

      {propios.map((item) => (
        <div key={item.id} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold">{item.name}</span>
                {badge(item.status)}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--t-muted)]">
                <Clock className="h-3 w-3" />
                {item.status === 'completed'
                  ? ES.programados.enviado(fecha(item.lastRunAt))
                  : ES.programados.saleEl(fecha(item.nextRunAt))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {(item.status === 'active' || item.status === 'paused') && (
                <button
                  type="button"
                  onClick={() => void cambiarEstado(item, item.status === 'active' ? 'paused' : 'active')}
                  className="rounded-lg p-1.5 text-[var(--t-muted)] hover:text-[var(--t-text)]"
                  title={item.status === 'active' ? ES.programados.pausar : ES.programados.activar}
                >
                  {item.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setBorrador({
                  id: item.id,
                  name: item.name,
                  message: item.message ?? '',
                  scheduledAt: paraInput(item.scheduledAt ?? item.nextRunAt),
                })}
                className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--tareas-accent)]"
              >
                {ES.programados.editar}
              </button>
              <button
                type="button"
                onClick={() => void eliminar(item)}
                className="rounded-lg p-1.5 text-[var(--t-muted)] hover:text-rose-500"
                title={ES.programados.eliminar}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {item.message && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--t-text-secondary)]">{item.message}</p>
          )}
          {item.status === 'failed' && item.lastError && (
            <p className="mt-2 text-[11px] text-rose-500">{item.lastError}</p>
          )}
        </div>
      ))}

      {borrador ? (
        <div className="space-y-2 rounded-2xl border border-[var(--t-border)] p-4">
          <div className="flex items-center justify-between">
            <span className={C.rotulo}>{borrador.id ? ES.programados.editando : ES.programados.nuevo}</span>
            <button type="button" onClick={() => setBorrador(null)} className="text-[var(--t-muted)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            value={borrador.name}
            onChange={(event) => setBorrador({ ...borrador, name: event.target.value })}
            placeholder={ES.programados.nombrePlaceholder}
            className={C.control}
          />
          <textarea
            value={borrador.message}
            onChange={(event) => setBorrador({ ...borrador, message: event.target.value })}
            placeholder={ES.programados.mensajePlaceholder}
            rows={4}
            className={cn(C.control, 'resize-none')}
          />
          <label className="block space-y-1">
            <span className={C.rotulo}>{ES.programados.cuando}</span>
            <input
              type="datetime-local"
              value={borrador.scheduledAt}
              onChange={(event) => setBorrador({ ...borrador, scheduledAt: event.target.value })}
              className={C.control}
            />
          </label>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !borrador.name.trim() || !borrador.message.trim()}
            className="w-full rounded-2xl bg-[var(--tareas-accent)] py-3 text-sm font-bold text-white disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            <Save className="h-4 w-4" />
            {ES.programados.guardar}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBorrador({
            id: null,
            name: ES.programados.nombreSugerido(props.nombreCliente),
            message: '',
            scheduledAt: '',
          })}
          className="w-full rounded-2xl border-2 border-dashed border-[color-mix(in_srgb,var(--tareas-accent)_40%,transparent)] py-3 text-xs font-bold tracking-widest text-[var(--tareas-accent)] inline-flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {ES.programados.nuevo}
        </button>
      )}
    </div>
  );
}
