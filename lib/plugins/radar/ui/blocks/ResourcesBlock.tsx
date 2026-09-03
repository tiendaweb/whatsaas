'use client';

/**
 * `resources` — elementos vinculados del sistema, mezclados: documentos,
 * tareas, proyectos, workspaces, personas, archivos y links. Cada `kind` trae
 * icono, tono y destino por defecto; un documento con id se abre en el visor
 * de Radar (mismo mecanismo que el bloque `documents`).
 */
import { ArrowUpRight } from 'lucide-react';
import type { RadarBlock, RadarIcon, RadarResourceKind, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip, resolveIcon, toneClasses } from './primitives';
import { useRadarDocumentOpener } from './radar-context';

export type ResourcesBlockData = Extract<RadarBlock, { type: 'resources' }>;

const KIND_STYLE: Record<RadarResourceKind, { icon: RadarIcon; tone: RadarTone; label: string; href: string | null }> = {
  document: { icon: 'FileText', tone: 'violet', label: 'Documento', href: '/plugins/documents' },
  task: { icon: 'ListTodo', tone: 'emerald', label: 'Tarea', href: '/plugins/tasks' },
  project: { icon: 'FolderKanban', tone: 'indigo', label: 'Proyecto', href: '/plugins/tasks' },
  workspace: { icon: 'Briefcase', tone: 'sky', label: 'Workspace', href: '/plugins/tasks' },
  contact: { icon: 'UserRound', tone: 'teal', label: 'Contacto', href: '/contacts' },
  user: { icon: 'IdCard', tone: 'slate', label: 'Persona', href: null },
  file: { icon: 'Paperclip', tone: 'amber', label: 'Archivo', href: null },
  link: { icon: 'Link2', tone: 'sky', label: 'Link', href: null },
};

function safeUrl(value?: string | null): string | null {
  if (!value) return null;
  const url = value.trim();
  if (url.startsWith('/')) return url;
  return /^https:\/\//i.test(url) ? url : null;
}

export function ResourcesBlock({ block }: { block: ResourcesBlockData }) {
  const openDocument = useRadarDocumentOpener();
  const items = block.items ?? [];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {items.length === 0 ? (
        <BlockEmpty text="Sin elementos vinculados." />
      ) : (
        <div className="space-y-1.5">
          {items.map((item, index) => {
            const style = KIND_STYLE[item.kind];
            const classes = toneClasses(item.tone ?? style.tone);
            const Icon = resolveIcon(item.icon, style.icon);
            const href = safeUrl(item.url) ?? style.href;
            const external = href ? !href.startsWith('/') : false;
            // Un documento con id se abre dentro del panel de Radar si hay visor.
            const opensInViewer = item.kind === 'document' && item.id && openDocument;

            const content = (
              <>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${classes.soft}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-bold text-neutral-800 dark:text-neutral-100">{item.label}</span>
                    {item.badge && <Chip label={item.badge.label} tone={item.badge.tone ?? item.tone} />}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                    {style.label}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </span>
                </span>
                {(href || opensInViewer) && <ArrowUpRight className={`h-3.5 w-3.5 shrink-0 ${classes.text}`} />}
              </>
            );

            const className =
              'flex w-full items-center gap-2.5 rounded-2xl border border-neutral-100 bg-white px-3.5 py-2.5 text-left transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-800/60';
            const hover = ' hover:border-indigo-500';

            if (opensInViewer) {
              return (
                <button key={index} type="button" onClick={() => openDocument(item.id!)} className={className + hover}>
                  {content}
                </button>
              );
            }
            return href ? (
              <a
                key={index}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                className={className + hover}
              >
                {content}
              </a>
            ) : (
              <div key={index} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
