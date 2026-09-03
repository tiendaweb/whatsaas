'use client';

import { useState } from 'react';
import { Panel, SectionHeader, EmptyState, Metric } from '../../components/shared';
import { bwCollectionFields, type BwCollectionKey } from '../shared/collections';
import { resolveBwIcon, resolveBwTone, resolveBlockAppearance } from '../shared/tokens';
import { aggregateRows, formatFieldValue } from './binding';
import { useBindingRows } from './useBindingRows';
import { BwFormModal } from './BwFormModal';
import { BwRecordDrawer } from './BwRecordDrawer';
import { archiveLocalRecord, deleteLocalRecord, genericFieldsFor, updateLocalRecord } from './recordActions';
import { BwKanbanBlockView } from './blocks/BwKanbanBlockView';
import type { BwBlock } from '../shared/schema';

export type BwCollectionsData = Partial<Record<BwCollectionKey, any[]>>;
export type BwMutateCollection = (collection: BwCollectionKey, items: any[]) => void;

type BwFormButtonBlockType = Extract<BwBlock, { type: 'form_button' }>;
type BwMetricBlockType = Extract<BwBlock, { type: 'metric' }>;
type BwListBlockType = Extract<BwBlock, { type: 'list' }>;
type BwTableBlockType = Extract<BwBlock, { type: 'table' }>;
type BwCardsBlockType = Extract<BwBlock, { type: 'cards' }>;
type BwRotatingTextBlockType = Extract<BwBlock, { type: 'rotating_text' }>;
type BwImageBlockType = Extract<BwBlock, { type: 'image' }>;
type BwQuickActionsBlockType = Extract<BwBlock, { type: 'quick_actions' }>;

/** Un solo día del año en la zona horaria del navegador — determinístico
 * durante todo el día, cambia a la medianoche local. Sin `Math.random`, así
 * "daily" es estable entre recargas y entre pestañas del mismo día. */
function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** Arma los props de `BwRecordDrawer` para una fila: catálogo + escritura
 * real si el binding es `local`; sólo lectura con campos genéricos si es
 * `system` (crear/editar recursos reales de WhatsPro queda fuera de esta
 * fase — ver Roadmap). */
function drawerPropsFor(
  binding: BwListBlockType['binding'] | BwTableBlockType['binding'] | BwCardsBlockType['binding'],
  row: any,
  localRecords: any[],
  onMutate: BwMutateCollection,
) {
  if (binding.kind === 'system') {
    return { fields: genericFieldsFor(row), readOnly: true as const };
  }
  const collection = binding.collection;
  return {
    fields: bwCollectionFields(collection),
    readOnly: false as const,
    onSave: (patch: Record<string, unknown>) => updateLocalRecord(collection, localRecords, row._recordId, patch, onMutate),
    onDelete: () => deleteLocalRecord(collection, localRecords, row._recordId, onMutate),
    onArchive: (archived: boolean) => archiveLocalRecord(collection, localRecords, row._recordId, archived, onMutate),
  };
}

/* ------------------------------------------------------------------ */
/* Bloques ligados a datos — cada uno en su propio componente para que  */
/* useBindingRows (que adentro llama a un hook de SWR) se llame siempre */
/* en el mismo orden dentro de SU instancia, nunca dentro de un `case`. */
/* ------------------------------------------------------------------ */

function BwMetricBlockView({ block, data }: { block: BwMetricBlockType; data: BwCollectionsData }) {
  const { rows, loading, error } = useBindingRows(block.binding, data);
  if (error) return <BlockError title={block.label} message={error} />;
  const value = aggregateRows(rows, block.aggregate, block.field);
  const formatted = loading ? '…' : block.aggregate === 'avg' ? value.toFixed(1) : Math.round(value).toLocaleString('es');
  // Metric (shared.tsx) es una primitiva ya con su propio estilo fijo; tone/
  // customColor de este bloque quedan reservados para una variante visual
  // futura (ver Roadmap) — hoy no rompen nada, sólo no se usan todavía acá.
  return <Metric label={block.label} value={formatted} />;
}

function BwListBlockView({ block, data, onMutate }: { block: BwListBlockType; data: BwCollectionsData; onMutate: BwMutateCollection }) {
  const { rows, loading, error } = useBindingRows(block.binding, data);
  const appearance = resolveBlockAppearance(block.tone, block.customColor);
  const [openRow, setOpenRow] = useState<any | null>(null);
  const localRecords = block.binding.kind === 'local' ? (data[block.binding.collection] ?? []) : [];
  return (
    <Panel className="p-4">
      {block.title && <SectionHeader title={block.title} />}
      {error ? (
        <BlockErrorInline message={error} />
      ) : loading ? (
        <LoadingRows />
      ) : !rows.length ? (
        <EmptyState>Todavía no hay registros acá.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div
              key={row._recordId ?? row.id ?? index}
              role={block.openDetail ? 'button' : undefined}
              onClick={block.openDetail ? () => setOpenRow(row) : undefined}
              className={`rounded-xl border px-3 py-2 ${appearance.soft.className} ${block.openDetail ? 'cursor-pointer transition hover:brightness-95' : ''}`}
              style={appearance.soft.style}
            >
              <div className="text-sm font-semibold text-zinc-900">{formatFieldValue(row[block.primaryField])}</div>
              {block.secondaryField && <div className="text-xs text-zinc-500">{formatFieldValue(row[block.secondaryField])}</div>}
            </div>
          ))}
        </div>
      )}
      {openRow && <BwRecordDrawer record={openRow} onClose={() => setOpenRow(null)} {...drawerPropsFor(block.binding, openRow, localRecords, onMutate)} />}
    </Panel>
  );
}

function BwTableBlockView({ block, data, onMutate }: { block: BwTableBlockType; data: BwCollectionsData; onMutate: BwMutateCollection }) {
  const { rows, loading, error } = useBindingRows(block.binding, data);
  const fieldLabels = block.binding.kind === 'local' ? new Map(bwCollectionFields(block.binding.collection).map((f) => [f.key, f.label])) : new Map<string, string>();
  const [openRow, setOpenRow] = useState<any | null>(null);
  const localRecords = block.binding.kind === 'local' ? (data[block.binding.collection] ?? []) : [];
  return (
    <Panel className="p-4">
      {block.title && <SectionHeader title={block.title} />}
      {error ? (
        <BlockErrorInline message={error} />
      ) : loading ? (
        <LoadingRows />
      ) : !rows.length ? (
        <EmptyState>Todavía no hay registros acá.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {block.columns.map((col) => (
                  <th key={col} className="px-3 py-2">{fieldLabels.get(col) ?? col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, index) => (
                <tr
                  key={row._recordId ?? row.id ?? index}
                  onClick={block.openDetail ? () => setOpenRow(row) : undefined}
                  className={`border-b border-zinc-100 last:border-0 ${block.openDetail ? 'cursor-pointer hover:bg-rose-50/40' : ''}`}
                >
                  {block.columns.map((col) => (
                    <td key={col} className="px-3 py-2 text-zinc-700">{formatFieldValue(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openRow && <BwRecordDrawer record={openRow} onClose={() => setOpenRow(null)} {...drawerPropsFor(block.binding, openRow, localRecords, onMutate)} />}
    </Panel>
  );
}

function BwCardsBlockView({ block, data, onMutate }: { block: BwCardsBlockType; data: BwCollectionsData; onMutate: BwMutateCollection }) {
  const { rows, loading, error } = useBindingRows(block.binding, data);
  const appearance = resolveBlockAppearance(block.tone, block.customColor);
  const [openRow, setOpenRow] = useState<any | null>(null);
  const localRecords = block.binding.kind === 'local' ? (data[block.binding.collection] ?? []) : [];
  return (
    <Panel className="p-4">
      {block.title && <SectionHeader title={block.title} />}
      {error ? (
        <BlockErrorInline message={error} />
      ) : loading ? (
        <LoadingRows />
      ) : !rows.length ? (
        <EmptyState>Todavía no hay registros acá.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row: any, index) => (
            <div
              key={row._recordId ?? row.id ?? index}
              onClick={block.openDetail ? () => setOpenRow(row) : undefined}
              className={`rounded-2xl border border-white/50 bg-white/70 p-3 ${block.openDetail ? 'cursor-pointer transition hover:border-rose-200' : ''}`}
            >
              <div className="text-sm font-bold text-zinc-900">{formatFieldValue(row[block.titleField])}</div>
              {block.subtitleField && <div className="mt-0.5 text-xs text-zinc-500">{formatFieldValue(row[block.subtitleField])}</div>}
              {block.badgeField && (
                <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${appearance.soft.className}`} style={appearance.soft.style}>
                  {formatFieldValue(row[block.badgeField])}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {openRow && <BwRecordDrawer record={openRow} onClose={() => setOpenRow(null)} {...drawerPropsFor(block.binding, openRow, localRecords, onMutate)} />}
    </Panel>
  );
}

/** Extraído aparte (en vez de vivir en el `case` del switch) para no llamar
 * useState condicionalmente dentro de una rama de switch — más claro para el
 * linter de reglas de hooks, aunque en la práctica cada instancia de
 * BwBlockRenderer siempre recibe el mismo `block.type` mientras vive. */
function BwFormButtonBlock({ block, records, onMutate }: { block: BwFormButtonBlockType; records: any[]; onMutate: BwMutateCollection }) {
  const [open, setOpen] = useState(false);
  const Icon = resolveBwIcon(block.icon ?? 'Sparkles');
  const appearance = resolveBlockAppearance(block.tone, block.customColor);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${appearance.solid.className}`}
        style={appearance.solid.style}
      >
        <Icon className="h-4 w-4" />
        {block.label}
      </button>
      {open && (
        <BwFormModal
          collection={block.collection}
          tone={block.tone}
          currentRecords={records}
          onSave={(items) => onMutate(block.collection, items)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BwRotatingTextBlock({ block }: { block: BwRotatingTextBlockType }) {
  const appearance = resolveBlockAppearance(block.tone, block.customColor);
  const Icon = resolveBwIcon(block.icon ?? 'Sparkles');
  const index = block.mode === 'random' ? Math.floor(Math.random() * block.items.length) : dayOfYear() % block.items.length;
  return (
    <Panel className="flex items-start gap-3 p-4">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${appearance.soft.className}`} style={appearance.soft.style}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        {block.title && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{block.title}</div>}
        <p className="text-sm font-medium leading-relaxed text-zinc-800">{block.items[index]}</p>
      </div>
    </Panel>
  );
}

function BwImageBlockView({ block }: { block: BwImageBlockType }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/50 bg-white/40">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL arbitraria del conector, no un asset local optimizable */}
      <img src={block.url} alt={block.alt ?? ''} className="h-auto w-full object-cover" />
      {block.caption && <figcaption className="px-3 py-2 text-xs text-zinc-500">{block.caption}</figcaption>}
    </figure>
  );
}

function BwQuickActionsBlock({ block, data, onMutate, onNavigate }: { block: BwQuickActionsBlockType; data: BwCollectionsData; onMutate: BwMutateCollection; onNavigate?: (viewId: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {block.actions.map((action, index) => (
        <QuickActionButton key={index} action={action} data={data} onMutate={onMutate} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function QuickActionButton({
  action,
  data,
  onMutate,
  onNavigate,
}: {
  action: BwQuickActionsBlockType['actions'][number];
  data: BwCollectionsData;
  onMutate: BwMutateCollection;
  onNavigate?: (viewId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = resolveBwIcon(action.icon ?? 'Sparkles');
  const appearance = resolveBlockAppearance(action.tone, undefined);
  const onClick = () => {
    if (action.action.kind === 'navigate' && action.action.viewId) onNavigate?.(action.action.viewId);
    else setOpen(true);
  };
  // `collection` sólo falta acá si la definición no pasó por
  // whatspro_business_theme_apply (que valida con el .refine de zod) — en ese
  // caso no hay nada que abrir, se degrada a no-op en vez de romper.
  const createAction = action.action.kind === 'create' && action.action.collection ? { collection: action.action.collection } : null;
  return (
    <>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold ${appearance.solid.className}`} style={appearance.solid.style}>
        <Icon className="h-4 w-4" />
        {action.label}
      </button>
      {open && createAction && (
        <BwFormModal
          collection={createAction.collection}
          tone={action.tone}
          currentRecords={data[createAction.collection] ?? []}
          onSave={(items) => onMutate(createAction.collection, items)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LoadingRows() {
  return <div className="animate-pulse text-sm text-zinc-400">Cargando…</div>;
}

function BlockErrorInline({ message }: { message: string }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">No se pudo cargar: {message}</div>;
}

function BlockError({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">{title}</div>
      <div className="text-xs text-amber-700">{message}</div>
    </div>
  );
}

/**
 * Dispatcher central: switch exhaustivo por `block.type`, sin registry
 * dinámico (mismo motivo que Radar — 100% type-safe, sin imports por
 * string). `columns` es el único recursivo. Los bloques ligados a datos
 * viven en sus propios componentes arriba (ver comentario ahí).
 */
export function BwBlockRenderer({
  block,
  data,
  onMutate,
  onNavigate,
}: {
  block: BwBlock;
  data: BwCollectionsData;
  onMutate: BwMutateCollection;
  onNavigate?: (viewId: string) => void;
}) {
  switch (block.type) {
    case 'heading': {
      const Icon = block.icon ? resolveBwIcon(block.icon) : null;
      const appearance = resolveBlockAppearance(block.tone, block.customColor);
      const Tag = (`h${block.level}` as unknown) as 'h1' | 'h2' | 'h3';
      const sizeClass = block.level === '1' ? 'text-2xl md:text-3xl' : block.level === '2' ? 'text-xl md:text-2xl' : 'text-lg';
      return (
        <Tag className={`flex items-center gap-2 font-black tracking-[-0.3px] text-zinc-950 ${sizeClass}`}>
          {Icon && (
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${appearance.soft.className}`} style={appearance.soft.style}>
              <Icon className="h-4 w-4" />
            </span>
          )}
          {block.text}
        </Tag>
      );
    }

    case 'text': {
      const className = block.customColor ? 'text-sm leading-relaxed' : `text-sm leading-relaxed ${block.tone ? resolveBwTone(block.tone).text : 'text-zinc-600'}`;
      return (
        <p className={className} style={block.customColor ? { color: block.customColor } : undefined}>
          {block.text}
        </p>
      );
    }

    case 'metric':
      return <BwMetricBlockView block={block} data={data} />;
    case 'list':
      return <BwListBlockView block={block} data={data} onMutate={onMutate} />;
    case 'table':
      return <BwTableBlockView block={block} data={data} onMutate={onMutate} />;
    case 'cards':
      return <BwCardsBlockView block={block} data={data} onMutate={onMutate} />;
    case 'form_button':
      return <BwFormButtonBlock block={block} records={data[block.collection] ?? []} onMutate={onMutate} />;
    case 'rotating_text':
      return <BwRotatingTextBlock block={block} />;
    case 'image':
      return <BwImageBlockView block={block} />;
    case 'kanban':
      return <BwKanbanBlockView block={block} />;
    case 'quick_actions':
      return <BwQuickActionsBlock block={block} data={data} onMutate={onMutate} onNavigate={onNavigate} />;

    case 'columns': {
      return (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${block.lanes.length}, minmax(0, 1fr))` }}>
          {block.lanes.map((lane, laneIndex) => (
            <div key={laneIndex} className="flex flex-col gap-4">
              {lane.map((child) => (
                <BwBlockRenderer key={child.id} block={child} data={data} onMutate={onMutate} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
      );
    }

    default:
      // Un `type` desconocido llega si un conector viejo escribió un bloque de
      // una versión más nueva del contrato — se ignora en silencio, igual que
      // en Radar, en vez de romper toda la vista.
      return null;
  }
}
