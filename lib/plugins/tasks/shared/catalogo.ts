import type { WorkKind } from './produccion';

/**
 * El Catálogo Operativo AAPP SPACE 2026 (v1.2, 04/09/2026), en código.
 *
 * Hasta acá los precios vivían en un HTML publicado en aapp.space
 * (`catalogo-operativo-aapp`) y en las cabezas de Noelia y Carlos: un conector
 * que cotizaba los inventaba o los leía del HTML, y Producción OS no sabía
 * cuánto valía un pedido, así que no podía calcular lo único que el protocolo
 * pide medir —US$ por hora—. Esto es la fuente única: el pedido nace con
 * `catalogKey` y de acá salen ticket, rondas incluidas y horas objetivo.
 *
 * Regla del documento: «congelar este catálogo 30 días» → vigente hasta
 * `VIGENCIA_HASTA`. Después de esa fecha la UI lo marca como «a revisar», no
 * lo esconde: un precio viejo es mejor que ninguno, pero hay que saberlo.
 */

/** ARS por US$ 1 al 04/09/2026, según el documento. Los precios en USD se redondean al dólar entero superior. */
export const REFERENCIA_ARS_POR_USD = 1530;
export const REFERENCIA_FECHA = '2026-09-04';
export const VIGENCIA_HASTA = '2026-10-04';

export type FamiliaCatalogo = 'space' | 'chatbot' | 'business' | 'redes' | 'medida';
export type Recurrencia = 'unico' | 'mensual' | 'anual';

export type ItemCatalogo = {
  key: string;
  nombre: string;
  familia: FamiliaCatalogo;
  /** Tipo de trabajo que produce este producto. `null` = no pasa por Producción OS (recurrencias, redes). */
  workKind: WorkKind | null;
  precioArs: number | null;
  precioUsd: number;
  recurrencia: Recurrencia;
  /** Rondas de revisión incluidas: 1 express, 2 premium (Protocolo SPACE §05). */
  rondasIncluidas: number;
  /** Horas objetivo de producción. Es el denominador del US$/h esperado. */
  horasObjetivo: number | null;
  incluye: string[];
  /** El catálogo lo dice explícitamente: existe pero no se empuja. */
  desincentivado?: boolean;
};

export const CATALOGO_AAPP: ItemCatalogo[] = [
  // ── Motor 1 · AAPP SPACE · caja rápida ───────────────────────────────────
  { key: 'sitio_web', nombre: 'Sitio Web', familia: 'space', workKind: 'sitio_aapp', precioArs: 40_000, precioUsd: 27, recurrencia: 'anual', rondasIncluidas: 1, horasObjetivo: 1,
    incluye: ['Dominio .uno incluido', 'Hasta 25 servicios', 'Turnos y reservas', 'PWA + WhatsApp', 'SEO + configuración'] },
  { key: 'tienda_online', nombre: 'Tienda Online', familia: 'space', workKind: 'tienda_aapp', precioArs: 40_000, precioUsd: 27, recurrencia: 'anual', rondasIncluidas: 1, horasObjetivo: 1.5,
    incluye: ['Hasta 50 productos', 'Carrito de compras', 'Pedidos a WhatsApp', 'Métodos de pago', '0% de comisiones'] },
  { key: 'sitio_mas_tienda', nombre: 'Sitio + Tienda', familia: 'space', workKind: 'tienda_aapp', precioArs: 60_000, precioUsd: 40, recurrencia: 'anual', rondasIncluidas: 1, horasObjetivo: 2,
    incluye: ['Todo Sitio Web', 'Todo Tienda Online', '50 productos + categorías', 'Dominio incluido', 'Soporte prioritario'] },
  { key: 'sitio_profesional', nombre: 'Sitio Web Profesional', familia: 'space', workKind: 'prosite', precioArs: 200_000, precioUsd: 131, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 3,
    incluye: ['Diseño 100% personalizado', 'Blog / portafolio', 'Páginas individuales', 'Formularios personalizados', 'Páginas extra a medida'] },
  { key: 'tienda_profesional', nombre: 'Tienda Online Profesional', familia: 'space', workKind: 'tienda_custom', precioArs: 200_000, precioUsd: 131, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 3,
    incluye: ['Diseño personalizado', 'Hasta 100 productos', 'POS / caja', 'Pagos integrados', 'Stock y facturación'] },
  { key: 'campanas', nombre: 'Campañas Publicitarias', familia: 'space', workKind: null, precioArs: 100_000, precioUsd: 66, recurrencia: 'unico', rondasIncluidas: 1, horasObjetivo: 2,
    incluye: ['Google Ads o Meta Ads', 'Configuración y gestión', 'Segmentación / keywords', 'Seguimiento inicial', 'Pauta publicitaria aparte'] },
  // ── Recurrente · Chatbot WhatsApp ─────────────────────────────────────────
  { key: 'chatbot_basico', nombre: 'Chatbot Básico', familia: 'chatbot', workKind: null, precioArs: 50_000, precioUsd: 33, recurrencia: 'mensual', rondasIncluidas: 0, horasObjetivo: null,
    incluye: ['1 número por QR', 'Editor visual de flujos', 'CRM + etiquetas', 'Difusiones', 'Integración con IA'] },
  { key: 'chatbot_premium', nombre: 'Chatbot Premium', familia: 'chatbot', workKind: null, precioArs: 70_000, precioUsd: 46, recurrencia: 'mensual', rondasIncluidas: 0, horasObjetivo: null,
    incluye: ['Todo Básico', 'API oficial opcional', 'Hasta 3 usuarios', 'Campañas segmentadas', 'Reportes'] },
  { key: 'chatbot_pro', nombre: 'Chatbot Pro', familia: 'chatbot', workKind: null, precioArs: 100_000, precioUsd: 66, recurrencia: 'mensual', rondasIncluidas: 0, horasObjetivo: null,
    incluye: ['Todo Premium', 'IA entrenada', 'Usuarios ilimitados', 'Multi-número', 'Webhooks e integraciones'] },
  { key: 'chatbot_implementacion', nombre: 'Implementación de chatbot', familia: 'chatbot', workKind: 'desarrollo', precioArs: 400_000, precioUsd: 262, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 5,
    incluye: ['Hecha por nosotros', 'Se ajusta por complejidad'] },
  // ── Motor 2 · AAPP BUSINESS · ticket alto ─────────────────────────────────
  { key: 'aapp_caza', nombre: 'AAPP CAZA', familia: 'business', workKind: 'business_caza', precioArs: null, precioUsd: 300, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 6,
    incluye: ['Sitio Web Profesional', 'Google Ads setup', 'Landing / copy de conversión', 'Medición de conversiones', 'Dominio y publicación', '30 días de ajuste inicial'] },
  { key: 'aapp_piloto', nombre: 'AAPP PILOTO', familia: 'business', workKind: 'business_piloto', precioArs: null, precioUsd: 500, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 10,
    incluye: ['Todo AAPP CAZA', 'Chatbot implementado', 'Flujo inicial de calificación', 'CRM + etiquetas', 'Derivación a vendedor', 'IA básica integrada'] },
  { key: 'aapp_torre', nombre: 'AAPP TORRE', familia: 'business', workKind: 'business_torre', precioArs: null, precioUsd: 750, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 15,
    incluye: ['Todo AAPP PILOTO', 'Command Center', 'Pipeline de oportunidades', 'Priorización de contactos', 'Siguiente mejor acción', 'Onboarding del equipo'] },
  { key: 'command_center_mensual', nombre: 'Command Center (recurrencia TORRE)', familia: 'business', workKind: null, precioArs: null, precioUsd: 99, recurrencia: 'mensual', rondasIncluidas: 0, horasObjetivo: null,
    incluye: ['Se suma al plan Chatbot elegido'] },
  // ── Redes sociales · desincentivado ───────────────────────────────────────
  { key: 'kit_contenido_3', nombre: 'Kit de Contenido x3', familia: 'redes', workKind: null, precioArs: 70_000, precioUsd: 46, recurrencia: 'unico', rondasIncluidas: 1, horasObjetivo: 3, incluye: ['3 posts', '3 historias', 'Identidad visual'], desincentivado: true },
  { key: 'kit_contenido_6', nombre: 'Kit de Contenido x6', familia: 'redes', workKind: null, precioArs: 100_000, precioUsd: 66, recurrencia: 'unico', rondasIncluidas: 1, horasObjetivo: 5, incluye: ['6 posts', '6 historias', 'Revisión incluida'], desincentivado: true },
  { key: 'kit_contenido_9', nombre: 'Kit de Contenido x9', familia: 'redes', workKind: null, precioArs: 130_000, precioUsd: 85, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: 7, incluye: ['9 posts', '9 historias', '2 revisiones'], desincentivado: true },
  { key: 'redes_premium', nombre: 'Gestión de Redes Premium', familia: 'redes', workKind: null, precioArs: null, precioUsd: 600, recurrencia: 'mensual', rondasIncluidas: 2, horasObjetivo: null, incluye: ['Contrato mínimo 3 meses', 'Hasta 12 piezas + 12 historias', '2 rondas de cambios', 'Producción presencial aparte'], desincentivado: true },
  // ── A medida · sólo si el margen justifica ────────────────────────────────
  { key: 'desarrollo_medida', nombre: 'Desarrollo a Medida', familia: 'medida', workKind: 'desarrollo', precioArs: null, precioUsd: 0, recurrencia: 'unico', rondasIncluidas: 2, horasObjetivo: null,
    incluye: ['A cotizar', 'Diagnóstico previo pago', 'Alcance firmado', 'Pagos por hitos', 'No interrumpe la cola normal'], desincentivado: true },
];

export const CATALOGO_KEYS = CATALOGO_AAPP.map((item) => item.key);
export const catalogoPorKey = (key: string | null | undefined): ItemCatalogo | null => (key ? CATALOGO_AAPP.find((item) => item.key === key) ?? null : null);
/** El ítem «natural» de un tipo de trabajo: el primero del catálogo que lo produce. */
export const catalogoPorWorkKind = (kind: WorkKind): ItemCatalogo | null => CATALOGO_AAPP.find((item) => item.workKind === kind) ?? null;
export const catalogoVigente = (hoy: Date = new Date()): boolean => hoy.toISOString().slice(0, 10) <= VIGENCIA_HASTA;

/** Necesidad del análisis comercial (`NEEDS` de sales-ops) → ítem del catálogo. Lo que no mapea queda sin ticket, no con uno inventado. */
export const CATALOGO_POR_NECESIDAD: Record<string, string> = {
  sitio_web: 'sitio_web',
  tienda_online: 'tienda_online',
  combo_full: 'sitio_mas_tienda',
  tienda_profesional: 'tienda_profesional',
  sitio_profesional: 'sitio_profesional',
  publicidad: 'campanas',
  contenido: 'kit_contenido_3',
  desarrollo_medida: 'desarrollo_medida',
  automatizacion: 'chatbot_implementacion',
};

// ── Evaluador de oportunidad (Catálogo, «Herramienta») ───────────────────────

export type NivelOportunidad = 'alta' | 'revisar' | 'segundo_plano';
export type Evaluacion = { usdPorHora: number | null; nivel: NivelOportunidad | null; motivo: string };

/** Unidad menor de la moneda → US$ enteros, con la referencia del catálogo. Sólo ARS y USD: otra moneda no se adivina. */
export function ticketEnUsd(amountMinor: number | null | undefined, currency: string | null | undefined): number | null {
  if (amountMinor == null || !currency) return null;
  const unidades = amountMinor / 100;
  if (currency === 'USD') return unidades;
  if (currency === 'ARS') return unidades / REFERENCIA_ARS_POR_USD;
  return null;
}

/**
 * La calculadora del catálogo, tal cual: US$/h con umbrales 50 (alta) / 25
 * (revisar) / menos (segundo plano), y la línea roja fija —más de 6 horas con
 * ticket menor a US$ 250 no entra como prioridad normal—. Sin horas no hay
 * evaluación: un pedido sin tiempo registrado no se juzga, se mide.
 */
export function evaluarOportunidad(ticketUsd: number | null, horas: number | null): Evaluacion {
  if (ticketUsd == null) return { usdPorHora: null, nivel: null, motivo: 'Sin ticket: cargá el precio del pedido para poder medirlo.' };
  if (horas == null || horas <= 0) return { usdPorHora: null, nivel: null, motivo: 'Sin horas registradas todavía.' };
  const usdPorHora = ticketUsd / Math.max(0.5, horas);
  if (horas > 6 && ticketUsd < 250) return { usdPorHora, nivel: 'segundo_plano', motivo: 'Más de 6 horas y menos de US$ 250: subir precio, reducir alcance o postergar.' };
  if (usdPorHora >= 50) return { usdPorHora, nivel: 'alta', motivo: 'Buen retorno por hora.' };
  if (usdPorHora >= 25) return { usdPorHora, nivel: 'revisar', motivo: 'Rentabilidad media: revisar alcance, delegación y upsell.' };
  return { usdPorHora, nivel: 'segundo_plano', motivo: 'Bajo retorno por hora. No debe desplazar productos rentables.' };
}

/** WIP máximo del protocolo: «3 trabajos activos máximo. El cuarto espera». */
export const WIP_MAXIMO = 3;
