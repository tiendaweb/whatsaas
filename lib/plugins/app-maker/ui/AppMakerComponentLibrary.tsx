'use client';

import { BarChart3, Blocks, FormInput, LayoutPanelTop } from 'lucide-react';
import {
  APP_MAKER_BLOCK_REGISTRY,
  APP_MAKER_CHART_TYPE_REGISTRY,
  APP_MAKER_FORM_FIELD_TYPE_REGISTRY,
  APP_MAKER_FORM_PRESENTATION_REGISTRY,
} from '../shared/registries';

function NumberedHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="grid grid-cols-[48px_1fr] gap-4 border-b border-[#111111] pb-3"><span className="text-3xl font-bold leading-none text-[#002FA7]">{number}</span><div><h3 className="text-base font-bold tracking-tight">{title}</h3><p className="mt-1 text-xs leading-5 text-[#5F6368]">{description}</p></div></div>;
}

export function AppMakerComponentLibrary() {
  const categories = [...new Set(APP_MAKER_BLOCK_REGISTRY.map((block) => block.category))];
  const fieldCategories = [...new Set(APP_MAKER_FORM_FIELD_TYPE_REGISTRY.map((field) => field.category))];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F7F8] text-[#111111] [font-family:Helvetica_Neue,Helvetica,Arial,sans-serif]">
      <header className="border-b border-[#111111] bg-white px-5 py-5"><div className="flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center bg-[#002FA7] text-white"><Blocks className="size-5" /></span><div><h2 className="text-lg font-bold">Biblioteca completa</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#5F6368]">Estos elementos forman parte del contrato versionado y se renderizan con cualquier Design Template. Se configuran desde JSON y los formularios CRUD también pueden generarse desde el modelador.</p></div></div></header>
      <div className="space-y-10 p-5">
        <section className="space-y-4"><NumberedHeader number="03" title={`${APP_MAKER_BLOCK_REGISTRY.length} bloques`} description="Datos, indicadores, productividad, contenido, media, estructura y acciones." /><div className="space-y-5">{categories.map((category) => <div key={category}><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#002FA7]">{category}</p><div className="grid gap-px border border-[#111111] bg-[#111111] sm:grid-cols-2 lg:grid-cols-3">{APP_MAKER_BLOCK_REGISTRY.filter((block) => block.category === category).map((block) => <article key={block.type} className="bg-white p-3"><div className="flex items-start gap-3"><LayoutPanelTop className="mt-0.5 size-4 shrink-0 text-[#002FA7]" /><div><p className="text-xs font-bold">{block.label}</p><code className="mt-1 block text-[10px] text-[#002FA7]">{block.type}</code><p className="mt-2 text-[11px] leading-4 text-[#5F6368]">{block.description}</p></div></div></article>)}</div></div>)}</div></section>
        <section className="space-y-4"><NumberedHeader number="04" title={`${APP_MAKER_FORM_FIELD_TYPE_REGISTRY.length} campos de formulario`} description="Controles de texto, números, fechas, selección, relaciones, archivos y sistema." /><div className="space-y-5">{fieldCategories.map((category) => <div key={category}><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#002FA7]">{category}</p><div className="grid gap-px border border-[#111111] bg-[#111111] sm:grid-cols-3 lg:grid-cols-4">{APP_MAKER_FORM_FIELD_TYPE_REGISTRY.filter((field) => field.category === category).map((field) => <div key={field.type} className="flex items-center gap-2 bg-white p-3"><FormInput className="size-3.5 text-[#002FA7]" /><div><p className="text-xs font-bold">{field.label}</p><code className="text-[9px] text-[#5F6368]">{field.type}</code></div></div>)}</div></div>)}</div></section>
        <section className="grid gap-8 lg:grid-cols-2"><div className="space-y-4"><NumberedHeader number="05" title={`${APP_MAKER_CHART_TYPE_REGISTRY.length} gráficos`} description="Todos admiten datos reales y series configurables." /><div className="grid gap-px border border-[#111111] bg-[#111111] sm:grid-cols-2">{APP_MAKER_CHART_TYPE_REGISTRY.map((chart) => <div key={chart.type} className="flex items-center gap-3 bg-white p-3"><BarChart3 className="size-4 text-[#002FA7]" /><div><p className="text-xs font-bold">{chart.label}</p><p className="text-[10px] text-[#5F6368]">{chart.supportsMultipleSeries ? 'Varias series' : 'Una serie'}</p></div></div>)}</div></div><div className="space-y-4"><NumberedHeader number="06" title={`${APP_MAKER_FORM_PRESENTATION_REGISTRY.length} maneras de presentar formularios`} description="La estructura de campos es independiente de su presentación." /><div className="border border-[#111111]">{APP_MAKER_FORM_PRESENTATION_REGISTRY.map((presentation, index) => <div key={presentation.type} className="grid grid-cols-[36px_1fr] gap-3 border-b border-[#111111] bg-white p-3 last:border-0"><span className="text-sm font-bold text-[#002FA7]">{String(index + 1).padStart(2, '0')}</span><div><p className="text-xs font-bold">{presentation.label}</p><code className="text-[9px] text-[#002FA7]">{presentation.type}</code><p className="mt-1 text-[11px] leading-4 text-[#5F6368]">{presentation.description}</p></div></div>)}</div></div></section>
      </div>
    </div>
  );
}
