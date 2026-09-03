'use client';

import React, { useState } from 'react';
import { Plus, Trash2, ExternalLink, Search, Link as LinkIcon } from 'lucide-react';
import { Panel, SectionHeader } from '../components/shared';

type LinkItem = { _recordId: string; url: string; title: string; description: string; group: string; clientId: string; createdAt: string };
type LinkGroup = { _recordId: string; name: string; color: string; emoji: string };
type ClientItem = { _recordId: string; name: string };

const fieldCls = 'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-200';
const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500';

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function hostOf(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinksView({ links, linkGroups, clients, onLinksChange, onGroupsChange }: {
  links: LinkItem[];
  linkGroups: LinkGroup[];
  clients: ClientItem[];
  onLinksChange: (items: LinkItem[]) => void;
  onGroupsChange: (items: LinkGroup[]) => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const blank = { title: '', url: '', description: '', group: linkGroups[0]?._recordId ?? '', clientId: '' };
  const [form, setForm] = useState(blank);
  const [newGroup, setNewGroup] = useState('');

  const filtered = links.filter((l) => {
    if (selectedGroup !== 'all' && l.group !== selectedGroup) return false;
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return `${l.title} ${l.description} ${l.url}`.toLowerCase().includes(q);
  });

  function save() {
    if (!form.title.trim() && !form.url.trim()) return;
    onLinksChange([{ _recordId: makeId(), title: form.title.trim() || hostOf(form.url), url: form.url.trim(), description: form.description.trim(), group: form.group, clientId: form.clientId, createdAt: new Date().toISOString() }, ...links]);
    setForm({ ...blank, group: form.group });
    setShowAdd(false);
  }

  function addGroup() {
    if (!newGroup.trim()) return;
    const colors = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b'];
    onGroupsChange([...linkGroups, { _recordId: makeId(), name: newGroup.trim(), color: colors[linkGroups.length % colors.length], emoji: '🔗' }]);
    setNewGroup('');
  }

  function groupMeta(id: string) {
    return linkGroups.find((g) => g._recordId === id);
  }

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader title="Links">
        {!showAdd && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow"><Plus className="h-4 w-4" /> Nuevo link</button>}
      </SectionHeader>

      {/* Group chips */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setSelectedGroup('all')} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${selectedGroup === 'all' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`}>Todos ({links.length})</button>
        {linkGroups.map((g) => {
          const count = links.filter((l) => l.group === g._recordId).length;
          const active = selectedGroup === g._recordId;
          return (
            <button key={g._recordId} onClick={() => setSelectedGroup(g._recordId)} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${active ? 'text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`} style={active ? { backgroundColor: g.color, borderColor: g.color } : { borderColor: g.color }}>
              {g.emoji} {g.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
        <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar links..." className={`${fieldCls} pl-9`} />
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-2">
          <div><label className={labelCls}>Título</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nombre del link" className={fieldCls} /></div>
          <div><label className={labelCls}>URL</label><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={fieldCls} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Descripción</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" className={fieldCls} /></div>
          <div>
            <label className={labelCls}>Grupo</label>
            <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className={fieldCls}>
              <option value="">Sin grupo</option>
              {linkGroups.map((g) => <option key={g._recordId} value={g._recordId}>{g.emoji} {g.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cliente</label>
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={fieldCls}>
              <option value="">Ninguno</option>
              {clients.map((c) => <option key={c._recordId} value={c._recordId}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button onClick={() => { setShowAdd(false); setForm(blank); }} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">Cancelar</button>
            <button onClick={save} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow">Agregar link</button>
          </div>
        </div>
      )}

      {/* Quick group creator */}
      <div className="mb-4 flex items-center gap-2">
        <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }} placeholder="Nuevo grupo…" className={`${fieldCls} max-w-[220px]`} />
        <button onClick={addGroup} disabled={!newGroup.trim()} className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm font-bold text-zinc-700 disabled:opacity-40">+ Grupo</button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/40 py-10 text-center text-sm text-zinc-500">No hay links{selectedGroup !== 'all' ? ' en este grupo' : ''}.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((l) => {
            const g = groupMeta(l.group);
            const client = clients.find((c) => c._recordId === l.clientId);
            return (
              <div key={l._recordId} className="group flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white/80 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: g?.color ?? '#71717a' }}><LinkIcon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-zinc-900">{l.title}</div>
                  <a href={l.url.startsWith('http') ? l.url : `https://${l.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs text-sky-600 hover:underline"><ExternalLink className="h-3 w-3 shrink-0" /> {hostOf(l.url)}</a>
                  {l.description && <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{l.description}</div>}
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                    {g && <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ backgroundColor: g.color }}>{g.emoji} {g.name}</span>}
                    {client && <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600">{client.name}</span>}
                  </div>
                </div>
                <button onClick={() => onLinksChange(links.filter((x) => x._recordId !== l._recordId))} className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
