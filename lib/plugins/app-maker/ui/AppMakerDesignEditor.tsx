'use client';

import { Check, Gauge, LayoutTemplate, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApplicationDefinition } from '../shared/contract';
import { APP_MAKER_DESIGN_TEMPLATES, type AppMakerDesignTemplateKey } from '../shared/design-templates';

const ACCENTS = [
  { key: 'emerald', label: 'Esmeralda', className: 'bg-emerald-600' },
  { key: 'blue', label: 'Azul', className: 'bg-blue-600' },
  { key: 'violet', label: 'Violeta', className: 'bg-violet-600' },
  { key: 'rose', label: 'Rosa', className: 'bg-rose-600' },
  { key: 'amber', label: 'Ámbar', className: 'bg-amber-600' },
  { key: 'slate', label: 'Pizarra', className: 'bg-slate-700' },
] as const;

export function AppMakerDesignEditor({ definition, onChange }: { definition: ApplicationDefinition; onChange: (next: ApplicationDefinition) => void }) {
  function updateDesign(template: AppMakerDesignTemplateKey) {
    onChange({ ...structuredClone(definition), design: { template } });
  }

  function updateTheme(theme: Partial<ApplicationDefinition['theme']>) {
    onChange({ ...structuredClone(definition), theme: { ...definition.theme, ...theme } });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F7F8] text-[#111111] [font-family:Helvetica_Neue,Helvetica,Arial,sans-serif]">
      <div className="border-b border-[#111111] bg-white px-5 py-5">
        <div className="grid grid-cols-[48px_1fr] gap-4">
          <span className="text-3xl font-bold leading-none text-[#002FA7]">02</span>
          <div><h2 className="text-lg font-bold tracking-tight">Design Templates</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#5F6368]">El diseño es independiente del modelo, los conectores y los workflows. Cambiarlo no modifica datos ni comportamiento.</p></div>
        </div>
      </div>

      <div className="space-y-8 p-5">
        <section>
          <div className="mb-3 flex items-center gap-2 border-b border-[#111111] pb-2"><LayoutTemplate className="size-4 text-[#002FA7]" /><h3 className="text-xs font-bold uppercase tracking-[0.14em]">Lenguaje visual</h3></div>
          <div className="grid gap-px border border-[#111111] bg-[#111111] sm:grid-cols-2">
            {APP_MAKER_DESIGN_TEMPLATES.map((template, index) => {
              const active = (definition.design?.template ?? 'adaptive-light-dark') === template.key;
              return (
                <button key={template.key} type="button" onClick={() => updateDesign(template.key)} className="group bg-white p-4 text-left hover:bg-[#F1F3F8]">
                  <div className="mb-4 flex h-24 overflow-hidden border border-black/20" style={{ background: template.preview.background }}>
                    <div className="w-1/4 border-r border-black/20" style={{ background: template.preview.surface }} />
                    <div className="flex flex-1 flex-col gap-2 p-3"><span className="h-2 w-1/2" style={{ background: template.preview.foreground }} /><span className="h-8 w-full border border-black/10" style={{ background: template.preview.surface }} /><span className="h-2 w-1/3" style={{ background: template.preview.accent }} /></div>
                  </div>
                  <div className="flex items-start gap-3"><span className="text-xl font-bold leading-none text-[#002FA7]">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{template.name}</p>{active && <span className="flex size-5 items-center justify-center bg-[#002FA7] text-white"><Check className="size-3" /></span>}</div><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#002FA7]">{template.anchor}</p><p className="mt-2 text-xs leading-5 text-[#5F6368]">{template.description}</p></div></div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2 border-b border-[#111111] pb-2"><Palette className="size-4 text-[#002FA7]" /><h3 className="text-xs font-bold uppercase tracking-[0.14em]">Acento compatible</h3></div>
            <div className="grid grid-cols-2 gap-px border border-[#111111] bg-[#111111] sm:grid-cols-3">
              {ACCENTS.map((accent) => <button key={accent.key} type="button" onClick={() => updateTheme({ accent: accent.key })} className={cn('flex items-center gap-2 bg-white px-3 py-3 text-xs hover:bg-[#F1F3F8]', definition.theme.accent === accent.key && 'font-bold')}><span className={cn('size-3', accent.className)} />{accent.label}{definition.theme.accent === accent.key && <Check className="ml-auto size-3 text-[#002FA7]" />}</button>)}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[#5F6368]">Claro / Oscuro y SaaS Neutral utilizan este acento directamente. Los demás templates conservan su color de señal propio para mantener su identidad.</p>
          </div>
          <div>
            <div className="mb-3 flex items-center gap-2 border-b border-[#111111] pb-2"><Gauge className="size-4 text-[#002FA7]" /><h3 className="text-xs font-bold uppercase tracking-[0.14em]">Densidad</h3></div>
            <div className="grid grid-cols-2 gap-px border border-[#111111] bg-[#111111]">
              {(['comfortable', 'compact'] as const).map((density) => <button key={density} type="button" onClick={() => updateTheme({ density })} className={cn('bg-white px-4 py-4 text-left hover:bg-[#F1F3F8]', definition.theme.density === density && 'bg-[#E9EEFF]')}><span className="flex items-center justify-between text-sm font-bold">{density === 'comfortable' ? 'Cómoda' : 'Compacta'}{definition.theme.density === density && <Check className="size-4 text-[#002FA7]" />}</span><span className="mt-1 block text-xs text-[#5F6368]">{density === 'comfortable' ? 'Más aire entre controles y contenidos.' : 'Más información visible por pantalla.'}</span></button>)}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
