'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { bwCollectionFields, type BwCollectionKey } from '../shared/collections';
import { resolveBwTone, type BwThemeTone } from '../shared/tokens';

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Formulario de alta genérico: se arma solo a partir del catálogo de campos
 * de la colección (`shared/collections.ts`). El registro nuevo se guarda con
 * `onMutateCollection`, exactamente la misma función que usa la UI clásica —
 * por eso lo que se crea acá aparece también en la vista clásica de esa
 * colección (Clientes, Ventas, etc.) si el equipo vuelve al tema por defecto.
 */
export function BwFormModal({
  collection,
  tone,
  currentRecords,
  onSave,
  onClose,
}: {
  collection: BwCollectionKey;
  tone?: BwThemeTone;
  currentRecords: any[];
  onSave: (items: any[]) => void;
  onClose: () => void;
}) {
  const fields = bwCollectionFields(collection);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const toneClasses = resolveBwTone(tone);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const record: Record<string, unknown> = { _recordId: nanoid() };
    for (const field of fields) {
      const raw = values[field.key];
      if (field.type === 'boolean') record[field.key] = Boolean(raw);
      else if (field.type === 'number') record[field.key] = raw ? Number(raw) : 0;
      else record[field.key] = raw ?? '';
    }
    onSave([record, ...currentRecords]);
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-zinc-950">Nuevo registro</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-zinc-600">{field.label}</span>
              {field.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[field.key])}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.checked }))}
                  className="h-5 w-5 self-start rounded border-zinc-300"
                />
              ) : field.type === 'longtext' ? (
                <textarea
                  value={(values[field.key] as string) ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  rows={3}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-rose-300 focus:outline-none"
                />
              ) : field.type === 'select' ? (
                <select
                  value={(values[field.key] as string) ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-rose-300 focus:outline-none"
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  value={(values[field.key] as string) ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-rose-300 focus:outline-none"
                />
              )}
            </label>
          ))}
        </div>
        <button type="submit" className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm ${toneClasses.solid}`}>
          Guardar
        </button>
      </form>
    </div>,
    document.body,
  );
}
