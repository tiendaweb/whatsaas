'use client';

import { useRef, useState } from 'react';
import {
  ChevronRight,
  Download,
  FolderOpen,
  HelpCircle,
  Moon,
  Palette,
  Sun,
  Trash,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { ACENTOS, type EscrituraEtiquetas, type EtiquetaUnificada, type GrupoProyecto, type Preferencias, type Tema } from '../data/tipos';
import { ES } from '../i18n/es';

export function Ajustes(props: {
  prefs: Preferencias;
  onPrefs: (patch: Partial<Preferencias>) => void;
  grupos: GrupoProyecto[];
  etiquetas: EtiquetaUnificada[];
  onComoUsar: () => void;
  onVolverClasico: () => void;
  onNuevaEtiqueta: (name: string, color: string) => void;
  onRenombrar: (etiqueta: EtiquetaUnificada, name: string) => void;
  onBorrar: (etiqueta: EtiquetaUnificada) => void;
  onExportar: () => void;
  onImportar: (file: File) => void;
  onLimpiar: (projectId: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState('');
  const dark = props.prefs.tema === 'oscuro';

  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className={`${C.card} p-8 space-y-4`}>
      <div className={C.rotulo}>{title}</div>
      {children}
    </section>
  );

  return (
    <div className="space-y-6 pb-32">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-[var(--t-text)]">{ES.ajustes.titulo}</h1>
        <p className="text-[var(--t-text-secondary)] mt-1">{ES.ajustes.bajada}</p>
      </div>

      <Block title={ES.ajustes.interfaz}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center', dark ? 'bg-indigo-100 text-indigo-500' : 'bg-amber-100 text-amber-500')}>
              {dark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <div className="font-bold text-[var(--t-text)]">{ES.ajustes.apariencia}</div>
              <div className="text-sm text-[var(--t-text-secondary)]">{ES.ajustes.aparienciaBajada}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => props.onPrefs({ tema: (dark ? 'claro' : 'oscuro') as Tema })}
            className={cn('w-14 h-8 rounded-full relative', dark ? 'bg-[var(--tareas-accent)]' : 'bg-neutral-200')}
            aria-label={ES.ajustes.apariencia}
          >
            <span className={cn('absolute top-1 w-6 h-6 bg-white rounded-full transition-all', dark ? 'left-7' : 'left-1')} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[color-mix(in_srgb,var(--tareas-accent)_15%,transparent)] text-[var(--tareas-accent)] flex items-center justify-center">
              <Palette className="w-5 h-5" />
            </div>
            <div className="font-bold text-[var(--t-text)]">{ES.ajustes.acento}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {ACENTOS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => props.onPrefs({ acento: color })}
                className={cn('w-11 h-11 rounded-2xl', props.prefs.acento === color && 'ring-2 ring-offset-2 ring-[var(--tareas-accent)]')}
                style={{ background: color }}
                aria-label={color}
              />
            ))}
          </div>
        </div>
      </Block>

      <Block title={ES.ajustes.destinoYEscritura}>
        <label className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-[color-mix(in_srgb,var(--tareas-accent)_15%,transparent)] text-[var(--tareas-accent)] flex items-center justify-center">
              <FolderOpen className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-bold text-[var(--t-text)]">{ES.ajustes.proyectoDestino}</span>
              <span className="text-sm text-[var(--t-text-secondary)]">{ES.ajustes.proyectoDestinoBajada}</span>
            </span>
          </span>
          <select
            value={props.prefs.destinoProjectId ?? ''}
            onChange={(event) => props.onPrefs({ destinoProjectId: event.target.value ? Number(event.target.value) : null })}
            className={C.control}
          >
            <option value="">{ES.ajustes.elegirProyecto}</option>
            {props.grupos.map((grupo) =>
              grupo.projectIds.map((id) => (
                <option key={id} value={id}>
                  {grupo.workspaceNombre} · {grupo.name}{grupo.projectIds.length > 1 ? ` #${id}` : ''}
                </option>
              )),
            )}
          </select>
        </label>
        <div className="space-y-2">
          <div className="font-bold text-[var(--t-text)]">{ES.ajustes.escrituraEtiquetas}</div>
          {(['conservadora', 'completa'] as EscrituraEtiquetas[]).map((mode) => (
            <label key={mode} className="flex items-start gap-3 bg-[var(--t-surface-2)] rounded-2xl px-4 py-4">
              <input
                type="radio"
                name="escritura"
                checked={props.prefs.escritura === mode}
                onChange={() => props.onPrefs({ escritura: mode })}
                className="mt-1"
              />
              <span>
                <span className="font-bold text-[var(--t-text)]">
                  {mode === 'conservadora' ? ES.ajustes.conservadora : ES.ajustes.completa}
                </span>
                <span className="block text-sm text-[var(--t-text-secondary)]">
                  {mode === 'conservadora' ? ES.ajustes.conservadoraBajada : ES.ajustes.completaBajada}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Block>

      <Block title={ES.ajustes.meta}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-[var(--t-text)]">{ES.ajustes.objetivo}</span>
          <span className="bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)] text-[10px] font-bold px-3 py-1 rounded-lg">
            {ES.ajustes.objetivoBadge(props.prefs.objetivoDiario)}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={props.prefs.objetivoDiario}
          onChange={(event) => props.onPrefs({ objetivoDiario: Number(event.target.value) })}
          className="t-range w-full"
          style={{ ['--t-range' as string]: `${((props.prefs.objetivoDiario - 1) / 19) * 100}%` }}
        />
      </Block>

      <Block title={ES.ajustes.gestionEtiquetas}>
        {props.etiquetas.map((etiqueta) => (
          <div key={etiqueta.name} className="bg-[var(--t-surface-2)] rounded-2xl px-4 py-4 flex items-center gap-4 group">
            <span className="w-7 h-7 rounded-lg shrink-0" style={{ background: etiqueta.color }} />
            <input
              defaultValue={etiqueta.name}
              className="flex-1 bg-transparent font-bold outline-none text-[var(--t-text)]"
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== etiqueta.name) props.onRenombrar(etiqueta, name);
              }}
            />
            <span className="text-[10px] text-[var(--t-muted)]">{ES.ajustes.enProyectos(etiqueta.projectIds.length)}</span>
            <button
              type="button"
              onClick={() => props.onBorrar(etiqueta)}
              className="opacity-0 group-hover:opacity-100 text-rose-400"
              aria-label={ES.seleccion.eliminar}
            >
              <Trash className="w-4 h-4" />
            </button>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!newTag.trim()) return;
            props.onNuevaEtiqueta(newTag.trim(), ACENTOS[0]);
            setNewTag('');
          }}
        >
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder={ES.ajustes.agregarEtiqueta}
            className="w-full border-2 border-dashed rounded-2xl py-4 text-xs font-black tracking-widest text-[var(--t-muted)] text-center outline-none"
          />
        </form>
      </Block>

      <Block title={ES.ajustes.ayuda}>
        <button type="button" onClick={props.onComoUsar} className="w-full flex items-center justify-between">
          <span className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-[color-mix(in_srgb,var(--tareas-accent)_15%,transparent)] text-[var(--tareas-accent)] flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </span>
            <span className="text-left">
              <span className="block font-bold text-[var(--t-text)]">{ES.ajustes.ayudaTitulo}</span>
              <span className="text-sm text-[var(--t-text-secondary)]">{ES.ajustes.ayudaBajada}</span>
            </span>
          </span>
          <ChevronRight className="w-5 h-5 text-[var(--t-muted)]" />
        </button>
      </Block>

      <Block title={ES.ajustes.datos}>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={props.onExportar} className="bg-[var(--t-surface-2)] rounded-2xl py-4 text-xs font-black tracking-widest inline-flex items-center justify-center gap-2">
            <Download className="w-4 h-4" />
            {ES.ajustes.exportar}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="bg-[var(--t-surface-2)] rounded-2xl py-4 text-xs font-black tracking-widest inline-flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" />
            {ES.ajustes.importar}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onImportar(file);
            event.target.value = '';
          }}
        />
        {props.prefs.destinoProjectId && (
          <button
            type="button"
            onClick={() => props.onLimpiar(props.prefs.destinoProjectId!)}
            className="w-full text-xs font-bold text-rose-400"
          >
            {ES.ajustes.limpiarCompletadas}
          </button>
        )}
      </Block>

      <Block title={ES.ajustes.interfazClasica}>
        <button type="button" onClick={props.onVolverClasico} className="w-full text-left">
          <div className="font-bold text-[var(--t-text)]">{ES.ajustes.volverClasico}</div>
          <div className="text-sm text-[var(--t-text-secondary)]">{ES.ajustes.volverClasicoBajada}</div>
        </button>
      </Block>
    </div>
  );
}
