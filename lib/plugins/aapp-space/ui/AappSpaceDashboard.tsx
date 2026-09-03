'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { KeyRound, Loader2, RefreshCw, Store, Unplug, Users, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AappSpaceCustomers } from './AappSpaceCustomers';

type State = { connected: boolean; status: string; hasApiKey: boolean; lastSyncedAt: string | null; lastSyncStatus: string | null; lastSyncError: string | null; counts: { customers: number; stores: number; transactions: number } };
const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

export function AappSpaceDashboard() {
  const { data, mutate } = useSWR<State>('/api/plugins/aapp-space/connection', fetcher);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  async function connect() {
    setBusy('connect');
    const response = await fetch('/api/plugins/aapp-space/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
    const body = await response.json(); setBusy(null);
    if (!response.ok) return toast.error(body.error || 'No se pudo conectar');
    setApiKey(''); toast.success('Conexión guardada'); mutate();
  }
  async function sync() {
    setBusy('sync'); const response = await fetch('/api/plugins/aapp-space/sync', { method: 'POST' }); const body = await response.json(); setBusy(null);
    if (!response.ok) return toast.error(body.error || 'No se pudo sincronizar');
    toast.success(`Sincronizados: ${body.summary.customers} clientes, ${body.summary.stores} tiendas`); mutate();
  }
  async function disconnect() {
    setBusy('disconnect'); await fetch('/api/plugins/aapp-space/connection', { method: 'DELETE' }); setBusy(null); toast.success('Conexión eliminada'); mutate();
  }
  const counts = data?.counts ?? { customers: 0, stores: 0, transactions: 0 };
  return <div className="h-full overflow-y-auto bg-background p-5 sm:p-7">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div><div className="flex items-center gap-3"><Store className="h-6 w-6 text-primary"/><h1 className="text-2xl font-semibold">AAPP SPACE</h1><Badge variant={data?.connected ? 'default' : 'secondary'}>{data?.status ?? 'desconectado'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Clientes, membresías, sitios web y pagos de GoBiz.</p></div>
        <Button onClick={sync} disabled={!data?.connected || busy !== null}><RefreshCw className={`mr-2 h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`}/>Sincronizar ahora</Button>
      </div>
      <section className="border-b pb-6">
        <h2 className="mb-3 text-sm font-semibold">Conexión</h2>
        <div className="flex max-w-2xl flex-col gap-3 sm:flex-row"><div className="relative flex-1"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={data?.hasApiKey ? 'API key guardada' : 'gbz_...'} className="pl-9"/></div><Button onClick={connect} disabled={!apiKey || busy !== null}>{busy === 'connect' && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}<span>Probar y guardar</span></Button>{data?.hasApiKey && <Button variant="outline" size="icon" title="Desconectar" onClick={disconnect} disabled={busy !== null}><Unplug className="h-4 w-4"/></Button>}</div>
        {data?.lastSyncedAt && <p className="mt-3 text-xs text-muted-foreground">Última sincronización: {new Date(data.lastSyncedAt).toLocaleString('es-ES')}</p>}
        {data?.lastSyncError && <p className="mt-2 text-sm text-destructive">{data.lastSyncError}</p>}
      </section>
      <div className="grid gap-4 sm:grid-cols-3">{[[Users,'Clientes',counts.customers],[Store,'Sitios web',counts.stores],[WalletCards,'Transacciones',counts.transactions]].map(([Icon,label,total]) => { const C = Icon as typeof Users; return <div key={String(label)} className="border-l-2 border-primary py-2 pl-4"><C className="mb-3 h-5 w-5 text-muted-foreground"/><p className="text-3xl font-semibold tabular-nums">{String(total)}</p><p className="text-sm text-muted-foreground">{String(label)}</p></div>; })}</div>
      <AappSpaceCustomers />
    </div>
  </div>;
}
