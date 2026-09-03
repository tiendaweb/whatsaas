'use client';

import { useState } from 'react';
import { Bot, CalendarPlus, CheckCircle2, ListChecks, Loader2, Save, Trash2, UserSquare2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EVENT_COLORS, EVENT_KINDS, KIND_META, PLANTILLAS, PROPOSITOS, PROPOSITO_META, RECURRENCES, RECURRENCE_LABELS, STATUS_META, esProposito, googleCalendarUrl, type EventoRow, type EventKind, type EventStatus, type Proposito, type Recurrence } from '../../shared/tipos';
import { C } from '../data/clases';
import { KIND_ICON, PROPOSITO_ICON } from '../data/iconos';
import { borrarEvento, crearEvento, editarEvento } from '../data/api';
import { deInput, paraInput } from '../data/fechas';

export type BorradorEvento = Partial<EventoRow> & { startsAt: string; endsAt: string };

/**
 * Crear o editar un evento.
 *
 * Mismo patrón que el modal de Tareas OS: el cuerpo scrollea y el pie con
 * Guardar y Eliminar queda fijo, a pantalla completa en el teléfono. Lo único
 * obligatorio es el título y el horario; todo lo demás se completa si hace
 * falta, para que anotar "llamar a Juan a las 3" cueste dos toques.
 */
export function ModalEvento({ borrador, onClose, onGuardado }: { borrador: BorradorEvento; onClose: () => void; onGuardado: () => void }) {
  const esNuevo = !borrador.id;
  const [title, setTitle] = useState(borrador.title ?? '');
  const [inicio, setInicio] = useState(paraInput(borrador.startsAt));
  const [fin, setFin] = useState(paraInput(borrador.endsAt));
  const [allDay, setAllDay] = useState(Boolean(borrador.allDay));
  const [kind, setKind] = useState<EventKind>((borrador.kind as EventKind) ?? 'meeting');
  const [status, setStatus] = useState<EventStatus>((borrador.status as EventStatus) ?? 'scheduled');
  const [notes, setNotes] = useState(borrador.notes ?? '');
  const [location, setLocation] = useState(borrador.location ?? '');
  const [color, setColor] = useState(borrador.color ?? EVENT_COLORS[0]);
  const [recurrence, setRecurrence] = useState<Recurrence>((borrador.recurrence as Recurrence) ?? 'none');
  const [recurrenceUntil, setRecurrenceUntil] = useState(borrador.recurrenceUntil ?? '');
  const [recordatorio, setRecordatorio] = useState<number | ''>(borrador.reminderMinutes?.[0] ?? 10);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [mas, setMas] = useState(Boolean(borrador.notes || borrador.location || borrador.recurrence !== 'none'));
  const [proposito, setProposito] = useState<Proposito | null>(esProposito(borrador.subtype) ? (borrador.subtype as Proposito) : null);
  /** Paso 1 sólo al crear: qué se va a agendar. Al editar se entra directo al detalle. */
  const [paso, setPaso] = useState<'tipo' | 'detalle'>(esNuevo ? 'tipo' : 'detalle');
  const [outcome, setOutcome] = useState(borrador.outcome ?? '');
  const [nextAction, setNextAction] = useState(borrador.nextAction ?? '');
  const [cerrando, setCerrando] = useState(false);
  const [creandoTarea, setCreandoTarea] = useState(false);
  const [pedido, setPedido] = useState('');
  const [encolando, setEncolando] = useState(false);

  /**
   * Deja un pedido en la cola del Command Center sobre este evento.
   *
   * Si el evento tiene contacto va atado a ese chat (y el conector puede leer
   * su expediente); si no, es un pedido del equipo. Sale aprobado porque lo
   * escribió una persona acá.
   */
  const encolarPedido = async () => {
    const texto = pedido.trim();
    if (texto.length < 5) {
      toast.error('Escribí qué tiene que hacer el conector.');
      return;
    }
    setEncolando(true);
    try {
      const cuando = new Date(borrador.startsAt).toLocaleString('es-AR');
      const contexto = [
        `Pedido sobre el evento «${title || borrador.title}» del ${cuando}${borrador.contactName ? ` con ${borrador.contactName}` : ''}.`,
        outcome.trim() ? `QUÉ SE ACORDÓ:\n${outcome.trim()}` : null,
        notes.trim() ? `NOTAS DE LA REUNIÓN:\n${notes.trim()}` : null,
        `INDICACIÓN:\n${texto}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      const res = await fetch('/api/plugins/sales-ops/prompts/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: contexto,
          title: `Agenda · ${(title || borrador.title || 'evento').slice(0, 80)}`,
          targetKind: borrador.chatId ? 'chat' : 'team',
          targetId: borrador.chatId ?? null,
          mode: 'queue',
        }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      setPedido('');
      toast.success('En la cola del Command Center. Lo toma el próximo conector.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEncolando(false);
    }
  };

  /** Una plantilla completa tipo, propósito, duración y título sugerido. */
  const aplicarPlantilla = (id: string) => {
    const p = PLANTILLAS.find((x) => x.id === id);
    if (!p) return;
    setKind(p.kind);
    setProposito(p.proposito);
    setColor(PROPOSITO_META[p.proposito].color);
    if (!title.trim()) setTitle(p.label);
    const desde = inicio ? new Date(inicio) : new Date();
    setFin(paraInput(new Date(desde.getTime() + p.minutos * 60000).toISOString()));
    setPaso('detalle');
  };

  const cerrarReunion = async (status: 'completed' | 'canceled') => {
    if (!borrador.id) return;
    setCerrando(true);
    try {
      const res = await fetch(`/api/plugins/calendar/agenda/${borrador.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cerrar', outcome, nextAction, notes, status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success(status === 'completed' ? 'Reunión cerrada.' : 'Reunión cancelada.');
      setStatus(status);
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar.');
    } finally {
      setCerrando(false);
    }
  };

  const mandarATareas = async () => {
    if (!borrador.id) return;
    if (!nextAction.trim()) {
      toast.error('Escribí primero la próxima acción.');
      return;
    }
    setCreandoTarea(true);
    try {
      const res = await fetch(`/api/plugins/calendar/agenda/${borrador.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tarea', title: nextAction.trim(), notes: outcome }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success('Tarea creada en Tareas OS.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la tarea.');
    } finally {
      setCreandoTarea(false);
    }
  };

  const guardar = async () => {
    if (!title.trim() || !inicio || !fin) {
      toast.error('Falta el título o el horario.');
      return;
    }
    if (new Date(fin) <= new Date(inicio)) {
      toast.error('Tiene que terminar después de empezar.');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        title: title.trim(),
        startsAt: deInput(inicio),
        endsAt: deInput(fin),
        allDay,
        kind,
        subtype: proposito,
        status,
        notes,
        location: location.trim() || null,
        color,
        recurrence,
        recurrenceUntil: recurrence === 'none' ? null : recurrenceUntil || null,
        reminderMinutes: recordatorio === '' ? [] : [Number(recordatorio)],
        contactId: borrador.contactId ?? null,
        customerId: borrador.customerId ?? null,
        relatedUserId: borrador.relatedUserId ?? null,
      };
      if (esNuevo) await crearEvento(datos);
      else await editarEvento(borrador.id!, datos);
      toast.success(esNuevo ? 'Evento agendado.' : 'Evento guardado.');
      onGuardado();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!borrador.id || !window.confirm(`¿Eliminar «${borrador.title ?? title}»? No se puede deshacer.`)) return;
    setBorrando(true);
    try {
      await borrarEvento(borrador.id);
      toast.success('Evento eliminado.');
      onGuardado();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBorrando(false);
    }
  };

  const rotulo = 'mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-[var(--c-muted)]';

  return (
    <div className={C.overlay} onClick={onClose} role="presentation">
      <div
        className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-[var(--c-surface)] shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] px-5 py-4">
          <span className="rounded-full bg-[color-mix(in_srgb,var(--cal-accent)_10%,transparent)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--cal-accent)]">
            {esNuevo ? 'Nuevo evento' : 'Editar evento'}
          </span>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[var(--c-muted)] hover:text-[var(--c-text)]">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {paso === 'tipo' ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
            <div>
              <p className={rotulo}>¿Qué vas a agendar?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLANTILLAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => aplicarPlantilla(p.id)}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface-2)] p-3 text-left hover:border-[var(--cal-accent)]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${PROPOSITO_META[p.proposito].color} 16%, transparent)`, color: PROPOSITO_META[p.proposito].color }} aria-hidden>
                      {(() => {
                        const Icon = KIND_ICON[p.kind];
                        return <Icon className="size-4" />;
                      })()}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[var(--c-text)]">{p.label}</span>
                      <span className="block text-[11px] text-[var(--c-text-secondary)]">
                        {KIND_META[p.kind].label} · {PROPOSITO_META[p.proposito].label} · {p.minutos} min
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setPaso('detalle')} className="text-xs font-semibold text-[var(--cal-accent)]">
              Empezar en blanco
            </button>
          </div>
        ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Reunión con…"
            className="w-full bg-transparent text-2xl font-black tracking-tight text-[var(--c-text)] outline-none placeholder:text-[var(--c-muted)]"
          />

          <div className="flex flex-wrap gap-1.5">
            {EVENT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(C.chip, kind === k ? C.chipActive : C.chipIdle)}
              >
                {(() => {
                  const Icon = KIND_ICON[k];
                  return <Icon className="size-3.5" aria-hidden />;
                })()}
                {KIND_META[k].label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PROPOSITOS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setProposito(proposito === p ? null : p);
                  if (proposito !== p) setColor(PROPOSITO_META[p].color);
                }}
                className={cn(C.chip, proposito === p ? C.chipActive : C.chipIdle)}
              >
                {(() => {
                  const Icon = PROPOSITO_ICON[p];
                  return <Icon className="size-3.5" aria-hidden />;
                })()}
                {PROPOSITO_META[p].label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={rotulo}>Empieza</span>
              <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className={C.control} />
            </label>
            <label className="block">
              <span className={rotulo}>Termina</span>
              <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={C.control} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--c-text-secondary)]">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              Todo el día
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--c-text-secondary)]">
              Avisar
              <select value={recordatorio} onChange={(e) => setRecordatorio(e.target.value === '' ? '' : Number(e.target.value))} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2 py-1 text-sm">
                <option value="">sin aviso</option>
                <option value={10}>10 min antes</option>
                <option value={30}>30 min antes</option>
                <option value={60}>1 h antes</option>
                <option value={1440}>1 día antes</option>
              </select>
            </label>
            <span className="flex items-center gap-1">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className={cn('size-5 rounded-full border-2', color === c ? 'border-[var(--c-text)]' : 'border-transparent')}
                  style={{ background: c }}
                />
              ))}
            </span>
          </div>

          {!mas ? (
            <button type="button" onClick={() => setMas(true)} className="text-xs font-semibold text-[var(--cal-accent)]">
              + Lugar, notas y repetición
            </button>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className={rotulo}>Lugar o link</span>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oficina, Google Meet…" className={C.control} />
              </label>
              <label className="block">
                <span className={rotulo}>Notas</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={cn(C.control, 'resize-y')} placeholder="Qué hay que preparar, con quién, qué se acordó…" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={rotulo}>Se repite</span>
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} className={C.control}>
                    {RECURRENCES.map((r) => (
                      <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                {recurrence !== 'none' && (
                  <label className="block">
                    <span className={rotulo}>Hasta</span>
                    <input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} className={C.control} />
                  </label>
                )}
              </div>
              {!esNuevo && (
                <label className="block">
                  <span className={rotulo}>Estado</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className={C.control}>
                    {(Object.keys(STATUS_META) as EventStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {(borrador.contactName || borrador.customerName) && (
            <p className="flex items-center gap-2 text-xs text-[var(--c-text-secondary)]">
              Con {borrador.contactName ?? borrador.customerName}
              {borrador.chatId && (
                <a href={`/plugins/sales-ops?chat=${borrador.chatId}&sec=chat`} className="inline-flex items-center gap-1 font-semibold text-[var(--cal-accent)]" title="Abrir la ficha en el Command Center">
                  <UserSquare2 className="size-3.5" aria-hidden />
                  Ver ficha
                </a>
              )}
            </p>
          )}

          {/* Notas de la reunión: se escriben mientras se habla. Lo que se
              acordó y qué sigue son campos aparte porque son lo que después se
              busca, y la próxima acción se manda a Tareas OS con un clic. */}
          {!esNuevo && (
            <div className="space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface-2)] p-3">
              <p className={rotulo}>Notas de la reunión</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Escribí mientras hablás: qué pidió, qué dudas tiene, qué se mostró…"
                className={cn(C.control, 'resize-y bg-[var(--c-surface)]')}
              />
              <label className="block">
                <span className={rotulo}>Qué se acordó</span>
                <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} placeholder="Resultado de la reunión" className={cn(C.control, 'resize-y bg-[var(--c-surface)]')} />
              </label>
              <label className="block">
                <span className={rotulo}>Próxima acción</span>
                <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Ej.: mandarle la propuesta el lunes" className={cn(C.control, 'bg-[var(--c-surface)]')} />
              </label>
              {/* Pedido para un conector: preparar la propuesta, resumir la
                  reunión, redactar el seguimiento. Va a la misma cola que el
                  resto del Command Center. */}
              <div className="space-y-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-2.5">
                <span className={rotulo}>
                  <Bot className="mr-1 inline size-3" aria-hidden />
                  Pedirle algo a un conector
                </span>
                <textarea
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                  rows={2}
                  placeholder="Ej.: armá la propuesta con lo que se habló y dejala lista para revisar."
                  className={cn(C.control, 'resize-y')}
                />
                <button
                  type="button"
                  onClick={() => void encolarPedido()}
                  disabled={encolando || pedido.trim().length < 5}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cal-accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {encolando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
                  Dejar en la cola
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void mandarATareas()} disabled={creandoTarea} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border-2)] px-3 py-2 text-xs font-bold text-[var(--c-text-secondary)] hover:text-[var(--c-text)] disabled:opacity-60">
                  {creandoTarea ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ListChecks className="size-3.5" aria-hidden />}
                  Mandar a Tareas OS
                </button>
                <button type="button" onClick={() => void cerrarReunion('completed')} disabled={cerrando} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border-2)] px-3 py-2 text-xs font-bold text-[var(--c-text-secondary)] hover:text-emerald-600 disabled:opacity-60">
                  {cerrando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                  Cerrar como hecha
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {paso === 'detalle' && (
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--c-border)] bg-[var(--c-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2">
            {!esNuevo && (
              <button type="button" onClick={() => void eliminar()} disabled={guardando || borrando} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--c-muted)] hover:bg-red-500/10 hover:text-red-600 disabled:opacity-60">
                {borrando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                Eliminar
              </button>
            )}
            {/* Google avisa aunque WhatsPro esté cerrado: es el respaldo del
                recordatorio, así que está siempre a mano (también al crear). */}
            {inicio && fin && (
              <a
                href={googleCalendarUrl({ title, startsAt: deInput(inicio), endsAt: deInput(fin), allDay, notes, location })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--c-muted)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text)]"
                title="Guardar este evento en Google Calendar"
              >
                <CalendarPlus className="size-4" aria-hidden />
                Google
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !title.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cal-accent)] px-6 py-3 font-bold text-white hover:bg-[var(--cal-accent-700)] disabled:opacity-60 sm:min-w-48"
            style={{ boxShadow: 'var(--c-shadow-accent)' }}
          >
            {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            {esNuevo ? 'Agendar' : 'Guardar'}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
