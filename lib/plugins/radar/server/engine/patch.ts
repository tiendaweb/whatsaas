/**
 * Subset seguro de JSON Patch (RFC 6902) para editar definiciones de apps del
 * Radar Engine sin reenviar el documento entero: replace / add / remove, con
 * paths JSON Pointer (RFC 6901). No muta la definición recibida: trabaja sobre
 * una copia profunda y la devuelve.
 *
 * Sin 'server-only' a propósito: es función pura y la usan también los tests
 * y los scripts de seed.
 */
import type { RadarAppDefinition, RadarPatchOp } from '@/lib/plugins/radar/shared/engine';

/** Des-escapa un segmento de JSON Pointer: ~1 → "/" y ~0 → "~" (en ese orden). */
function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Parte "/views/0/name" en ["views", "0", "name"], validando la forma. */
function parsePointer(path: string): string[] {
  if (!path.startsWith('/')) {
    throw new Error(`path inválido "${path}": un JSON Pointer empieza con /`);
  }
  if (path === '/') {
    throw new Error('el path raíz "/" está prohibido: reemplazá la definición entera con un apply, no con un patch');
  }
  return path.slice(1).split('/').map(unescapeSegment);
}

/** Índice de array válido para LEER (tiene que existir). */
function toArrayIndex(segment: string, array: unknown[], path: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) {
    throw new Error(`índice de array inválido en ${path}: "${segment}" no es un número`);
  }
  const index = Number(segment);
  if (index >= array.length) {
    throw new Error(`no existe ${path}: el array tiene ${array.length} elemento${array.length === 1 ? '' : 's'}`);
  }
  return index;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Camina el documento hasta el PADRE del target. Devuelve el contenedor y el
 * último segmento (todavía sin resolver, porque add lo interpreta distinto).
 */
function resolveParent(root: unknown, segments: string[], fullPath: string): { parent: unknown; last: string } {
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const walked = `/${segments.slice(0, i + 1).join('/')}`;
    if (Array.isArray(current)) {
      current = current[toArrayIndex(segment, current, walked)];
    } else if (isPlainObject(current)) {
      if (!(segment in current)) {
        throw new Error(`no existe ${walked} (llegando a ${fullPath})`);
      }
      current = current[segment];
    } else {
      throw new Error(`no se puede entrar a ${walked}: no es un objeto ni un array`);
    }
  }
  return { parent: current, last: segments[segments.length - 1] };
}

function applyOne(root: unknown, op: RadarPatchOp): void {
  if (op.op !== 'remove' && op.value === undefined) {
    throw new Error(`falta value para ${op.op} en ${op.path}`);
  }
  const segments = parsePointer(op.path);
  const { parent, last } = resolveParent(root, segments, op.path);

  if (Array.isArray(parent)) {
    if (op.op === 'add') {
      // `-` es el append de RFC 6902; un índice igual a length también agrega
      // al final, y uno menor corre los siguientes (insert, no pisado).
      if (last === '-') {
        parent.push(op.value);
        return;
      }
      if (!/^(0|[1-9][0-9]*)$/.test(last)) {
        throw new Error(`índice de array inválido en ${op.path}: "${last}" no es un número ni "-"`);
      }
      const index = Number(last);
      if (index > parent.length) {
        throw new Error(`no se puede insertar en ${op.path}: el array tiene ${parent.length} elemento${parent.length === 1 ? '' : 's'}`);
      }
      parent.splice(index, 0, op.value);
      return;
    }
    const index = toArrayIndex(last, parent, op.path);
    if (op.op === 'replace') parent[index] = op.value;
    else parent.splice(index, 1);
    return;
  }

  if (!isPlainObject(parent)) {
    throw new Error(`no se puede aplicar ${op.op} en ${op.path}: el padre no es un objeto ni un array`);
  }

  if (op.op === 'add') {
    // En objeto, add crea la clave (o la pisa si ya estaba: RFC 6902).
    parent[last] = op.value;
    return;
  }
  if (!(last in parent)) {
    throw new Error(`no existe ${op.path}: ${op.op === 'replace' ? 'replace exige que el target exista (usá add para crearlo)' : 'no hay nada que borrar'}`);
  }
  if (op.op === 'replace') parent[last] = op.value;
  else delete parent[last];
}

/**
 * Aplica las operaciones EN ORDEN sobre una copia profunda de la definición.
 * Cualquier operación inválida tira con un mensaje que incluye el path; en ese
 * caso no se devuelve nada a medio aplicar (la copia descartada muere acá).
 */
export function applyJsonPatch(definition: RadarAppDefinition, ops: RadarPatchOp[]): RadarAppDefinition {
  const draft = structuredClone(definition) as unknown;
  for (const op of ops) {
    applyOne(draft, op);
  }
  return draft as RadarAppDefinition;
}
