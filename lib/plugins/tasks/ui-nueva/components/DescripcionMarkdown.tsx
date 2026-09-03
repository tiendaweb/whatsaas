'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Heading2, Italic, List, ListChecks, Table } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ES } from '../i18n/es';

function esHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMd(text: string) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownAHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (!/^:?-{3,}:?$/.test(cells[0] ?? '')) rows.push(cells);
        i += 1;
      }
      if (rows.length) {
        const head = rows[0];
        const body = rows.slice(1);
        html.push('<table><thead><tr>');
        head.forEach((c) => html.push(`<th>${inlineMd(c)}</th>`));
        html.push('</tr></thead><tbody>');
        body.forEach((row) => {
          html.push('<tr>');
          row.forEach((c) => html.push(`<td>${inlineMd(c)}</td>`));
          html.push('</tr>');
        });
        html.push('</tbody></table>');
      }
      continue;
    }
    const task = line.match(/^- \[( |x|X)\]\s+(.*)$/);
    if (task) {
      html.push('<ul data-type="taskList">');
      while (i < lines.length) {
        const m = lines[i].match(/^- \[( |x|X)\]\s+(.*)$/);
        if (!m) break;
        const checked = m[1].toLowerCase() === 'x';
        html.push(`<li data-type="taskItem" data-checked="${checked}"><p>${inlineMd(m[2])}</p></li>`);
        i += 1;
      }
      html.push('</ul>');
      continue;
    }
    if (/^###\s/.test(line)) html.push(`<h3>${inlineMd(line.replace(/^###\s/, ''))}</h3>`);
    else if (/^##\s/.test(line)) html.push(`<h2>${inlineMd(line.replace(/^##\s/, ''))}</h2>`);
    else if (/^#\s/.test(line)) html.push(`<h1>${inlineMd(line.replace(/^#\s/, ''))}</h1>`);
    else if (/^[-*]\s+/.test(line)) {
      html.push('<ul>');
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        html.push(`<li><p>${inlineMd(lines[i].replace(/^[-*]\s+/, ''))}</p></li>`);
        i += 1;
      }
      html.push('</ul>');
      continue;
    } else if (line.trim()) html.push(`<p>${inlineMd(line)}</p>`);
    i += 1;
  }
  return html.join('') || '<p></p>';
}

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: true } }),
  Placeholder.configure({ placeholder: ES.modal.descripcionMd }),
];

export function DescripcionMarkdown(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = useEditor({
    extensions,
    content: props.value && esHtml(props.value) ? props.value : markdownAHtml(props.value || ''),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tareas-md min-h-48 max-h-[50vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none',
      },
    },
    onUpdate: ({ editor: instance }) => {
      props.onChange(instance.getHTML());
    },
  });

  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      'p-2 rounded-lg text-[var(--t-muted)] hover:bg-[var(--t-hover)] hover:text-[var(--t-text)]',
      active && 'bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)]',
    );

  return (
    <div className="mt-6 bg-[var(--t-surface-2)] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[var(--t-border)]">
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title={ES.markdown.negrita}>
          <Bold className="w-4 h-4" />
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title={ES.markdown.cursiva}>
          <Italic className="w-4 h-4" />
        </button>
        <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={ES.markdown.titulo}>
          <Heading2 className="w-4 h-4" />
        </button>
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title={ES.markdown.lista}>
          <List className="w-4 h-4" />
        </button>
        <button type="button" className={btn(editor.isActive('taskList'))} onClick={() => editor.chain().focus().toggleTaskList().run()} title={ES.markdown.casillas}>
          <ListChecks className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive('table'))}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title={ES.markdown.tabla}
        >
          <Table className="w-4 h-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
