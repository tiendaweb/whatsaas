import type { BwCollectionKey } from '../shared/collections';
import type { BwFieldDef } from '../shared/collections';
import type { BwMutateCollection } from './BwBlockRenderer';

/** Mutadores genéricos sobre UN registro de una colección local, reusando
 * SIEMPRE `onMutate` (la misma función que ya persiste en `mini_app_records`
 * — no hay una ruta de escritura paralela). */
export function updateLocalRecord(collection: BwCollectionKey, records: any[], recordId: string, patch: Record<string, unknown>, onMutate: BwMutateCollection) {
  onMutate(collection, records.map((r) => (r._recordId === recordId ? { ...r, ...patch } : r)));
}

export function deleteLocalRecord(collection: BwCollectionKey, records: any[], recordId: string, onMutate: BwMutateCollection) {
  onMutate(collection, records.filter((r) => r._recordId !== recordId));
}

export function archiveLocalRecord(collection: BwCollectionKey, records: any[], recordId: string, archived: boolean, onMutate: BwMutateCollection) {
  onMutate(collection, records.map((r) => (r._recordId === recordId ? { ...r, _archived: archived } : r)));
}

/** Campos "genéricos" para un registro de un binding `system` (no hay
 * catálogo cerrado — se listan las claves propias del registro, legibles).
 * Siempre de sólo lectura (ver BwRecordDrawer con readOnly). */
export function genericFieldsFor(row: Record<string, any>): BwFieldDef[] {
  return Object.keys(row)
    .filter((key) => key !== '_recordId' && !key.startsWith('_'))
    .map((key) => ({ key, label: humanizeKey(key), type: 'text' as const }));
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
