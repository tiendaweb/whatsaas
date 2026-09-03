import { Package, Download, Crown, Wrench, Tag, type LucideIcon } from 'lucide-react';

export const BILLING_MODES = [
  'one_time',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'installation',
  'maintenance',
  'custom',
] as const;

export type BillingMode = (typeof BILLING_MODES)[number];

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  one_time: 'Pago único',
  daily: 'Por día',
  weekly: 'Por semana',
  monthly: 'Por mes',
  yearly: 'Por año',
  installation: 'Pago de instalación',
  maintenance: 'Mantenimiento',
  custom: 'Otro',
};

export const ARTICLE_KINDS = ['physical', 'digital', 'membership', 'service', 'other'] as const;

export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_KIND_LABELS: Record<ArticleKind, string> = {
  physical: 'Producto físico',
  digital: 'Producto digital',
  membership: 'Membresía',
  service: 'Servicio',
  other: 'Otro',
};

export const KIND_ICON: Record<ArticleKind, LucideIcon> = {
  physical: Package,
  digital: Download,
  membership: Crown,
  service: Wrench,
  other: Tag,
};

// Sugerencia de "controla stock" por defecto según el tipo elegido (el usuario puede sobreescribirla).
export const KIND_DEFAULT_TRACKS_STOCK: Record<ArticleKind, boolean> = {
  physical: true,
  digital: false,
  membership: false,
  service: false,
  other: true,
};

export const ARTICLE_TYPE_FIELD_CONFIG_KEYS = ['sku', 'category', 'unit', 'tags', 'description'] as const;

export type ArticleTypeFieldConfigKeys = (typeof ARTICLE_TYPE_FIELD_CONFIG_KEYS)[number];

export const ARTICLE_TYPE_FIELD_CONFIG_LABELS: Record<ArticleTypeFieldConfigKeys, string> = {
  sku: 'SKU',
  category: 'Categoría',
  unit: 'Unidad',
  tags: 'Etiquetas',
  description: 'Descripción',
};

export function billingModeLabel(mode: string, customLabel?: string | null): string {
  if (mode === 'custom' && customLabel) return customLabel;
  return BILLING_MODE_LABELS[mode as BillingMode] ?? mode;
}

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'boolean', 'select'] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sí / No',
  select: 'Selección (opciones)',
};

// hasPrice solo tiene sentido en boolean (addon fijo) y select (precio por opción elegida).
export const CUSTOM_FIELD_TYPES_WITH_PRICE: CustomFieldType[] = ['boolean', 'select'];

export type ArticleCustomFieldOption = {
  id: string;
  label: string;
  priceModifier: number;
};

export type ArticleCustomFieldDef = {
  id: number;
  key: string;
  name: string;
  type: CustomFieldType;
  required: boolean;
  hasPrice: boolean;
  price: number;
  options: ArticleCustomFieldOption[];
};

// Suma el impacto en precio (centavos) de los valores elegidos para los campos personalizados de un artículo.
export function computeCustomFieldsPriceDelta(
  fields: ArticleCustomFieldDef[],
  values: Record<string, string | number | boolean | undefined>,
): number {
  return fields.reduce((total, field) => {
    if (!field.hasPrice) return total;
    const value = values[field.key];
    if (field.type === 'boolean') {
      return value === true ? total + field.price : total;
    }
    if (field.type === 'select' && typeof value === 'string') {
      const option = field.options.find(o => o.id === value);
      return option ? total + option.priceModifier : total;
    }
    return total;
  }, 0);
}
