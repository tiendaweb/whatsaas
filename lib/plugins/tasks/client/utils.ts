export function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

export function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function formatBytes(size: number | null | undefined) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}