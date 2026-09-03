'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Flag, HelpCircle, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { formatearFechaCorta } from '../data/fechas';
import { parsearCaptura } from '../data/parser';
import { PRIO_COLORES, type EtiquetaUnificada, type Prioridad, type Recurrencia } from '../data/tipos';
import { ES } from '../i18n/es';

export function CapturaRapida(props: {
  disabled: boolean;
  placeholder: string;
  onPlaceholderClick?: () => void;
  etiquetas: EtiquetaUnificada[];
  onCrear: (entrada: {
    title: string;
    dueDate: string | null;
    prioridad: Prioridad;
    recurrencia: Recurrencia;
    etiquetas: { name: string; color?: string }[];
  }) => Promise<unknown>;
  onComoUsar: () => void;
  sidebarCollapsed?: boolean;
}) {
  const [raw, setRaw] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [prioridad, setPrioridad] = useState<Prioridad>('media');
  const [recurrencia, setRecurrencia] = useState<Recurrencia>('unica');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parsearCaptura(raw), [raw]);

  const effectiveDue = parsed.dueDate ?? dueDate;
  const effectivePrio = parsed.prioridad ?? prioridad;
  const effectiveRec = parsed.recurrencia !== 'unica' ? parsed.recurrencia : recurrencia;
  const effectiveTags = Array.from(new Set([...tags, ...parsed.etiquetas]));

  const cyclePrio = () => {
    setPrioridad((prev) => (prev === 'media' ? 'alta' : prev === 'alta' ? 'baja' : 'media'));
  };
  const cycleRec = () => {
    setRecurrencia((prev) => (
      prev === 'unica' ? 'diaria' : prev === 'diaria' ? 'semanal' : prev === 'semanal' ? 'mensual' : 'unica'
    ));
  };

  const submit = async () => {
    const title = parsed.titulo;
    if (!title || props.disabled || saving) return;
    setSaving(true);
    await props.onCrear({
      title,
      dueDate: effectiveDue,
      prioridad: effectivePrio,
      recurrencia: effectiveRec,
      etiquetas: effectiveTags.map((name) => ({ name })),
    });
    setRaw('');
    setDueDate(null);
    setPrioridad('media');
    setRecurrencia('unica');
    setTags([]);
    setSaving(false);
  };

  const prioColor = PRIO_COLORES[effectivePrio];

  return (
    <div className={`fixed bottom-6 left-0 right-0 z-20 pointer-events-none ${props.sidebarCollapsed ? 'lg:left-0' : 'lg:left-64'}`}>
      <div className="pointer-events-auto max-w-3xl mx-auto px-6 relative">
        <div
          className={cn(
            'bg-[var(--t-surface)] rounded-3xl border border-[var(--t-border-2)] p-3.5 flex flex-col gap-3',
            'shadow-2xl',
            props.disabled && 'opacity-80',
          )}
          style={{ boxShadow: 'var(--t-shadow-dock)' }}
        >
          <div className="flex items-center gap-2">
            <input
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              disabled={props.disabled}
              placeholder={props.disabled ? props.placeholder : ES.captura.chat}
              className="flex-1 px-4 py-2.5 text-sm outline-none placeholder:text-[var(--t-muted)] bg-transparent text-[var(--t-text)]"
            />
            {props.disabled && props.onPlaceholderClick && (
              <button
                type="button"
                onClick={props.onPlaceholderClick}
                className="text-[var(--tareas-accent)] underline text-xs font-bold shrink-0"
              >
                {ES.nav.ajustes}
              </button>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2 border-t border-[var(--t-border)] pt-3 px-1">
            <label className={C.chip}>
              <CalendarDays className="w-3.5 h-3.5" />
              {effectiveDue ? formatearFechaCorta(effectiveDue) : ES.rotulos.fecha}
              <input
                type="date"
                className="sr-only"
                disabled={props.disabled}
                onChange={(event) => {
                  setDueDate(event.target.value ? `${event.target.value}T12:00:00.000Z` : null);
                }}
              />
            </label>
            <button type="button" className={C.chip} onClick={cycleRec} disabled={props.disabled}>
              <Repeat className="w-3.5 h-3.5" />
              {ES.recurrencia[effectiveRec]}
            </button>
            <button
              type="button"
              className={C.chip}
              onClick={cyclePrio}
              disabled={props.disabled}
              style={{ color: prioColor }}
            >
              <Flag className="w-3.5 h-3.5" />
              {ES.prioridad[effectivePrio]}
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              {props.etiquetas.slice(0, 8).map((etiqueta) => {
                const on = effectiveTags.some((name) => name.toLowerCase() === etiqueta.name.toLowerCase());
                return (
                  <button
                    key={etiqueta.name}
                    type="button"
                    title={etiqueta.name}
                    disabled={props.disabled}
                    onClick={() => {
                      setTags((prev) => (
                        on
                          ? prev.filter((name) => name.toLowerCase() !== etiqueta.name.toLowerCase())
                          : [...prev, etiqueta.name]
                      ));
                    }}
                    className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center transition-all border',
                      on ? 'opacity-100' : 'opacity-40 grayscale',
                    )}
                    style={{ background: etiqueta.color, borderColor: etiqueta.color }}
                  />
                );
              })}
              <span className="w-px h-4 bg-[var(--t-border-2)] mx-1" />
              <button
                type="button"
                onClick={props.onComoUsar}
                className="text-[10px] font-bold text-[var(--t-muted)] hover:text-[var(--tareas-accent)] inline-flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {ES.nav.comoUsar}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
