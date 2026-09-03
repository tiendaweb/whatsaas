'use client';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CalendarClock, Globe2, Plus, Search, UserRoundCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Customer } from './types';
const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

export function CustomersList() {
  const [source, setSource] = useState('all'); const [search, setSearch] = useState(''); const [createOpen, setCreateOpen] = useState(false);
  const { data = [], mutate } = useSWR<Customer[]>(`/api/plugins/customers?source=${source}`, fetcher);
  const filtered = useMemo(() => { const q = search.toLowerCase(); return q ? data.filter((c) => [c.name,c.email,c.phone].some((v) => v?.toLowerCase().includes(q))) : data; }, [data, search]);
  return <div className="h-full overflow-y-auto bg-background">
    <header className="border-b px-5 py-5 sm:px-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary"/><h1 className="text-2xl font-semibold">Clientes</h1></div><p className="mt-1 text-sm text-muted-foreground">Clientes manuales y sincronizados, con sus contactos y membresías.</p></div><Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4"/>Nuevo cliente</Button></div></header>
    <main className="p-5 sm:p-7"><div className="mb-5 grid gap-4 border-b pb-5 sm:grid-cols-3"><Metric icon={Users} label="Clientes" value={data.length}/><Metric icon={UserRoundCheck} label="Membresías activas" value={data.reduce((n,c)=>n+Number(c.activeMemberships),0)}/><Metric icon={Globe2} label="Sitios web" value={data.reduce((n,c)=>n+Number(c.storesCount),0)}/></div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar por nombre, email o teléfono" className="pl-9"/></div><div className="flex gap-1">{[['all','Todos'],['manual','Manuales'],['aapp_space','AAPP SPACE']].map(([id,label])=><Button key={id} size="sm" variant={source===id?'default':'outline'} onClick={()=>setSource(id)}>{label}</Button>)}</div></div>
      <div className="divide-y border-y">{filtered.length ? filtered.map((customer)=><Link key={customer.id} href={`/plugins/customers/${customer.id}`} className="grid gap-3 px-2 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-medium">{customer.name}</p><Badge variant={customer.source==='aapp_space'?'default':'secondary'} className="text-[10px]">{customer.source==='aapp_space'?'AAPP SPACE':'Manual'}</Badge></div><p className="truncate text-xs text-muted-foreground">{customer.email || customer.phone || 'Sin datos de contacto'}</p></div><Cell label="Contactos" value={customer.contactsCount}/><Cell label="Membresías" value={customer.activeMemberships}/><div><p className="text-xs text-muted-foreground">Próximo vencimiento</p><p className="mt-1 flex items-center gap-1 text-sm"><CalendarClock className="h-3.5 w-3.5"/>{customer.nextExpiration ? new Date(`${customer.nextExpiration}T00:00:00`).toLocaleDateString('es-ES') : 'Sin vencimiento'}</p></div></Link>) : <p className="py-14 text-center text-sm text-muted-foreground">No hay clientes para este filtro.</p>}</div>
    </main><CreateCustomer open={createOpen} setOpen={setCreateOpen} onCreated={mutate}/>
  </div>;
}
function Metric({icon:Icon,label,value}:{icon:typeof Users;label:string;value:number}) { return <div className="flex items-center gap-3"><Icon className="h-5 w-5 text-muted-foreground"/><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>; }
function Cell({label,value}:{label:string;value:number}) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium tabular-nums">{value}</p></div>; }
function CreateCustomer({open,setOpen,onCreated}:{open:boolean;setOpen:(v:boolean)=>void;onCreated:()=>void}) { const [form,setForm]=useState({name:'',email:'',phone:''}); async function save(){const r=await fetch('/api/plugins/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});if(!r.ok)return toast.error('No se pudo crear el cliente');toast.success('Cliente creado');setOpen(false);setForm({name:'',email:'',phone:''});onCreated();} return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Nombre</Label><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></div><div><Label>Email</Label><Input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></div><div><Label>Teléfono</Label><Input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></div></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={!form.name.trim()}>Crear</Button></div></DialogContent></Dialog>; }
