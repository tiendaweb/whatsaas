'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, ArrowLeftRight, Download, Search, RefreshCw, Phone, MessageCircle, Plus } from 'lucide-react';
import { ClientDetail } from './ClientDetail';
import type { ClientItem, CRMContact, ClientProduct, DetailSource } from './clients/types';

interface ClientsViewProps {
  clients: ClientItem[];
  onChange: (items: ClientItem[]) => void;
  clientProducts: ClientProduct[];
  onProductsChange: (items: ClientProduct[]) => void;
  backgroundStyle: React.CSSProperties;
  preferredMode?: 'local' | 'crm';
  targetClientPhone?: string;
}

export function ClientsView({
  clients, onChange, clientProducts, onProductsChange, backgroundStyle, preferredMode = 'local', targetClientPhone
}: ClientsViewProps) {
  const [mode, setMode] = useState<'local' | 'crm'>(preferredMode);
  const [detailSource, setDetailSource] = useState<DetailSource | null>(null);

  // Local add form
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('potencial');
  const [localSearch, setLocalSearch] = useState('');

  // CRM
  const [crmContacts, setCrmContacts] = useState<CRMContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSearch, setCrmSearch] = useState('');

  // Import modal state (kept minimal for this view)
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { setMode(preferredMode); }, [preferredMode]);

  useEffect(() => {
    const targetPhone = (targetClientPhone ?? '').replace(/[^\d]/g, '');
    if (!targetPhone) return;
    const match = clients.find(c => (c.phone || '').replace(/[^\d]/g, '') === targetPhone);
    if (match) { setMode('local'); setDetailSource({ type: 'local', item: match }); }
  }, [clients, targetClientPhone]);

  const loadCrmContacts = useCallback(async () => {
    setCrmLoading(true);
    try {
      const res = await fetch('/api/contacts/list', { cache: 'no-store' });
      if (!res.ok) throw new Error('crm_load_failed');
      const payload = await res.json();
      setCrmContacts(Array.isArray(payload) ? payload.map((contact: CRMContact) => ({
        ...contact,
        name: contact.name || contact.phone || 'Sin nombre',
      })) : []);
    } catch {
      setCrmContacts([]);
    } finally { setCrmLoading(false); }
  }, []);

  useEffect(() => {
    if (mode === 'crm') void loadCrmContacts();
  }, [loadCrmContacts, mode]);

  // Simple filtered
  const filteredLocal = localSearch
    ? clients.filter(c => c.name.toLowerCase().includes(localSearch.toLowerCase()) || (c.notes || '').toLowerCase().includes(localSearch.toLowerCase()))
    : clients;

  const filteredCrm = crmContacts.filter(c =>
    !crmSearch || c.name.toLowerCase().includes(crmSearch.toLowerCase()) || (c.phone || '').includes(crmSearch)
  );

  function handleAddLocal() {
    if (!name.trim()) return;
    onChange([...clients, { _recordId: Math.random().toString(36).slice(2,10)+Date.now(), name: name.trim(), status, notes: notes.trim(), contacted: false }]);
    setName(''); setNotes(''); setLocalSearch('');
  }

  if (detailSource) {
    return (
      <ClientDetail
        source={detailSource}
        clients={clients}
        clientProducts={clientProducts}
        backgroundStyle={backgroundStyle}
        onLocalSave={(updated) => onChange(clients.map(c => c._recordId === updated._recordId ? updated : c))}
        onLocalDelete={(id) => onChange(clients.filter(c => c._recordId !== id))}
        onProductsChange={onProductsChange}
        onConvertToLocal={(contact) => onChange([...clients, { _recordId: Math.random().toString(36).slice(2,10)+Date.now(), name: contact.name, status: 'potencial', notes: contact.notes ?? '', contacted: false, phone: contact.phone ?? undefined }])}
        onBack={() => setDetailSource(null)}
      />
    );
  }

  return (
    <div className="bw-content p-5 space-y-5">
      {/* Elegant mode switch + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-white/50 bg-white/60 p-1 shadow-sm backdrop-blur">
          <button
            onClick={() => setMode('local')}
            className={`flex min-h-[42px] items-center gap-2 rounded-[14px] px-5 text-sm font-semibold transition ${mode === 'local' ? 'bg-zinc-950 text-white' : 'hover:bg-white/70 text-zinc-700'}`}
          >
            <Users className="h-4 w-4" /> Mis Clientes
          </button>
          <button
            onClick={() => setMode('crm')}
            className={`flex min-h-[42px] items-center gap-2 rounded-[14px] px-5 text-sm font-semibold transition ${mode === 'crm' ? 'bg-zinc-950 text-white' : 'hover:bg-white/70 text-zinc-700'}`}
          >
            <ArrowLeftRight className="h-4 w-4" /> CRM del sistema
          </button>
        </div>

        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-2xl border border-white/50 bg-white/80 px-4 py-2 text-sm font-semibold shadow-sm hover:bg-white">
          <Download className="h-4 w-4" /> Importar contactos
        </button>
      </div>

      {/* LOCAL MODE - redesigned clean cards */}
      {mode === 'local' && (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400" />
            <input value={localSearch} onChange={e=>setLocalSearch(e.target.value)} placeholder="Buscar entre mis clientes..." className="w-full rounded-3xl border border-white/60 bg-white/90 pl-11 py-3 text-sm shadow-sm focus:ring-rose-300" />
          </div>

          {/* Add form - elegant compact */}
          <div className="grid gap-2 rounded-3xl border border-white/40 bg-white/70 p-4 md:grid-cols-[1fr,140px,1fr,auto]">
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del cliente" className="rounded-2xl border px-4 py-3 text-sm" />
            <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-2xl border px-4 py-3 text-sm">
              <option value="potencial">Potencial</option><option value="activo">Activo</option><option value="seguimiento">Seguimiento</option><option value="cerrado">Cerrado</option>
            </select>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notas rápidas" className="rounded-2xl border px-4 py-3 text-sm md:col-span-1" />
            <button onClick={handleAddLocal} className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 text-sm font-bold text-white shadow active:opacity-90">+ Agregar</button>
          </div>

          {/* Client cards - visually impactful, professional, clean */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredLocal.length === 0 && <div className="col-span-full py-12 text-center text-muted-foreground">No hay clientes todavía. ¡Agrega el primero!</div>}
            {filteredLocal.map(client => (
              <div key={client._recordId} onClick={() => setDetailSource({ type: 'local', item: client })} className="group cursor-pointer rounded-3xl border border-white/50 bg-white/85 p-5 transition hover:-translate-y-px hover:border-rose-200 hover:shadow-xl active:scale-[0.995]">
                <div className="flex justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-200 to-pink-300 text-sm font-black text-rose-700 ring-1 ring-white/70">
                      {client.name.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-lg tracking-[-0.2px] group-hover:text-rose-600">{client.name}</div>
                      {client.phone && <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{client.phone}</div>}
                    </div>
                  </div>

                  {client.phone && (
                    <a href={`/dashboard/chat/${encodeURIComponent(client.phone.replace(/@.*/,''))}`} onClick={e=>e.stopPropagation()} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white shadow hover:bg-[#128C7E]">
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                </div>

                {client.notes && <p className="mt-3 line-clamp-2 text-sm text-zinc-600">{client.notes}</p>}

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className={`rounded-full border px-3 py-1 font-bold ${STATUS_CLS[client.status] || ''}`}>{client.status}</span>
                  <span className="text-zinc-500">{clientProducts.filter(p => p.clientId === client._recordId && p.status === 'activo').length} servicios activos</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* CRM MODE - clean professional list */}
      {mode === 'crm' && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3 h-4 w-4 text-zinc-400" />
              <input value={crmSearch} onChange={e=>setCrmSearch(e.target.value)} placeholder="Buscar en CRM..." className="w-full rounded-3xl border border-white/50 bg-white/90 pl-11 py-3 text-sm" />
            </div>
            <button onClick={loadCrmContacts} className="rounded-2xl border px-4 hover:bg-white/70"><RefreshCw className={crmLoading ? 'animate-spin' : ''} /></button>
          </div>

          {crmLoading ? <div className="py-10 text-center text-sm">Cargando CRM…</div> : filteredCrm.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No hay contactos CRM que coincidan.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredCrm.map(contact => (
                <div key={contact.id} onClick={() => setDetailSource({ type: 'crm', contact })} className="cursor-pointer rounded-3xl border border-white/60 bg-white/90 p-5 hover:border-rose-300 hover:shadow-xl transition">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-200 to-fuchsia-200 flex items-center justify-center text-xs font-black text-violet-700 shrink-0">
                      {contact.name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold tracking-tight">{contact.name}</div>
                      <div className="font-mono text-xs text-zinc-500">{contact.phone}</div>
                      {contact.funnelStage && <div className="text-[11px] mt-1 text-rose-600">{contact.funnelStage.emoji} {contact.funnelStage.name}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Minimal import hint modal trigger - can expand */}
      {showModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="bw-liquid-panel max-w-md w-full rounded-3xl p-6" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-3">Importar contactos de WhatsApp</h3>
            <p className="text-sm text-muted-foreground">El importador completo sigue disponible desde el botón principal de importación o el flujo anterior. Esta vista ahora es más limpia.</p>
            <button onClick={() => setShowModal(false)} className="mt-5 w-full rounded-2xl bg-zinc-900 py-2.5 text-white text-sm font-medium">Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  potencial: 'bg-blue-50 text-blue-700 border-blue-200',
  activo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  seguimiento: 'bg-amber-50 text-amber-700 border-amber-200',
  cerrado: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};
