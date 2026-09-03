'use client';

/**
 * `form` — el PLANO de un formulario o brief: qué campos pedir, de qué tipo y
 * cuáles son obligatorios. No es interactivo a propósito: es la especificación
 * para construirlo o relevarla con el cliente.
 */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip } from './primitives';

export type FormBlockData = Extract<RadarBlock, { type: 'form' }>;

const TYPE_LABEL: Record<string, string> = {
  text: 'Texto',
  textarea: 'Texto largo',
  number: 'Número',
  select: 'Opción única',
  multiselect: 'Varias opciones',
  date: 'Fecha',
  phone: 'Teléfono',
  email: 'Email',
  url: 'URL',
  checkbox: 'Sí / No',
  file: 'Archivo',
};

export function FormBlock({ block }: { block: FormBlockData }) {
  const fields = block.fields ?? [];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {block.description && (
        <p className="mb-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{block.description}</p>
      )}

      {fields.length === 0 ? (
        <BlockEmpty text="Sin campos definidos." />
      ) : (
        <ol className="space-y-2">
          {fields.map((field, index) => (
            <li
              key={`${field.label}-${index}`}
              className="rounded-2xl border border-neutral-100 bg-white px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/60"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-rose-500" title="Obligatorio">*</span>}
                </span>
                <Chip label={TYPE_LABEL[field.fieldType ?? 'text'] ?? field.fieldType ?? 'Texto'} tone="slate" />
              </div>
              {field.placeholder && (
                <p className="mt-1 text-xs italic text-neutral-400 dark:text-neutral-500">“{field.placeholder}”</p>
              )}
              {field.options && field.options.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {field.options.map((option, optionIndex) => (
                    <span
                      key={optionIndex}
                      className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300"
                    >
                      {option}
                    </span>
                  ))}
                </p>
              )}
              {field.hint && <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{field.hint}</p>}
            </li>
          ))}
        </ol>
      )}

      {block.cta && (
        <p className="mt-3 text-xs font-bold text-neutral-400 dark:text-neutral-500">Cierre: “{block.cta}”</p>
      )}
    </div>
  );
}
