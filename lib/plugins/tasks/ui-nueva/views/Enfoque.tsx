'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCircle, ListTree, Pause, Play, RotateCcw, Target, X } from 'lucide-react';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { AnilloProgreso } from '../components/AnilloProgreso';
import { C } from '../data/clases';
import type { Tarea } from '../data/tipos';
import { ES } from '../i18n/es';
import { cn } from '@/lib/utils';

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Enfoque(props: {
  tarea: Tarea | null;
  minutos: number;
  onMinutos: (n: number) => void;
  onClose: () => void;
  onToggleSub: (index: number) => void;
  onFinalizar: () => void;
}) {
  const total = Math.max(1, props.minutos) * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLeft(total);
  }, [total]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);



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
          <AnilloProgreso progress={left / total}>
            <div className="flex items-center gap-2 text-[var(--tareas-accent)] text-xs font-bold tracking-[0.2em]">
              <Target className="w-4 h-4" />
              {ES.rotulos.trabajoProfundo}
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
                onClick={() => setEditing(true)}
                className="text-7xl font-black tracking-tight text-[var(--t-text)] mt-2"
              >
                {fmt(left)}
              </button>
            )}
          </AnilloProgreso>
          <div className="flex items-center gap-6 mt-10">
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                setLeft(total);
              }}
              className="w-20 h-20 rounded-full bg-[var(--t-chip)] flex items-center justify-center text-[var(--t-text)]"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => setRunning((v) => !v)}
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
