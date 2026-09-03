'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Globe, Tag, X, RefreshCw, User } from 'lucide-react';

export type DomainFormData = {
  id?: number;
  name: string;
  registrar: string;
  expiresAt: string;
  registeredAt: string;
  autoRenew: boolean;
  status: 'active' | 'expiring_soon' | 'expired' | 'transferred';
  contactId: number | null;
  notes: string;
  price: string;
  currency: string;
  tags: string[];
  notifyDaysBefore: number;
};

function defaultDates() {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { registeredAt: fmt(today), expiresAt: fmt(nextYear) };
}

const EMPTY: DomainFormData = {
  name: '',
  registrar: '',
  ...defaultDates(),
  autoRenew: false,
  status: 'active',
  contactId: null,
  notes: '',
  price: '',
  currency: 'USD',
  tags: [],
  notifyDaysBefore: 30,
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  expiring_soon: 'Por vencer',
  expired: 'Vencido',
  transferred: 'Transferido',
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface DomainFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: DomainFormData) => Promise<void>;
  initialData?: DomainFormData;
}

export function DomainForm({ open, onOpenChange, onSave, initialData }: DomainFormProps) {
  const [form, setForm] = useState<DomainFormData>(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: contactsData } = useSWR<Array<{ id: number; name: string; phone: string }>>(
    open ? '/api/contacts?limit=200' : null,
    fetcher,
  );

  useEffect(() => {
    if (open) {
      setForm(initialData ?? EMPTY);
      setTagInput('');
    }
  }, [open, initialData]);

    function set<K extends keyof DomainFormData>(key: K, value: DomainFormData[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'registeredAt' && typeof value === 'string' && value) {
        const d = new Date(`${value}T00:00:00`);
        d.setFullYear(d.getFullYear() + 1);
        next.expiresAt = d.toISOString().split('T')[0];
      }
      return next;
    });
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (tag && !form.tags.includes(tag)) {
      set('tags', [...form.tags, tag]);
    }
    setTagInput('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const contacts = contactsData && !('error' in contactsData) ? (contactsData as Array<{ id: number; name: string; phone: string }>) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            {initialData?.id ? 'Editar dominio' : 'Agregar dominio'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Domain name */}
          <div className="space-y-1.5">
            <Label htmlFor="domain-name">Dominio *</Label>
            <Input
              id="domain-name"
              placeholder="ejemplo.com"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Registrar */}
            <div className="space-y-1.5">
              <Label>Registrador</Label>
              <Input
                placeholder="GoDaddy, Namecheap..."
                value={form.registrar}
                onChange={e => set('registrar', e.target.value)}
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={v => set('status', v as DomainFormData['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Registered at */}
            <div className="space-y-1.5">
              <Label>Fecha de registro</Label>
              <Input
                type="date"
                value={form.registeredAt}
                onChange={e => set('registeredAt', e.target.value)}
              />
            </div>

            {/* Expires at */}
            <div className="space-y-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={e => set('expiresAt', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Price */}
            <div className="space-y-1.5">
              <Label>Precio (centavos)</Label>
              <Input
                type="number"
                placeholder="1200"
                value={form.price}
                onChange={e => set('price', e.target.value)}
              />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={form.currency} onValueChange={v => set('currency', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="CLP">CLP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Notify days */}
            <div className="space-y-1.5">
              <Label>Avisar (días antes)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.notifyDaysBefore}
                onChange={e => set('notifyDaysBefore', parseInt(e.target.value) || 30)}
              />
            </div>

            {/* Auto renew */}
            <div className="space-y-1.5">
              <Label>Renovación automática</Label>
              <div className="flex items-center gap-3 h-10">
                <button
                  type="button"
                  onClick={() => set('autoRenew', !form.autoRenew)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    form.autoRenew ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      form.autoRenew ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 inline mr-1" />
                  {form.autoRenew ? 'Sí' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Contacto asociado (opcional)
            </Label>
            <Select
              value={form.contactId?.toString() ?? 'none'}
              onValueChange={v => set('contactId', v === 'none' ? null : parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin contacto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin contacto</SelectItem>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name || c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Etiquetas
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => set('tags', form.tags.filter(t => t !== tag))}
                    className="rounded-full hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder="Agregar etiqueta y presionar Enter"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
                if (e.key === ',' || e.key === ' ') { e.preventDefault(); addTag(tagInput); }
              }}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <textarea
              rows={3}
              placeholder="Información adicional sobre este dominio..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving || !form.name.trim()}>
              {saving ? 'Guardando...' : initialData?.id ? 'Guardar cambios' : 'Agregar dominio'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
