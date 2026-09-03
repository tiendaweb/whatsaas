'use client';

/**
 * `image` — imagen con caption y enlace opcional. La URL viene validada por el
 * schema (https o ruta interna), pero se re-chequea acá: los bloques guardados
 * antes de esa regla también pasan por este render.
 */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader } from './primitives';

export type ImageBlockData = Extract<RadarBlock, { type: 'image' }>;

function safeUrl(value?: string | null): string | null {
  if (!value) return null;
  const url = value.trim();
  if (url.startsWith('/')) return url;
  return /^https:\/\//i.test(url) ? url : null;
}

export function ImageBlock({ block }: { block: ImageBlockData }) {
  const src = safeUrl(block.url);
  const href = safeUrl(block.href);
  if (!src) return null;

  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- URL externa arbitraria: next/image exigiría allow-list de dominios.
    <img
      src={src}
      alt={block.alt ?? block.title ?? ''}
      loading="lazy"
      className="w-full rounded-2xl border border-neutral-100 object-cover dark:border-neutral-800"
      style={block.height ? { maxHeight: block.height } : undefined}
    />
  );

  return (
    <figure className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {href ? (
        <a href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noreferrer">
          {image}
        </a>
      ) : (
        image
      )}
      {block.caption && (
        <figcaption className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{block.caption}</figcaption>
      )}
    </figure>
  );
}
