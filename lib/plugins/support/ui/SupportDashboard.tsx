'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LifeBuoy, Loader2, Plus } from 'lucide-react';

type Customer = { id: number; name: string };

type TicketListItem = {
  id: number;
  subject: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: string;
  category: string | null;
  customerId: number | null;
  customerName: string | null;
  dueAt: string | null;
  createdAt: string;
};

type OverviewData = { open: number; urgent: number; overdue: number };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_LABEL: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En curso',
  waiting_customer: 'Esperando cliente',
  resolved: 'Resuelto',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

const PRIORITY_LABEL: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function SupportDashboard() {
  const { data: overview } = useSWR<OverviewData>('/api/plugins/support/overview', fetcher);
  const { data: ticketsData, mutate: mutateTickets } = useSWR<TicketListItem[]>('/api/plugins/support/tickets', fetcher);
  const { data: customersData } = useSWR<Customer[]>('/api/plugins/customers', fetcher);

  const tickets = Array.isArray(ticketsData) ? ticketsData : [];
  const customers = Array.isArray(customersData) ? customersData : [];

  const [form, setForm] = useState({ subject: '', description: '', customerId: '', priority: 'normal' as TicketListItem['priority'] });
  const [saving, setSaving] = useState(false);

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customerId) {
      toast.error('Elegí un cliente.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/plugins/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject,
          description: form.description,
          customerId: Number(form.customerId),
          priority: form.priority,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo crear el ticket.');
      toast.success('Ticket creado.');
      setForm({ subject: '', description: '', customerId: '', priority: 'normal' });
      mutateTickets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el ticket.');
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (ticket: TicketListItem) => {
    const flow: Record<string, string> = { open: 'in_progress', in_progress: 'resolved', resolved: 'closed' };
    const next = flow[ticket.status];
    if (!next) return;
    try {
      const response = await fetch(`/api/plugins/support/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo actualizar el ticket.');
      toast.success(`Ticket movido a ${STATUS_LABEL[next]}.`);
      mutateTickets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar.');
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center">
          <LifeBuoy className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Soporte</h1>
          <p className="text-sm text-muted-foreground">Tickets de soporte y postventa.</p>
        </div>
      </div>

      {overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Abiertos</p>
            <p className="text-xl font-semibold">{overview.open}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Urgentes</p>
            <p className="text-xl font-semibold">{overview.urgent}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Vencidos</p>
            <p className="text-xl font-semibold">{overview.overdue}</p>
          </CardContent></Card>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Nuevo ticket</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createTicket} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Asunto</Label>
                <Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={form.customerId} onValueChange={(value) => setForm({ ...form, customerId: value })}>
                  <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
            </div>
            <div className="space-y-2 w-40">
              <Label>Prioridad</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as TicketListItem['priority'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={saving || !form.subject.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear ticket
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            Todavía no hay tickets de soporte.
          </p>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} className="border rounded-lg p-4 bg-card flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium flex items-center gap-2">
                  {ticket.subject}
                  <Badge className={PRIORITY_COLOR[ticket.priority]}>{PRIORITY_LABEL[ticket.priority]}</Badge>
                  <Badge variant="secondary">{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {ticket.customerName ?? 'Sin cliente'} {ticket.category ? `· ${ticket.category}` : ''}
                </p>
              </div>
              {['open', 'in_progress', 'resolved'].includes(ticket.status) ? (
                <Button size="sm" variant="outline" onClick={() => advanceStatus(ticket)}>
                  Avanzar
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  );
}
