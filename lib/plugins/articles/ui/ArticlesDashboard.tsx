'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Package,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  ShoppingBag,
  CheckCircle2,
  MinusCircle,
  Settings2,
} from 'lucide-react';
import { KIND_ICON, billingModeLabel, type ArticleKind } from '../constants';

type ArticleType = {
  id: number;
  name: string;
  kind: ArticleKind;
  billingMode: string;
  billingLabel: string | null;
  tracksStock: boolean;
};

type Article = {
  id: number;
  name: string;
  description: string;
  sku: string | null;
  articleTypeId: number | null;
  articleType: ArticleType | null;
  price: number;
  currency: string;
  category: string | null;
  unit: string;
  stock: number | null;
  tags: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

type StatusFilter = 'all' | 'active' | 'inactive';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function StatChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
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

export function ArticlesDashboard() {
  const router = useRouter();
  const { data, mutate } = useSWR<Article[]>('/api/plugins/articles', fetcher);
  const { data: articleTypes } = useSWR<ArticleType[]>('/api/plugins/article-types', fetcher);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<number | null>(null);

  const articles = data ?? [];
  const types = articleTypes ?? [];

  const stats = useMemo(() => ({
    total:    articles.length,
    active:   articles.filter(a => a.status === 'active').length,
    inactive: articles.filter(a => a.status === 'inactive').length,
  }), [articles]);

  const categories = useMemo(() => {
    const cats = articles.map(a => a.category).filter(Boolean) as string[];
    return Array.from(new Set(cats)).sort();
  }, [articles]);

  const usedTypeIds = useMemo(() => {
    return new Set(articles.map(a => a.articleTypeId).filter((id): id is number => id != null));
  }, [articles]);

  const filterableTypes = useMemo(
    () => types.filter(t => usedTypeIds.has(t.id)),
    [types, usedTypeIds],
  );

  const filtered = useMemo(() => {
    let list = articles;
    if (statusFilter !== 'all') {
      list = list.filter(a => a.status === statusFilter);
    }
    if (categoryFilter) {
      list = list.filter(a => a.category === categoryFilter);
    }
    if (typeFilter) {
      list = list.filter(a => a.articleTypeId === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.sku ?? '').toLowerCase().includes(q) ||
        (a.category ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [articles, statusFilter, categoryFilter, typeFilter, search]);

  function handleNew() {
    router.push('/plugins/articles/new');
  }

  function handleEdit(article: Article) {
    router.push(`/plugins/articles/${article.id}/edit`);
  }

  async function handleDelete(article: Article) {
    if (!confirm('¿Eliminar este artículo?')) return;
    await fetch(`/api/plugins/articles/${article.id}`, { method: 'DELETE' });
    mutate();
  }

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: 'all',      label: 'Todos' },
    { value: 'active',   label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Artículos</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gestiona tu catálogo de productos y servicios
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, SKU, categoría..."
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

            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 px-3 text-sm">
              <Link href="/plugins/articles/types">
                <Settings2 className="h-3.5 w-3.5" />
                Tipos de artículo
              </Link>
            </Button>

            <Button size="sm" onClick={handleNew} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="h-3.5 w-3.5" />
              Nuevo artículo
            </Button>
          </div>
        </div>

        {/* Stats */}
        {articles.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
            <StatChip icon={ShoppingBag}    label="Total"    value={stats.total}    color="text-muted-foreground" />
            <StatChip icon={CheckCircle2}   label="Activos"  value={stats.active}   color="text-emerald-500" />
            <StatChip icon={MinusCircle}    label="Inactivos" value={stats.inactive} color="text-slate-400" />
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="border-b border-border bg-background px-6 py-2 flex items-center gap-2 flex-wrap">
        {/* Status tabs */}
        <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
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

        {/* Category pills */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                className={`h-6 px-2.5 rounded-full text-xs font-medium border transition-all ${
                  categoryFilter === cat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {cat}
              </button>
            ))}
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="h-6 px-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* Type pills */}
        {filterableTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pl-2 ml-1 border-l border-border/60">
            {filterableTypes.map(type => {
              const Icon = KIND_ICON[type.kind] ?? Package;
              return (
                <button
                  key={type.id}
                  onClick={() => setTypeFilter(typeFilter === type.id ? null : type.id)}
                  className={`h-6 pl-2 pr-2.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${
                    typeFilter === type.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {type.name}
                </button>
              );
            })}
            {typeFilter && (
              <button
                onClick={() => setTypeFilter(null)}
                className="h-6 px-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState
            hasArticles={articles.length > 0}
            onNew={handleNew}
          />
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_0.7fr_1fr_0.7fr_1fr_auto] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Nombre / SKU</span>
              <span>Categoría</span>
              <span>Unidad</span>
              <span>Precio</span>
              <span>Stock</span>
              <span>Estado</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map((article, idx) => (
              <ArticleRow
                key={article.id}
                article={article}
                isLast={idx === filtered.length - 1}
                onEdit={() => handleEdit(article)}
                onDelete={() => handleDelete(article)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleRow({
  article,
  isLast,
  onEdit,
  onDelete,
}: {
  article: Article;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const type = article.articleType;
  const TypeIcon = type ? (KIND_ICON[type.kind] ?? Package) : null;
  const isRecurring = type && type.billingMode !== 'one_time';

  return (
    <div
      className={`group grid grid-cols-[2fr_1fr_0.7fr_1fr_0.7fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/40 transition-colors ${
        !isLast ? 'border-b border-border/60' : ''
      }`}
    >
      {/* Name + SKU + Type */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{article.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {article.sku && (
            <p className="text-xs text-muted-foreground font-mono">{article.sku}</p>
          )}
          {type && TypeIcon && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <TypeIcon className="h-3 w-3" />
              {type.name}
            </span>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="min-w-0">
        {article.category ? (
          <span className="text-sm text-foreground truncate block">{article.category}</span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Unit */}
      <div>
        <span className="text-sm text-muted-foreground">{article.unit}</span>
      </div>

      {/* Price */}
      <div>
        <span className="text-sm font-medium tabular-nums">
          {formatPrice(article.price, article.currency)}
        </span>
        {isRecurring && (
          <span className="block text-xs text-muted-foreground">
            / {billingModeLabel(type.billingMode, type.billingLabel)}
          </span>
        )}
      </div>

      {/* Stock */}
      <div>
        {article.stock != null ? (
          <span className={`text-sm tabular-nums font-medium ${article.stock === 0 ? 'text-destructive' : 'text-foreground'}`}>
            {article.stock}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Status badge */}
      <div>
        {article.status === 'active' ? (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs font-medium px-2 py-0.5">
            Activo
          </Badge>
        ) : (
          <Badge variant="outline" className="text-slate-500 border-slate-300 dark:text-slate-400 dark:border-slate-700 text-xs font-medium px-2 py-0.5">
            Inactivo
          </Badge>
        )}
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
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Editar
            </DropdownMenuItem>
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

function EmptyState({
  hasArticles,
  onNew,
}: {
  hasArticles: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
        <Package className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        {hasArticles ? 'Sin resultados' : 'Sin artículos'}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        {hasArticles
          ? 'Prueba con otra búsqueda o cambia los filtros activos.'
          : 'Empieza agregando tu primer producto o servicio al catálogo.'}
      </p>
      {!hasArticles && (
        <Button size="sm" onClick={onNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nuevo artículo
        </Button>
      )}
    </div>
  );
}
