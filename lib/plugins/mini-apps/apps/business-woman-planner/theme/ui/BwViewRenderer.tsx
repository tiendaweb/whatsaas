'use client';

import { resolveBwIcon, resolveBwTone, resolveBwWidth } from '../shared/tokens';
import { BwBlockRenderer, type BwCollectionsData, type BwMutateCollection } from './BwBlockRenderer';
import type { BwView } from '../shared/schema';

/**
 * Una vista custom completa: título + los bloques en una grilla responsiva de
 * 12 columnas (1 columna en móvil vía `grid-cols-1`, clase estática — Tailwind
 * v4 no tiene problema con esto porque no se concatena nada). Cada bloque
 * ocupa el ancho que le pidió el conector (`width`, por defecto "full") — así
 * es como se "cambia el tamaño de los widgets" sin drag&drop: el conector lo
 * decide por prompt y publica de nuevo. Los bloques `columns` arman además
 * sus propios carriles horizontales puertas adentro de su celda.
 */
export function BwViewRenderer({
  view,
  data,
  onMutate,
  onNavigate,
}: {
  view: BwView;
  data: BwCollectionsData;
  onMutate: BwMutateCollection;
  onNavigate?: (viewId: string) => void;
}) {
  const Icon = resolveBwIcon(view.icon ?? 'Sparkles');
  const tone = resolveBwTone(view.tone);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tone.soft}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <h1 className="text-xl font-black tracking-[-0.3px] text-zinc-950 md:text-2xl">{view.title}</h1>
      </div>
      {!view.blocks.length ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center text-sm text-zinc-500">
          Esta vista todavía no tiene contenido. Pídele a tu conector de IA que la arme.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {view.blocks.map((block) => (
            <div key={block.id} className={resolveBwWidth(block.width)}>
              <BwBlockRenderer block={block} data={data} onMutate={onMutate} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
