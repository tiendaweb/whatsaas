'use client';

import { forwardRef } from 'react';
import { Check, LayoutGrid, List, MoreHorizontal, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TagPill } from '@/components/chat/ContactTagsEditor';
import { cn } from '@/lib/utils';
import { GRUPO_SIN, GRUPO_TODAS, type Densidad, type Etiqueta, type GrupoEtapas, type Orden, type Segmento } from './tipos';

const CHIPS_VISIBLES = 8;

type Props = {
  q: string;
  onQ: (v: string) => void;
  segmento: Segmento;
  onSegmento: (v: Segmento) => void;
  conteos: Record<Segmento, number>;
  grupo: string;
  onGrupo: (v: string) => void;
  grupos: GrupoEtapas[];
  etiquetas: Etiqueta[];
  tagsSel: number[];
  onTagsSel: (ids: number[]) => void;
  densidad: Densidad;
  onDensidad: (v: Densidad) => void;
  orden: Orden;
  onOrden: (v: Orden) => void;
};

const SEGMENTOS: Segmento[] = ['todos', 'leads', 'clientes'];
const ORDENES: Orden[] = ['ultimo', 'nombre', 'sinContestar', 'temperatura'];
const ORDEN_KEY: Record<Orden, string> = {
  ultimo: 'sort.lastMessage',
  nombre: 'sort.name',
  sinContestar: 'sort.unanswered',
  temperatura: 'sort.temperature',
};

export const Toolbar = forwardRef<HTMLInputElement, Props>(function Toolbar(
  { q, onQ, segmento, onSegmento, conteos, grupo, onGrupo, grupos, etiquetas, tagsSel, onTagsSel, densidad, onDensidad, orden, onOrden },
  searchRef,
) {
  const t = useTranslations('Seguimiento');

  const toggleTag = (id: number) => onTagsSel(tagsSel.includes(id) ? tagsSel.filter((x) => x !== id) : [...tagsSel, id]);
  const chips = etiquetas.slice(0, CHIPS_VISIBLES);
  const ocultas = etiquetas.slice(CHIPS_VISIBLES);
  const ocultasSel = ocultas.filter((e) => tagsSel.includes(e.id)).length;

  const selectorGrupo = (
    <Select value={grupo} onValueChange={onGrupo}>
      <SelectTrigger className="h-9 w-auto max-w-56 rounded-lg" aria-label={t('group.label')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {grupos.map((g) => (
          <SelectItem key={g.id} value={String(g.id)}>
            {g.name}
          </SelectItem>
        ))}
        {grupos.length > 0 && <SelectSeparator />}
        <SelectItem value={GRUPO_SIN}>{t('group.none')}</SelectItem>
        <SelectItem value={GRUPO_TODAS}>{t('group.all')}</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <h1 className="shrink-0 text-base font-semibold tracking-tight sm:text-lg">{t('title')}</h1>

        <div className="ml-1 flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="tablist" aria-label={t('segment.label')}>
          {SEGMENTOS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={segmento === s}
              onClick={() => onSegmento(s)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                segmento === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`segment.${s}`)}
              <span className="hidden tabular-nums text-muted-foreground sm:inline">{conteos[s]}</span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="h-9 w-64 rounded-lg pl-8 pr-8"
          />
          {q && (
            <button
              type="button"
              aria-label={t('search.clear')}
              onClick={() => onQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="hidden md:block">{selectorGrupo}</div>

        <div className="hidden items-center rounded-lg bg-muted p-0.5 md:flex">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('density.grid')}
            aria-pressed={densidad === 'tarjetas'}
            className={cn('h-7 w-7 p-0', densidad === 'tarjetas' && 'bg-background shadow-sm')}
            onClick={() => onDensidad('tarjetas')}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('density.list')}
            aria-pressed={densidad === 'lista'}
            className={cn('h-7 w-7 p-0', densidad === 'lista' && 'bg-background shadow-sm')}
            onClick={() => onDensidad('lista')}
          >
            <List className="size-4" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-9 w-9 p-0 md:ml-0" aria-label={t('sort.label')}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('sort.label')}</DropdownMenuLabel>
            {ORDENES.map((o) => (
              <DropdownMenuItem key={o} onSelect={() => onOrden(o)} className="flex items-center justify-between">
                {t(ORDEN_KEY[o])}
                {orden === o && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
            {tagsSel.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onTagsSel([])}>{t('tags.clear')}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 md:hidden">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => onQ(e.target.value)} placeholder={t('search.placeholder')} className="h-9 rounded-lg pl-8" />
        </div>
        {selectorGrupo}
      </div>

      {etiquetas.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {chips.map((tag) => {
            const activa = tagsSel.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={activa}
                onClick={() => toggleTag(tag.id)}
                className={cn('shrink-0 rounded-full transition-[box-shadow,opacity]', activa ? 'ring-1 ring-foreground/40' : 'opacity-80 hover:opacity-100')}
              >
                <TagPill tag={{ ...tag, color: tag.color ?? 'gray' }} className="h-6 px-2 text-[11px]" />
              </button>
            );
          })}
          {ocultas.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground">
                  {t('tags.more')}
                  {ocultasSel > 0 && <span className="ml-1 tabular-nums">({ocultasSel})</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {ocultas.map((tag) => {
                    const activa = tagsSel.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={activa}
                        onClick={() => toggleTag(tag.id)}
                        className="flex items-center justify-between rounded-md px-2 py-1 text-left hover:bg-muted"
                      >
                        <TagPill tag={{ ...tag, color: tag.color ?? 'gray' }} className="h-6 px-2 text-[11px]" />
                        {activa && <Check className="size-4" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {tagsSel.length > 0 && (
            <button type="button" onClick={() => onTagsSel([])} className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">
              {t('tags.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
