import { Extension, Node, getSchema, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';

// Protocolos permitidos en los enlaces. Todo lo demás (javascript:, data:, vbscript:)
// se descarta al validar el contenido.
const SAFE_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];

export const isSafeHref = (href: unknown): boolean => {
  if (typeof href !== 'string' || !href.trim()) return false;
  if (href.startsWith('/') || href.startsWith('#')) return true;
  try {
    const protocol = new URL(href).protocol.replace(':', '').toLowerCase();
    return SAFE_PROTOCOLS.includes(protocol);
  } catch {
    return false;
  }
};

// Las imágenes sólo pueden apuntar a lo que subimos nosotros o a rutas relativas del sitio.
export const isSafeImageSrc = (src: unknown): boolean =>
  typeof src === 'string' && (src.startsWith('/uploads/') || src.startsWith('uploads/'));

/**
 * Enlace a otro documento. Es un nodo atómico en línea: el texto que se ve sale
 * del atributo `label`, así que no hay HTML del usuario en juego. Los backlinks
 * se recalculan leyendo estos nodos del JSON.
 */
export const DocumentLink = Node.create({
  name: 'documentLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute('data-document-id')) || null,
        renderHTML: (attributes) =>
          attributes.documentId ? { 'data-document-id': String(attributes.documentId) } : {},
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? '',
        renderHTML: (attributes) => ({ 'data-label': attributes.label ?? '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-document-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-document-link': '', class: 'doc-link' }, HTMLAttributes),
      `@${node.attrs.label || 'documento'}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label || 'documento'}`;
  },
});

// Trailing node: garantiza que siempre haya un párrafo al final para poder
// escribir debajo de una imagen o un bloque de código sin quedar atrapado.
export const TrailingNode = Extension.create({ name: 'trailingNode' });

/**
 * Extensiones que definen el ESQUEMA del documento. Deben ser idénticas en cliente
 * y servidor: es lo que hace que `Node.fromJSON()` funcione como sanitizador.
 * Nada de lo que no esté acá puede entrar a la base.
 */
export const baseExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: SAFE_PROTOCOLS,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({
    table: {
      resizable: true,
      lastColumnResizable: false,
      allowTableNodeSelection: true,
    },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  DocumentLink,
];

export const documentSchema = getSchema(baseExtensions);

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] } as const;
