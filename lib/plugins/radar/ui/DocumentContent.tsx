'use client';

import { Fragment } from 'react';
import { isSafeHref, isSafeImageSrc } from '@/lib/plugins/documents/shared/extensions';

/**
 * Renderizador de sólo lectura del JSON de Documentos (ProseMirror/Tiptap).
 *
 * Radar necesita LEER informes dentro de su propio panel, sin montar el editor
 * completo (Tiptap + extensiones pesa, y acá no se edita nada). Cubre los nodos
 * que el esquema de Documentos permite; cualquier nodo desconocido se ignora en
 * lugar de romper el informe.
 *
 * Seguridad: nunca se inyecta HTML. `href` y `src` pasan por las mismas
 * whitelists que usa el guardado (`isSafeHref` / `isSafeImageSrc`).
 */
type PmMark = { type?: string; attrs?: Record<string, unknown> };
type PmNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: PmMark[];
  content?: PmNode[];
};

function applyMarks(text: string, marks: PmMark[] | undefined, key: string): React.ReactNode {
  let node: React.ReactNode = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold': node = <strong>{node}</strong>; break;
      case 'italic': node = <em>{node}</em>; break;
      case 'strike': node = <s>{node}</s>; break;
      case 'underline': node = <u>{node}</u>; break;
      case 'code':
        node = <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-neutral-800">{node}</code>;
        break;
      case 'link': {
        const href = mark.attrs?.href;
        node = isSafeHref(href) ? (
          <a
            href={String(href)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
          >
            {node}
          </a>
        ) : node;
        break;
      }
      default: break;
    }
  }
  return <Fragment key={key}>{node}</Fragment>;
}

function renderNodes(nodes: PmNode[] | undefined, prefix: string): React.ReactNode {
  if (!nodes?.length) return null;
  return nodes.map((node, index) => <DocumentNode key={`${prefix}-${index}`} node={node} path={`${prefix}-${index}`} />);
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-6 text-2xl font-black tracking-tight text-neutral-900 dark:text-white',
  2: 'mt-5 text-xl font-black tracking-tight text-neutral-900 dark:text-white',
  3: 'mt-4 text-base font-bold text-neutral-900 dark:text-white',
};

function DocumentNode({ node, path }: { node: PmNode; path: string }) {
  switch (node.type) {
    case 'doc':
      return <>{renderNodes(node.content, path)}</>;

    case 'text':
      return <>{applyMarks(node.text ?? '', node.marks, path)}</>;

    case 'paragraph':
      return <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{renderNodes(node.content, path)}</p>;

    case 'heading': {
      const level = Number(node.attrs?.level) || 2;
      const className = HEADING_CLASS[Math.min(3, Math.max(1, level))] ?? HEADING_CLASS[3];
      const children = renderNodes(node.content, path);
      if (level === 1) return <h1 className={className}>{children}</h1>;
      if (level === 2) return <h2 className={className}>{children}</h2>;
      return <h3 className={className}>{children}</h3>;
    }

    case 'bulletList':
      return <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">{renderNodes(node.content, path)}</ul>;

    case 'orderedList':
      return <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">{renderNodes(node.content, path)}</ol>;

    case 'listItem':
      return <li className="leading-relaxed [&>p]:mt-0">{renderNodes(node.content, path)}</li>;

    case 'taskList':
      return <ul className="mt-3 space-y-1.5">{renderNodes(node.content, path)}</ul>;

    case 'taskItem':
      return (
        <li className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input type="checkbox" checked={Boolean(node.attrs?.checked)} readOnly className="mt-1 h-3.5 w-3.5 shrink-0 accent-indigo-500" />
          <span className="min-w-0 flex-1 [&>p]:mt-0">{renderNodes(node.content, path)}</span>
        </li>
      );

    case 'blockquote':
      return (
        <blockquote className="mt-3 border-l-4 border-indigo-200 pl-4 text-sm italic text-neutral-600 dark:border-indigo-500/40 dark:text-neutral-400">
          {renderNodes(node.content, path)}
        </blockquote>
      );

    case 'codeBlock':
      return (
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-neutral-900 p-3.5 text-xs leading-relaxed text-neutral-100">
          <code>{node.content?.map((child) => child.text ?? '').join('')}</code>
        </pre>
      );

    case 'horizontalRule':
      return <hr className="my-5 border-neutral-100 dark:border-neutral-800" />;

    case 'hardBreak':
      return <br />;

    case 'image': {
      const src = node.attrs?.src;
      if (!isSafeImageSrc(src)) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={String(src)} alt={String(node.attrs?.alt ?? '')} className="mt-3 max-w-full rounded-2xl" />;
    }

    case 'table':
      return (
        <div className="-mx-1 mt-3 overflow-x-auto px-1">
          <table className="w-full border-collapse text-xs">
            <tbody>{renderNodes(node.content, path)}</tbody>
          </table>
        </div>
      );

    case 'tableRow':
      return <tr>{renderNodes(node.content, path)}</tr>;

    case 'tableHeader':
      return (
        <th className="border border-neutral-100 bg-neutral-50 px-2.5 py-1.5 text-left font-bold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
          {renderNodes(node.content, path)}
        </th>
      );

    case 'tableCell':
      return (
        <td className="border border-neutral-100 px-2.5 py-1.5 align-top text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
          {renderNodes(node.content, path)}
        </td>
      );

    case 'documentLink':
      return (
        <a
          href={`/plugins/documents/doc/${node.attrs?.documentId ?? ''}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[0.9em] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
        >
          @{String(node.attrs?.label ?? 'documento')}
        </a>
      );

    default:
      // Nodo de una versión más nueva del editor: se ignora su envoltorio pero
      // se intenta dibujar el contenido, así el informe no pierde texto.
      return <>{renderNodes(node.content, path)}</>;
  }
}

export function DocumentContent({ content }: { content: unknown }) {
  if (!content || typeof content !== 'object') return null;
  return <div className="[&>*:first-child]:mt-0">{<DocumentNode node={content as PmNode} path="d" />}</div>;
}
