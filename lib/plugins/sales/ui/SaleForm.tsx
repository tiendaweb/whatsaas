'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';

// ---- Types ---------------------------------------------------------------

export type SaleItemInput = {
  articleId: number | null;
  name: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  total: number;
};

export type SaleFormData = {
  id?: number;
  contactId: number | null;
  saleNumber: string;
  status: 'draft' | 'confirmed' | 'paid' | 'cancelled' | 'refunded';
  currency: string;
  items: SaleItemInput[];
  discountAmount: string;
  taxAmount: string;
  notes: string;
  dueDate: string;
};

type Contact = {
  id: number;
  name: string | null;
  phone: string | null;
  remoteJid?: string | null;
};

type Article = {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  currency: string;
  unit: string;
};

// ---- Constants -----------------------------------------------------------

const CURRENCIES = ['USD', 'ARS', 'PYG', 'MXN', 'EUR', 'COP', 'CLP'];

const STATUS_OPTIONS: { value: SaleFormData['status']; label: string }[] = [
  { value: 'draft',     label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'paid',      label: 'Pagada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded',  label: 'Reembolsada' },
];

const EMPTY_ITEM: SaleItemInput = {
  articleId: null,
  name: '',
  sku: '',
  quantity: '1',
  unitPrice: '',
  total: 0,
};

const EMPTY_FORM: SaleFormData = {
  contactId: null,
  saleNumber: '',
  status: 'draft',
  currency: 'USD',
  items: [],
  discountAmount: '0',
  taxAmount: '0',
  notes: '',
  dueDate: '',
};

// ---- Helpers -------------------------------------------------------------

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

function formatPhone(phone: string | null | undefined, remoteJid?: string | null): string {
  if (phone) return phone;
  if (remoteJid) return remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  return '';
}

function computeItemTotal(item: SaleItemInput): number {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unitPrice) || 0;
  return Math.round(qty * price * 100);
}

// ---- Component -----------------------------------------------------------

interface SaleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: SaleFormData) => Promise<void>;
  initialData?: SaleFormData;
}

export function SaleForm({ open, onOpenChange, onSave, initialData }: SaleFormProps) {
  const { data: contactsData } = useSWR<{ contacts: Contact[] }>(
    open ? '/api/contacts?limit=500' : null,
    fetcher
  );
  const { data: articlesData } = useSWR<Article[]>(
    open ? '/api/plugins/articles' : null,
    fetcher
  );

  const contacts = contactsData?.contacts ?? [];
  const articles = articlesData ?? [];

  const [form, setForm] = useState<SaleFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialData ?? EMPTY_FORM);
    }
  }, [open, initialData]);

  function setField<K extends keyof SaleFormData>(key: K, value: SaleFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // ---- Item helpers --------------------------------------------------------

  function addItem() {
    setField('items', [...form.items, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx: number) {
    setField('items', form.items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<SaleItemInput>) {
    setForm(prev => {
      const items = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, ...patch };
        updated.total = computeItemTotal(updated);
        return updated;
      });
      return { ...prev, items };
    });
  }

  function selectArticle(idx: number, articleId: string) {
    if (articleId === '__none__') {
      updateItem(idx, { articleId: null, name: '', sku: '', unitPrice: '' });
      return;
    }
    const art = articles.find(a => a.id === parseInt(articleId, 10));
    if (!art) return;
    updateItem(idx, {
      articleId: art.id,
      name: art.name,
      sku: art.sku ?? '',
      unitPrice: (art.price / 100).toFixed(2),
    });
  }

  // ---- Computed totals -----------------------------------------------------

  const subtotalCents = useMemo(
    () => form.items.reduce((sum, item) => sum + item.total, 0),
    [form.items]
  );

  const discountCents = Math.round(parseFloat(form.discountAmount || '0') * 100);
  const taxCents      = Math.round(parseFloat(form.taxAmount || '0') * 100);
  const totalCents    = subtotalCents - discountCents + taxCents;

  function formatCents(cents: number) {
    return (cents / 100).toFixed(2);
  }

  function displayPrice(cents: number) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: form.currency || 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  }

  // ---- Save ----------------------------------------------------------------

  async function handleSave() {
    if (!form.saleNumber.trim()) {
      alert('El número de venta es requerido');
      return;
    }
    setIsSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  // ---- Render --------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Editar venta' : 'Nueva venta'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Row 1: Contact + Sale Number */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contacto</Label>
              <Select
                value={form.contactId != null ? String(form.contactId) : '__none__'}
                onValueChange={v => setField('contactId', v === '__none__' ? null : parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin contacto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin contacto</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name || formatPhone(c.phone, c.remoteJid)}
                      {c.name && c.phone ? ` · ${formatPhone(c.phone, c.remoteJid)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sale-number">
                Número de venta <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sale-number"
                placeholder="VTA-001"
                value={form.saleNumber}
                onChange={e => setField('saleNumber', e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Status + Currency + Due Date */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={v => setField('status', v as SaleFormData['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={form.currency} onValueChange={v => setField('currency', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sale-due">Fecha de vencimiento</Label>
              <Input
                id="sale-due"
                type="date"
                value={form.dueDate}
                onChange={e => setField('dueDate', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Artículos / Líneas</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                className="h-7 px-2.5 text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar línea
              </Button>
            </div>

            {form.items.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[2fr_0.6fr_1fr_0.8fr_auto] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Artículo</span>
                  <span>Cant.</span>
                  <span>Precio unit.</span>
                  <span>Total</span>
                  <span />
                </div>

                {/* Items */}
                {form.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-[2fr_0.6fr_1fr_0.8fr_auto] gap-2 px-3 py-2 items-center ${
                      idx < form.items.length - 1 ? 'border-b border-border/60' : ''
                    }`}
                  >
                    {/* Article selector or free name */}
                    <div className="min-w-0">
                      <Select
                        value={item.articleId != null ? String(item.articleId) : '__none__'}
                        onValueChange={v => selectArticle(idx, v)}
                      >
                        <SelectTrigger className="h-8 text-xs mb-1">
                          <SelectValue placeholder="Seleccionar artículo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Escribir manualmente</SelectItem>
                          {articles.map(a => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                              {a.sku ? ` (${a.sku})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.articleId == null && (
                        <Input
                          placeholder="Nombre del artículo"
                          value={item.name}
                          onChange={e => updateItem(idx, { name: e.target.value })}
                          className="h-7 text-xs"
                        />
                      )}
                    </div>

                    {/* Quantity */}
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={e => updateItem(idx, { quantity: e.target.value })}
                      className="h-8 text-xs tabular-nums"
                    />

                    {/* Unit price */}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChange={e => updateItem(idx, { unitPrice: e.target.value })}
                      className="h-8 text-xs tabular-nums"
                    />

                    {/* Total */}
                    <span className="text-xs font-medium tabular-nums text-right pr-1">
                      {displayPrice(item.total)}
                    </span>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Subtotal */}
                <div className="px-3 py-2 bg-muted/20 border-t border-border flex justify-end">
                  <span className="text-xs text-muted-foreground mr-3">Subtotal</span>
                  <span className="text-xs font-semibold tabular-nums">{displayPrice(subtotalCents)}</span>
                </div>
              </div>
            )}

            {form.items.length === 0 && (
              <div className="rounded-lg border border-dashed border-border py-8 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Sin líneas — haz clic en &ldquo;Agregar línea&rdquo; para comenzar
                </p>
              </div>
            )}
          </div>

          {/* Discount + Tax */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-discount">Descuento ({form.currency})</Label>
              <Input
                id="sale-discount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.discountAmount}
                onChange={e => setField('discountAmount', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-tax">Impuesto ({form.currency})</Label>
              <Input
                id="sale-tax"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.taxAmount}
                onChange={e => setField('taxAmount', e.target.value)}
              />
            </div>
          </div>

          {/* Total computed */}
          <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{displayPrice(totalCents)}</span>
          </div>

          {/* Breakdown detail */}
          {(discountCents > 0 || taxCents > 0) && (
            <div className="text-xs text-muted-foreground space-y-0.5 px-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{displayPrice(subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Descuento</span>
                  <span className="tabular-nums">- {displayPrice(discountCents)}</span>
                </div>
              )}
              {taxCents > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Impuesto</span>
                  <span className="tabular-nums">+ {displayPrice(taxCents)}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="sale-notes">Notas</Label>
            <Textarea
              id="sale-notes"
              placeholder="Notas internas o para el cliente..."
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="h-8 px-3 text-sm"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8 px-4 text-sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Guardando...
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
