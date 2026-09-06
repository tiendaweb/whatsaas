/**
 * Producción OS: tipos de trabajo y estados de un pedido, compartidos por
 * servidor, pantallas y tools.
 *
 * Es el equivalente en producción de las etapas del Command Center comercial:
 * ahí un chat está en G0…G11; acá un pedido está en pedido → aceptado →
 * en_curso → espera_cliente → entregado → cambios. Y así como el Command
 * Center separa Dinero de Oportunidades, acá se separa demo (pre-venta, rápido,
 * mucho volumen) de producción (lo vendido) y de cambio (lo entregado que hay
 * que retocar).
 */

export const WORK_KINDS = [
  'demo_html',
  'demo_tienda_custom',
  'demo_tienda_aapp',
  'demo_sitio_aapp',
  'demo_prosite',
  'sitio_html',
  'tienda_custom',
  'tienda_aapp',
  'sitio_aapp',
  'prosite',
  'desarrollo',
  'cambio',
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export type Familia = 'demo' | 'produccion' | 'cambio';

export const WORK_KIND_META: Record<WorkKind, { label: string; corto: string; familia: Familia; ayuda: string }> = {
  demo_html: { label: 'Demo · sitio HTML', corto: 'Demo HTML', familia: 'demo', ayuda: 'Página estática a medida, para mostrar antes de vender.' },
  demo_tienda_custom: { label: 'Demo · tienda custom', corto: 'Demo tienda custom', familia: 'demo', ayuda: 'Tienda a medida (catálogo, pedidos) para mostrar antes de vender.' },
  demo_tienda_aapp: { label: 'Demo · tienda AAPP SPACE', corto: 'Demo tienda', familia: 'demo', ayuda: 'Tienda en AAPP SPACE (gobiz_stores_create) con los productos del cliente.' },
  demo_sitio_aapp: { label: 'Demo · sitio AAPP SPACE', corto: 'Demo sitio', familia: 'demo', ayuda: 'Sitio de una página en AAPP SPACE (gobiz_sites_create), tipo vcard.' },
  demo_prosite: { label: 'Demo · sitio profesional', corto: 'Demo pro site', familia: 'demo', ayuda: 'Sitio de varias páginas en AAPP SPACE (gobiz_prosites_create).' },
  sitio_html: { label: 'Sitio HTML', corto: 'Sitio HTML', familia: 'produccion', ayuda: 'Sitio estático a medida, vendido.' },
  tienda_custom: { label: 'Tienda custom', corto: 'Tienda custom', familia: 'produccion', ayuda: 'Tienda a medida, vendida.' },
  tienda_aapp: { label: 'Tienda AAPP SPACE', corto: 'Tienda', familia: 'produccion', ayuda: 'Tienda en AAPP SPACE, vendida.' },
  sitio_aapp: { label: 'Sitio AAPP SPACE', corto: 'Sitio', familia: 'produccion', ayuda: 'Sitio de una página en AAPP SPACE, vendido.' },
  prosite: { label: 'Sitio profesional', corto: 'Pro site', familia: 'produccion', ayuda: 'Sitio profesional de varias páginas, vendido.' },
  desarrollo: { label: 'Desarrollo a medida', corto: 'Desarrollo', familia: 'produccion', ayuda: 'Plataforma, app o integración a medida.' },
  cambio: { label: 'Cambio de cliente', corto: 'Cambio', familia: 'cambio', ayuda: 'Retoque o ajuste sobre algo ya entregado.' },
};

export const WORK_STATUSES = ['pedido', 'aceptado', 'en_curso', 'espera_cliente', 'entregado', 'cambios', 'descartado'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_META: Record<WorkStatus, { label: string; ayuda: string; abierto: boolean }> = {
  pedido: { label: 'Pedido', ayuda: 'Llegó y nadie lo tomó todavía. Espera que producción lo acepte o pida más datos.', abierto: true },
  aceptado: { label: 'Aceptado', ayuda: 'Producción lo tomó; todavía no arrancó.', abierto: true },
  en_curso: { label: 'En curso', ayuda: 'Se está haciendo.', abierto: true },
  espera_cliente: { label: 'Esperando al cliente', ayuda: 'Falta algo del cliente (logo, textos, acceso, seña). Quien pidió tiene que conseguirlo.', abierto: true },
  entregado: { label: 'Entregado', ayuda: 'Listo y con link. Quien pidió le avisa al cliente.', abierto: false },
  cambios: { label: 'Con cambios', ayuda: 'El cliente vio la entrega y pidió retoques.', abierto: true },
  descartado: { label: 'Descartado', ayuda: 'No se hace.', abierto: false },
};

/** Orden de las columnas del tablero y de la cola. */
export const WORK_STATUS_ORDER: WorkStatus[] = ['pedido', 'aceptado', 'en_curso', 'espera_cliente', 'cambios', 'entregado', 'descartado'];

/**
 * Caminos permitidos del pedido. No es un kanban decorativo: evita que una
 * integración marque "entregado" algo que todavía nadie aceptó, o que una
 * tarea descartada reaparezca en curso sin volver a abrir el pedido.
 */
export const WORK_STATUS_TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
  pedido: ['aceptado', 'espera_cliente', 'descartado'],
  aceptado: ['en_curso', 'espera_cliente', 'descartado'],
  en_curso: ['espera_cliente', 'entregado', 'descartado'],
  espera_cliente: ['aceptado', 'en_curso', 'descartado'],
  entregado: ['cambios'],
  cambios: ['en_curso', 'espera_cliente', 'entregado', 'descartado'],
  descartado: ['pedido'],
};

export const esWorkKind = (v: unknown): v is WorkKind => typeof v === 'string' && (WORK_KINDS as readonly string[]).includes(v);
export const esWorkStatus = (v: unknown): v is WorkStatus => typeof v === 'string' && (WORK_STATUSES as readonly string[]).includes(v);
export const familiaDe = (kind: WorkKind | null | undefined): Familia | null => (kind ? WORK_KIND_META[kind].familia : null);
export const puedeTransicionar = (actual: WorkStatus, siguiente: WorkStatus): boolean =>
  actual === siguiente || WORK_STATUS_TRANSITIONS[actual].includes(siguiente);

/** El estado genérico de Tareas acompaña al operativo, nunca compite con él. */
export function estadoTareaPara(status: WorkStatus): 'open' | 'in_progress' | 'done' {
  if (status === 'entregado' || status === 'descartado') return 'done';
  if (status === 'en_curso' || status === 'espera_cliente' || status === 'cambios') return 'in_progress';
  return 'open';
}

export const FAMILIA_LABEL: Record<Familia, string> = { demo: 'Demos', produccion: 'Producción', cambio: 'Cambios' };

/** Checklist por defecto según el tipo: lo que producción hace siempre para ese trabajo. */
export function checklistPorDefecto(kind: WorkKind): Array<{ id: string; text: string; completed: boolean }> {
  const f = familiaDe(kind);
  if (f === 'demo') {
    return [
      { id: 'investigar', text: 'Leer el chat y anotar rubro, tono y datos concretos', completed: false },
      { id: 'prompt', text: 'Revisar el prompt para generar la demo', completed: false },
      { id: 'generar', text: kind === 'demo_html' || kind === 'demo_tienda_custom' ? 'Armar la demo' : 'Generar en AAPP SPACE con el prompt', completed: false },
      { id: 'revisar', text: 'Revisar en el celular', completed: false },
      { id: 'entregar', text: 'Pegar el link y marcar Entregado (Noelia le avisa al cliente)', completed: false },
    ];
  }
  if (f === 'cambio') {
    return [
      { id: 'entender', text: 'Confirmar qué pide exactamente el cliente', completed: false },
      { id: 'hacer', text: 'Aplicar el cambio', completed: false },
      { id: 'revisar', text: 'Revisar en el celular', completed: false },
      { id: 'entregar', text: 'Marcar Entregado con el link', completed: false },
    ];
  }
  return [
    { id: 'brief', text: 'Confirmar alcance, textos y accesos con el cliente', completed: false },
    { id: 'armar', text: 'Armar la primera versión', completed: false },
    { id: 'revisar', text: 'Revisión interna en el celular', completed: false },
    { id: 'entregar', text: 'Publicar y marcar Entregado con el link', completed: false },
  ];
}
