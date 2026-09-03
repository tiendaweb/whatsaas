'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Archive, Boxes, ChevronDown, Copy, Loader2, Trash2, Undo2 } from 'lucide-react';
import type { RadarSectionId, RadarWidget } from '@/lib/plugins/radar/shared/blocks';
import { RADAR_SECTIONS, RADAR_SECTION_LABEL } from '@/lib/plugins/radar/shared/blocks';
import { RadarBlocks } from '../blocks/RadarBlockView';
import { BlockLabel, resolveIcon, toneClasses } from '../blocks/primitives';
import { useRadarBank } from '../useRadarWidgets';

/**
 * Secciones REALES del equipo (builtins renombradas + personalizadas), para el
 * selector de destino y para mostrar el nombre de la sección de cada widget.
 * Cae a las constantes del código mientras carga.
 */
function useSectionOptions() {
  const { data } = useSWR<{ sections?: Array<{ section: string; label: string; hidden: boolean }> }>(
    '/api/plugins/radar/appearance',
    (url: string) => fetch(url).then((res) => res.json()),
  );
  const sections = data?.sections?.length
    ? data.sections
    : RADAR_SECTIONS.map((value) => ({ section: value, label: RADAR_SECTION_LABEL[value], hidden: false }));
  const labelOf = (id: string) => sections.find((entry) => entry.section === id)?.label ?? id;
  return { sections, labelOf };
}

/** `mi-widget` → `mi-widget-copia`, `mi-widget-copia` → `mi-widget-copia-2`… */
function suggestKey(key: string) {
  const match = key.match(/^(.*-copia)(?:-(\d+))?$/);
  if (!match) return `${key}-copia`.slice(0, 80);
  const next = Number(match[2] ?? 1) + 1;
  return `${match[1]}-${next}`.slice(0, 80);
}

function formatArchivedAt(value: string | null) {
  if (!value) return 'sin fecha';
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Banco de widgets: todo lo que se sacó del tablero sigue acá. No es una
 * papelera — es la biblioteca de plantillas del equipo, porque cualquier
 * widget archivado se puede duplicar tantas veces como haga falta.
 */
export function BancoSection() {
  const { widgets, isLoading, restore, duplicate, purge } = useRadarBank();

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
        Los widgets que sacás del tablero se guardan acá en vez de borrarse. Desde el banco podés
        devolverlos a cualquier sección, duplicarlos como plantilla para armar uno nuevo, o
        eliminarlos definitivamente.
      </p>

      <div className="flex items-center justify-between gap-3">
        <BlockLabel>{widgets.length} widget{widgets.length === 1 ? '' : 's'} en el banco</BlockLabel>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-300" />}
      </div>

      {!isLoading && !widgets.length ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-neutral-200 px-6 py-14 text-center dark:border-neutral-700">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
            <Boxes className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold text-neutral-700 dark:text-neutral-200">El banco está vacío</p>
          <p className="max-w-md text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Cuando guardes un widget en el banco desde el menú de la grilla, va a aparecer acá con todos
            sus bloques intactos, listo para restaurarlo o usarlo de plantilla.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {widgets.map((widget) => (
            <BankCard
              key={widget.key}
              widget={widget}
              onRestore={restore}
              onDuplicate={duplicate}
              onPurge={purge}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BankCard({
  widget,
  onRestore,
  onDuplicate,
  onPurge,
}: {
  widget: RadarWidget;
  onRestore: (key: string, section?: RadarSectionId) => Promise<boolean>;
  onDuplicate: (key: string, newKey: string, options?: { title?: string; section?: RadarSectionId }) => Promise<boolean>;
  onPurge: (key: string) => Promise<boolean>;
}) {
  const { sections, labelOf } = useSectionOptions();
  // La vista previa arranca plegada a propósito: un banco con 30 widgets no
  // puede montar 30 gráficos de una sola vez.
  const [preview, setPreview] = useState(false);
  const [section, setSection] = useState<RadarSectionId>(widget.section);
  const [duplicating, setDuplicating] = useState(false);
  const [newKey, setNewKey] = useState(() => suggestKey(widget.key));
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [busy, setBusy] = useState<null | 'restore' | 'duplicate' | 'purge'>(null);

  const Icon = resolveIcon(widget.icon, 'Layers');
  const tone = toneClasses(widget.tone);

  async function run(kind: 'restore' | 'duplicate' | 'purge', action: () => Promise<boolean>) {
    setBusy(kind);
    try {
      return await action();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-100 bg-white transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-800/60">
      <header className="flex items-start gap-2.5 p-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${tone.soft}`}>
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{widget.title}</p>
          {widget.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{widget.description}</p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
            <span>{widget.blocks.length} bloque{widget.blocks.length === 1 ? '' : 's'}</span>
            <span aria-hidden>·</span>
            <span>{labelOf(widget.section)}</span>
            <span aria-hidden>·</span>
            <span className="normal-case tracking-normal">{widget.key}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            <Archive className="h-3 w-3" /> Guardado el {formatArchivedAt(widget.archivedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPreview((value) => !value)}
          aria-expanded={preview}
          className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <span className="hidden sm:inline">Vista previa</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${preview ? '' : '-rotate-90'}`} />
        </button>
      </header>

      {preview && (
        <div className="border-t border-neutral-100 p-4 dark:border-neutral-800">
          {widget.blocks.length ? (
            <RadarBlocks blocks={widget.blocks} />
          ) : (
            <p className="text-xs text-neutral-400">Este widget no tiene bloques guardados.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-neutral-100 p-3 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <select
            value={section}
            onChange={(event) => setSection(event.target.value)}
            aria-label="Sección de destino"
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-xs font-bold text-neutral-600 transition-all duration-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 sm:flex-none"
          >
            {sections.map((entry) => (
              <option key={entry.section} value={entry.section}>
                {entry.label}{entry.hidden ? ' (oculta)' : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void run('restore', () => onRestore(widget.key, section))}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-bold text-white transition-all duration-200 hover:bg-indigo-600 disabled:opacity-50"
          >
            {busy === 'restore' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Restaurar
          </button>

          <button
            type="button"
            onClick={() => setDuplicating((value) => !value)}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-600 transition-all duration-200 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!confirmPurge) {
              setConfirmPurge(true);
              return;
            }
            void run('purge', () => onPurge(widget.key));
          }}
          onBlur={() => setConfirmPurge(false)}
          disabled={busy !== null}
          className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-200 disabled:opacity-50 ${
            confirmPurge
              ? 'bg-rose-500 text-white hover:bg-rose-600'
              : 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
          }`}
        >
          {busy === 'purge' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {confirmPurge ? '¿Seguro? No se puede deshacer' : 'Eliminar definitivamente'}
        </button>
      </div>

      {duplicating && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 p-3 dark:border-neutral-800 sm:flex-row sm:items-center">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400" htmlFor={`key-${widget.key}`}>
            Key de la copia
          </label>
          <input
            id={`key-${widget.key}`}
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            spellCheck={false}
            placeholder="mi-widget-copia"
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 font-mono text-xs text-neutral-700 transition-all duration-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          />
          <button
            type="button"
            onClick={async () => {
              const created = await run('duplicate', () => onDuplicate(widget.key, newKey.trim(), { section }));
              if (created) {
                setDuplicating(false);
                setNewKey(suggestKey(newKey.trim()));
              }
            }}
            disabled={busy !== null || !newKey.trim()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white transition-all duration-200 hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {busy === 'duplicate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Crear copia en {labelOf(section)}
          </button>
        </div>
      )}
    </section>
  );
}
