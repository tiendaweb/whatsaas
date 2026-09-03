'use client';

import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { RADAR_BLOCK_DEFAULT_ICON } from '@/lib/plugins/radar/shared/blocks';
import {
  AreaChartBlock, BarChartBlock, FunnelBlock, HeatmapBlock,
  LineChartBlock, PieChartBlock, RadarChartBlock, SparklineBlock,
} from './charts';
import {
  CalloutBlock, CardBlock, ChecklistBlock, DividerBlock, FormBlock, HtmlBlock,
  ImageBlock, KpiBlock, ListBlock, MarkdownBlock, MeterBlock, ProgressBlock,
  QuoteBlock, RepliesBlock, ResourcesBlock, ScoreBlock, StatBlock, StepsBlock,
  TableBlock, TagsBlock, TasksBlock, TextBlock, TilesBlock, TimelineBlock,
} from './structural';
import { ContactsBlock } from './ContactsBlock';
import { DocumentsBlock } from './DocumentsBlock';
import { BlockHeader, BlockSurface } from './primitives';

/**
 * Bloques que traen su propia superficie (o que no deben tenerla). El resto va
 * envuelto en `BlockSurface` para que todo el sistema se vea homogéneo.
 * `columns` va sin envolver porque cada bloque anidado ya recibe la suya.
 */
const UNWRAPPED = new Set<RadarBlock['type']>(['callout', 'divider', 'columns']);

/**
 * Icono por defecto según el tipo de bloque.
 *
 * Sin esto, todo bloque al que la IA no le puso `icon` caía en el mismo genérico
 * (`Sparkles` en `resolveIcon`) y una ficha con seis cards se veía como seis
 * elementos idénticos. El mapa da un icono distinto por tipo, y sigue ganando el
 * que haya elegido la IA. No fuerza que aparezca un encabezado donde no lo había:
 * `BlockHeader` no dibuja nada si el bloque no trae título ni subtítulo.
 */
function withDefaultIcon(block: RadarBlock): RadarBlock {
  if ('icon' in block && block.icon) return block;
  const icon = RADAR_BLOCK_DEFAULT_ICON[block.type];
  return icon ? ({ ...block, icon } as RadarBlock) : block;
}

export function RadarBlockView({
  block: incoming,
  onSelectContact,
}: {
  block: RadarBlock;
  onSelectContact?: (contactId: number) => void;
}) {
  const block = withDefaultIcon(incoming);

  switch (block.type) {
    case 'card': return <CardBlock block={block} />;
    case 'kpi': return <KpiBlock block={block} />;
    case 'score': return <ScoreBlock block={block} />;
    case 'progress': return <ProgressBlock block={block} />;
    case 'meter': return <MeterBlock block={block} />;
    case 'barChart': return <BarChartBlock block={block} />;
    case 'lineChart': return <LineChartBlock block={block} />;
    case 'areaChart': return <AreaChartBlock block={block} />;
    case 'pieChart': return <PieChartBlock block={block} />;
    case 'radarChart': return <RadarChartBlock block={block} />;
    case 'funnel': return <FunnelBlock block={block} />;
    case 'sparkline': return <SparklineBlock block={block} />;
    case 'heatmap': return <HeatmapBlock block={block} />;
    case 'table': return <TableBlock block={block} />;
    case 'timeline': return <TimelineBlock block={block} />;
    case 'list': return <ListBlock block={block} />;
    case 'steps': return <StepsBlock block={block} />;
    case 'callout': return <CalloutBlock block={block} />;
    case 'quote': return <QuoteBlock block={block} />;
    case 'stat': return <StatBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'markdown': return <MarkdownBlock block={block} />;
    case 'html': return <HtmlBlock block={block} />;
    case 'contacts': return <ContactsBlock block={block} onSelect={onSelectContact} />;
    case 'documents': return <DocumentsBlock block={block} />;
    case 'divider': return <DividerBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'tiles': return <TilesBlock block={block} />;
    case 'columns': return <ColumnsBlock block={block} onSelectContact={onSelectContact} />;
    case 'tasks': return <TasksBlock block={block} />;
    case 'checklist': return <ChecklistBlock block={block} />;
    case 'resources': return <ResourcesBlock block={block} />;
    case 'tags': return <TagsBlock block={block} />;
    case 'replies': return <RepliesBlock block={block} />;
    case 'form': return <FormBlock block={block} />;
    default: {
      // Un `type` desconocido llega cuando la base tiene un bloque de una
      // versión más nueva del contrato. No es un error: se ignora en silencio.
      return null;
    }
  }
}

// Literales completos: Tailwind v4 no genera clases concatenadas en runtime.
const COLUMNS_GRID: Record<2 | 3 | 4, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
};

/**
 * `columns` — layout de 2 a 4 columnas con bloques adentro. Vive acá y no en un
 * archivo propio porque necesita `RadarBlocks` (recursión de un solo nivel) y
 * sacarlo afuera armaría un import circular con el barrel.
 */
function ColumnsBlock({
  block,
  onSelectContact,
}: {
  block: Extract<RadarBlock, { type: 'columns' }>;
  onSelectContact?: (contactId: number) => void;
}) {
  const count = Math.min(Math.max(block.columns.length, 2), 4) as 2 | 3 | 4;
  return (
    <div className="min-w-0">
      {(block.title || block.subtitle) && (
        <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      )}
      <div className={`grid grid-cols-1 gap-3 ${COLUMNS_GRID[count]}`}>
        {block.columns.map((column, index) => (
          <RadarBlocks
            key={index}
            blocks={column.blocks as RadarBlock[]}
            onSelectContact={onSelectContact}
            className="min-w-0 space-y-3"
          />
        ))}
      </div>
    </div>
  );
}

/** Renderiza una lista de bloques apilados, cada uno en su superficie. */
export function RadarBlocks({
  blocks,
  onSelectContact,
  className = 'space-y-3',
}: {
  blocks: RadarBlock[];
  onSelectContact?: (contactId: number) => void;
  className?: string;
}) {
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const view = <RadarBlockView block={block} onSelectContact={onSelectContact} />;
        return UNWRAPPED.has(block.type) ? (
          <div key={index}>{view}</div>
        ) : (
          <BlockSurface key={index}>{view}</BlockSurface>
        );
      })}
    </div>
  );
}
