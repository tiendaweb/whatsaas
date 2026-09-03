'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Order = {
  id: number;
  status: 'pending_review' | 'approved' | 'rejected' | 'canceled';
  total: number;
  createdAt: string;
  reviewedAt: string | null;
  item: { id: number; title: string } | null;
  team: { id: number; name: string } | null;
  lines: Array<{ id: number; quantity: number; unitAmount: number; currency: string; price: { billingType: string } | null }>;
  statusEvents: Array<{
    id: number;
    previousStatus: string | null;
    nextStatus: string;
    reason: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type OrderStatusFilter = 'pending_review' | 'approved' | 'rejected' | 'canceled' | 'all';
type ReviewStatus = 'approved' | 'rejected' | 'canceled';
type PaymentMethod = 'manual_transfer' | 'mercadopago' | 'stripe' | 'cash' | 'other';

export function MarketplaceOrdersAdminClient() {
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('pending_review');
  const { data: orders, mutate, isLoading } = useSWR<Order[]>(`/api/plugins/marketplace/admin/orders?status=${statusFilter}`, fetcher);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Marketplace · Pedidos</h1>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OrderStatusFilter)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">Pendientes</SelectItem>
            <SelectItem value="approved">Aprobados</SelectItem>
            <SelectItem value="rejected">Rechazados</SelectItem>
            <SelectItem value="canceled">Cancelados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando pedidos...</p> : null}

      {(orders ?? []).map((order) => (
        <OrderReviewCard key={order.id} order={order} onReviewed={mutate} />
      ))}
    </div>
  );
}

function OrderReviewCard({ order, onReviewed }: { order: Order; onReviewed: () => Promise<Order[] | undefined> }) {
  const [status, setStatus] = useState<ReviewStatus>('approved');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('manual_transfer');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function submitReview() {
    setIsSaving(true);
    await fetch(`/api/plugins/marketplace/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, paymentMethod, reason: reason || null }),
    });
    setIsSaving(false);
    setReason('');
    await onReviewed();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Pedido #{order.id} · {order.item?.title ?? 'Item eliminado'}</span>
          <Badge variant={order.status === 'approved' ? 'default' : 'outline'}>{order.status}</Badge>
        </CardTitle>
        <CardDescription>
          Equipo: {order.team?.name ?? 'N/A'} · Creado {new Date(order.createdAt).toLocaleString()} · Total {order.total / 100}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">Líneas del pedido</p>
          {order.lines.map((line) => (
            <p key={line.id} className="text-xs text-muted-foreground">
              {line.quantity} × {line.unitAmount / 100} {line.currency.toUpperCase()} · modalidad {line.price?.billingType ?? 'n/a'}
            </p>
          ))}
        </div>

        {order.status === 'pending_review' ? (
          <div className="rounded-lg border p-3 grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Estado revisión</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ReviewStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Aprobar</SelectItem>
                  <SelectItem value="rejected">Rechazar</SelectItem>
                  <SelectItem value="canceled">Cancelar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de pago</Label>
              <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_transfer">Transferencia manual</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-3">
              <Label>Motivo / auditoría</Label>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="Opcional" />
            </div>

            <div className="md:col-span-3 flex justify-end">
              <Button onClick={submitReview} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Aplicar revisión'}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">Auditoría de eventos</p>
          {order.statusEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
          ) : (
            order.statusEvents.map((event) => (
              <div key={event.id} className="rounded border p-2 text-xs">
                <p>
                  <strong>{event.previousStatus ?? 'null'}</strong> → <strong>{event.nextStatus}</strong>
                  {' · '}
                  {new Date(event.createdAt).toLocaleString()}
                </p>
                {event.reason ? <p className="text-muted-foreground">Motivo: {event.reason}</p> : null}
                {'paymentMethod' in (event.metadata ?? {}) ? (
                  <p className="text-muted-foreground">Método: {String(event.metadata.paymentMethod)}</p>
                ) : null}
                <p className="text-muted-foreground">metadata: {JSON.stringify(event.metadata)}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
