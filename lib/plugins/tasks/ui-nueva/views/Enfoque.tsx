'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle, Coffee, Factory, ListTree, Pause, Play, RotateCcw, Target, X } from 'lucide-react';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { AnilloProgreso } from '../components/AnilloProgreso';
import { C } from '../data/clases';
import type { Tarea } from '../data/tipos';
import { relojBloque, useBloqueProduccion } from '../hooks/useBloqueProduccion';
import { WORK_KIND_META, esWorkKind } from '@/lib/plugins/tasks/shared/produccion';
import { postSesion } from './PedidoProtocolo';
import { ES } from '../i18n/es';
import { cn } from '@/lib/utils';

/**
 * Enfoque de una tarea, sobre EL MISMO reloj que el Focus de Producción.
 *
 * Antes había dos cronómetros de 25 minutos que no se conocían: éste, con un
 * `useState` que se perdía al cerrar la pantalla, y el de Producción, guardado
 * en localStorage. Arrancar un bloque acá y abrir Producción mostraba otro
 * reloj en cero, y viceversa. Ahora los dos usan `useBloqueProduccion` con la
 * misma clave: un solo bloque, se pause donde se pause. El reloj sobrevive a
 * cerrar el Enfoque, recargar o cambiar de pestaña, que es lo que corresponde a
 * un bloque de trabajo de verdad.
 *
 * La duración editable (`props.minutos`) es la del PRÓXIMO bloque: cambiarla
 * no acorta ni estira el que ya corre.
 */
export function Enfoque(props: {
  tarea: Tarea | null;
  minutos: number;
  onMinutos: (n: number) => void;
  onClose: () => void;
  onToggleSub: (index: number) => void;
  onFinalizar: () => void;
}) {
  const minutosFoco = Math.max(1, props.minutos);
  const bloque = useBloqueProduccion({ minutosFoco });
  const [editing, setEditing] = useState(false);

  // Lo que falta, en ms. Sin bloque, el reloj muestra la duración completa.
  const totalMs = bloque.minutos * 60_000;
  const calcular = () => {
    if (!bloque.hayBloque || bloque.terminaEn == null) return totalMs;
    if (bloque.pausadoCon != null) return bloque.pausadoCon;
    return Math.max(0, bloque.terminaEn - Date.now());
  };
  const [left, setLeft] = useState(calcular);

  // Los segundos que corren se dibujan acá, no en el hook: el hook sólo agenda
  // el vencimiento, para no re-renderizar toda la pantalla una vez por segundo.
  useEffect(() => {
    setLeft(calcular());
    if (!bloque.hayBloque || bloque.pausado) return;
    const id = window.setInterval(() => setLeft(calcular()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloque.hayBloque, bloque.pausado, bloque.terminaEn, bloque.pausadoCon, totalMs]);

  const running = bloque.hayBloque && !bloque.pausado;

  // Si la tarea es un pedido de producción, el bloque también suma a sus horas:
  // misma sesión que abre el Focus de Producción, sobre el mismo reloj.
  const pedidoKind = props.tarea && esWorkKind(props.tarea.workKind) ? props.tarea.workKind : null;
  const pedidoId = pedidoKind ? props.tarea!.id : null;
  const sesionDe = useRef<number | null>(null);
  const corriendoFoco = running && bloque.tipo === 'foco';
  useEffect(() => {
    if (corriendoFoco && pedidoId != null) {
      if (sesionDe.current === pedidoId) return;
      sesionDe.current = pedidoId;
      void postSesion(pedidoId, { action: 'open', kind: 'foco' });
    } else if (sesionDe.current != null) {
      const anterior = sesionDe.current;
      sesionDe.current = null;
      void postSesion(anterior, { action: 'close' });
    }
  }, [pedidoId, corriendoFoco]);
  useEffect(() => () => { if (sesionDe.current != null) void postSesion(sesionDe.current, { action: 'close' }); }, []);

  const togglePlay = () => {
    if (!bloque.hayBloque) bloque.arrancar('foco');
    else if (bloque.pausado) bloque.reanudar();
    else bloque.pausar();
  };

  return (
    <div className="fixed inset-0 bg-[var(--t-bg)] z-50 overflow-y-auto">
      <button
        type="button"
        onClick={props.onClose}
        className="absolute top-6 right-6 w-12 h-12 rounded-full bg-[var(--t-chip)] text-[var(--t-muted)] flex items-center justify-center"
        aria-label={ES.enfoque.salir}
      >
        <X className="w-5 h-5" />
      </button>
      <div className="max-w-5xl mx-auto px-6 py-16 grid lg:grid-cols-2 gap-12 items-center min-h-screen">
        <div className="flex flex-col items-center">
          <AnilloProgreso progress={left / Math.max(1, totalMs)}>
            <div className="flex items-center gap-2 text-[var(--tareas-accent)] text-xs font-bold tracking-[0.2em]">
              {bloque.tipo === 'descanso' ? <Coffee className="w-4 h-4" /> : <Target className="w-4 h-4" />}
              {bloque.tipo === 'descanso' ? ES.enfoque.descanso : ES.rotulos.trabajoProfundo}
            </div>
            {editing ? (
              <input
                autoFocus
                type="number"
                min={1}
                max={120}
                value={props.minutos}
                onChange={(event) => props.onMinutos(Number(event.target.value) || 25)}
                onBlur={() => setEditing(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setEditing(false);
                }}
                className="mt-2 w-32 text-center text-5xl font-black bg-transparent outline-none"
              />
            ) : (
              <button
                type="button"
                // La duración sólo se edita sin bloque en curso: el que corre no se toca.
                onClick={() => { if (!bloque.hayBloque) setEditing(true); }}
                title={bloque.hayBloque ? undefined : ES.enfoque.editarDuracion}
                className="text-7xl font-black tracking-tight text-[var(--t-text)] mt-2"
                data-testid="enfoque-reloj"
                data-estado={!bloque.hayBloque ? 'sin-bloque' : bloque.pausado ? 'pausado' : 'corriendo'}
              >
                {relojBloque(left)}
              </button>
            )}
          </AnilloProgreso>
          {bloque.mostrarAviso && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="font-semibold text-[var(--t-text)]">
                {bloque.tipo === 'descanso' ? ES.enfoque.descansoTerminado : ES.enfoque.bloqueTerminado(bloque.minutos)}
              </span>
              <button
                type="button"
                onClick={() => bloque.arrancar('foco')}
                className="rounded-full bg-[var(--tareas-accent)] px-4 py-1.5 font-bold text-white"
              >
                {ES.enfoque.otroBloque(minutosFoco)}
              </button>
              {bloque.tipo !== 'descanso' && (
                <button
                  type="button"
                  onClick={() => bloque.arrancar('descanso')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--t-chip)] px-4 py-1.5 font-bold text-[var(--t-text)]"
                >
                  <Coffee className="w-4 h-4" />
                  {ES.enfoque.descansoCorto}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-6 mt-10">
            <button
              type="button"
              onClick={() => bloque.terminar()}
              title={ES.enfoque.reiniciar}
              className="w-20 h-20 rounded-full bg-[var(--t-chip)] flex items-center justify-center text-[var(--t-text)]"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              title={!bloque.hayBloque ? ES.enfoque.iniciar : bloque.pausado ? ES.enfoque.reanudar : ES.enfoque.pausar}
              className="w-32 h-20 rounded-[2rem] bg-[var(--tareas-accent)] text-white flex items-center justify-center"
              style={{ boxShadow: 'var(--t-shadow-accent)' }}
            >
              {running ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </button>
          </div>
        </div>

        <div className="bg-[color-mix(in_srgb,var(--t-chip)_60%,transparent)] rounded-[2rem] p-8 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className={C.rotulo}>{ES.rotulos.tareaPrincipal}</span>
            {props.tarea && (
              <button
                type="button"
                onClick={props.onFinalizar}
                className="inline-flex items-center gap-2 text-[var(--tareas-accent)] text-sm font-bold"
              >
                <CheckCircle className="w-4 h-4" />
                {ES.enfoque.finalizar}
              </button>
            )}
          </div>
          {props.tarea ? (
            <>
              {pedidoKind && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--tareas-accent)]/30 bg-[var(--tareas-accent)]/10 px-3 py-1 text-[11px] font-black text-[var(--tareas-accent)]" title={ES.enfoque.pedidoProduccionAyuda} data-testid="enfoque-pedido-produccion">
                  <Factory className="w-3.5 h-3.5" aria-hidden /> {ES.enfoque.pedidoProduccion(WORK_KIND_META[pedidoKind].corto)}
                </div>
              )}
              {isRadarTaskTitle(props.tarea.title) && (
                <div className="mt-4">
                  <RadarTag label="Radar" />
                </div>
              )}
              <h2
                className={cn(
                  'text-3xl font-black leading-tight text-[var(--t-text)] break-words',
                  isRadarTaskTitle(props.tarea.title) ? 'mt-2' : 'mt-4',
                )}
              >
                {radarTaskTitle(props.tarea.title)}
              </h2>
              <div className={cn(C.rotulo, 'mt-8 flex items-center gap-2')}>
                <ListTree className="w-3.5 h-3.5" />
                {ES.rotulos.subtareas}
              </div>
              <div className="mt-3 space-y-3">
                {props.tarea.subtareas.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => props.onToggleSub(index)}
                    className="w-full bg-[var(--t-surface)] rounded-2xl px-5 py-4 flex items-center gap-4 text-left"
                  >
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full border-2 border-neutral-300 flex items-center justify-center',
                        step.completed && 'bg-[var(--tareas-accent)] border-[var(--tareas-accent)]',
                      )}
                    >
                      {step.completed && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className={cn('font-bold text-sm', step.completed && 'line-through text-[var(--t-muted)]')}>
                      {step.text}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-6 text-[var(--t-text-secondary)]">{ES.enfoque.sinTarea}</p>
          )}
        </div>
      </div>
    </div>
  );
}
