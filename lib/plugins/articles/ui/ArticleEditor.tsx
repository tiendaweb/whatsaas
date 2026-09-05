'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Tag, X } from 'lucide-react';
import { ArticleVariationsSection } from './ArticleVariationsSection';
import { ArticlePlansSection } from './ArticlePlansSection';
import { formatMoney as formatMoneySeguro, formatMoneyFromCents } from '@/lib/format/money';
import {
  billingModeLabel,
  computeCustomFieldsPriceDelta,
  KIND_ICON,
  type ArticleCustomFieldDef,
  type ArticleKind,
  type ArticleTypeFieldConfigKeys,
} from '../constants';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());
const CURRENCIES = ['USD', 'MXN', 'EUR', 'ARS', 'COP', 'CLP'];

type ArticleTypeSummary = {
  id: number;
  name: string;
  kind: ArticleKind;
  billingMode: string;
  billingLabel: string | null;
  tracksStock: boolean;
  fieldConfig: Partial<Record<ArticleTypeFieldConfigKeys, boolean>>;
};

type ArticleDetail = {
  id: number;
  name: string;
  description: string;
  sku: string | null;
  articleTypeId: number | null;
  price: number;
  currency: string;
  category: string | null;
  unit: string;
  stock: number | null;
  tags: string[];
  customFieldValues: Record<string, string | number | boolean>;
  attributeIds: number[];
  status: 'active' | 'inactive';
};

type FormState = {
  name: string;
  description: string;
  sku: string;
  articleTypeId: number | null;
  price: string;
  currency: string;
  category: string;
  unit: string;
  stock: string;
  tags: string[];
  customFieldValues: Record<string, string | number | boolean>;
  attributeIds: number[];
  status: 'active' | 'inactive';
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  sku: '',
  articleTypeId: null,
  price: '',
  currency: 'USD',
  category: '',
  unit: 'unidad',
  stock: '',
  tags: [],
  customFieldValues: {},
  attributeIds: [],
  status: 'active',
};

function fieldVisible(fieldConfig: Partial<Record<ArticleTypeFieldConfigKeys, boolean>> | undefined, key: ArticleTypeFieldConfigKeys) {
  return fieldConfig?.[key] !== false;
}

export function ArticleEditor({ mode, articleId }: { mode: 'new' | 'edit'; articleId?: number }) {
  const router = useRouter();
  const { data: articleTypes } = useSWR<ArticleTypeSummary[]>('/api/plugins/article-types', fetcher);
  const { data: detail, mutate: mutateDetail } = useSWR<ArticleDetail>(
    mode === 'edit' && articleId ? `/api/plugins/articles/${articleId}` : null,
    fetcher,
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (detail) {
      setForm({
        name: detail.name,
        description: detail.description,
        sku: detail.sku ?? '',
        articleTypeId: detail.articleTypeId,
        price: (detail.price / 100).toFixed(2),
        currency: detail.currency,
        category: detail.category ?? '',
        unit: detail.unit,
        stock: detail.stock != null ? String(detail.stock) : '',
        tags: detail.tags ?? [],
        customFieldValues: detail.customFieldValues ?? {},
        attributeIds: detail.attributeIds ?? [],
        status: detail.status,
      });
    }
  }, [detail]);

  const types = articleTypes ?? [];
  const selectedType = types.find(t => t.id === form.articleTypeId) ?? null;

  const { data: customFields } = useSWR<ArticleCustomFieldDef[]>(
    selectedType ? `/api/plugins/article-types/${selectedType.id}/fields` : null,
    fetcher,
  );
  const fields = customFields ?? [];

  const basePriceCents = Math.round(parseFloat(form.price || '0') * 100) || 0;
  const priceDelta = useMemo(
    () => computeCustomFieldsPriceDelta(fields, form.customFieldValues),
    [fields, form.customFieldValues],
  );
  const totalPriceCents = basePriceCents + priceDelta;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function setCustomFieldValue(key: string, value: string | number | boolean) {
    setForm(prev => ({ ...prev, customFieldValues: { ...prev.customFieldValues, [key]: value } }));
  }

  function handleTypeChange(typeId: number | null) {
    const type = types.find(t => t.id === typeId) ?? null;
    setForm(prev => ({
      ...prev,
      articleTypeId: typeId,
      stock: type && !type.tracksStock ? '' : prev.stock,
    }));
  }

  function handleAddTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      set('tags', [...form.tags, t]);
      setTagInput('');
    }
  }

  function buildPayload() {
    return {
      name: form.name,
      description: form.description,
      sku: form.sku || null,
      articleTypeId: form.articleTypeId,
      price: basePriceCents,
      currency: form.currency,
      category: form.category || null,
      unit: form.unit,
      stock: form.stock !== '' ? parseInt(form.stock, 10) : null,
      tags: form.tags,
      customFieldValues: form.customFieldValues,
      attributeIds: form.attributeIds,
      status: form.status,
    };
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('El nombre del artículo es requerido');
      return;
    }
    if (!form.articleTypeId) {
      toast.error('Selecciona un tipo de artículo');
      return;
    }
    setIsSaving(true);
    try {
      if (mode === 'new') {
        const res = await fetch('/api/plugins/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        toast.success('Artículo creado');
        router.push(`/plugins/articles/${created.id}/edit`);
      } else if (articleId) {
        const res = await fetch(`/api/plugins/articles/${articleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) throw new Error();
        toast.success('Cambios guardados');
        mutateDetail();
      }
    } catch {
      toast.error('No se pudo guardar el artículo');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAttributeIdsChange(ids: number[]) {
    set('attributeIds', ids);
    if (mode === 'edit' && articleId) {
      await fetch(`/api/plugins/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributeIds: ids }),
      });
    }
  }

  if (mode === 'edit' && !detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TypeIcon = selectedType ? KIND_ICON[selectedType.kind] : null;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <Link href="/plugins/articles" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-1">
          <ArrowLeft className="h-3 w-3" /> Volver a Artículos
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {mode === 'new' ? 'Nuevo artículo' : `Editar: ${detail?.name}`}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-5xl">
          <div className="space-y-6">
            {/* 1. Nombre y tipo */}
            <Section title="Nombre y tipo">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre del artículo" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de artículo <span className="text-destructive">*</span></Label>
                <Select value={form.articleTypeId != null ? String(form.articleTypeId) : ''} onValueChange={v => handleTypeChange(v ? Number(v) : null)}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un tipo..." /></SelectTrigger>
                  <SelectContent>
                    {types.map(type => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name} — {billingModeLabel(type.billingMode, type.billingLabel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && (
                  <p className="text-xs text-muted-foreground">
                    Se factura: {billingModeLabel(selectedType.billingMode, selectedType.billingLabel)}
                  </p>
                )}
              </div>
            </Section>

            {/* 2. Campos base */}
            <Section title="Datos del catálogo">
              {fieldVisible(selectedType?.fieldConfig, 'description') && (
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="resize-none text-sm" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {fieldVisible(selectedType?.fieldConfig, 'sku') && (
                  <div className="space-y-1.5">
                    <Label>SKU</Label>
                    <Input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="ABC-001" />
                  </div>
                )}
                {fieldVisible(selectedType?.fieldConfig, 'category') && (
                  <div className="space-y-1.5">
                    <Label>Categoría</Label>
                    <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Ej: Electrónica" />
                  </div>
                )}
              </div>
              {fieldVisible(selectedType?.fieldConfig, 'unit') && (
                <div className="space-y-1.5">
                  <Label>Unidad</Label>
                  <Input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="unidad" />
                </div>
              )}
              {fieldVisible(selectedType?.fieldConfig, 'tags') && (
                <div className="space-y-2">
                  <Label>Etiquetas</Label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                        placeholder="Agregar etiqueta y presionar Enter..."
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddTag} className="h-8 px-3 text-xs">Agregar</Button>
                  </div>
                  {form.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          {tag}
                          <button type="button" onClick={() => set('tags', form.tags.filter(t => t !== tag))} className="hover:opacity-70">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* 3. Campos personalizados */}
            {selectedType && fields.length > 0 && (
              <Section title="Campos personalizados">
                {fields.map(field => (
                  <CustomFieldInput
                    key={field.id}
                    field={field}
                    value={form.customFieldValues[field.key]}
                    onChange={v => setCustomFieldValue(field.key, v)}
                  />
                ))}
              </Section>
            )}

            {/* 4. Atributos y variaciones (solo en edición) */}
            {mode === 'edit' && articleId && (
              <Section title="Atributos y variaciones (opcional)">
                <ArticleVariationsSection
                  articleId={articleId}
                  attributeIds={form.attributeIds}
                  onAttributeIdsChange={handleAttributeIdsChange}
                  basePrice={basePriceCents}
                />
              </Section>
            )}

            {/* 5. Planes de membresía */}
            {mode === 'edit' && articleId && selectedType?.kind === 'membership' && (
              <Section title="Planes de membresía">
                <ArticlePlansSection articleId={articleId} />
              </Section>
            )}

            {/* 6. Precio, stock, estado */}
            <Section title="Precio y disponibilidad">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Precio base</Label>
                  <Input type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Moneda</Label>
                  <Select value={form.currency} onValueChange={v => set('currency', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(!selectedType || selectedType.tracksStock) && (
                <div className="space-y-1.5">
                  <Label>Stock</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={e => set('stock', e.target.value)}
                    placeholder="Sin control de stock"
                  />
                  <p className="text-xs text-muted-foreground">Dejar en blanco para no controlar el stock.</p>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Artículo activo</p>
                  <p className="text-xs text-muted-foreground">Los artículos inactivos no aparecen disponibles para la venta.</p>
                </div>
                <Switch checked={form.status === 'active'} onCheckedChange={v => set('status', v ? 'active' : 'inactive')} />
              </div>
            </Section>
          </div>

          {/* Resumen fijo */}
          <div className="lg:sticky lg:top-0 h-fit">
            <div className="border border-border rounded-xl p-4 space-y-3 bg-card/50">
              <h3 className="text-sm font-semibold">Resumen</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nombre</span>
                  <span className="font-medium truncate max-w-[160px]">{form.name || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="inline-flex items-center gap-1 font-medium">
                    {TypeIcon && <TypeIcon className="h-3.5 w-3.5" />}
                    {selectedType?.name ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio final</span>
                  <span className="font-medium tabular-nums">
                    {formatMoneyFromCents(totalPriceCents, form.currency, { locale: 'es-ES', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {priceDelta !== 0 && (
                  <p className="text-xs text-muted-foreground">Incluye {priceDelta > 0 ? '+' : ''}{(priceDelta / 100).toFixed(2)} de campos personalizados.</p>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado</span>
                  <Badge variant={form.status === 'active' ? 'default' : 'outline'} className="text-xs">
                    {form.status === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
              <Button className="w-full" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {mode === 'new' ? 'Guardar y continuar' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: ArticleCustomFieldDef;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const priceHint = field.hasPrice && field.type === 'boolean' && field.price !== 0
    ? ` (+${(field.price / 100).toFixed(2)})`
    : '';

  return (
    <div className="space-y-1.5">
      <Label>
        {field.name}{priceHint}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.type === 'text' && (
        <Input value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />
      )}
      {field.type === 'number' && (
        <Input type="number" value={typeof value === 'number' ? value : ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : '')} />
      )}
      {field.type === 'boolean' && (
        <div className="flex items-center gap-2">
          <Switch checked={value === true} onCheckedChange={v => onChange(v)} />
          <span className="text-sm text-muted-foreground">{value === true ? 'Sí' : 'No'}</span>
        </div>
      )}
      {field.type === 'select' && (
        <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
          <SelectContent>
            {field.options.map(opt => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}{field.hasPrice && opt.priceModifier !== 0 ? ` (+${(opt.priceModifier / 100).toFixed(2)})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
