/**
 * Lo que el panel del chat lee del cliente vinculado.
 *
 * Es un subconjunto de lo que devuelve `GET /api/plugins/customers/[id]`: la
 * ficha del cliente ya traía todo esto —sus membresías completas, sus sitios,
 * sus movimientos— y el panel del chat estaba pidiendo por otro lado una
 * versión recortada. Se declara acá y no se importa del servidor porque la ruta
 * arma la respuesta con `...customer` y no tiene un tipo publicado.
 */
export type ClienteVinculado = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  /**
   * De dónde salió este cliente: `aapp_space` lo trajo el sincronizador,
   * `manual` lo cargó alguien. Es el dato que faltaba para entender por qué el
   * bloque comercial dice lo que dice.
   */
  source: string;
  externalId: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  notes: string;
  customerSince: string | null;
  lastSyncedAt: string | null;
  contacts: Array<{ id: number; name: string; remoteJid: string; profilePicUrl: string | null }>;
  /** TODAS las membresías del cliente, no sólo la última. */
  subscriptions: Array<{
    id: number;
    subscriptionNumber: string;
    status: string;
    paymentStatus: string;
    startDate: string;
    endDate: string | null;
    planName: string | null;
    /** En centavos, como lo guarda Membresías. */
    price: number;
    currency: string;
  }>;
  stores: Array<{ id: number; title: string | null; subTitle: string | null; url: string | null; status: string | null }>;
  /** Movimientos de plata del cliente, tal como los guarda el sincronizador. */
  transactions: Array<{ id: number; amount: string | null; currency: string | null; paymentStatus: string | null; transactionDate: string | null; gateway: string | null }>;
  tasks: Array<{ id: number; title: string; status: string; dueDate: string | null }>;
  customFieldDefs: Array<{ key: string; name: string; type: string }>;
  customFieldValues: Record<string, unknown>;
};

/** De dónde salió el cliente, dicho en castellano. */
export const ORIGEN_LABEL: Record<string, string> = {
  aapp_space: 'AAPP SPACE',
  manual: 'carga manual',
  import: 'importación',
  chat: 'el chat',
  api: 'la API',
};

export const origenLabel = (source: string | null | undefined): string =>
  (source && ORIGEN_LABEL[source]) || source || 'origen desconocido';

/**
 * Un importe en centavos con su moneda.
 *
 * Una moneda sucia venida de un sync hace tirar `RangeError` a `Intl` y eso se
 * lleva puesta la pantalla entera con el error boundary genérico; por eso el
 * `catch` cae al formato simple en vez de romper.
 */
export function plata(cents: number, currency: string | null | undefined): string {
  const monto = cents / 100;
  const cod = (currency ?? '').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cod || 'USD', maximumFractionDigits: 0 }).format(monto);
  } catch {
    return `${monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ${cod}`.trim();
  }
}

/** "en 3 días", "hace 2 días", "hoy". Sin librería: son cuatro casos. */
export function relativo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(t)) return '—';
  const dias = Math.round((t - Date.now()) / 86_400_000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${Math.abs(dias)} días`;
}

/** Una fecha corta, para renglones de detalle. */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: '2-digit' }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}
