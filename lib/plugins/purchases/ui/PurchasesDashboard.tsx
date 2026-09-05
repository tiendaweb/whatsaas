'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, PackageCheck, Plus, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { formatMoney as formatMoneySeguro, formatMoneyFromCents } from '@/lib/format/money';

type Vendor = {
  id: number;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
};

type OrderItemInput = { description: string; quantity: number; unitAmount: number };

type OrderListItem = {
  id: number;
  orderNumber: string;
  status: string;
  currency: string;
  totalAmount: number;
  vendorName: string;
  expectedDate: string | null;
  createdAt: string;
};

type OverviewData = {
  pendingOrders: { count: number; total: number };
  ordersThisMonth: { count: number; total: number };
  activeVendors: number;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  confirmed: 'Confirmada',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

function formatMoney(amount: number, currency: string) {
  return formatMoneyFromCents(amount, currency, { locale: 'es-AR', maximumFractionDigits: 2 });
}

export function PurchasesDashboard() {
  const { data: overview } = useSWR<OverviewData>('/api/plugins/purchases/overview', fetcher);
  const { data: vendorsData, mutate: mutateVendors } = useSWR<Vendor[]>('/api/plugins/purchases/vendors', fetcher);
  const { data: ordersData, mutate: mutateOrders } = useSWR<OrderListItem[]>('/api/plugins/purchases/orders', fetcher);

  const vendors = Array.isArray(vendorsData) ? vendorsData : [];
  const orders = Array.isArray(ordersData) ? ordersData : [];

  const [vendorForm, setVendorForm] = useState({ name: '', taxId: '', email: '', phone: '' });
  const [savingVendor, setSavingVendor] = useState(false);

  const [orderVendorId, setOrderVendorId] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItemInput[]>([{ description: '', quantity: 1, unitAmount: 0 }]);
  const [savingOrder, setSavingOrder] = useState(false);

  const createVendor = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingVendor(true);
    try {
      const response = await fetch('/api/plugins/purchases/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendorForm),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo crear el proveedor.');
      toast.success('Proveedor creado.');
      setVendorForm({ name: '', taxId: '', email: '', phone: '' });
      mutateVendors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el proveedor.');
    } finally {
      setSavingVendor(false);
    }
  };

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orderVendorId) {
      toast.error('Elegí un proveedor.');
      return;
    }
    const items = orderItems.filter((item) => item.description.trim());
    if (!items.length) {
      toast.error('Agregá al menos un ítem.');
      return;
    }
    setSavingOrder(true);
    try {
      const response = await fetch('/api/plugins/purchases/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: Number(orderVendorId),
          items: items.map((item) => ({ ...item, unitAmount: Math.round(item.unitAmount * 100) })),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.formErrors?.[0] || json.error || 'No se pudo crear la orden.');
      toast.success(`Orden ${json.orderNumber} creada.`);
      setOrderVendorId('');
      setOrderItems([{ description: '', quantity: 1, unitAmount: 0 }]);
      mutateOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la orden.');
    } finally {
      setSavingOrder(false);
    }
  };

  const receiveOrder = async (order: OrderListItem) => {
    try {
      const response = await fetch(`/api/plugins/purchases/orders/${order.id}/receive`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo marcar como recibida.');
      toast.success(`Orden ${order.orderNumber} recibida.`);
      mutateOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al recibir la orden.');
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center">
          <ShoppingCart className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Compras</h1>
          <p className="text-sm text-muted-foreground">Proveedores y órdenes de compra.</p>
        </div>
      </div>

      {overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Órdenes pendientes</p>
            <p className="text-xl font-semibold">{overview.pendingOrders.count}</p>
            <p className="text-xs text-muted-foreground">{formatMoney(overview.pendingOrders.total, 'ARS')}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Este mes</p>
            <p className="text-xl font-semibold">{overview.ordersThisMonth.count}</p>
            <p className="text-xs text-muted-foreground">{formatMoney(overview.ordersThisMonth.total, 'ARS')}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Proveedores activos</p>
            <p className="text-xl font-semibold">{overview.activeVendors}</p>
          </CardContent></Card>
        </div>
      ) : null}

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Órdenes</TabsTrigger>
          <TabsTrigger value="vendors">Proveedores</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Nueva orden</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createOrder} className="space-y-3">
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <Select value={orderVendorId} onValueChange={setOrderVendorId}>
                    <SelectTrigger><SelectValue placeholder="Elegí un proveedor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={String(vendor.id)}>{vendor.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Ítems</Label>
                  {orderItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        placeholder="Descripción"
                        value={item.description}
                        onChange={(event) => {
                          const next = [...orderItems];
                          next[index] = { ...next[index], description: event.target.value };
                          setOrderItems(next);
                        }}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => {
                          const next = [...orderItems];
                          next[index] = { ...next[index], quantity: Number(event.target.value) || 1 };
                          setOrderItems(next);
                        }}
                        className="w-20"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Precio unit."
                        value={item.unitAmount || ''}
                        onChange={(event) => {
                          const next = [...orderItems];
                          next[index] = { ...next[index], unitAmount: Number(event.target.value) || 0 };
                          setOrderItems(next);
                        }}
                        className="w-28"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setOrderItems(orderItems.filter((_, i) => i !== index))}
                        disabled={orderItems.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderItems([...orderItems, { description: '', quantity: 1, unitAmount: 0 }])}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Agregar ítem
                  </Button>
                </div>

                <Button type="submit" disabled={savingOrder}>
                  {savingOrder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear orden
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
                Todavía no hay órdenes de compra.
              </p>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="border rounded-lg p-4 bg-card flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {order.orderNumber}
                      <Badge variant="secondary">{STATUS_LABEL[order.status] ?? order.status}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.vendorName} · {formatMoney(order.totalAmount, order.currency)}
                    </p>
                  </div>
                  {order.status !== 'received' && order.status !== 'cancelled' ? (
                    <Button size="sm" variant="outline" onClick={() => receiveOrder(order)}>
                      <PackageCheck className="h-4 w-4 mr-2" /> Recibir
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Nuevo proveedor</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createVendor} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={vendorForm.name} onChange={(event) => setVendorForm({ ...vendorForm, name: event.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>CUIT/Tax ID</Label>
                    <Input value={vendorForm.taxId} onChange={(event) => setVendorForm({ ...vendorForm, taxId: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={vendorForm.email} onChange={(event) => setVendorForm({ ...vendorForm, email: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input value={vendorForm.phone} onChange={(event) => setVendorForm({ ...vendorForm, phone: event.target.value })} />
                  </div>
                </div>
                <Button type="submit" disabled={savingVendor || !vendorForm.name.trim()}>
                  {savingVendor ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear proveedor
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {vendors.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
                Todavía no hay proveedores.
              </p>
            ) : (
              vendors.map((vendor) => (
                <div key={vendor.id} className="border rounded-lg p-4 bg-card">
                  <p className="text-sm font-medium">{vendor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[vendor.taxId, vendor.email, vendor.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </p>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
