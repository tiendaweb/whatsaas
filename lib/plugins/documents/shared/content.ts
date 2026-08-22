import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { documentSchema, EMPTY_DOC, isSafeHref, isSafeImageSrc } from './extensions';

export type DocumentJson = Record<string, unknown>;

/**
 * Valida el JSON que manda el cliente contra el esquema del editor.
 *
 * Esto ES la sanitización: `Node.fromJSON()` rechaza cualquier nodo o marca que no
 * esté declarada en `baseExtensions`, y ningún nodo nuestro emite HTML crudo. Por eso
 * no hace falta DOMPurify. Además limpiamos a mano lo único que el esquema no puede
 * juzgar: a dónde apuntan los href y los src.
 *
 * Devuelve el documento normalizado o `null` si es irrecuperable.
 */
export function parseDocumentJson(raw: unknown): ProseMirrorNode | null {
  if (!raw || typeof raw !== 'object') return null;

  try {
    const cleaned = stripUnsafeUrls(raw as DocumentJson);
    const node = ProseMirrorNode.fromJSON(documentSchema, cleaned);
    node.check();
    return node;
  } catch {
    return null;
  }
}

/** Quita href y src que no pasan la whitelist, conservando el texto. */
function stripUnsafeUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsafeUrls);
  if (!value || typeof value !== 'object') return value;

  const node = { ...(value as DocumentJson) };

  if (node.type === 'image' && !isSafeImageSrc((node.attrs as DocumentJson | undefined)?.src)) {
    // Imagen externa: la reemplazamos por un párrafo vacío en vez de tirar todo el guardado.
    return { type: 'paragraph' };
  }

  if (Array.isArray(node.marks)) {
    node.marks = node.marks.filter((mark) => {
      const entry = mark as DocumentJson;
      if (entry?.type !== 'link') return true;
      return isSafeHref((entry.attrs as DocumentJson | undefined)?.href);
    });
  }

  if (Array.isArray(node.content)) node.content = node.content.map(stripUnsafeUrls);

  return node;
}

/** Texto plano para búsqueda y extractos. Los saltos de bloque se vuelven \n. */
export function documentToText(node: ProseMirrorNode): string {
  return node.textBetween(0, node.content.size, '\n', (leaf) =>
    leaf.type.name === 'documentLink' ? `@${leaf.attrs.label ?? ''}` : '',
  );
}

/** IDs de los documentos enlazados desde este contenido, sin repetir. */
export function extractLinkedDocumentIds(node: ProseMirrorNode): number[] {
  const ids = new Set<number>();
  node.descendants((child) => {
    if (child.type.name === 'documentLink') {
      const id = Number(child.attrs.documentId);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
  });
  return [...ids];
}

/** Primeras líneas del documento, para las tarjetas del listado. */
export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export const emptyDocument = () => JSON.parse(JSON.stringify(EMPTY_DOC)) as DocumentJson;
