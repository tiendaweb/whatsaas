'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
  Receipt,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle2,
  X,
  TrendingUp,
  Clock,
  Banknote,
} from 'lucide-react';
import { SaleForm, SaleFormData } from './SaleForm';

// ---- Types ---------------------------------------------------------------

type SaleItem = {
  articleId: number | null;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Sale = {
  id: number;
  contactId: number | null;
  contactName: string | null;
  contactPhone: string | null;
  saleNumber: string;
  status: 'draft' | 'confirmed' | 'paid' | 'cancelled' | 'refunded';
  currency: string;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  notes: string;
  paidAt: string | null;
  dueDate: string | null;
  createdAt: string;
};

type SaleStatus = Sale['status'];
type StatusFilterValue = 'all' | SaleStatus;

// ---- Status config --------------------------------------------------------

const STATUS_CONFIG: Record<SaleStatus, { label: string; badgeClass: string; dotClass: string }> = {
  draft:     { label: 'Borrador',     badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400 border-gray-200 dark:border-gray-700',       dotClass: 'bg-gray-400' },
  confirmed: { label: 'Confirmada',   badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-800',         dotClass: 'bg-blue-500' },
  paid:      { label: 'Pagada',       badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dotClass: 'bg-emerald-500' },
  cancelled: { label: 'Cancelada',    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border-red-200 dark:border-red-800',               dotClass: 'bg-red-500' },
  refunded:  { label: 'Reembolsada',  badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800',   dotClass: 'bg-amber-500' },
};

const STATUS_TABS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all',       label: 'Todos' },
  { value: 'draft',     label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'paid',      label: 'Pagada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded',  label: 'Reembolsada' },
];

// ---- Helpers -------------------------------------------------------------

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function saleToFormData(sale: Sale): SaleFormData {
  return {
    id:             sale.id,
    contactId:      sale.contactId,
    saleNumber:     sale.saleNumber,
    status:         sale.status,
    currency:       sale.currency,
    items:          sale.items.map(item => ({
      articleId:  item.articleId,
      name:       item.name,
      sku:        item.sku,
      quantity:   String(item.quantity),
      unitPrice:  (item.unitPrice / 100).toFixed(2),
      total:      item.total,
    })),
    discountAmount: (sale.discountAmount / 100).toFixed(2),
    taxAmount:      (sale.taxAmount / 100).toFixed(2),
    notes:          sale.notes ?? '',
    dueDate:        sale.dueDate ? sale.dueDate.split('T')[0] : '',
  };
}

// ---- StatChip ------------------------------------------------------------

function StatChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}

// ---- Dashboard -----------------------------------------------------------

export function SalesDashboard() {
  const { data, mutate } = useSWR<Sale[]>('/api/plugins/sales', fetcher);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleFormData | undefined>(undefined);

  const sales = data ?? [];

  // Stats
  const stats = useMemo(() => {
    const paidTotal = sales
      .filter(s => s.status === 'paid')
      .reduce((sum, s) => sum + s.total, 0);
    const pendingCount = sales.filter(s => s.status === 'draft' || s.status === 'confirmed').length;
    // Determine dominant currency (most frequent among paid)
    const paidSales = sales.filter(s => s.status === 'paid');
    const currencyFreq = paidSales.reduce<Record<string, number>>((acc, s) => {
      acc[s.currency] = (acc[s.currency] ?? 0) + 1;
      return acc;
    }, {});
    const dominantCurrency = Object.entries(currencyFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';

    return {
      total:           sales.length,
      paidTotal,
      dominantCurrency,
      pendingCount,
    };
  }, [sales]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = sales;
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.saleNumber.toLowerCase().includes(q) ||
        (s.contactName ?? '').toLowerCase().includes(q) ||
        formatPhone(s.contactPhone).includes(q)
      );
    }
    return list;
  }, [sales, statusFilter, search]);

  function handleNew() {
    setEditingSale(undefined);
    setFormOpen(true);
  }

  function handleEdit(sale: Sale) {
    setEditingSale(saleToFormData(sale));
    setFormOpen(true);
  }

  async function handleDelete(sale: Sale) {
    if (!confirm('¿Eliminar esta venta?')) return;
    await fetch(`/api/plugins/sales/${sale.id}`, { method: 'DELETE' });
    mutate();
  }

  async function handleMarkPaid(sale: Sale) {
    if (!confirm('¿Marcar esta venta como pagada?')) return;
    await fetch(`/api/plugins/sales/${sale.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', paidAt: new Date().toISOString() }),
    });
    mutate();
  }

  async function handleSave(formData: SaleFormData) {
    const payload = {
      contactId:      formData.contactId,
      saleNumber:     formData.saleNumber,
      status:         formData.status,
      currency:       formData.currency,
      items:          formData.items.map(item => ({
        articleId:  item.articleId,
        name:       item.name,
        sku:        item.sku,
        quantity:   parseFloat(item.quantity) || 1,
        unitPrice:  Math.round(parseFloat(item.unitPrice || '0') * 100),
        total:      item.total,
      })),
      discountAmount: Math.round(parseFloat(formData.discountAmount || '0') * 100),
      taxAmount:      Math.round(parseFloat(formData.taxAmount || '0') * 100),
      notes:          formData.notes,
      dueDate:        formData.dueDate || null,
    };

    if (formData.id) {
      await fetch(`/api/plugins/sales/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/plugins/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    mutate();
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Ventas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gestiona órdenes y seguimiento de pagos
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar venta o contacto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 w-56 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button size="sm" onClick={handleNew} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="h-3.5 w-3.5" />
              Nueva venta
            </Button>
          </div>
        </div>

        {/* Stats */}
        {sales.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
            <StatChip
              icon={TrendingUp}
              label="Total ventas"
              value={stats.total}
              color="text-muted-foreground"
            />
            <StatChip
              icon={Banknote}
              label="Ingresos cobrados"
              value={formatPrice(stats.paidTotal, stats.dominantCurrency)}
              color="text-emerald-500"
            />
            <StatChip
              icon={Clock}
              label="Pendientes"
              value={stats.pendingCount}
              color="text-amber-500"
            />
          </div>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="border-b border-border bg-background px-6 py-2">
        <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5 w-fit">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
                statusFilter === tab.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState hasSales={sales.length > 0} onNew={handleNew} />
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1.2fr_2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>N° Venta</span>
              <span>Contacto</span>
              <span>Fecha</span>
              <span>Estado</span>
              <span>Total</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map((sale, idx) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                isLast={idx === filtered.length - 1}
                onEdit={() => handleEdit(sale)}
                onDelete={() => handleDelete(sale)}
                onMarkPaid={() => handleMarkPaid(sale)}
              />
            ))}
          </div>
        )}
      </div>

      <SaleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleSave}
        initialData={editingSale}
      />
    </div>
  );
}

// ---- SaleRow -------------------------------------------------------------

function SaleRow({
  sale,
  isLast,
  onEdit,
  onDelete,
  onMarkPaid,
}: {
  sale: Sale;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkPaid: () => void;
}) {
  const cfg = STATUS_CONFIG[sale.status];
  const displayPhone = formatPhone(sale.contactPhone);

  return (
    <div
      className={`group grid grid-cols-[1.2fr_2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/40 transition-colors ${
        !isLast ? 'border-b border-border/60' : ''
      }`}
    >
      {/* Sale number */}
      <div className="min-w-0">
        <p className="text-sm font-mono font-medium text-foreground truncate">{sale.saleNumber}</p>
      </div>

      {/* Contact */}
      <div className="min-w-0">
        {sale.contactName ? (
          <>
            <p className="text-sm font-medium text-foreground truncate">{sale.contactName}</p>
            {displayPhone && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{displayPhone}</p>
            )}
          </>
        ) : displayPhone ? (
          <p className="text-sm font-mono text-muted-foreground">{displayPhone}</p>
        ) : (
          <span className="text-xs text-muted-foreground/50">Sin contacto</span>
        )}
      </div>

      {/* Date */}
      <div>
        <span className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</span>
        {sale.dueDate && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">Vence: {formatDate(sale.dueDate)}</p>
        )}
      </div>

      {/* Status */}
      <div>
        <Badge className={`${cfg.badgeClass} border text-xs font-medium px-2 py-0.5`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass} mr-1.5 inline-block`} />
          {cfg.label}
        </Badge>
      </div>

      {/* Total */}
      <div>
        <span className="text-sm font-semibold tabular-nums">
          {formatPrice(sale.total, sale.currency)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Editar
            </DropdownMenuItem>
            {(sale.status === 'draft' || sale.status === 'confirmed') && (
              <DropdownMenuItem onClick={onMarkPaid}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                Marcar como pagada
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ---- Empty state ---------------------------------------------------------

function EmptyState({ hasSales, onNew }: { hasSales: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
        <Receipt className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {hasSales ? 'Sin resultados' : 'Sin ventas'}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        {hasSales
          ? 'Prueba con otra búsqueda o cambia el filtro de estado.'
          : 'Registra tu primera venta para comenzar a hacer seguimiento de ingresos.'}
      </p>
      {!hasSales && (
        <Button size="sm" onClick={onNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nueva venta
        </Button>
      )}
    </div>
  );
}
