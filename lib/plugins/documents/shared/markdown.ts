/**
 * Markdown → JSON de ProseMirror para documentos creados desde scripts y conectores.
 * Mantiene el subconjunto seguro del editor y cubre los bloques de documentación
 * habituales: tablas, tareas, encabezados, listas, citas, código y separadores.
 */
type Inline =
  | { type: 'text'; text: string; marks?: Array<Record<string, unknown>> }
  | { type: 'hardBreak' };
type Block = Record<string, unknown>;

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\)|<https?:\/\/[^>]+>)/g;

function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];

  const push = (text: string, marks?: Array<Record<string, unknown>>) => {
    if (!text) return;
    nodes.push(marks ? { type: 'text', text, marks } : { type: 'text', text });
  };

  let cursor = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    push(source.slice(cursor, start));
    cursor = start + token.length;

    if (token.startsWith('**') || token.startsWith('__')) push(token.slice(2, -2), [{ type: 'bold' }]);
    else if (token.startsWith('~~')) push(token.slice(2, -2), [{ type: 'strike' }]);
    else if (token.startsWith('`')) push(token.slice(1, -1), [{ type: 'code' }]);
    else if (token.startsWith('[')) {
      const [, label, href] = token.match(/\[([^\]]+)\]\(([^)]+)\)/) ?? [];
      push(label ?? token, [{ type: 'link', attrs: { href } }]);
    } else if (token.startsWith('<')) {
      const href = token.slice(1, -1);
      push(href, [{ type: 'link', attrs: { href } }]);
    } else push(token.slice(1, -1), [{ type: 'italic' }]);
  }
  push(source.slice(cursor));

  return nodes;
}

const paragraph = (text: string): Block => {
  const content = parseInline(text);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

const paragraphLines = (lines: string[]): Block => {
  const content: Inline[] = [];

  lines.forEach((line, index) => {
    const hasHardBreak = /(?: {2}|\\)$/.test(line);
    const clean = hasHardBreak ? line.replace(/(?: {2}|\\)$/, '') : line;
    content.push(...parseInline(clean.trim()));

    if (index < lines.length - 1) {
      content.push(hasHardBreak ? { type: 'hardBreak' } : { type: 'text', text: ' ' });
    }
  });

  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

const listItem = (text: string): Block => ({ type: 'listItem', content: [paragraph(text)] });
const taskItem = (text: string, checked: boolean): Block => ({
  type: 'taskItem',
  attrs: { checked },
  content: [paragraph(text)],
});

function splitTableRow(source: string): string[] {
  const row = source.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;

  for (const char of row) {
    if (escaped) {
      cell += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

const isTableDivider = (source: string): boolean => {
  if (!source.includes('|')) return false;
  const cells = splitTableRow(source);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
};

const tableCell = (value: string, header = false): Block => ({
  type: header ? 'tableHeader' : 'tableCell',
  content: [paragraph(value)],
});

export function markdownToProseMirror(markdown: string): Block {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const content: Block[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed === '---') {
      content.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    // Bloque de código con ``` — lo usamos para los diagramas en monoespaciado.
    if (trimmed.startsWith('```')) {
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1; // cierre de la cerca
      content.push({
        type: 'codeBlock',
        content: buffer.length ? [{ type: 'text', text: buffer.join('\n') }] : undefined,
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && trimmed.includes('|') && isTableDivider(lines[index + 1])) {
      const headerCells = splitTableRow(line);
      const columnCount = headerCells.length;
      const rows: Block[] = [
        { type: 'tableRow', content: headerCells.map((cell) => tableCell(cell, true)) },
      ];

      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = splitTableRow(lines[index]);
        const normalized = Array.from({ length: columnCount }, (_, cellIndex) => cells[cellIndex] ?? '');
        rows.push({ type: 'tableRow', content: normalized.map((cell) => tableCell(cell)) });
        index += 1;
      }
      content.push({ type: 'table', content: rows });
      continue;
    }

    if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: Block[] = [];
      while (index < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[index].trim())) {
        const match = lines[index].trim().match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (match) items.push(taskItem(match[2], match[1].toLowerCase() === 'x'));
        index += 1;
      }
      content.push({ type: 'taskList', content: items });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: Block[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(listItem(lines[index].trim().replace(/^[-*]\s+/, '')));
        index += 1;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: Block[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(listItem(lines[index].trim().replace(/^\d+\.\s+/, '')));
        index += 1;
      }
      content.push({ type: 'orderedList', attrs: { start: 1 }, content: items });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoted: Block[] = [];
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quoted.push(paragraph(lines[index].trim().slice(2)));
        index += 1;
      }
      content.push({ type: 'blockquote', content: quoted });
      continue;
    }

    // Párrafo: se corta en la primera línea en blanco o en el próximo bloque.
    const buffer: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      const startsTable = index + 1 < lines.length && current.includes('|') && isTableDivider(lines[index + 1]);
      if (!current || current === '---' || current.startsWith('```') || startsTable || /^(#{1,3}\s|[-*]\s|\d+\.\s|>\s)/.test(current)) break;
      buffer.push(lines[index].trimStart());
      index += 1;
    }
    content.push(paragraphLines(buffer));
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
