export type ContactCustomFieldDef = {
  id: number;
  name: string;
  key: string;
  type: string;
  position?: number;
};

export type ContactCustomFieldRow = {
  field: ContactCustomFieldDef;
  value: unknown;
  isOrphan?: boolean;
};

/** Lista todos los campos definidos + claves huérfanas guardadas en customData. */
export function buildContactCustomFieldRows(
  fieldDefs: ContactCustomFieldDef[],
  customData: Record<string, unknown> | null | undefined,
): ContactCustomFieldRow[] {
  const data = customData ?? {};
  const sortedDefs = [...fieldDefs].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id,
  );

  const rows: ContactCustomFieldRow[] = sortedDefs.map((field) => ({
    field,
    value: data[field.key],
  }));

  const defKeys = new Set(sortedDefs.map((f) => f.key));
  for (const [key, value] of Object.entries(data)) {
    if (defKeys.has(key)) continue;
    rows.push({
      field: { id: -1, name: key, key, type: 'text' },
      value,
      isOrphan: true,
    });
  }

  return rows;
}

export function normalizeCustomDataForSave(
  rows: ContactCustomFieldRow[],
  localValues: Record<string, unknown>,
  existingData: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existingData ?? {}) };

  for (const row of rows) {
    const raw = localValues[row.field.key];
    if (row.field.type === 'boolean') {
      next[row.field.key] = Boolean(raw);
    } else if (raw === undefined || raw === null || String(raw).trim() === '') {
      delete next[row.field.key];
    } else {
      next[row.field.key] = String(raw);
    }
  }

  return next;
}

export function formatCustomFieldDisplayValue(type: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (type === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}