'use client';

import React, { useState } from 'react';
import { Panel, SectionHeader, IconButton } from '../components/shared';
import { Trash2, Check } from 'lucide-react';

type GrowthItem = { _recordId: string; goal: string; done: boolean; notes?: string };

interface GrowthViewProps {
  growth: GrowthItem[];
  onChange: (items: GrowthItem[]) => void;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now();
}

export function GrowthView({ growth, onChange }: GrowthViewProps) {
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Panel className="p-5">
      <SectionHeader title="Crecimiento personal" />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
        <input 
          value={goal} 
          onChange={(e) => setGoal(e.target.value)} 
          placeholder="Meta o hábito (ej: Meditar 10 min)" 
          className="rounded-2xl border border-white/60 bg-white/90 px-4 py-2.5 text-sm min-h-[44px]" 
        />
        <input 
          value={notes} 
          onChange={(e) => setNotes(e.target.value)} 
          placeholder="Notas o por qué" 
          className="rounded-2xl border border-white/60 bg-white/90 px-4 py-2.5 text-sm min-h-[44px]" 
        />
        <button
          onClick={() => {
            if (!goal.trim()) return;
            onChange([...growth, { _recordId: makeId(), goal: goal.trim(), done: false, notes: notes.trim() || undefined }]);
            setGoal(''); setNotes('');
          }}
          className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-bold text-white min-h-[44px]"
        >
          + Agregar meta
        </button>
      </div>

      <div className="space-y-2">
        {growth.length === 0 && <div className="py-6 text-center text-sm text-zinc-500">Define tus metas de crecimiento personal.</div>}
        {growth.map((item) => (
          <div key={item._recordId} className="flex items-start gap-3 rounded-2xl border border-white/50 bg-white/80 p-4 transition hover:border-rose-200">
            <button 
              onClick={() => onChange(growth.map((x) => (x._recordId === item._recordId ? { ...x, done: !x.done } : x)))} 
              className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border transition ${item.done ? 'border-rose-500 bg-gradient-to-br from-rose-500 to-pink-500 text-white' : 'border-zinc-300'}`}
            >
              {item.done && <Check className="h-3.5 w-3.5" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${item.done ? 'line-through text-zinc-400' : 'text-zinc-900'}`}>{item.goal}</div>
              {item.notes && <div className="text-xs text-zinc-500 mt-0.5">{item.notes}</div>}
            </div>
            <IconButton title="Eliminar" onClick={() => onChange(growth.filter((x) => x._recordId !== item._recordId))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
      </div>
    </Panel>
  );
}
