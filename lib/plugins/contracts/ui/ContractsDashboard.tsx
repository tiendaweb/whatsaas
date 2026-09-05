'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileSignature, Loader2, Plus } from 'lucide-react';
import { formatMoney as formatMoneySeguro, formatMoneyFromCents } from '@/lib/format/money';

type Customer = { id: number; name: string };

type ContractListItem = {
  id: number;
  title: string;
  status: string;
  value: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  autoRenew: boolean;
  customerId: number | null;
  customerName: string | null;
};

type OverviewData = { activeContracts: { count: number; total: number }; expiringSoon: number };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  expiring: 'Por vencer',
  expired: 'Vencido',
  cancelled: 'Cancelado',
  renewed: 'Renovado',
};

function formatMoney(amount: number, currency: string) {
  return formatMoneyFromCents(amount, currency, { locale: 'es-AR', maximumFractionDigits: 2 });
}

export function ContractsDashboard() {
  const { data: overview } = useSWR<OverviewData>('/api/plugins/contracts/overview', fetcher);
  const { data: contractsData, mutate: mutateContracts } = useSWR<ContractListItem[]>('/api/plugins/contracts', fetcher);
  const { data: customersData } = useSWR<Customer[]>('/api/plugins/customers', fetcher);

  const contracts = Array.isArray(contractsData) ? contractsData : [];
  const customers = Array.isArray(customersData) ? customersData : [];

  const [form, setForm] = useState({ title: '', customerId: '', value: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);

  const createContract = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/plugins/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          customerId: form.customerId ? Number(form.customerId) : null,
          value: Math.round(Number(form.value || 0) * 100),
          status: 'active',
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo crear el contrato.');
      toast.success('Contrato creado.');
      setForm({ title: '', customerId: '', value: '', startDate: '', endDate: '' });
      mutateContracts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el contrato.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-sky-600 to-blue-700 flex items-center justify-center">
          <FileSignature className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <p className="text-sm text-muted-foreground">Contratos comerciales por cliente.</p>
        </div>
      </div>

      {overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Contratos activos</p>
            <p className="text-xl font-semibold">{overview.activeContracts.count}</p>
            <p className="text-xs text-muted-foreground">{formatMoney(overview.activeContracts.total, 'ARS')}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Por vencer (30 días)</p>
            <p className="text-xl font-semibold">{overview.expiringSoon}</p>
          </CardContent></Card>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Nuevo contrato</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createContract} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
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
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" min={0} step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fin</Label>
                <Input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
              </div>
            </div>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear contrato
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            Todavía no hay contratos.
          </p>
        ) : (
          contracts.map((contract) => (
            <div key={contract.id} className="border rounded-lg p-4 bg-card">
              <p className="text-sm font-medium flex items-center gap-2">
                {contract.title}
                <Badge variant="secondary">{STATUS_LABEL[contract.status] ?? contract.status}</Badge>
                {contract.autoRenew ? <Badge variant="outline">Auto-renovación</Badge> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {contract.customerName ?? 'Sin cliente'} · {formatMoney(contract.value, contract.currency)}
                {contract.endDate ? ` · vence ${contract.endDate}` : ''}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  );
}
