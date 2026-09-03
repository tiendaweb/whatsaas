'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Panel, SectionHeader, EmptyState } from '../components/shared';

type CalendarItem = { id: string; title: string; type: string };

interface CalendarViewProps {
  month: Date;
  selectedDate: string;
  days: Date[];
  items: Record<string, CalendarItem[]>;
  selectedItems: CalendarItem[];
  onPrev: () => void;
  onNext: () => void;
  onSelectDate: (date: string) => void;
  onCreateTask: (title: string) => void;
  onOpenTask: (id: string) => void;
}

function dateKey(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function CalendarView({
  month,
  selectedDate,
  days,
  items,
  selectedItems,
  onPrev,
  onNext,
  onSelectDate,
  onCreateTask,
  onOpenTask,
}: CalendarViewProps) {
  const [title, setTitle] = useState('');
  const monthLabel = month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onPrev} className="rounded-2xl border border-white/60 bg-white/80 p-2 hover:bg-white transition"><ChevronLeft className="h-4 w-4" /></button>
          <h2 className="text-lg font-bold capitalize text-zinc-950">{monthLabel}</h2>
          <button onClick={onNext} className="rounded-2xl border border-white/60 bg-white/80 p-2 hover:bg-white transition"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold uppercase text-zinc-500">
          {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = dateKey(day);
            const dayItems = items[key] ?? [];
            const active = key === selectedDate;
            const muted = day.getMonth() !== month.getMonth();
            return (
              <button
                key={key}
                onClick={() => onSelectDate(key)}
                className={`min-h-24 rounded-2xl border p-2 text-left transition ${
                  active ? 'border-rose-500 bg-gradient-to-br from-rose-500 to-pink-500 text-white' : 'border-white/50 bg-white/80 hover:border-rose-200'
                } ${muted ? 'opacity-45' : ''}`}
              >
                <span className="text-xs font-bold">{day.getDate()}</span>
                <div className="mt-2 space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <div key={`${item.type}-${item.id}`} className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-white/25' : 'bg-zinc-100 text-zinc-600'}`}>
                      {item.title}
                    </div>
                  ))}
                  {dayItems.length > 3 && <div className="text-[10px] font-semibold">+{dayItems.length - 3}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader title={formatDate(selectedDate) || selectedDate} />
        <div className="space-y-2">
          {selectedItems.map((item) => (
            <button key={`${item.type}-${item.id}`} onClick={() => item.type === 'task' && onOpenTask(item.id)} className="block w-full rounded-2xl border border-white/50 bg-white/80 px-3 py-2 text-left hover:bg-white transition">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs font-medium text-zinc-500">{item.type === 'task' ? 'Tarea' : item.type === 'payment' ? 'Pago' : 'Dominio'}</p>
            </button>
          ))}
          {!selectedItems.length && <EmptyState>Sin elementos para este día.</EmptyState>}
        </div>
        <div className="mt-4 border-t border-white/40 pt-4">
          <label className="text-xs font-bold uppercase text-rose-600">Crear tarea en esta fecha</label>
          <div className="mt-2 flex gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="min-w-0 flex-1 rounded-2xl border border-white/60 bg-white/90 px-3 py-2 text-sm" />
            <button
              onClick={() => {
                if (title.trim()) {
                  onCreateTask(title.trim());
                  setTitle('');
                }
              }}
              className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-3 text-white flex items-center"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
