import path from 'node:path';
import { SITE_MAX_PATH_LENGTH } from './constants';

export function normalizeSitePath(raw: string, allowEmpty = false): string {
  const candidate = raw.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  if (!candidate) {
    if (allowEmpty) return '';
    throw new Error('La ruta no puede estar vacía.');
  }

  const segments = candidate.split('/');
  if (
    candidate.length > SITE_MAX_PATH_LENGTH ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.length > 180 ||
        segment.includes('\0'),
    )
  ) {
    throw new Error('La ruta del archivo no es válida.');
  }

  return segments.join('/');
}

export function sitePathName(sitePath: string) {
  return sitePath.split('/').pop() ?? sitePath;
}

export function siteParentPath(sitePath: string) {
  const normalized = normalizeSitePath(sitePath);
  const parent = path.posix.dirname(normalized);
  return parent === '.' ? '' : parent;
}

export function joinSitePath(parentPath: string, name: string) {
  const parent = normalizeSitePath(parentPath, true);
  const cleanName = normalizeSitePath(name);
  if (cleanName.includes('/')) {
    throw new Error('El nombre no puede contener carpetas.');
  }
  return normalizeSitePath(parent ? `${parent}/${cleanName}` : cleanName);
}

export function extensionOf(sitePath: string) {
  return path.posix.extname(sitePath).slice(1).toLowerCase();
}
