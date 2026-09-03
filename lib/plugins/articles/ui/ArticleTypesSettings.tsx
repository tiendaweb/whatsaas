'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Package, Boxes, ListPlus, X } from 'lucide-react';
import {
  ARTICLE_KINDS,
  ARTICLE_KIND_LABELS,
  ARTICLE_TYPE_FIELD_CONFIG_KEYS,
  ARTICLE_TYPE_FIELD_CONFIG_LABELS,
  BILLING_MODES,
  BILLING_MODE_LABELS,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES_WITH_PRICE,
  KIND_ICON,
  KIND_DEFAULT_TRACKS_STOCK,
  billingModeLabel,
  type ArticleKind,
  type ArticleCustomFieldDef,
  type ArticleTypeFieldConfigKeys,
  type BillingMode,
  type CustomFieldType,
} from '../constants';

type ArticleTypeRecord = {
  id: number;
  name: string;
  kind: ArticleKind;
  billingMode: BillingMode;
  billingLabel: string | null;
  tracksStock: boolean;
  fieldConfig: Partial<Record<ArticleTypeFieldConfigKeys, boolean>>;
  position: number;
};

type TypeFormData = {
  id?: number;
  name: string;
  kind: ArticleKind;
  billingMode: BillingMode;
  billingLabel: string;
  tracksStock: boolean;
  fieldConfig: Partial<Record<ArticleTypeFieldConfigKeys, boolean>>;
};

const EMPTY_TYPE_FORM: TypeFormData = {
  name: '',
  kind: 'physical',
  billingMode: 'one_time',
  billingLabel: '',
  tracksStock: true,
  fieldConfig: {},
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export function ArticleTypesSettings() {
  const { data, mutate } = useSWR<ArticleTypeRecord[]>('/api/plugins/article-types', fetcher);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TypeFormData | undefined>(undefined);
  const [typeToDelete, setTypeToDelete] = useState<ArticleTypeRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [fieldsType, setFieldsType] = useState<ArticleTypeRecord | null>(null);

  const types = data ?? [];

  function handleNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(type: ArticleTypeRecord) {
    setEditing({
      id: type.id,
      name: type.name,
      kind: type.kind,
      billingMode: type.billingMode,
      billingLabel: type.billingLabel ?? '',
      tracksStock: type.tracksStock,
      fieldConfig: type.fieldConfig ?? {},
    });
    setFormOpen(true);
  }

  async function handleSave(form: TypeFormData) {
    const payload = {
      name: form.name,
      kind: form.kind,
      billingMode: form.billingMode,
      billingLabel: form.billingMode === 'custom' ? form.billingLabel || null : null,
      tracksStock: form.tracksStock,
      fieldConfig: form.fieldConfig,
    };

    const res = await fetch(form.id ? `/api/plugins/article-types/${form.id}` : '/api/plugins/article-types', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'No se pudo guardar el tipo de artículo');
      return false;
    }

    toast.success(form.id ? 'Tipo actualizado' : 'Tipo creado');
    mutate();
    return true;
  }

  async function handleDelete() {
    if (!typeToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/plugins/article-types/${typeToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('No se pudo eliminar el tipo de artículo');
        return;
      }
      toast.success('Tipo eliminado');
      mutate();
    } finally {
      setIsDeleting(false);
      setTypeToDelete(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/plugins/articles"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1"
            >
              <ArrowLeft className="h-3 w-3" /> Volver a Artículos
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Tipos de artículo</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define los tipos de artículo de tu catálogo (productos físicos, digitales, membresías, servicios...) y cómo se cobra cada uno.
            </p>
          </div>
          <Button size="sm" onClick={handleNew} className="h-9 gap-1.5 px-3 text-sm">
            <Plus className="h-3.5 w-3.5" />
            Nuevo tipo
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {types.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <Boxes className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">Sin tipos de artículo</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Crea tu primer tipo para empezar a clasificar tu catálogo.
            </p>
            <Button size="sm" onClick={handleNew} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nuevo tipo
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {types.map(type => {
              const Icon = KIND_ICON[type.kind] ?? Package;
              return (
                <div
                  key={type.id}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{type.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs font-normal">
                        {ARTICLE_KIND_LABELS[type.kind] ?? type.kind}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-normal">
                        {billingModeLabel(type.billingMode, type.billingLabel)}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                        {type.tracksStock ? 'Con stock' : 'Sin stock'}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => handleEdit(type)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFieldsType(type)}>
                        <ListPlus className="h-3.5 w-3.5 mr-2" />
                        Campos personalizados
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setTypeToDelete(type)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ArticleTypeForm open={formOpen} onOpenChange={setFormOpen} onSave={handleSave} initialData={editing} />

      {fieldsType && (
        <CustomFieldsDialog
          type={fieldsType}
          open
          onOpenChange={open => !open && setFieldsType(null)}
        />
      )}

      <AlertDialog open={!!typeToDelete} onOpenChange={open => !open && setTypeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este tipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Los artículos que usen &quot;{typeToDelete?.name}&quot; quedarán sin tipo asignado. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ArticleTypeForm({
  open,
  onOpenChange,
  onSave,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: TypeFormData) => Promise<boolean>;
  initialData?: TypeFormData;
}) {
  const [form, setForm] = useState<TypeFormData>(EMPTY_TYPE_FORM);
  const [isSaving, setIsSaving] = useState(false);

  function set<K extends keyof TypeFormData>(key: K, value: TypeFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleKindChange(kind: ArticleKind) {
    setForm(prev => ({ ...prev, kind, tracksStock: KIND_DEFAULT_TRACKS_STOCK[kind] }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert('El nombre del tipo es requerido');
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
        if (next) setForm(initialData ?? EMPTY_TYPE_FORM);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Editar tipo de artículo' : 'Nuevo tipo de artículo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="type-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="type-name"
              placeholder="Ej: Membresía Premium"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Naturaleza</Label>
            <Select value={form.kind} onValueChange={v => handleKindChange(v as ArticleKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARTICLE_KINDS.map(kind => (
                  <SelectItem key={kind} value={kind}>{ARTICLE_KIND_LABELS[kind]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Modo de cobro</Label>
            <Select value={form.billingMode} onValueChange={v => set('billingMode', v as BillingMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILLING_MODES.map(mode => (
                  <SelectItem key={mode} value={mode}>{BILLING_MODE_LABELS[mode]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.billingMode === 'custom' && (
            <div className="space-y-1.5">
              <Label htmlFor="type-billing-label">
                Etiqueta personalizada <span className="text-destructive">*</span>
              </Label>
              <Input
                id="type-billing-label"
                placeholder="Ej: Pago semestral"
                value={form.billingLabel}
                onChange={e => set('billingLabel', e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Controla stock</p>
              <p className="text-xs text-muted-foreground">Activa si los artículos de este tipo llevan inventario.</p>
            </div>
            <Switch checked={form.tracksStock} onCheckedChange={v => set('tracksStock', v)} />
          </div>

          <div className="space-y-2">
            <Label>Campos visibles</Label>
            <p className="text-xs text-muted-foreground">
              Desactiva los campos que no apliquen a este tipo de artículo (ej. Unidad para una membresía).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ARTICLE_TYPE_FIELD_CONFIG_KEYS.map(key => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2.5 py-1.5">
                  {ARTICLE_TYPE_FIELD_CONFIG_LABELS[key]}
                  <Switch
                    checked={form.fieldConfig[key] !== false}
                    onCheckedChange={v => set('fieldConfig', { ...form.fieldConfig, [key]: v })}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving} className="h-8 px-3 text-sm">
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 px-4 text-sm">
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

type FieldFormData = {
  id?: number;
  name: string;
  type: CustomFieldType;
  required: boolean;
  hasPrice: boolean;
  price: string;
  options: { id: string; label: string; priceModifier: string }[];
};

const EMPTY_FIELD_FORM: FieldFormData = {
  name: '',
  type: 'text',
  required: false,
  hasPrice: false,
  price: '',
  options: [],
};

const fieldsFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

function CustomFieldsDialog({
  type,
  open,
  onOpenChange,
}: {
  type: ArticleTypeRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, mutate } = useSWR<ArticleCustomFieldDef[]>(`/api/plugins/article-types/${type.id}/fields`, fieldsFetcher);
  const [form, setForm] = useState<FieldFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [optionInput, setOptionInput] = useState({ label: '', priceModifier: '' });

  const fields = data ?? [];

  function set<K extends keyof FieldFormData>(key: K, value: FieldFormData[K]) {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  }

  function startCreate() {
    setForm(EMPTY_FIELD_FORM);
    setOptionInput({ label: '', priceModifier: '' });
  }

  function startEdit(field: ArticleCustomFieldDef) {
    setForm({
      id: field.id,
      name: field.name,
      type: field.type,
      required: field.required,
      hasPrice: field.hasPrice,
      price: field.hasPrice ? (field.price / 100).toFixed(2) : '',
      options: field.options.map(o => ({ id: o.id, label: o.label, priceModifier: (o.priceModifier / 100).toFixed(2) })),
    });
    setOptionInput({ label: '', priceModifier: '' });
  }

  function addOption() {
    if (!form || !optionInput.label.trim()) return;
    set('options', [
      ...form.options,
      { id: `opt_${Date.now()}`, label: optionInput.label.trim(), priceModifier: optionInput.priceModifier || '0' },
    ]);
    setOptionInput({ label: '', priceModifier: '' });
  }

  function removeOption(id: string) {
    if (!form) return;
    set('options', form.options.filter(o => o.id !== id));
  }

  async function handleSaveField() {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error('El nombre del campo es requerido');
      return;
    }
    if (form.type === 'select' && form.options.length === 0) {
      toast.error('Agrega al menos una opción');
      return;
    }

    setIsSaving(true);
    const payload = {
      name: form.name,
      type: form.type,
      required: form.required,
      hasPrice: form.hasPrice,
      price: form.hasPrice ? Math.round(parseFloat(form.price || '0') * 100) : 0,
      options: form.options.map(o => ({ id: o.id, label: o.label, priceModifier: Math.round(parseFloat(o.priceModifier || '0') * 100) })),
    };

    try {
      const res = await fetch(
        form.id ? `/api/plugins/article-types/${type.id}/fields/${form.id}` : `/api/plugins/article-types/${type.id}/fields`,
        {
          method: form.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error?.message || body.error || 'No se pudo guardar el campo');
        return;
      }
      toast.success(form.id ? 'Campo actualizado' : 'Campo creado');
      mutate();
      setForm(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteField(field: ArticleCustomFieldDef) {
    if (!confirm(`¿Eliminar el campo "${field.name}"?`)) return;
    const res = await fetch(`/api/plugins/article-types/${type.id}/fields/${field.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('No se pudo eliminar el campo');
      return;
    }
    mutate();
  }

  const canHavePrice = form ? CUSTOM_FIELD_TYPES_WITH_PRICE.includes(form.type) : false;

  return (
    <Dialog open={open} onOpenChange={next => { onOpenChange(next); if (!next) setForm(null); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campos personalizados — {type.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {fields.length === 0 && !form && (
            <p className="text-sm text-muted-foreground text-center py-4">Este tipo no tiene campos personalizados todavía.</p>
          )}

          {!form && fields.map(field => (
            <div key={field.id} className="flex items-center gap-2 p-2.5 border border-border rounded-md">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{field.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-xs font-normal">{CUSTOM_FIELD_TYPE_LABELS[field.type]}</Badge>
                  {field.required && <Badge variant="outline" className="text-xs font-normal">Requerido</Badge>}
                  {field.hasPrice && <Badge variant="outline" className="text-xs font-normal">Con precio</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(field)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteField(field)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {!form ? (
            <Button type="button" variant="outline" size="sm" onClick={startCreate} className="w-full gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nuevo campo
            </Button>
          ) : (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Color favorito" autoFocus />
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de dato</Label>
                <Select value={form.type} onValueChange={v => set('type', v as CustomFieldType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-2.5">
                <p className="text-sm">Requerido</p>
                <Switch checked={form.required} onCheckedChange={v => set('required', v)} />
              </div>

              {canHavePrice && (
                <div className="flex items-center justify-between rounded-md border border-border p-2.5">
                  <p className="text-sm">Tiene impacto en el precio</p>
                  <Switch checked={form.hasPrice} onCheckedChange={v => set('hasPrice', v)} />
                </div>
              )}

              {form.type === 'boolean' && form.hasPrice && (
                <div className="space-y-1.5">
                  <Label>Precio adicional (si se marca &quot;Sí&quot;)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
                </div>
              )}

              {form.type === 'select' && (
                <div className="space-y-2">
                  <Label>Opciones</Label>
                  <div className="flex gap-2">
                    <Input
                      value={optionInput.label}
                      onChange={e => setOptionInput(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="Nombre de la opción"
                      className="h-8 text-sm"
                    />
                    {form.hasPrice && (
                      <Input
                        type="number"
                        step="0.01"
                        value={optionInput.priceModifier}
                        onChange={e => setOptionInput(prev => ({ ...prev, priceModifier: e.target.value }))}
                        placeholder="+precio"
                        className="h-8 text-sm w-28"
                      />
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={addOption} className="h-8 px-3 text-xs shrink-0">Agregar</Button>
                  </div>
                  {form.options.length > 0 && (
                    <ul className="space-y-1">
                      {form.options.map(opt => (
                        <li key={opt.id} className="flex items-center justify-between text-sm bg-muted/40 rounded px-2 py-1">
                          <span>{opt.label}{form.hasPrice && parseFloat(opt.priceModifier) !== 0 ? ` (+${opt.priceModifier})` : ''}</span>
                          <button type="button" onClick={() => removeOption(opt.id)} className="text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={isSaving}>Cancelar</Button>
                <Button size="sm" onClick={handleSaveField} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Guardar campo
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
