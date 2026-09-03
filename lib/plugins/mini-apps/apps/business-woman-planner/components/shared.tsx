'use client';

import React from 'react';
import { Check, Trash2 } from 'lucide-react';

// Shared glass panel for appreciable background - maintains the feminine professional look
export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bw-liquid-panel rounded-2xl border border-white/45 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-black text-zinc-950 md:text-2xl tracking-[-0.3px]">{title}</h2>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/40 bg-white/30 p-8 text-center text-sm font-semibold text-zinc-600 backdrop-blur-xl">
      {children}
    </div>
  );
}

export function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/70 hover:text-rose-600 active:bg-rose-50"
    >
      {children}
    </button>
  );
}

export function Metric({ label, value, intent = 'normal' }: { label: string; value: string | number; intent?: 'normal' | 'danger' }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 backdrop-blur-xl ${intent === 'danger' ? 'border-red-200/60 bg-red-50/40' : 'border-white/40 bg-white/60'}`}>
      <div className={`text-2xl font-black tracking-tighter ${intent === 'danger' ? 'text-red-700' : 'text-zinc-950'}`}>
        {value}
      </div>
      <div className="text-xs font-semibold uppercase tracking-[0.5px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

// Small reusable task row for agenda/home etc, with feminine accent
export function TaskRow({ 
  done, 
  onToggle, 
  onDelete, 
  time, 
  children 
}: { 
  done: boolean; 
  onToggle: () => void; 
  onDelete: () => void; 
  time?: string; 
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 transition hover:border-rose-200">
      <button 
        onClick={onToggle} 
        className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${done ? 'border-rose-500 bg-gradient-to-br from-rose-500 to-pink-500 text-white' : 'border-zinc-300 hover:border-rose-300'}`}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </button>
      {time && <span className="w-14 text-xs font-bold text-rose-600 tabular-nums">{time}</span>}
      <span className={`flex-1 text-sm font-medium ${done ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
        {children}
      </span>
      <button onClick={onDelete} className="text-zinc-400 hover:text-red-500 transition p-1">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
