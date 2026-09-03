'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Globe, Plus, Search, X, Calendar, RefreshCw, User,
  AlertTriangle, CheckCircle2, Clock, MoreHorizontal,
  Pencil, Trash2, Tag, Building2, ExternalLink, Store,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DomainForm, DomainFormData } from './DomainForm';

type DomainStatus = 'active' | 'expiring_soon' | 'expired' | 'transferred';

type Domain = {
  id: number;
  name: string;
  registrar: string | null;
  expiresAt: string | null;
  registeredAt: string | null;
  autoRenew: boolean;
  status: DomainStatus;
  contactId: number | null;
  contactName: string | null;
  customerId: number | null;
  customerName: string | null;
  notes: string;
  price: number | null;
  currency: string;
  tags: string[];
  notifyDaysBefore: number;
  source: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_CONFIG: Record<DomainStatus, {
  label: string;
  pill: string;
  icon: React.ElementType;
}> = {
  active: {
    label: 'Activo',
    pill: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
  },
  expiring_soon: {
    label: 'Por vencer',
    pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
  },
  expired: {
    label: 'Vencido',
    pill: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800',
    icon: AlertTriangle,
  },
  transferred: {
    label: 'Transferido',
    pill: 'bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800',
    icon: RefreshCw,
  },
};

type ViewType = 'list' | 'calendar';
type FilterStatus = 'all' | DomainStatus;

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
};

function getDaysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(price: number | null, currency: string): string {
  if (!price) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(price / 100);
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKDAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function CalendarView({ domains, onEdit, onDelete }: { domains: Domain[]; onEdit: (d: Domain) => void; onDelete: (id: number) => void }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDay = new Date(year, month, 1).getDay();

  const byDate: Record<string, Domain[]> = {};
  domains.forEach(d => {
    if (d.expiresAt) {
      const key = d.expiresAt.split('T')[0];
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(d);
    }
  });

  const isToday = (dateStr: string) => {
    const t = new Date();
    return dateStr === `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < startingDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const selectedDomains = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold">{MONTHS[month]} {year}</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date(year, month - 1))}>‹</Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date(year, month + 1))}>›</Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} className="aspect-square" />;
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const dayDomains = byDate[dateStr] ?? [];
            const hasExpiry = dayDomains.length > 0;
            const today = isToday(dateStr);
            const isSelected = selectedDate === dateStr;
            const hasExpired = dayDomains.some(d => d.status === 'expired' || (d.expiresAt && new Date(d.expiresAt) < new Date()));

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`aspect-square rounded-lg border-2 p-1 text-xs font-semibold transition-colors ${
                  isSelected ? 'border-primary bg-primary/10' :
                  today ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' :
                  hasExpiry ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-900/10' :
                  'border-border hover:border-muted-foreground/30'
                } ${hasExpired ? 'text-destructive' : ''}`}
              >
                <div className="h-full flex flex-col justify-between">
                  <span>{day}</span>
                  {hasExpiry && (
                    <div className="flex gap-0.5 justify-center">
                      {dayDomains.slice(0, 3).map((_, i) => (
                        <div key={i} className="h-1 w-1 rounded-full bg-amber-500" />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 h-fit">
        <h3 className="font-semibold mb-4 text-sm">
          {selectedDate
            ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
            : 'Selecciona un día'}
        </h3>
        {selectedDomains.length === 0 ? (
          <p className="text-xs text-muted-foreground">{selectedDate ? 'Sin vencimientos' : ''}</p>
        ) : (
          <div className="space-y-2">
            {selectedDomains.map(d => (
              <div key={d.id} className="rounded-lg border border-border/50 bg-background p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{d.name}</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onEdit(d)} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={() => onDelete(d.id)} className="h-6 w-6 flex items-center justify-center rounded text-destructive/60 hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {d.registrar && <p className="text-xs text-muted-foreground">{d.registrar}</p>}
                <DomainStatusBadge status={d.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.pill}`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

export function DomainsDashboard() {
  const { data, mutate } = useSWR<Domain[]>('/api/plugins/domains', fetcher);
  const [view, setView] = useState<ViewType>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Domain | null>(null);

  const domains = data ?? [];

  const stats = useMemo(() => {
    const now = Date.now();
    const soon = 30 * 24 * 60 * 60 * 1000;
    return {
      total: domains.length,
      active: domains.filter(d => d.status === 'active').length,
      expiringSoon: domains.filter(d => {
        if (!d.expiresAt) return false;
        const diff = new Date(d.expiresAt).getTime() - now;
        return diff > 0 && diff <= soon;
      }).length,
      expired: domains.filter(d => d.status === 'expired' || (d.expiresAt && new Date(d.expiresAt) < new Date())).length,
    };
  }, [domains]);

  const filtered = useMemo(() => {
    let list = domains;
    if (filterStatus !== 'all') list = list.filter(d => d.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.registrar?.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [domains, filterStatus, search]);

  // Sort: expired/expiring first, then by expiry date
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
      const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
      return aExp - bExp;
    });
  }, [filtered]);

  async function saveDomain(formData: DomainFormData) {
    const payload = {
      name: formData.name,
      registrar: formData.registrar || null,
      expiresAt: formData.expiresAt || null,
      registeredAt: formData.registeredAt || null,
      autoRenew: formData.autoRenew,
      status: formData.status,
      contactId: formData.contactId,
      notes: formData.notes,
      price: formData.price ? parseInt(formData.price) : null,
      currency: formData.currency,
      tags: formData.tags,
      notifyDaysBefore: formData.notifyDaysBefore,
    };

    if (formData.id) {
      await fetch(`/api/plugins/domains/${formData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/plugins/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    mutate();
    setEditing(null);
  }

  async function deleteDomain(id: number) {
    if (!confirm('¿Eliminar este dominio?')) return;
    await fetch(`/api/plugins/domains/${id}`, { method: 'DELETE' });
    mutate();
  }

  function openEdit(domain: Domain) {
    setEditing(domain);
    setFormOpen(true);
  }

  const editingFormData: DomainFormData | undefined = editing ? {
    id: editing.id,
    name: editing.name,
    registrar: editing.registrar ?? '',
    expiresAt: editing.expiresAt ? editing.expiresAt.split('T')[0] : '',
    registeredAt: editing.registeredAt ? editing.registeredAt.split('T')[0] : '',
    autoRenew: editing.autoRenew,
    status: editing.status,
    contactId: editing.contactId,
    notes: editing.notes,
    price: editing.price ? String(editing.price) : '',
    currency: editing.currency,
    tags: editing.tags,
    notifyDaysBefore: editing.notifyDaysBefore,
  } : undefined;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dominios</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gestiona vencimientos, registradores y renovaciones
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar dominio..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 w-44 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* View toggle */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              {(['list', 'calendar'] as ViewType[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-all ${
                    view === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v === 'list' ? 'Lista' : 'Calendario'}
                </button>
              ))}
            </div>

            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </Button>
          </div>
        </div>

        {/* Stats + filter */}
        {domains.length > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-4">
              <StatCard icon={Globe} label="Total" value={stats.total} color="text-muted-foreground" />
              <StatCard icon={CheckCircle2} label="Activos" value={stats.active} color="text-emerald-500" />
              <StatCard icon={AlertTriangle} label="Por vencer" value={stats.expiringSoon} color="text-amber-500" />
              {stats.expired > 0 && <StatCard icon={AlertTriangle} label="Vencidos" value={stats.expired} color="text-destructive" />}
            </div>

            {/* Status filter */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              {(['all', 'active', 'expiring_soon', 'expired'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`h-6 px-2 rounded-md text-[10px] font-medium transition-all ${
                    filterStatus === s ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'all' ? 'Todos' : STATUS_CONFIG[s as DomainStatus]?.label ?? s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {domains.length === 0 ? (
          <EmptyState onAdd={() => setFormOpen(true)} />
        ) : view === 'calendar' ? (
          <CalendarView domains={filtered} onEdit={openEdit} onDelete={deleteDomain} />
        ) : (
          <ListView domains={sorted} onEdit={openEdit} onDelete={deleteDomain} />
        )}
      </div>

      <DomainForm
        open={formOpen}
        onOpenChange={open => { setFormOpen(open); if (!open) setEditing(null); }}
        onSave={saveDomain}
        initialData={editingFormData}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
        <Globe className="h-8 w-8 text-white" />
      </div>
      <div>
        <p className="font-semibold text-base">Sin dominios registrados</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Agrega tus dominios para controlar vencimientos y renovaciones desde un solo lugar.
        </p>
      </div>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" />
        Agregar primer dominio
      </Button>
    </div>
  );
}

function ListView({ domains, onEdit, onDelete }: { domains: Domain[]; onEdit: (d: Domain) => void; onDelete: (id: number) => void }) {
  if (domains.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">Sin resultados para los filtros actuales</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[1fr_120px_130px_100px_80px_40px] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dominio</span>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Registrador</span>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Vencimiento</span>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estado</span>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Precio</span>
        <span />
      </div>

      {domains.map((d, i) => {
        const daysLeft = getDaysUntilExpiry(d.expiresAt);
        const isLast = i === domains.length - 1;
        const isUrgent = daysLeft !== null && daysLeft <= d.notifyDaysBefore && daysLeft >= 0;
        const isExpired = daysLeft !== null && daysLeft < 0;

        return (
          <div
            key={d.id}
            className={`group grid md:grid-cols-[1fr_120px_130px_100px_80px_40px] gap-4 items-center px-4 py-3.5 hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border/50' : ''}`}
          >
            {/* Name */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Globe className={`h-3.5 w-3.5 shrink-0 ${isExpired ? 'text-destructive' : isUrgent ? 'text-amber-500' : 'text-muted-foreground'}`} />
                <span className="font-medium text-sm truncate">{d.name}</span>
                {d.autoRenew && (
                  <span title="Renovación automática">
                    <RefreshCw className="h-3 w-3 text-blue-500 shrink-0" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 md:hidden">
                {d.registrar && <span className="text-xs text-muted-foreground">{d.registrar}</span>}
              </div>
              {d.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {d.tags.slice(0, 3).map(t => (
                    <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                      <Tag className="h-2 w-2" />{t}
                    </span>
                  ))}
                </div>
              )}
              {d.contactName && (
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                  <User className="h-2.5 w-2.5" />{d.contactName}
                </div>
              )}
              {d.customerName && (
                <Link
                  href={`/plugins/customers/${d.customerId}`}
                  className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground hover:text-primary hover:underline w-fit"
                >
                  <Store className="h-2.5 w-2.5" />{d.customerName}
                </Link>
              )}
            </div>

            {/* Registrar */}
            <span className="hidden md:block text-xs text-muted-foreground truncate">
              {d.registrar || '—'}
            </span>

            {/* Expiry */}
            <div className="hidden md:flex items-center gap-1.5">
              <Calendar className={`h-3 w-3 ${isExpired ? 'text-destructive' : isUrgent ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <div>
                <span className={`text-xs ${isExpired ? 'text-destructive font-semibold' : isUrgent ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}`}>
                  {formatDate(d.expiresAt)}
                </span>
                {daysLeft !== null && (
                  <p className={`text-[10px] ${isExpired ? 'text-destructive' : isUrgent ? 'text-amber-500' : 'text-muted-foreground'}`}>
                    {isExpired ? `Hace ${Math.abs(daysLeft)}d` : `En ${daysLeft}d`}
                  </p>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="hidden md:block">
              <DomainStatusBadge status={d.status} />
            </div>

            {/* Price */}
            <span className="hidden md:block text-xs text-muted-foreground">
              {formatPrice(d.price, d.currency)}
            </span>

            {/* Actions */}
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(d)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(d.id)}
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
      })}
    </div>
  );
}
