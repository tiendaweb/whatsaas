'use client';

import React, { useState } from 'react';
import { Panel, SectionHeader, IconButton } from '../components/shared';
import { Check, Trash2 } from 'lucide-react';

interface ChecklistViewProps<T extends { _recordId: string; done: boolean; [key: string]: any }> {
  title: string;
  placeholder: string;
  items: T[];
  textKey: string;
  onChange: (items: T[]) => void;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function ChecklistView<T extends { _recordId: string; done: boolean; [key: string]: any }>({
  title,
  placeholder,
  items,
  textKey,
  onChange,
}: ChecklistViewProps<T>) {
  const [text, setText] = useState('');

  return (
    <Panel className="p-5">
      <SectionHeader title={title} />

      <div className="mb-4 flex gap-2">
        <input 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder={placeholder} 
          className="min-w-0 flex-1 rounded-2xl border border-white/60 bg-white/90 px-4 py-2.5 text-sm min-h-[44px]" 
        />
        <button
          onClick={() => {
            if (!text.trim()) return;
            onChange([...items, { _recordId: makeId(), [textKey]: text.trim(), done: false } as T]);
            setText('');
          }}
          className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-bold text-white min-h-[44px]"
        >
          Agregar
        </button>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <div className="text-sm text-zinc-500 py-4 text-center">Sin elementos todavía.</div>}
        {items.map((item) => (
          <div key={item._recordId} className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/80 px-4 py-3">
            <button 
              onClick={() => onChange(items.map((x) => (x._recordId === item._recordId ? { ...x, done: !x.done } : x)))} 
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${item.done ? 'border-rose-500 bg-gradient-to-br from-rose-500 to-pink-500 text-white' : 'border-zinc-300'}`}
            >
              {item.done && <Check className="h-3.5 w-3.5" />}
            </button>
            <span className={`flex-1 text-sm font-medium ${item.done ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
              {item[textKey]}
            </span>
            <IconButton title="Eliminar" onClick={() => onChange(items.filter((x) => x._recordId !== item._recordId))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
      </div>
    </Panel>
  );
}
