'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, Trash2, X } from 'lucide-react';
import type { BwFieldDef } from '../shared/collections';

/**
 * Panel lateral derecho genérico: ver/editar TODOS los campos de un registro
 * (sin omitir ninguno — el catálogo de la colección es la fuente de verdad),
 * archivar (soft, reversible) y eliminar (hard, con confirmación). Es la
 * "ficha" que pediste para clientes, y sirve igual para cualquier otra
 * colección local — no hay una ficha "especial" de clientes hardcodeada, el
 * mismo componente sirve para todas.
 *
 * SÓLO para bindings `local`: los registros de un binding `system` (datos
 * reales de WhatsPro) se muestran acá mismo en modo LECTURA — crear/editar
 * esos recursos queda fuera de esta fase (ver Roadmap).
 */
export function BwRecordDrawer({
  fields,
  record,
  readOnly,
  onSave,
  onDelete,
  onArchive,
  onClose,
}: {
  /** Catálogo de campos a mostrar, en orden. Para bindings `local` es el de
   * la colección (`bwCollectionFields`); para `system` se arma en el
   * llamador a partir de las claves del registro (ver BwBlockRenderer). */
  fields: readonly BwFieldDef[];
  record: Record<string, any>;
  readOnly?: boolean;
  onSave?: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onArchive?: (archived: boolean) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map((f) => [f.key, record[f.key]])));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isArchived = Boolean(record._archived);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    onSave?.(values);
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h3 className="text-base font-black text-zinc-950">Detalle</h3>
            {isArchived && <span className="text-xs font-semibold text-amber-600">Archivado</span>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            {fields.map((field) => (
              <RecordField
                key={field.key}
                field={field}
                value={values[field.key]}
                readOnly={readOnly}
                onChange={(value) => setField(field.key, value)}
              />
            ))}
          </div>
        </div>

        {!readOnly && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-100 px-5 py-4">
            <button type="button" onClick={handleSave} className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm">
              Guardar cambios
            </button>
            <div className="flex gap-2">
              {onArchive && (
                <button
                  type="button"
                  onClick={() => { onArchive(!isArchived); onClose(); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-amber-300 hover:text-amber-700"
                >
                  {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {isArchived ? 'Desarchivar' : 'Archivar'}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmingDelete) { setConfirmingDelete(true); return; }
                    onDelete();
                    onClose();
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    confirmingDelete ? 'border-red-300 bg-red-50 text-red-700' : 'border-zinc-200 text-zinc-600 hover:border-red-300 hover:text-red-600'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {confirmingDelete ? '¿Seguro? Tocá de nuevo' : 'Eliminar'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RecordField({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: BwFieldDef;
  value: unknown;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
}) {
  const disabled = Boolean(readOnly);

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 rounded border-zinc-300" />
        <span className="font-semibold text-zinc-700">{field.label}</span>
      </label>
    );
  }

  if (field.type === 'tags') {
    const tags: string[] = Array.isArray(value) ? value : [];
    const [draft, setDraft] = useState('');
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-zinc-500">{field.label}</span>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 px-2 py-1.5">
          {tags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
              {tag}
              {!disabled && (
                <button type="button" onClick={() => onChange(tags.filter((_, i) => i !== index))} className="text-rose-400 hover:text-rose-700">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {!disabled && (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ',') return;
                e.preventDefault();
                const next = draft.trim();
                if (next && !tags.includes(next)) onChange([...tags, next]);
                setDraft('');
              }}
              placeholder="Agregar…"
              className="min-w-[80px] flex-1 border-none text-sm outline-none"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-zinc-600">{field.label}</span>
      {field.type === 'longtext' ? (
        <textarea value={(value as string) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-50" />
      ) : field.type === 'select' ? (
        <select value={(value as string) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-50">
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={(value as string) ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-50"
        />
      )}
    </label>
  );
}
