'use client';

import React, { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Panel, SectionHeader, IconButton } from '../components/shared';

type AgendaItem = { _recordId: string; time: string; task: string; done: boolean };

interface AgendaViewProps {
  agenda: AgendaItem[];
  onChange: (items: AgendaItem[]) => void;
  backgroundStyle?: React.CSSProperties;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function AgendaView({ agenda, onChange, backgroundStyle }: AgendaViewProps) {
  const [time, setTime] = useState('');
  const [task, setTask] = useState('');

  const sortedAgenda = [...agenda].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return (
    <div style={backgroundStyle}>
      <Panel className="p-5">
        <SectionHeader title="Agenda del día">
          <button
            onClick={() => {
              const suggested: AgendaItem[] = [
                { _recordId: makeId(), time: '07:00', task: 'Revisar inbox y mensajes prioritarios', done: false },
                { _recordId: makeId(), time: '09:00', task: 'Bloque profundo de trabajo creativo', done: false },
                { _recordId: makeId(), time: '12:30', task: 'Almuerzo + descanso corto', done: false },
                { _recordId: makeId(), time: '15:00', task: 'Llamadas y seguimiento a clientes', done: false },
              ];
              onChange(suggested);
            }}
            className="rounded-2xl border border-white/60 bg-white/80 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-white transition active:scale-[0.985]"
          >
            Rutina sugerida
          </button>
        </SectionHeader>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input 
            type="time" 
            value={time} 
            onChange={(e) => setTime(e.target.value)} 
            className="rounded-2xl border border-white/60 bg-white/90 px-3 py-2.5 text-sm min-h-[44px]" 
          />
          <input 
            value={task} 
            onChange={(e) => setTask(e.target.value)} 
            placeholder="Actividad o reunión" 
            className="min-w-0 flex-1 rounded-2xl border border-white/60 bg-white/90 px-3 py-2.5 text-sm min-h-[44px]" 
          />
          <button
            onClick={() => {
              if (!task.trim()) return;
              const next = [...agenda, { _recordId: makeId(), time, task: task.trim(), done: false }];
              onChange(next.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
              setTime('');
              setTask('');
            }}
            className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2.5 text-sm font-bold text-white min-h-[44px] active:brightness-95"
          >
            + Agregar
          </button>
        </div>

        <div className="space-y-2">
          {sortedAgenda.length === 0 && (
            <div className="text-sm text-zinc-500 py-4 text-center">Tu agenda está vacía. Agrega tu primera actividad.</div>
          )}
          {sortedAgenda.map((item) => (
            <div key={item._recordId} className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/80 px-4 py-3 transition hover:border-rose-200/70">
              <button 
                onClick={() => onChange(agenda.map((a) => (a._recordId === item._recordId ? { ...a, done: !a.done } : a)))} 
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${item.done ? 'border-rose-500 bg-gradient-to-br from-rose-500 to-pink-500 text-white' : 'border-zinc-300 hover:border-rose-300'}`}
              >
                {item.done && <Check className="h-3.5 w-3.5" />}
              </button>
              <span className="w-14 shrink-0 text-xs font-bold tabular-nums text-rose-600">{item.time || '—'}</span>
              <span className={`flex-1 text-sm font-medium ${item.done ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
                {item.task}
              </span>
              <IconButton title="Eliminar" onClick={() => onChange(agenda.filter((a) => a._recordId !== item._recordId))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
