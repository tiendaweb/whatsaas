import { SITE_MAX_FILE_BYTES } from './constants';

export type ExactTextPatch = {
  search: string;
  replace: string;
  expectedOccurrences?: number;
};

function countOccurrences(content: string, search: string) {
  if (!search) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= content.length - search.length) {
    const found = content.indexOf(search, cursor);
    if (found === -1) break;
    count += 1;
    cursor = found + search.length;
  }
  return count;
}

/**
 * Applies deterministic, exact text replacements in order. Every patch checks
 * how many matches it will affect before changing the content, which prevents
 * an assistant from silently editing a broader region than intended.
 */
export function applyExactTextPatches(content: string, patches: ExactTextPatch[]) {
  let next = content;

  for (const [index, patch] of patches.entries()) {
    if (!patch.search) throw new Error(`El parche ${index + 1} necesita un texto de búsqueda.`);
    const expected = patch.expectedOccurrences ?? 1;
    const actual = countOccurrences(next, patch.search);
    if (actual !== expected) {
      throw new Error(
        `El parche ${index + 1} esperaba ${expected} coincidencia(s), pero encontró ${actual}. Volvé a leer el archivo antes de reintentar.`,
      );
    }
    next = next.split(patch.search).join(patch.replace);
    if (Buffer.byteLength(next, 'utf8') > SITE_MAX_FILE_BYTES) {
      throw new Error('El resultado supera el tamaño máximo permitido para un archivo.');
    }
  }

  return next;
}
