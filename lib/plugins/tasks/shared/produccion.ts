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
  'business_caza',
  'business_piloto',
  'business_torre',
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
  business_caza: { label: 'AAPP CAZA · captación', corto: 'CAZA', familia: 'produccion', ayuda: 'Sitio profesional + Google Ads + conversiones. Genera demanda. US$ 300.' },
  business_piloto: { label: 'AAPP PILOTO · automatización', corto: 'PILOTO', familia: 'produccion', ayuda: 'Todo CAZA + chatbot, calificación y CRM básico. Procesa la demanda. US$ 500.' },
  business_torre: { label: 'AAPP TORRE · command center', corto: 'TORRE', familia: 'produccion', ayuda: 'Todo PILOTO + Command Center, Radar, Focus y Modo Noelia. Decide. US$ 750.' },
  cambio: { label: 'Cambio de cliente', corto: 'Cambio', familia: 'cambio', ayuda: 'Retoque o ajuste sobre algo ya entregado.' },
};

export const WORK_STATUSES = ['pedido', 'aceptado', 'en_curso', 'qa', 'espera_cliente', 'entregado', 'activado', 'cambios', 'descartado'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_META: Record<WorkStatus, { label: string; ayuda: string; abierto: boolean }> = {
  pedido: { label: 'Pedido', ayuda: 'Llegó y nadie lo tomó todavía. Espera que producción lo acepte o pida más datos.', abierto: true },
  aceptado: { label: 'Aceptado', ayuda: 'Producción lo tomó; todavía no arrancó.', abierto: true },
  en_curso: { label: 'En curso', ayuda: 'Se está haciendo.', abierto: true },
  qa: { label: 'En QA', ayuda: 'Terminado y en revisión interna: celular, escritorio, enlaces, WhatsApp, textos. HTTP 200 no significa que funciona.', abierto: true },
  espera_cliente: { label: 'Esperando al cliente', ayuda: 'Falta algo del cliente (logo, textos, acceso, seña). Quien pidió tiene que conseguirlo.', abierto: true },
  entregado: { label: 'Entregado', ayuda: 'Listo y con link. Quien pidió le avisa al cliente.', abierto: false },
  activado: { label: 'Activado', ayuda: 'El cliente lo usa de verdad: primera acción real hecha. Construido no significa activado.', abierto: false },
  cambios: { label: 'Con cambios', ayuda: 'El cliente vio la entrega y pidió retoques.', abierto: true },
  descartado: { label: 'Descartado', ayuda: 'No se hace.', abierto: false },
};

/** Orden de las columnas del tablero y de la cola. */
export const WORK_STATUS_ORDER: WorkStatus[] = ['pedido', 'aceptado', 'en_curso', 'qa', 'espera_cliente', 'cambios', 'entregado', 'activado', 'descartado'];

/**
 * Caminos permitidos del pedido. No es un kanban decorativo: evita que una
 * integración marque "entregado" algo que todavía nadie aceptó, o que una
 * tarea descartada reaparezca en curso sin volver a abrir el pedido.
 */
export const WORK_STATUS_TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
  pedido: ['aceptado', 'espera_cliente', 'descartado'],
  aceptado: ['en_curso', 'espera_cliente', 'descartado'],
  en_curso: ['qa', 'espera_cliente', 'entregado', 'descartado'],
  qa: ['entregado', 'en_curso', 'espera_cliente', 'descartado'],
  espera_cliente: ['aceptado', 'en_curso', 'descartado'],
  entregado: ['activado', 'cambios'],
  activado: ['cambios'],
  cambios: ['en_curso', 'qa', 'espera_cliente', 'entregado', 'descartado'],
  descartado: ['pedido'],
};

export const esWorkKind = (v: unknown): v is WorkKind => typeof v === 'string' && (WORK_KINDS as readonly string[]).includes(v);
export const esWorkStatus = (v: unknown): v is WorkStatus => typeof v === 'string' && (WORK_STATUSES as readonly string[]).includes(v);
export const familiaDe = (kind: WorkKind | null | undefined): Familia | null => (kind ? WORK_KIND_META[kind].familia : null);
export const puedeTransicionar = (actual: WorkStatus, siguiente: WorkStatus): boolean =>
  actual === siguiente || WORK_STATUS_TRANSITIONS[actual].includes(siguiente);

/** El estado genérico de Tareas acompaña al operativo, nunca compite con él. */
export function estadoTareaPara(status: WorkStatus): 'open' | 'in_progress' | 'done' {
  if (status === 'entregado' || status === 'activado' || status === 'descartado') return 'done';
  if (status === 'en_curso' || status === 'qa' || status === 'espera_cliente' || status === 'cambios') return 'in_progress';
  return 'open';
}

/**
 * Las tres reglas del Protocolo Maestro que el estado solo no alcanza a decir.
 *
 * Se aplican a lo VENDIDO (familia `produccion`), no a los demos —que son
 * pre-venta y se hacen gratis y en volumen— ni a los cambios —que ya tienen su
 * propio freno en las rondas de revisión—.
 *
 *  1. «Sin pago no hay posición en cola»: `pedido → aceptado` exige el pago
 *     registrado (total, anticipo o verificado) o una excepción con motivo.
 *  2. «Si el handoff está incompleto, el trabajo no empieza»: `aceptado →
 *     en_curso` exige la ficha de handoff completa.
 *  3. «QA interno antes de enviar»: lo vendido no pasa de `en_curso` a
 *     `entregado` sin pasar por `qa`.
 *
 * Viven acá y no en el servidor porque las dos pantallas y las tools las
 * necesitan para no ofrecer un botón que el servidor va a rechazar.
 */
export const PAYMENT_STATES = ['pendiente', 'anticipo', 'total', 'verificado', 'excepcion'] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];
export const PAYMENT_STATE_META: Record<PaymentState, { label: string; habilita: boolean }> = {
  pendiente: { label: 'Pendiente de pago', habilita: false },
  anticipo: { label: 'Anticipo recibido', habilita: true },
  total: { label: 'Pago total recibido', habilita: true },
  verificado: { label: 'Pago verificado', habilita: true },
  excepcion: { label: 'Excepción autorizada', habilita: true },
};
export const esPaymentState = (v: unknown): v is PaymentState => typeof v === 'string' && (PAYMENT_STATES as readonly string[]).includes(v);

export const exigePago = (kind: WorkKind): boolean => familiaDe(kind) === 'produccion';
export const exigeHandoff = (kind: WorkKind): boolean => familiaDe(kind) === 'produccion';
export const exigeQa = (kind: WorkKind): boolean => familiaDe(kind) === 'produccion';

/**
 * Las transiciones que el servidor va a aceptar para ESTE pedido, con las
 * reglas del protocolo aplicadas. Es lo que las pantallas usan para dibujar
 * botones; `puedeTransicionar` sigue siendo el mapa crudo.
 */
export function transicionesDisponibles(order: { workKind: WorkKind; workStatus: WorkStatus }): WorkStatus[] {
  return WORK_STATUS_TRANSITIONS[order.workStatus].filter((next) => {
    // Lo vendido no salta de en_curso a entregado: pasa por QA.
    if (next === 'entregado' && order.workStatus === 'en_curso' && exigeQa(order.workKind)) return false;
    return true;
  });
}

/** Por qué NO se puede hacer esa transición, o null si se puede. El servidor lanza este texto tal cual. */
export function motivoBloqueo(
  order: { workKind: WorkKind; workStatus: WorkStatus; paymentState: PaymentState | null; blockedReason: string | null; handoff: Handoff | null; deliveryUrl: string | null },
  next: WorkStatus,
): string | null {
  if (!transicionesDisponibles(order).includes(next) && order.workStatus !== next) {
    if (next === 'entregado' && order.workStatus === 'en_curso' && exigeQa(order.workKind)) return 'Lo vendido pasa por QA antes de entregarse: marcá «En QA», revisalo y recién ahí entregá.';
    return `No se puede pasar de ${WORK_STATUS_META[order.workStatus].label} a ${WORK_STATUS_META[next].label}.`;
  }
  if (next === 'aceptado' && order.workStatus === 'pedido' && exigePago(order.workKind)) {
    if (!order.paymentState || !PAYMENT_STATE_META[order.paymentState].habilita) return 'Sin pago no hay posición en cola: registrá el pago (total, anticipo o verificado) o una excepción autorizada antes de aceptar.';
    if (order.paymentState === 'excepcion' && !order.blockedReason?.trim()) return 'Una excepción de pago lleva motivo y quién la autorizó: escribilo en «Qué falta / motivo».';
  }
  if (next === 'en_curso' && order.workStatus === 'aceptado' && exigeHandoff(order.workKind) && !handoffCompleto(order.handoff)) {
    return `Si el handoff está incompleto, el trabajo no empieza. Falta: ${handoffFaltantes(order.handoff).map((item) => HANDOFF_ITEMS.find((h) => h.id === item)?.label ?? item).join(', ')}. O dejalo «esperando al cliente» con lo que falta.`;
  }
  if (next === 'entregado' && !order.deliveryUrl?.trim()) return 'Pegá el enlace de entrega antes de marcar el trabajo como entregado.';
  return null;
}

// ── Handoff (Protocolo SPACE §06, BUSINESS etapa 03) ─────────────────────────

/** `ok` = está; `falta` = hay que pedirlo; `ia` = autorizado a resolverlo con IA o recursos propios. */
export type HandoffEstado = 'ok' | 'falta' | 'ia';
export const HANDOFF_ITEMS = [
  { id: 'logo', label: 'Logo / identidad', ayuda: 'O autorización para resolver con recursos disponibles.' },
  { id: 'colores', label: 'Colores / referencias visuales', ayuda: 'Paleta, sitios que le gustan, estilo.' },
  { id: 'textos', label: 'Textos y servicios', ayuda: 'O permiso explícito para redactarlos con IA.' },
  { id: 'fotos', label: 'Fotos / productos / precios', ayuda: 'Material suficiente para completar el alcance comprado.' },
  { id: 'whatsapp', label: 'WhatsApp y datos de contacto', ayuda: 'Número correcto y CTA definido.' },
  { id: 'accesos', label: 'Accesos e integraciones', ayuda: 'Dominio, redes, cuentas. Por canal seguro, nunca acá.' },
  { id: 'alcance', label: 'Alcance aceptado', ayuda: 'Incluye y no incluye comunicado antes de producir.' },
  { id: 'revision', label: 'Canal de revisión definido', ayuda: 'Una persona consolida los cambios del cliente.' },
] as const;
export type HandoffItemId = (typeof HANDOFF_ITEMS)[number]['id'];
export type Handoff = Partial<Record<HandoffItemId, HandoffEstado>>;

export const esHandoffEstado = (v: unknown): v is HandoffEstado => v === 'ok' || v === 'falta' || v === 'ia';
export function handoffFaltantes(handoff: Handoff | null | undefined): HandoffItemId[] {
  return HANDOFF_ITEMS.map((item) => item.id).filter((id) => { const estado = handoff?.[id]; return estado !== 'ok' && estado !== 'ia'; });
}
export const handoffCompleto = (handoff: Handoff | null | undefined): boolean => handoffFaltantes(handoff).length === 0;
/** Sólo las claves conocidas y los valores válidos: lo que venga de una tool o de un formulario no entra crudo. */
export function limpiarHandoff(value: unknown): Handoff {
  const out: Handoff = {};
  if (!value || typeof value !== 'object') return out;
  for (const item of HANDOFF_ITEMS) {
    const estado = (value as Record<string, unknown>)[item.id];
    if (esHandoffEstado(estado)) out[item.id] = estado;
  }
  return out;
}

export const FAMILIA_LABEL: Record<Familia, string> = { demo: 'Demos', produccion: 'Producción', cambio: 'Cambios' };
/** Las familias como lista cerrada, para enums de Zod y de JSON Schema. */
export const FAMILIAS_LISTA = ['demo', 'produccion', 'cambio'] as const;

/**
 * Con qué se hace cada tipo de trabajo.
 *
 * Es el equivalente de los `steps` de la cola comercial: el conector no tiene
 * que adivinar si "una tienda" se hace con `gobiz_stores_create` o con
 * `gobiz_sites_create` —elegir mal obliga a rehacerlo, porque los productos de
 * AAPP SPACE no se convierten entre sí—. Vive en `shared/` porque lo usan la
 * cola de conectores Y la pantalla, que muestra la receta al lado del pedido.
 *
 * `{id}` se reemplaza con el id del pedido al armar los pasos.
 */
export type CadenaDeTrabajo = { tools: string[]; steps: string[] };

const ENTREGAR = 'whatspro_production_update {task_id: {id}, work_status: "entregado", delivery_url: "<el enlace público>"}. Contá qué hiciste en notes si hace falta. — sin enlace no se puede entregar.';
const FALTA_MATERIAL =
  'Si falta material del cliente (logo, textos, fotos, accesos, dominio): whatspro_production_update {task_id: {id}, work_status: "espera_cliente", blocked_reason: "<qué falta, en una línea>"}. NO le escribas al cliente: el pedido sale por el Command Center.';

export const CADENA_POR_TIPO: Record<WorkKind, CadenaDeTrabajo> = {
  demo_sitio_aapp: {
    tools: ['whatspro_production_get', 'gobiz_sites_create', 'gobiz_sites_sections_set', 'gobiz_sites_styles_set', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → leer el brief, el checklist y el prompt del pedido.',
      'gobiz_sites_create: sitio de UNA página (vcard) con el nombre del negocio, rubro y datos de contacto del brief.',
      'gobiz_sites_sections_set y gobiz_sites_styles_set: secciones y paleta según el brief. Textos en el tono del cliente, sin relleno.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  demo_tienda_aapp: {
    tools: ['whatspro_production_get', 'gobiz_stores_create', 'gobiz_store_products_create', 'gobiz_stores_layout_install_preset', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → leer el brief y el prompt.',
      'gobiz_stores_create con el nombre y el rubro; gobiz_store_products_create para los productos que aparecen en el chat (si no hay precios, cargalos sin precio y anotalo).',
      'gobiz_stores_layout_install_preset para que la tienda no quede en blanco.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  demo_prosite: {
    tools: ['whatspro_production_get', 'gobiz_prosites_create', 'gobiz_prosites_pages_create', 'gobiz_prosites_publish', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → leer el brief y el prompt.',
      'gobiz_prosites_create (sitio profesional de varias páginas) + gobiz_prosites_pages_create: Inicio, Servicios y Contacto como mínimo.',
      'gobiz_prosites_publish para que el enlace se pueda ver.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  demo_html: {
    tools: ['whatspro_production_get', 'gobiz_html_create', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → leer el brief y el prompt.',
      'gobiz_html_create con el HTML completo (una sola página, responsive, sin dependencias externas salvo fuentes).',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  demo_tienda_custom: {
    tools: ['whatspro_production_get', 'gobiz_html_create', 'whatspro_manage_task', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → leer el brief y el prompt.',
      'Una tienda a medida no se genera de una: armá la demo navegable (gobiz_html_create) y dejá en el checklist lo que falta para la versión vendida.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  sitio_aapp: {
    tools: ['whatspro_production_get', 'gobiz_sites_create', 'gobiz_sites_update', 'gobiz_sites_hours_set', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → esto ya está vendido: leé el alcance y qué entregó el cliente.',
      'gobiz_sites_create / gobiz_sites_update con los textos, imágenes y horarios reales (no de relleno).',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  tienda_aapp: {
    tools: ['whatspro_production_get', 'gobiz_stores_create', 'gobiz_store_products_create', 'gobiz_stores_update', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → alcance vendido y catálogo que mandó el cliente.',
      'gobiz_stores_create / gobiz_store_products_create con los productos y precios reales; gobiz_stores_update para datos de contacto y envíos.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  prosite: {
    tools: ['whatspro_production_get', 'gobiz_prosites_create', 'gobiz_prosites_pages_create', 'gobiz_prosites_publish', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → alcance vendido, páginas acordadas y material del cliente.',
      'gobiz_prosites_create + gobiz_prosites_pages_create (una por página acordada) + gobiz_prosites_publish.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  sitio_html: {
    tools: ['whatspro_production_get', 'gobiz_html_create', 'gobiz_html_update', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → alcance vendido y material del cliente.',
      'gobiz_html_create / gobiz_html_update con el sitio completo.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  tienda_custom: {
    tools: ['whatspro_production_get', 'whatspro_manage_task', 'whatspro_manage_document', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → alcance vendido.',
      'Esto NO se genera con una tool: armá el plan. whatspro_manage_document para el brief técnico y whatspro_manage_task para las tareas del proyecto, en orden.',
      'whatspro_production_update {task_id: {id}, work_status: "en_curso"}.',
      FALTA_MATERIAL,
    ],
  },
  desarrollo: {
    tools: ['whatspro_production_get', 'whatspro_manage_task', 'whatspro_manage_document', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → alcance vendido y qué hay que entregar.',
      'whatspro_manage_document para el brief y whatspro_manage_task para las tareas del proyecto, una por entregable y en orden.',
      'whatspro_production_update {task_id: {id}, work_status: "en_curso"}.',
      FALTA_MATERIAL,
    ],
  },
  business_caza: {
    tools: ['whatspro_production_get', 'gobiz_prosites_create', 'gobiz_prosites_pages_create', 'gobiz_prosites_publish', 'whatspro_manage_task', 'whatspro_manage_document', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → oferta confirmada, rubro, ubicación, palabras clave del brief y el handoff.',
      'Landing / sitio profesional: gobiz_prosites_create + gobiz_prosites_pages_create con copy comercial de conversión, CTA y WhatsApp; gobiz_prosites_publish.',
      'Google Ads NO se configura desde acá: whatspro_manage_task con la checklist de campaña (keywords, conversiones, presupuesto confirmado aparte) y whatspro_manage_document con el brief de campaña.',
      'whatspro_production_update {task_id: {id}, work_status: "qa"} cuando la landing esté publicada; QA prueba CTA, WhatsApp, móvil y conversión antes de entregar.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  business_piloto: {
    tools: ['whatspro_production_get', 'whatspro_manage_automation', 'whatspro_automation_guide', 'whatspro_manage_crm_stage', 'whatspro_manage_tag', 'whatspro_manage_task', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → número de WhatsApp, preguntas a hacer, criterios de calificación y a quién derivar (todo en el handoff).',
      'Incluye lo aplicable de CAZA si el cliente no tiene captación; si ya la tiene, se valida y NO se produce dos veces.',
      'Chatbot: whatspro_automation_guide y whatspro_manage_automation para el flujo (inicio, preguntas, datos a guardar, derivación a humano, seguimientos). CRM básico: whatspro_manage_crm_stage y whatspro_manage_tag.',
      'whatspro_production_update {task_id: {id}, work_status: "qa"}: la conversación completa probada de punta a punta, casos incompletos y errores incluidos.',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
  business_torre: {
    tools: ['whatspro_production_get', 'whatspro_plugins_manage', 'whatspro_sales_settings', 'whatspro_manage_crm_stage', 'whatspro_manage_department', 'whatspro_manage_task', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → fuentes de conversaciones, estados comerciales, reglas de prioridad y responsables del cliente.',
      'TORRE no se construye desde cero: es PILOTO + Command Center. Habilitá sales-ops para el equipo del cliente (whatspro_plugins_manage), configurá etapas (whatspro_manage_crm_stage), responsables (whatspro_manage_department) y reglas (whatspro_sales_settings).',
      'Validar Radar y Focus con datos reales autorizados: Dinero Ahora, oportunidades, seguimientos críticos, Modo Noelia una decisión por vez, aprobación humana probada.',
      'whatspro_production_update {task_id: {id}, work_status: "qa"}: QA operativo con datos simulados etiquetados Y datos reales autorizados; permisos y registro de acciones probados.',
      ENTREGAR,
      'Después de entregar, «activado» sólo cuando el equipo del cliente hizo su primera acción real. Construido no significa activado.',
      FALTA_MATERIAL,
    ],
  },
  cambio: {
    tools: ['whatspro_production_get', 'gobiz_sites_update', 'gobiz_html_patch', 'gobiz_prosites_pages_patch', 'gobiz_stores_update', 'whatspro_production_update'],
    steps: [
      'whatspro_production_get {task_id: {id}} → qué pide el cliente y el enlace de lo que ya está entregado.',
      'Abrí lo entregado y aplicá SÓLO el cambio pedido, con la tool del producto (gobiz_sites_update / gobiz_html_patch / gobiz_prosites_pages_patch / gobiz_stores_update).',
      ENTREGAR,
      FALTA_MATERIAL,
    ],
  },
};

/** La cadena de un pedido concreto, con el id ya reemplazado. */
export function cadenaDeTrabajo(kind: WorkKind, taskId: number): CadenaDeTrabajo {
  const base = CADENA_POR_TIPO[kind];
  return { tools: base.tools, steps: base.steps.map((step) => step.replace(/\{id\}/g, String(taskId))) };
}

/** Checklist por defecto según el tipo: lo que producción hace siempre para ese trabajo. */
const CHECKLIST_BUSINESS: Record<'business_caza' | 'business_piloto' | 'business_torre', string[]> = {
  business_caza: [
    'Oferta confirmada', 'Rubro y ubicación confirmados', 'Palabras clave e intención de búsqueda validadas', 'Landing publicada con copy comercial aprobado',
    'Versión móvil revisada', 'CTA y WhatsApp correcto funcionando', 'Formulario probado si corresponde', 'Conversión configurada y comprobada',
    'Google Ads configurado', 'Presupuesto publicitario confirmado por separado', 'Exclusiones aclaradas; no se garantizan ventas',
    'QA del canal de captación aprobado', 'Activación autorizada preparada', 'Medición inicial preparada',
  ],
  business_piloto: [
    'Número de WhatsApp confirmado', 'Inicio de conversación definido', 'Preguntas y datos a guardar definidos', 'Criterios de calificación aprobados',
    'Rutas de respuesta y condiciones probadas', 'Derivación a humano probada', 'Seguimientos y retrasos configurados', 'Mensajes aprobados',
    'Conversación completa probada', 'Casos incompletos y errores probados', 'CRM básico o destino de datos verificado',
    'QA de automatización aprobado', 'Activación y medición preparadas',
  ],
  business_torre: [
    'Fuentes de conversaciones verificadas', 'Command Center y pipeline configurados', 'Estados comerciales definidos', 'Reglas de prioridad y responsables definidos',
    'Señales de intención y bloqueo validadas', 'Dinero Ahora y oportunidades configurados', 'Seguimientos críticos configurados', 'RADAR y FOCUS validados',
    'Next Best Action con evidencia por recomendación', 'Modo Noelia presenta una decisión por vez', 'Acciones disponibles y aprobación humana probadas',
    'Permisos y registro de acciones probados', 'Cloud omitido o integración real verificada según alcance', 'Prueba con datos simulados etiquetados',
    'Prueba con datos reales autorizados', 'QA operativo aprobado', 'Capacitación, activación y medición preparadas',
  ],
};

export function checklistPorDefecto(kind: WorkKind): Array<{ id: string; text: string; completed: boolean }> {
  if (kind === 'business_caza' || kind === 'business_piloto' || kind === 'business_torre') {
    return CHECKLIST_BUSINESS[kind].map((text, index) => ({ id: `${kind.replace('business_', '')}-${index + 1}`, text, completed: false }));
  }
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
