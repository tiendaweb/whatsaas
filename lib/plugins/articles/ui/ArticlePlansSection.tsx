'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Loader2, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BILLING_MODES, billingModeLabel, type BillingMode } from '../constants';

type Plan = {
  id: number;
  name: string;
  description: string;
  includedItems: string[];
  billingMode: BillingMode;
  billingLabel: string | null;
  price: number;
  currency: string;
  companyName: string | null;
  status: 'active' | 'inactive';
};

type PlanFormData = {
  id?: number;
  name: string;
  description: string;
  includedItems: string[];
  billingMode: BillingMode;
  billingLabel: string;
  price: string;
  currency: string;
  companyName: string;
};

const EMPTY_PLAN: PlanFormData = {
  name: '',
  description: '',
  includedItems: [],
  billingMode: 'monthly',
  billingLabel: '',
  price: '',
  currency: 'USD',
  companyName: '',
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

export function ArticlePlansSection({ articleId }: { articleId: number }) {
  const { data: plans, mutate } = useSWR<Plan[]>(`/api/plugins/articles/${articleId}/plans`, fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlanFormData | undefined>(undefined);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  function handleNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(plan: Plan) {
    setEditing({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      includedItems: plan.includedItems,
      billingMode: plan.billingMode,
      billingLabel: plan.billingLabel ?? '',
      price: (plan.price / 100).toFixed(2),
      currency: plan.currency,
      companyName: plan.companyName ?? '',
    });
    setFormOpen(true);
  }

  async function handleSave(form: PlanFormData) {
    const payload = {
      name: form.name,
      description: form.description,
      includedItems: form.includedItems,
      billingMode: form.billingMode,
      billingLabel: form.billingMode === 'custom' ? form.billingLabel : null,
      price: Math.round(parseFloat(form.price || '0') * 100),
      currency: form.currency,
      companyName: form.companyName || null,
    };

    const res = await fetch(
      form.id ? `/api/plugins/articles/${articleId}/plans/${form.id}` : `/api/plugins/articles/${articleId}/plans`,
      {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      toast.error('No se pudo guardar el plan');
      return false;
    }
    toast.success(form.id ? 'Plan actualizado' : 'Plan creado');
    mutate();
    return true;
  }

  async function handleDelete() {
    if (!planToDelete) return;
    const res = await fetch(`/api/plugins/articles/${articleId}/plans/${planToDelete.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar el plan');
      return;
    }
    toast.success('Plan eliminado');
    mutate();
    setPlanToDelete(null);
  }

  const items = plans ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define las variantes de membresía (ej. Básico, Pro, Premium), cada una con su propia frecuencia y precio.
        </p>
        <Button type="button" size="sm" onClick={handleNew} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" />
          Nuevo plan
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6 border border-dashed border-border rounded-lg">
          Todavía no hay planes para esta membresía.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(plan => (
            <div key={plan.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(plan.price, plan.currency)}{' '}
                    <span className="text-xs">/ {billingModeLabel(plan.billingMode, plan.billingLabel)}</span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => handleEdit(plan)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setPlanToDelete(plan)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {plan.description && <p className="text-xs text-muted-foreground">{plan.description}</p>}

              {plan.includedItems.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  {plan.includedItems.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}

              {plan.companyName && (
                <Badge variant="outline" className="text-xs font-normal gap-1">
                  <Building2 className="h-3 w-3" />
                  {plan.companyName}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <PlanFormDialog open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} initialData={editing} />

      {planToDelete && (
        <Dialog open onOpenChange={open => !open && setPlanToDelete(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>¿Eliminar &quot;{planToDelete.name}&quot;?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPlanToDelete(null)}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete}>Eliminar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PlanFormDialog({
  open,
  onOpenChange,
  onSave,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: PlanFormData) => Promise<boolean>;
  initialData?: PlanFormData;
}) {
  const [form, setForm] = useState<PlanFormData>(EMPTY_PLAN);
  const [itemInput, setItemInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function set<K extends keyof PlanFormData>(key: K, value: PlanFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function addItem() {
    const v = itemInput.trim();
    if (v) {
      set('includedItems', [...form.includedItems, v]);
      setItemInput('');
    }
  }

  function removeItem(index: number) {
    set('includedItems', form.includedItems.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert('El nombre del plan es requerido');
      return;
    }
    if (form.billingMode === 'custom' && !form.billingLabel.trim()) {
      alert('Escribe una etiqueta para el modo de cobro "Otro"');
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onSave(form);
      if (ok) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (next) {
          setForm(initialData ?? EMPTY_PLAN);
          setItemInput('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Plan Premium" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Breve descripción</Label>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className="resize-none text-sm"
              placeholder="Qué incluye este plan, en pocas palabras..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Precio</Label>
              <Input type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Frecuencia</Label>
              <Select value={form.billingMode} onValueChange={v => set('billingMode', v as BillingMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_MODES.map(mode => (
                    <SelectItem key={mode} value={mode}>{billingModeLabel(mode)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.billingMode === 'custom' && (
            <div className="space-y-1.5">
              <Label>Etiqueta personalizada <span className="text-destructive">*</span></Label>
              <Input value={form.billingLabel} onChange={e => set('billingLabel', e.target.value)} placeholder="Ej: Pago semestral" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Ítems incluidos</Label>
            <div className="flex gap-2">
              <Input
                value={itemInput}
                onChange={e => setItemInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                placeholder="Ej: Acceso a sala de pesas"
                className="h-8 text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8 px-3 text-xs">Agregar</Button>
            </div>
            {form.includedItems.length > 0 && (
              <ul className="space-y-1">
                {form.includedItems.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-muted/40 rounded px-2 py-1">
                    {item}
                    <button type="button" onClick={() => removeItem(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Empresa / cliente (opcional)</Label>
            <Input
              value={form.companyName}
              onChange={e => set('companyName', e.target.value)}
              placeholder="Ej: Acme Corp — dejar vacío para un plan público"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
