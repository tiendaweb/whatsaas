'use client';

import { Extension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { baseExtensions } from '../shared/extensions';
import { SuggestionList, type SuggestionItem } from './SuggestionList';

export type DocumentPick = { id: number; title: string; emoji: string | null };

/**
 * Menú flotante para `/` y `@`. Se posiciona con el rect que da Suggestion, no con
 * tippy: una dependencia menos y se comporta igual en móvil.
 */
function renderSuggestion() {
  let component: ReactRenderer | null = null;
  let container: HTMLDivElement | null = null;

  const place = (clientRect: (() => DOMRect | null) | null | undefined) => {
    if (!container || !clientRect) return;
    const rect = clientRect();
    if (!rect) return;

    const width = container.offsetWidth || 288;
    const height = container.offsetHeight || 260;
    // Si no entra abajo, se da vuelta hacia arriba.
    const top = rect.bottom + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6;
    const left = Math.min(rect.left, window.innerWidth - width - 12);

    container.style.top = `${Math.max(8, top)}px`;
    container.style.left = `${Math.max(8, left)}px`;
  };

  return {
    onStart: (props: any) => {
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.zIndex = '60';
      document.body.appendChild(container);

      component = new ReactRenderer(SuggestionList, { props, editor: props.editor });
      container.appendChild(component.element);
      place(props.clientRect);
    },
    onUpdate: (props: any) => {
      component?.updateProps(props);
      place(props.clientRect);
    },
    onKeyDown: (props: any) => {
      if (props.event.key === 'Escape') return true;
      return (component?.ref as { onKeyDown?: (p: any) => boolean } | null)?.onKeyDown?.(props) ?? false;
    },
    onExit: () => {
      component?.destroy();
      container?.remove();
      component = null;
      container = null;
    },
  };
}

/**
 * Extensión de sugerencias sin nodo asociado. Importante: NO usar `Mention.extend()`
 * para esto — agregaría tipos de nodo al esquema del cliente que el servidor no conoce.
 */
const createSuggestionExtension = (name: string, options: Omit<SuggestionOptions, 'editor'>) =>
  Extension.create({
    name,
    addProseMirrorPlugins() {
      // Cada sugerencia necesita su PROPIA PluginKey: Suggestion() usa `suggestion$` por
      // defecto y ProseMirror revienta al montar dos plugins con la misma clave
      // ("Adding different instances of a keyed plugin").
      return [Suggestion({ editor: this.editor, pluginKey: new PluginKey(name), ...options })];
    },
  });

const SLASH_ITEMS: SuggestionItem[] = [
  { key: 'h1', label: 'Título 1', hint: 'Encabezado grande', run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Título 2', hint: 'Encabezado mediano', run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Título 3', hint: 'Encabezado chico', run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'ul', label: 'Lista con viñetas', hint: 'Puntos', run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { key: 'ol', label: 'Lista numerada', hint: '1, 2, 3…', run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { key: 'task', label: 'Lista de tareas', hint: 'Con casillas', run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { key: 'table', label: 'Tabla', hint: '3 columnas', run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: 'quote', label: 'Cita', hint: 'Bloque citado', run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { key: 'code', label: 'Bloque de código', hint: 'Monoespaciado', run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { key: 'hr', label: 'Separador', hint: 'Línea horizontal', run: (editor) => editor.chain().focus().setHorizontalRule().run() },
];

export type EditorDeps = {
  searchDocuments: (query: string) => Promise<DocumentPick[]>;
  createDocument: (title: string) => Promise<DocumentPick | null>;
};

export function buildEditorExtensions(deps: EditorDeps) {
  const slash = createSuggestionExtension('slashMenu', {
    char: '/',
    items: ({ query }) => {
      const term = query.toLowerCase();
      return SLASH_ITEMS.filter((item) => item.label.toLowerCase().includes(term));
    },
    command: ({ editor, range, props }) => {
      const item = props as unknown as SuggestionItem;
      editor.chain().focus().deleteRange(range).run();
      item.run?.(editor);
    },
    render: renderSuggestion,
  });

  const documentLinks = createSuggestionExtension('documentMention', {
    char: '@',
    allowSpaces: true,
    items: async ({ query }) => {
      const results = await deps.searchDocuments(query);
      const items: SuggestionItem[] = results.map((doc) => ({
        key: `doc-${doc.id}`,
        label: `${doc.emoji ? `${doc.emoji} ` : ''}${doc.title}`,
        hint: 'Documento',
        payload: doc,
      }));

      const term = query.trim();
      if (term && !results.some((doc) => doc.title.toLowerCase() === term.toLowerCase())) {
        items.push({ key: 'create', label: `Crear documento «${term}»`, hint: 'Nuevo', create: term });
      }
      return items;
    },
    command: async ({ editor, range, props }) => {
      const item = props as unknown as SuggestionItem;
      const doc = item.create ? await deps.createDocument(item.create) : (item.payload as DocumentPick);
      if (!doc) return;

      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'documentLink', attrs: { documentId: doc.id, label: doc.title } },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
    render: renderSuggestion,
  });

  return [
    ...baseExtensions,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === 'heading'
          ? 'Título…'
          : 'Escribí «/» para insertar bloques, «@» para enlazar documentos…',
    }),
    slash,
    documentLinks,
  ];
}
