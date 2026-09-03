/**
 * Por qué falló una corrida, en castellano y con qué hacer al respecto.
 *
 * El motivo llega como una sola línea encadenada que arma el runner:
 * `proveedor del equipo: … · banco de keys: …`, y adentro viene el error crudo
 * del SDK (`{"code":429,"status":"RESOURCE_EXHAUSTED"}`). Eso, tal cual, no lo
 * lee nadie: la pantalla mostraba tres renglones de JSON y la persona no sabía
 * si el problema era la cuota, la key o el prompt.
 *
 * Acá se decide una sola cosa —qué clase de falla es— y con eso la interfaz
 * arma el mensaje, el tono y el botón que corresponde. Lo importante es
 * `canQueue`: una falla de cuota no se arregla reintentando por API, se manda a
 * la cola de conectores, que no gasta cuota del equipo.
 *
 * Módulo compartido a propósito: lo usan la vista y (más adelante) cualquier
 * resumen que quiera contar fallas por tipo sin volver a inventar los regex.
 */

export const RUN_FAILURE_KINDS = ['quota', 'overloaded', 'config', 'output', 'other'] as const;
export type RunFailureKind = (typeof RUN_FAILURE_KINDS)[number];

export type RunFailure = {
  kind: RunFailureKind;
  /** Titular corto. */
  title: string;
  /** Qué pasó, en una o dos frases. */
  detail: string;
  /** Qué hacer ahora. */
  hint: string;
  /** ¿Tiene sentido mandarla a la cola de conectores en vez de reintentar por API? */
  canQueue: boolean;
  /** El texto original, partido por proveedor, para quien quiera el detalle crudo. */
  parts: Array<{ source: string; message: string }>;
};

export const RUN_FAILURE_LABELS: Record<RunFailureKind, string> = {
  quota: 'Sin cuota de IA',
  overloaded: 'Modelo saturado',
  config: 'Problema de configuración',
  output: 'Respuesta inutilizable',
  other: 'Otro error',
};

/** Qué significa cada estado que devuelve Google, dicho para una persona. */
const GEMINI_STATUS_ES: Record<string, string> = {
  RESOURCE_EXHAUSTED: 'se agotó la cuota de la key',
  UNAVAILABLE: 'el modelo está saturado o fuera de servicio',
  DEADLINE_EXCEEDED: 'la llamada tardó demasiado y se cortó',
  PERMISSION_DENIED: 'la key no tiene permiso para usar ese modelo',
  UNAUTHENTICATED: 'la key es inválida o fue revocada',
  INVALID_ARGUMENT: 'la petición no es válida (modelo inexistente o prompt mal armado)',
  NOT_FOUND: 'el modelo elegido no existe para esta cuenta',
  FAILED_PRECONDITION: 'la cuenta no puede usar la API en este país o sin facturación',
  INTERNAL: 'error interno de Google',
  ABORTED: 'la llamada fue abortada por el proveedor',
  CANCELLED: 'la llamada fue cancelada',
};

const HTTP_STATUS_ES: Record<number, string> = {
  400: 'petición inválida',
  401: 'key inválida o revocada',
  403: 'la key no tiene permiso',
  404: 'modelo inexistente para esta cuenta',
  429: 'se agotó la cuota',
  500: 'error interno del proveedor',
  503: 'modelo saturado',
  504: 'la llamada tardó demasiado',
};

/**
 * Convierte un error del SDK de Gemini en una frase en castellano.
 *
 * El SDK tira el cuerpo HTTP tal cual como `message`, o sea un JSON:
 * `{"error":{"code":429,"message":"You exceeded your current quota…","status":"RESOURCE_EXHAUSTED"}}`.
 * Se conserva el estado y el código entre paréntesis para que `classifyRunError`
 * y quien lea el log sigan reconociendo la clase de falla. Un texto que no es
 * JSON vuelve tal cual (ya venía en castellano o no es de Gemini).
 */
export function humanizeProviderError(raw: string): string {
  const texto = raw.trim();
  if (!texto) return texto;
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) return texto;
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    return texto;
  }
  const err = (parsed as { error?: unknown })?.error;
  const cuerpo = (err && typeof err === 'object' ? err : parsed) as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof cuerpo?.code === 'number' ? cuerpo.code : Number(cuerpo?.code) || null;
  const status = typeof cuerpo?.status === 'string' ? cuerpo.status : '';
  const mensaje = typeof cuerpo?.message === 'string' ? cuerpo.message.trim() : '';
  if (!code && !status && !mensaje) return texto;

  const explicacion = (status && GEMINI_STATUS_ES[status]) || (code && HTTP_STATUS_ES[code]) || 'el proveedor rechazó la llamada';
  const etiqueta = [code, status].filter(Boolean).join(' ');
  const prefijo = texto.slice(0, inicio).trim();
  // Del mensaje original alcanza una línea: el resto suele ser links a la doc.
  const detalle = mensaje.split(/\r?\n/)[0]?.slice(0, 220) ?? '';
  const partes = [`Gemini: ${explicacion}${etiqueta ? ` (${etiqueta})` : ''}.`];
  if (detalle && !/^\s*$/.test(detalle)) partes.push(detalle);
  return `${prefijo ? `${prefijo} ` : ''}${partes.join(' ')}`.trim();
}

/** `proveedor del equipo: X · banco de keys: Y` → dos partes legibles. */
function splitParts(summary: string): Array<{ source: string; message: string }> {
  return summary
    .split(' · ')
    .map((chunk) => {
      const idx = chunk.indexOf(': ');
      if (idx <= 0) return { source: '', message: humanizeProviderError(chunk.trim()) };
      return { source: chunk.slice(0, idx).trim(), message: humanizeProviderError(chunk.slice(idx + 2).trim()) };
    })
    .filter((part) => part.message.length > 0);
}

const QUOTA = /RESOURCE_EXHAUSTED|"code"\s*:\s*429|\b429\b|quota|cuota|rate.?limit|free.?tier|sin cuota|exceeded/i;
const OVERLOADED = /UNAVAILABLE|"code"\s*:\s*503|\b503\b|high demand|overloaded|saturad/i;
const CONFIG = /no tiene proveedor|API.?key|api_key|PERMISSION_DENIED|UNAUTHENTICATED|"code"\s*:\s*40[13]|\b401\b|\b403\b|no longer available|not found for API version|INVALID_ARGUMENT|modelo/i;
const OUTPUT = /devolvió vacío|MAX_TOKENS|no cumple el contrato|JSON|finishReason/i;

/**
 * Clasifica el motivo de una corrida fallida. `null` si no hay motivo (una
 * corrida `failed` sin texto es un bug aparte, no un tipo de falla).
 */
export function classifyRunError(summary: string | null | undefined): RunFailure | null {
  const texto = (summary ?? '').trim();
  if (!texto) return null;
  const parts = splitParts(texto);

  // El orden importa: un 429 que además menciona "api key" sigue siendo cuota,
  // porque lo que hay que hacer es dejar de gastar cuota, no cambiar la key.
  if (QUOTA.test(texto)) {
    return {
      kind: 'quota',
      title: 'Se acabó la cuota de IA',
      detail: 'El proveedor del equipo y el banco de keys rechazaron la llamada por límite de uso. No es un problema del prompt: el mismo texto va a funcionar cuando la cuota se renueve.',
      hint: 'Mandala a la cola de conectores: Claude, ChatGPT o Grok la ejecutan con su propia cuota, sin gastar la del equipo.',
      canQueue: true,
      parts,
    };
  }
  if (OVERLOADED.test(texto)) {
    return {
      kind: 'overloaded',
      title: 'El modelo estaba saturado',
      detail: 'El proveedor devolvió "no disponible" por demanda alta. Es transitorio y no tiene que ver con el contenido del prompt.',
      hint: 'Reintentá en un rato, o dejala en la cola para que la tome un conector.',
      canQueue: true,
      parts,
    };
  }
  if (CONFIG.test(texto)) {
    return {
      kind: 'config',
      title: 'La IA del equipo no está bien configurada',
      detail: 'Falta el proveedor, la key no sirve o el modelo elegido ya no está disponible para esta cuenta.',
      hint: 'Revisá Ajustes → IA (proveedor, key y modelo). Mientras tanto, la cola de conectores funciona igual.',
      canQueue: true,
      parts,
    };
  }
  if (OUTPUT.test(texto)) {
    return {
      kind: 'output',
      title: 'La respuesta no sirvió',
      detail: 'El modelo contestó vacío o cortado. Suele pasar con prompts muy largos o con instrucciones contradictorias.',
      hint: 'Acortá el prompt o pedí menos cosas en una sola corrida.',
      canQueue: true,
      parts,
    };
  }
  return {
    kind: 'other',
    title: 'La corrida falló',
    detail: parts.map((p) => (p.source ? `${p.source}: ${p.message}` : p.message)).join(' · ').slice(0, 400) || texto.slice(0, 400),
    hint: 'Reintentá ahora o, si se repite, dejala en la cola de conectores.',
    canQueue: true,
    parts,
  };
}

/** ¿Esta corrida es una falla de cuota? Atajo para filtrar sin re-clasificar. */
export function isQuotaFailure(status: string, summary: string | null | undefined): boolean {
  if (status !== 'failed') return false;
  const failure = classifyRunError(summary);
  return failure?.kind === 'quota' || failure?.kind === 'overloaded';
}
