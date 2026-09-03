'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, FolderOpen, GripVertical, Loader2, Plus, Save, Sparkles, Trash2, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRadarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { C } from '../data/clases';
import { claveDia } from '../data/fechas';
import { prioridadPorNombre, proyectoTienePrio } from '../data/etiquetas';
import type { EscrituraEtiquetas, GrupoProyecto, Prioridad, Recurrencia, Tarea } from '../data/tipos';
import { ES } from '../i18n/es';
import { BitacoraTarea } from './BitacoraTarea';
import { DescripcionMarkdown } from './DescripcionMarkdown';
import { PanelRelaciones } from './PanelRelaciones';
import type { TaskDetails } from '@/lib/plugins/tasks/client/types';
import type { Universo } from '../data/tipos';

function nuevaSubtarea() {
  return { id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: '', completed: false };
}

export function ModalTarea(props: {
  tarea: Tarea;
  grupos: GrupoProyecto[];
  escritura: EscrituraEtiquetas;
  clientes: { id: number; name: string }[];
  vinculados: { id: number; name: string; relationId: number; tipo: 'cliente' | 'lead' }[];
  leads: { id: number; name: string }[];
  onVincularParte: (parte: { tipo: 'cliente' | 'lead'; id: number }) => void;
  onDesvincularCliente: (relationId: number) => void;
  detalles: TaskDetails | null;
  universo: Universo;
  contactos: { id: number; name: string }[];
  onVincularRelacion: (rel: { sourceType: string; sourceId: number; targetType: string; targetId: number; relationType?: string }) => Promise<unknown>;
  onAbrirTarea: (id: number) => void;
  onAbrirCliente: (id: number) => void;
  onAbrirLead?: (contactId: number) => void;
  onFiltrarProyecto: (projectId: number) => void;
  onActualizarRelaciones: () => void;
  onClose: () => void;
  onSave: (cambios: Partial<Tarea> & { moveToProjectId?: number }) => Promise<boolean>;
  /** Eliminar la tarea. Sin esto el botón no se dibuja. */
  onEliminar?: () => Promise<boolean>;
}) {
  // El input trabaja con el título COMPLETO (prefijo `RADAR ·` incluido) a
  // propósito: si acá se mostrara el título limpio, al guardar se perdería el
  // prefijo y Radar dejaría de encontrar y agrupar sus propias tareas.
  const [title, setTitle] = useState(props.tarea.title);
  const [notes, setNotes] = useState(props.tarea.notes);
  const [dueDate, setDueDate] = useState(claveDia(props.tarea.dueDate) ?? '');
  const [prioridad, setPrioridad] = useState<Prioridad>(props.tarea.prioridad);
  const [recurrencia, setRecurrencia] = useState<Recurrencia>(props.tarea.recurrencia);
  const [subtareas, setSubtareas] = useState(props.tarea.subtareas);
  const [projectId, setProjectId] = useState(props.tarea.projectId);
  const [aiPrompt, setAiPrompt] = useState(props.tarea.aiPrompt ?? '');
  const [aiNextStep, setAiNextStep] = useState(props.tarea.aiNextStep ?? '');
  const [aiContextQuestion, setAiContextQuestion] = useState(props.tarea.aiContextQuestion ?? '');
  const [aiContextAnswer, setAiContextAnswer] = useState(props.tarea.aiContextAnswer ?? '');
  const [saving, setSaving] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  /**
   * Campos opcionales sin valor. Fecha, recurrencia y prioridad se mostraban
   * siempre, aunque la tarea no tuviera ninguno: tres controles vacíos
   * ("dd/mm/aaaa", "Única", prioridad por defecto) que ocupaban la mitad del
   * modal y no decían nada. Ahora sólo salen los que tienen valor, y este
   * interruptor los muestra todos cuando efectivamente se los quiere cargar.
   * El mismo interruptor gobierna el formulario de relaciones.
   */
  const [mostrarVacios, setMostrarVacios] = useState(false);
  /** Índice del paso que se está arrastrando. En un ref y no en estado:
   * cambia en cada dragover y no debe re-renderizar la lista. */
  const arrastrando = useRef<number | null>(null);

  // "Media" es también el valor por defecto cuando la tarea no tiene ninguna
  // etiqueta de prioridad, así que el valor solo no alcanza: hay que mirar si
  // la etiqueta existe de verdad.
  const prioridadDefinida = props.tarea.labelIds.some((id) => id === 'prio-high' || id === 'prio-low' || id === 'prio-medium')
    || prioridadPorNombre(props.tarea.projectLabels, props.tarea.labelIds) !== null;
  const verFecha = mostrarVacios || Boolean(dueDate);
  const verRecurrencia = mostrarVacios || recurrencia !== 'unica';
  const verPrioridad = mostrarVacios || prioridadDefinida;
  const hayCampos = verFecha || verRecurrencia || verPrioridad;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const prioBloqueada = props.escritura === 'conservadora' && !proyectoTienePrio(props.tarea.projectLabels);

  const save = async () => {
    setSaving(true);
    await props.onSave({
      title,
      notes,
      aiPrompt,
      aiNextStep,
      aiContextQuestion,
      aiContextAnswer,
      dueDate: dueDate ? `${dueDate}T12:00:00.000Z` : null,
      prioridad,
      recurrencia,
      subtareas: subtareas.filter((step) => step.text.trim()),
      moveToProjectId: projectId !== props.tarea.projectId ? projectId : undefined,
    });
    setSaving(false);
  };

  return (
    <div className={cn(C.overlay, 'p-0 sm:p-4')} onClick={props.onClose} role="presentation">
      {/* Columna: el cuerpo scrollea y el pie con Guardar / Eliminar queda fijo,
          a la vista en el celular (donde antes había que llegar al final de
          un modal largo) y en escritorio. */}
      <div
        className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-[var(--t-surface)] shadow-2xl sm:max-h-[90vh] sm:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)] text-xs font-bold tracking-[0.2em] uppercase px-4 py-1.5 rounded-full">
              {ES.rotulos.editarTarea}
            </span>
            {isRadarTaskTitle(props.tarea.title) && (
              <RadarTag label="Radar" title="Tarea generada por Radar: el prefijo del título es lo que usa el sistema para agruparla" />
            )}
          </div>
          <button type="button" onClick={props.onClose} className="text-[var(--t-muted)] hover:text-[var(--t-text)]" aria-label={ES.modal.cerrar}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="text-3xl font-black tracking-tight w-full outline-none bg-transparent text-[var(--t-text)]"
          placeholder={ES.modal.titulo}
        />

        <DescripcionMarkdown key={props.tarea.id} value={notes} onChange={setNotes} />

        {/* Instrucciones para la IA. Es contenido, no configuración: nada se
            ejecuta solo — lo lee el conector cuando se le pide trabajar sobre
            esta tarea. Va debajo de la descripción porque se escribe como
            continuación de ella ("qué es esto" → "qué quiero que haga la IA"). */}
        <div className="mt-6">
          <label className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--tareas-accent)]" />
            <span className={C.rotulo}>{ES.modal.promptIa}</span>
          </label>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            rows={3}
            placeholder={ES.modal.promptIaPlaceholder}
            className="w-full resize-y rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)] px-4 py-3 text-sm text-[var(--t-text)] outline-none transition-colors focus:border-[var(--tareas-accent)]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--t-text-secondary)]">{ES.modal.promptIaAyuda}</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block space-y-2 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4">
            <span className={C.rotulo}>{ES.ia.siguientePaso}</span>
            <textarea
              value={aiNextStep}
              onChange={(event) => setAiNextStep(event.target.value)}
              rows={3}
              maxLength={20000}
              placeholder={ES.ia.siguientePasoPlaceholder}
              className="w-full resize-y bg-transparent text-sm leading-5 text-[var(--t-text)] outline-none placeholder:text-[var(--t-muted)]"
            />
          </label>
          <label className="block space-y-2 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] p-4">
            <span className={C.rotulo}>{ES.ia.preguntaContexto}</span>
            <textarea
              value={aiContextQuestion}
              onChange={(event) => setAiContextQuestion(event.target.value)}
              rows={3}
              maxLength={20000}
              placeholder={ES.ia.preguntaPlaceholder}
              className="w-full resize-y bg-transparent text-sm leading-5 text-[var(--t-text)] outline-none placeholder:text-[var(--t-muted)]"
            />
          </label>
        </div>
        {(aiContextQuestion.trim() || aiContextAnswer.trim()) && (
          <label className="mt-3 block space-y-2 rounded-2xl border border-[color-mix(in_srgb,var(--tareas-accent)_30%,var(--t-border))] bg-[color-mix(in_srgb,var(--tareas-accent)_6%,var(--t-surface))] p-4">
            <span className={C.rotulo}>{ES.ia.respuestaContexto}</span>
            <textarea
              value={aiContextAnswer}
              onChange={(event) => setAiContextAnswer(event.target.value)}
              rows={3}
              maxLength={20000}
              placeholder={ES.ia.respuestaPlaceholder}
              className="w-full resize-y bg-transparent text-sm leading-5 text-[var(--t-text)] outline-none placeholder:text-[var(--t-muted)]"
            />
          </label>
        )}

        <div className="mt-8 flex items-center justify-between">
          <span className={C.rotulo}>{ES.rotulos.subtareas}</span>
          <button
            type="button"
            hidden
            className="bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)] text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {ES.modal.desglosarIA}
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {subtareas.map((step, index) => (
            <div
              key={step.id}
              draggable
              onDragStart={(event) => {
                arrastrando.current = index;
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const desde = arrastrando.current;
                arrastrando.current = null;
                if (desde === null || desde === index) return;
                setSubtareas((prev) => {
                  const next = [...prev];
                  const [movido] = next.splice(desde, 1);
                  next.splice(index, 0, movido);
                  return next;
                });
              }}
              onDragEnd={() => { arrastrando.current = null; }}
              className="group bg-[var(--t-surface-2)] rounded-2xl px-4 py-4 flex items-center gap-3"
            >
              <GripVertical
                className="w-4 h-4 shrink-0 cursor-grab text-[var(--t-muted)] opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => {
                  setSubtareas((prev) => prev.map((item, i) => (
                    i === index ? { ...item, completed: !item.completed } : item
                  )));
                }}
                className={cn(
                  'w-6 h-6 shrink-0 rounded-full border-2 border-neutral-300 flex items-center justify-center',
                  step.completed && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
                )}
              >
                {step.completed && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
              <input
                value={step.text}
                onChange={(event) => {
                  const value = event.target.value;
                  setSubtareas((prev) => prev.map((item, i) => (i === index ? { ...item, text: value } : item)));
                }}
                onKeyDown={(event) => {
                  // Enter agrega el siguiente paso, como en cualquier lista:
                  // escribir cinco subtareas seguidas no debería exigir tocar
                  // el botón cinco veces.
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  setSubtareas((prev) => {
                    const next = [...prev];
                    next.splice(index + 1, 0, nuevaSubtarea());
                    return next;
                  });
                }}
                className={cn(
                  'flex-1 bg-transparent outline-none text-sm font-medium text-[var(--t-text)]',
                  step.completed && 'line-through text-[var(--t-muted)]',
                )}
              />
              <button
                type="button"
                onClick={() => setSubtareas((prev) => prev.filter((_, i) => i !== index))}
                title={ES.modal.quitarPaso}
                aria-label={ES.modal.quitarPaso}
                className="shrink-0 rounded-lg p-1.5 text-[var(--t-muted)] opacity-0 transition-opacity hover:bg-[var(--t-surface)] hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSubtareas((prev) => [...prev, nuevaSubtarea()])}
          className="mt-3 w-full border-2 border-dashed border-[color-mix(in_srgb,var(--tareas-accent)_40%,transparent)] text-[var(--tareas-accent)] text-xs font-bold tracking-widest rounded-2xl py-4 hover:bg-[color-mix(in_srgb,var(--tareas-accent)_5%,transparent)] inline-flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {ES.modal.agregarPaso}
        </button>

        <div className="mt-8 flex items-center justify-between gap-3">
          <span className={C.rotulo}>{ES.rotulos.detalles}</span>
          <button
            type="button"
            role="switch"
            aria-checked={mostrarVacios}
            onClick={() => setMostrarVacios((v) => !v)}
            className="inline-flex items-center gap-2 text-[11px] font-bold text-[var(--t-muted)] hover:text-[var(--tareas-accent)]"
          >
            {ES.modal.mostrarVacios}
            <span
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                mostrarVacios ? 'bg-[var(--tareas-accent)]' : 'bg-[var(--t-chip)]',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  mostrarVacios ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>
        </div>

        {hayCampos && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {verFecha && (
          <label className="space-y-2">
            <span className={C.rotulo}>{ES.rotulos.fecha}</span>
            <span className={cn(C.control, 'flex items-center gap-2')}>
              <CalendarDays className="w-4 h-4 text-[var(--t-muted)]" />
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="bg-transparent outline-none flex-1"
              />
            </span>
          </label>
          )}
          {verRecurrencia && (
          <label className="space-y-2">
            <span className={C.rotulo}>{ES.rotulos.recurrencia}</span>
            <select
              value={recurrencia}
              onChange={(event) => setRecurrencia(event.target.value as Recurrencia)}
              className={C.control}
            >
              <option value="unica">{ES.recurrencia.unica}</option>
              <option value="diaria">{ES.recurrencia.diaria}</option>
              <option value="semanal">{ES.recurrencia.semanal}</option>
              <option value="mensual">{ES.recurrencia.mensual}</option>
            </select>
          </label>
          )}
          {verPrioridad && (
          <label className="space-y-2" title={prioBloqueada ? ES.modal.prioridadBloqueada : undefined}>
            <span className={C.rotulo}>{ES.rotulos.prioridad}</span>
            <select
              value={prioridad}
              disabled={prioBloqueada}
              onChange={(event) => setPrioridad(event.target.value as Prioridad)}
              className={cn(C.control, prioBloqueada && 'opacity-50')}
            >
              <option value="baja">{ES.prioridad.baja}</option>
              <option value="media">{ES.prioridad.media}</option>
              <option value="alta">{ES.prioridad.alta}</option>
            </select>
          </label>
          )}
        </div>
        )}

        <label className="mt-4 block space-y-2">
          <span className={C.rotulo}>{ES.rotulos.proyecto}</span>
          <span className={cn(C.control, 'flex items-center gap-2')}>
            <FolderOpen className="w-4 h-4 text-[var(--t-muted)]" />
            <select
              value={projectId}
              onChange={(event) => setProjectId(Number(event.target.value))}
              className="bg-transparent outline-none flex-1"
            >
              {props.grupos.map((grupo) => (
                grupo.projectIds.map((id) => (
                  <option key={id} value={id}>
                    {grupo.workspaceNombre} · {grupo.name}
                    {grupo.projectIds.length > 1 ? ` #${id}` : ''}
                  </option>
                ))
              ))}
            </select>
          </span>
        </label>

        <label className="mt-4 block space-y-2">
          <span className={C.rotulo}>{ES.nav.cliente}</span>
          <span className={cn(C.control, 'flex items-center gap-2')}>
            <Users className="w-4 h-4 text-[var(--t-muted)]" />
            {/* Un solo control para las dos cosas: antes sólo se podía
                vincular un cliente desde acá, y el lead quedaba escondido en
                el panel de relaciones de más abajo. */}
            <select
              value=""
              onChange={(event) => {
                const [tipo, raw] = event.target.value.split(':');
                const id = Number(raw);
                if (id) props.onVincularParte({ tipo: tipo as 'cliente' | 'lead', id });
              }}
              className="bg-transparent outline-none flex-1"
            >
              <option value="">{ES.nav.sinCliente}</option>
              <optgroup label={ES.clientes.grupoClientes}>
                {props.clientes
                  .filter((cliente) => !props.vinculados.some((v) => v.tipo === 'cliente' && v.id === cliente.id))
                  .map((cliente) => (
                    <option key={`cliente-${cliente.id}`} value={`cliente:${cliente.id}`}>{cliente.name}</option>
                  ))}
              </optgroup>
              <optgroup label={ES.clientes.grupoLeads}>
                {props.leads
                  .filter((lead) => !props.vinculados.some((v) => v.tipo === 'lead' && v.id === lead.id))
                  .map((lead) => (
                    <option key={`lead-${lead.id}`} value={`lead:${lead.id}`}>{lead.name}</option>
                  ))}
              </optgroup>
            </select>
          </span>
          {props.vinculados.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {props.vinculados.map((parte) => (
                <span
                  key={parte.relationId}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg',
                    parte.tipo === 'cliente'
                      ? 'bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)]'
                      : 'bg-[var(--t-surface-2)] text-[var(--t-text-secondary)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => { if (parte.tipo === 'cliente') props.onAbrirCliente(parte.id); }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                  >
                    <Users className="h-3 w-3" />
                    {parte.tipo === 'cliente' ? ES.relaciones.fichaCorta : ES.relaciones.leadCorto} · {parte.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDesvincularCliente(parte.relationId)}
                    className="px-1.5 py-1 text-xs font-bold text-[var(--t-muted)] hover:text-[var(--t-text)]"
                    aria-label="Quitar cliente"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </label>

        <BitacoraTarea taskId={props.tarea.id} />

        <PanelRelaciones
          tarea={props.tarea}
          detalles={props.detalles}
          universo={props.universo}
          grupos={props.grupos}
          clientes={props.clientes}
          contactos={props.contactos}
          onVincular={props.onVincularRelacion}
          onQuitar={async (id) => props.onDesvincularCliente(id)}
          onAbrirTarea={props.onAbrirTarea}
          onAbrirCliente={props.onAbrirCliente}
          onFiltrarProyecto={props.onFiltrarProyecto}
          onActualizar={props.onActualizarRelaciones}
          mostrarFormulario={mostrarVacios}
        />

      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--t-border)] bg-[var(--t-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        {props.onEliminar ? (
          <button
            type="button"
            disabled={saving || eliminando}
            onClick={() => {
              if (!window.confirm(ES.modal.eliminarConfirm)) return;
              setEliminando(true);
              void props.onEliminar!().finally(() => setEliminando(false));
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-[var(--t-muted)] hover:bg-red-500/10 hover:text-red-600 disabled:opacity-60"
          >
            {eliminando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {ES.modal.eliminar}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !title.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--tareas-accent)] px-6 py-3.5 font-bold text-white hover:bg-[var(--tareas-accent-700)] disabled:opacity-60 sm:min-w-56"
          style={{ boxShadow: 'var(--t-shadow-accent)' }}
        >
          <Save className="w-4 h-4" />
          {saving ? ES.ia.guardando : ES.modal.guardar}
        </button>
      </div>
      </div>
    </div>
  );
}
