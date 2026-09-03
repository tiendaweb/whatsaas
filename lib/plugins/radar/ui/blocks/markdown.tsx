'use client';

/**
 * Motor de markdown de Radar.
 *
 * Parsea a NODOS REACT, no a un string de HTML. Cuesta más código que un
 * `replace` con regex + `dangerouslySetInnerHTML`, pero elimina de raíz una
 * clase entera de XSS: el texto de un bloque lo escribe una IA a partir de
 * conversaciones reales de clientes, así que es contenido no confiable que se
 * dibuja en el mismo origen que /dashboard y /sign-in. Es el mismo precio que
 * ya paga el renderer de Documentos (`lib/plugins/radar/ui/DocumentContent.tsx`).
 *
 * Subconjunto soportado — en línea: **negrita**, *itálica* / _itálica_,
 * `código`, ~~tachado~~, [enlaces](url) y escapes con \. En bloque: títulos
 * `#`..`######`, listas con viñeta y numeradas, checklists `- [ ]`, citas `>`,
 * cercos de código ```, reglas `---` y tablas `|`.
 */
import { Fragment } from 'react';

/* ------------------------------------------------------------------ */
/* URLs                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Whitelist de destinos. Todo lo que no entre se dibuja como texto plano, sin
 * enlace: `javascript:`, `data:` y las URL protocolo-relativas (`//host`) no
 * llegan nunca al DOM.
 */
export function isSafeMarkdownHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith('//')) return false;
  if (value.startsWith('/') || value.startsWith('#')) return true;
  return /^(?:https?:|mailto:|tel:)/i.test(value);
}

/* ------------------------------------------------------------------ */
/* Markdown en línea                                                    */
/* ------------------------------------------------------------------ */

/** Tope de anidamiento: corta un `**a **b** c**` patológico sin recursión infinita. */
const MAX_DEPTH = 4;

const ESCAPABLE = '\\`*_~[]()#-+.!>|';

function isWordChar(char: string): boolean {
  return /[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(char);
}

/**
 * Busca el cierre de un énfasis de un solo caracter. Para `_` exige que el
 * cierre no quede pegado a una palabra, así `nombre_de_variable` no se
 * convierte en itálica.
 */
function findEmphasisEnd(text: string, start: number, marker: string): number {
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\n') return -1;
    if (char !== marker) continue;
    if (index === start + 1) return -1;
    if (marker === '_' && isWordChar(text[index + 1] ?? '')) continue;
    return index;
  }
  return -1;
}

function parseLink(text: string, start: number): { label: string; href: string; next: number } | null {
  const close = text.indexOf(']', start + 1);
  if (close < 0 || text[close + 1] !== '(') return null;
  const end = text.indexOf(')', close + 2);
  if (end < 0) return null;
  const raw = text.slice(close + 2, end).trim();
  // `[t](url "título")`: el título se descarta, sólo interesa el destino.
  const href = raw.split(/\s+/)[0] ?? '';
  return { label: text.slice(start + 1, close), href, next: end + 1 };
}

const CODE_CLASS = 'rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-neutral-800';
const LINK_CLASS = 'font-medium text-indigo-600 underline underline-offset-2 break-words dark:text-indigo-400';

function inlineNodes(text: string, depth: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buffer = '';
  let key = 0;

  const flush = () => {
    if (!buffer) return;
    out.push(<Fragment key={`t${key++}`}>{buffer}</Fragment>);
    buffer = '';
  };
  const push = (node: React.ReactNode) => {
    flush();
    out.push(<Fragment key={`n${key++}`}>{node}</Fragment>);
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && ESCAPABLE.includes(text[i + 1] ?? '')) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        push(<code className={CODE_CLASS}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }

    if (depth < MAX_DEPTH && char === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        push(<strong className="font-bold text-neutral-900 dark:text-white">{inlineNodes(text.slice(i + 2, end), depth + 1)}</strong>);
        i = end + 2;
        continue;
      }
    }

    if (depth < MAX_DEPTH && char === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2);
      if (end > i + 2) {
        push(<s className="opacity-70">{inlineNodes(text.slice(i + 2, end), depth + 1)}</s>);
        i = end + 2;
        continue;
      }
    }

    if (depth < MAX_DEPTH && (char === '*' || char === '_')) {
      const previous = i > 0 ? text[i - 1] : '';
      if (!(char === '_' && isWordChar(previous))) {
        const end = findEmphasisEnd(text, i, char);
        if (end > i + 1) {
          push(<em>{inlineNodes(text.slice(i + 1, end), depth + 1)}</em>);
          i = end + 1;
          continue;
        }
      }
    }

    if (depth < MAX_DEPTH && char === '[') {
      const link = parseLink(text, i);
      if (link) {
        const label = inlineNodes(link.label, depth + 1);
        const href = link.href.trim();
        // Una ruta interna abre en la misma pestaña; lo de afuera, en otra.
        const external = !href.startsWith('/') && !href.startsWith('#');
        push(
          isSafeMarkdownHref(href) ? (
            <a
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
              className={LINK_CLASS}
            >
              {label}
            </a>
          ) : (
            <>{label}</>
          ),
        );
        i = link.next;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  flush();
  return out;
}

/** Markdown de una sola línea: devuelve nodos React, nunca HTML. */
export function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  return <>{inlineNodes(text, 0)}</>;
}

/* ------------------------------------------------------------------ */
/* Markdown de bloque                                                   */
/* ------------------------------------------------------------------ */

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-6 text-2xl font-black tracking-tight text-neutral-900 dark:text-white',
  2: 'mt-5 text-xl font-black tracking-tight text-neutral-900 dark:text-white',
  3: 'mt-4 text-base font-bold text-neutral-900 dark:text-white',
};

const BULLET_RE = /^\s{0,8}[-*+]\s+/;
const TASK_RE = /^\s{0,8}[-*+]\s+\[([ xX])\]\s*(.*)$/;
const ORDERED_RE = /^\s{0,8}\d{1,3}[.)]\s+/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const RULE_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const FENCE_RE = /^\s{0,3}(?:```|~~~)(.*)$/;

/** Una fila de tabla sólo cuenta como tal si abajo tiene la fila separadora. */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  return /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/.test(trimmed);
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function startsBlock(line: string): boolean {
  return (
    !line.trim()
    || HEADING_RE.test(line)
    || RULE_RE.test(line)
    || QUOTE_RE.test(line)
    || FENCE_RE.test(line)
    || BULLET_RE.test(line)
    || ORDERED_RE.test(line)
    || line.trim().startsWith('|')
  );
}

function parseBlocks(source: string, depth: number): React.ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      // Un cerco sin cierre igual se dibuja: se lo da por cerrado al final.
      if (i < lines.length) i += 1;
      out.push(
        <pre key={`k${key++}`} className="mt-3 overflow-x-auto rounded-2xl bg-neutral-900 p-3.5 text-xs leading-relaxed text-neutral-100">
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (RULE_RE.test(line)) {
      out.push(<hr key={`k${key++}`} className="my-5 border-neutral-100 dark:border-neutral-800" />);
      i += 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = Math.min(3, heading[1].length);
      const className = HEADING_CLASS[level];
      const content = renderInlineMarkdown(heading[2].trim());
      if (level === 1) out.push(<h1 key={`k${key++}`} className={className}>{content}</h1>);
      else if (level === 2) out.push(<h2 key={`k${key++}`} className={className}>{content}</h2>);
      else out.push(<h3 key={`k${key++}`} className={className}>{content}</h3>);
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(lines[i].match(QUOTE_RE)?.[1] ?? '');
        i += 1;
      }
      out.push(
        <blockquote key={`k${key++}`} className="mt-3 border-l-4 border-indigo-200 pl-4 text-sm italic text-neutral-600 [&>*:first-child]:mt-0 dark:border-indigo-500/40 dark:text-neutral-400">
          {depth < MAX_DEPTH ? parseBlocks(body.join('\n'), depth + 1) : body.join('\n')}
        </blockquote>,
      );
      continue;
    }

    if (line.trim().startsWith('|') && isTableSeparator(lines[i + 1] ?? '')) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(
        <div key={`k${key++}`} className="-mx-1 mt-3 overflow-x-auto px-1">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th key={index} className="border border-neutral-100 bg-neutral-50 px-2.5 py-1.5 text-left font-bold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {header.map((_, cellIndex) => (
                    <td key={cellIndex} className="border border-neutral-100 px-2.5 py-1.5 align-top break-words text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
                      {renderInlineMarkdown(row[cellIndex] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (TASK_RE.test(line)) {
      const items: Array<{ checked: boolean; text: string }> = [];
      while (i < lines.length) {
        const task = lines[i].match(TASK_RE);
        if (!task) break;
        items.push({ checked: task[1].toLowerCase() === 'x', text: task[2] });
        i += 1;
      }
      out.push(
        <ul key={`k${key++}`} className="mt-3 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input type="checkbox" checked={item.checked} readOnly className="mt-1 h-3.5 w-3.5 shrink-0 accent-indigo-500" />
              <span className="min-w-0 flex-1 break-words">{renderInlineMarkdown(item.text)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const ordered = !BULLET_RE.test(line);
      const pattern = ordered ? ORDERED_RE : BULLET_RE;
      const items: string[] = [];
      // Sin anidamiento real: una sub-lista se aplana al mismo nivel. Alcanza
      // con que no rompa el render.
      while (i < lines.length && pattern.test(lines[i]) && !TASK_RE.test(lines[i])) {
        items.push(lines[i].replace(pattern, ''));
        i += 1;
      }
      const itemNodes = items.map((item, index) => (
        <li key={index} className="break-words leading-relaxed">{renderInlineMarkdown(item)}</li>
      ));
      out.push(ordered ? (
        <ol key={`k${key++}`} className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">{itemNodes}</ol>
      ) : (
        <ul key={`k${key++}`} className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">{itemNodes}</ul>
      ));
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && !startsBlock(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`k${key++}`} className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {renderInlineMarkdown(paragraph.join('\n'))}
      </p>,
    );
  }

  return out;
}

/** Markdown completo (títulos, listas, tablas, citas, código). */
export function Markdown({ text, className = '' }: { text?: string | null; className?: string }) {
  const source = (text ?? '').trim();
  if (!source) return null;
  return (
    <div className={`min-w-0 break-words [&>*:first-child]:mt-0 ${className}`}>
      {parseBlocks(source, 0)}
    </div>
  );
}
