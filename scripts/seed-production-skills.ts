/**
 * Siembra las skills de **Producción OS** (`prod.*`) en el Prompt Studio del
 * equipo: una por tipo de trabajo (`WORK_KINDS`), con el formulario que hay que
 * llenar y la cadena exacta de tools que produce ese producto.
 *
 * Misma mecánica que `scripts/seed-sales-ops-quick-actions.ts`: idempotente por
 * key, compara con la versión activa y sólo crea una versión nueva retirando la
 * anterior, para que una corrida vieja siga apuntando al texto con el que se
 * ejecutó.
 *
 * Por qué una skill por tipo y no una sola con un "¿qué querés hacer?": los
 * cuatro productos de AAPP SPACE no se convierten entre sí (un sitio de una
 * página no se transforma en tienda), así que elegir mal obliga a rehacer todo.
 * La skill fija la cadena desde el principio, y el tipo de trabajo la elige
 * solo vía `recommendFor.workKinds`.
 *
 * La cadena NO se escribe acá: sale de `CADENA_POR_TIPO` (shared/produccion),
 * que es lo que también le da la cola a los conectores. Dos listas de tools
 * para lo mismo se desincronizan el día que alguien agrega un paso.
 *
 * El diseño de imágenes tampoco es una skill aparte (`prod.*.imagenes`) sino un
 * campo del formulario: son los mismos pasos y la misma cadena, sólo cambia si
 * antes hay que redactar los prompts de las imágenes. Con dos skills por tipo,
 * `recommendFor.workKinds` devolvería siempre dos candidatas para el mismo
 * pedido y habría que mantener el texto duplicado en dos lugares.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-production-skills.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';
import type { SkillCategory, SkillExecution, SkillIcon, SkillRecommendFor, SkillRecurrence, SkillScope, SkillVariable } from '@/lib/plugins/sales-ops/shared/skills';
import { CADENA_POR_TIPO, WORK_KINDS, WORK_KIND_META, type WorkKind } from '@/lib/plugins/tasks/shared/produccion';

const TEAM_ID = 2;
const USER_ID = 3;

/**
 * Las reglas que no se aflojan, repetidas en cada skill porque el conector ve
 * el texto de UNA skill, nunca el conjunto.
 */
const REGLAS = `REGLAS DE PRODUCCIÓN (valen para todo lo que sigue):
1. NUNCA marques un pedido como entregado sin el enlace. Entregado sin delivery_url es un pedido perdido: nadie sabe qué mirar y el cliente no recibe nada.
2. Si falta material del cliente (logo, textos, fotos, accesos, dominio), NO improvises: whatspro_production_update {task_id, work_status: "espera_cliente", blocked_reason: "<qué falta, en una línea>"} y frená ahí.
3. NO le escribas al cliente. Pedirle el material o mandarle el enlace es una acción del Command Center comercial (fila aprobada), nunca tuya: desde acá no sale ningún WhatsApp.
4. Antes de escribir en AAPP SPACE mirá los listados (\`gobiz_*_list\`) o \`gobiz_catalog_get\` para trabajar con identificadores reales; toda escritura acepta \`dry_run: true\` para ver el efecto sin aplicarlo.
5. Lo que el formulario no diga y el chat no aclare se entrega como "(falta confirmar)". Inventar un precio, un horario o una dirección es peor que dejar el hueco.
6. Español rioplatense, textos cortos, sin teléfonos completos.`;

const CIERRE = `ANTES DE ENTREGAR: abrí el enlace y revisalo en pantalla de celular. Recién ahí corré el whatspro_production_update de entrega con el delivery_url real, y contá en dos líneas qué hiciste y qué quedó marcado como "(falta confirmar)".`;

/**
 * El bloque de imágenes. Va sólo en los tipos donde el diseño lo hacemos
 * nosotros (HTML propio, tienda custom, sitio profesional): en un sitio o una
 * tienda de AAPP SPACE las fotos las carga el cliente o salen del catálogo.
 */
const IMAGENES = `DISEÑO DE IMÁGENES: ¿hace falta diseñar imágenes?: {{necesita_imagenes}}.
Si la respuesta es "Sí", ANTES de crear nada devolvé una lista \`imagenes[]\`, un objeto por imagen:
{ "donde": "hero | logo | producto: <nombre> | seccion: <nombre>", "prompt_de_imagen": "<descripción lista para pegar en un generador: sujeto, encuadre, luz, estilo, paleta; sin texto adentro de la imagen>", "proporcion": "16:9 | 1:1 | 4:5 | 3:2" }
Mínimo: portada (16:9), logo provisorio (1:1) y una imagen por producto o servicio destacado (4:5). Si para el rubro sirve más una foto de stock que una generada, decilo en "prompt_de_imagen" con qué buscar.
Recién DESPUÉS armá el sitio, usando cada imagen en el lugar que dice "donde". Mientras no estén generadas dejá el hueco visible con el nombre de archivo esperado; nunca una foto de relleno de otro rubro.
Si la respuesta es "No", saltá este bloque y usá el material que ya tenga el cliente.`;

// ── Variables del formulario ───────────────────────────────────────────────
// Obligatorias sólo las que, sin ellas, el trabajo no se puede hacer: cómo se
// llama el negocio, a qué se dedica y qué vende (y el catálogo, en una tienda).
// Todo lo demás se deduce del chat o se entrega como "(falta confirmar)".

const V = {
  negocio: { name: 'negocio', label: 'Nombre del negocio', type: 'text', required: true, placeholder: 'Ej.: Panadería La Esquina', help: 'Como quiere que se lea en el sitio.', defaultValue: null },
  rubro: { name: 'rubro', label: 'Rubro', type: 'text', required: true, placeholder: 'Ej.: panadería y confitería', help: null, defaultValue: null },
  ofrece: { name: 'que_ofrece', label: 'Qué ofrece', type: 'textarea', required: true, placeholder: 'Productos o servicios principales, y qué lo hace distinto.', help: 'Con esto se escriben la frase de valor y las secciones.', defaultValue: null },
  paleta: { name: 'paleta', label: 'Paleta y estilo', type: 'text', required: false, placeholder: 'Ej.: verde y madera, cálido y artesanal', help: 'Si queda vacío, elegí lo que corresponda al rubro y decilo en la entrega.', defaultValue: null },
  secciones: { name: 'secciones', label: 'Secciones', type: 'textarea', required: false, placeholder: 'Portada, servicios, sobre nosotros, contacto', help: null, defaultValue: 'Portada, qué ofrecemos, sobre nosotros, contacto por WhatsApp' },
  productos: { name: 'productos', label: 'Productos con precio', type: 'textarea', required: true, placeholder: 'Uno por línea: nombre · precio · categoría · descripción corta', help: 'Sin catálogo no hay tienda: si el cliente todavía no lo pasó, el pedido va a espera_cliente.', defaultValue: null },
  paginas: { name: 'paginas', label: 'Páginas del sitio', type: 'textarea', required: false, placeholder: 'Inicio, Servicios, Equipo, Casos, Contacto', help: null, defaultValue: 'Inicio, Servicios, Nosotros, Contacto' },
  tono: { name: 'tono', label: 'Tono', type: 'select', required: false, options: ['Cercano', 'Directo', 'Formal', 'Divertido', 'Elegante'], placeholder: null, help: 'Ante la duda, el mismo que usa el cliente en el chat.', defaultValue: 'Cercano' },
  contacto: { name: 'contacto', label: 'Datos de contacto', type: 'textarea', required: false, placeholder: 'WhatsApp, dirección, horarios, redes, mail', help: 'Lo que falte va como "(falta confirmar)", no inventado.', defaultValue: null },
  imagenes: { name: 'necesita_imagenes', label: '¿Necesita diseño de imágenes?', type: 'select', required: false, options: ['Sí', 'No'], placeholder: null, help: 'Sí = no tiene fotos ni logo y hay que proponerlas antes de armar el sitio.', defaultValue: 'Sí' },
  alcance: { name: 'alcance', label: 'Qué hay que construir', type: 'textarea', required: true, placeholder: 'Funcionalidad, pantallas, quién lo usa y para qué.', help: null, defaultValue: null },
  integraciones: { name: 'integraciones', label: 'Integraciones y accesos', type: 'textarea', required: false, placeholder: 'Pagos, WhatsApp, facturación, hosting, dominio…', help: null, defaultValue: null },
  plazo: { name: 'plazo', label: 'Plazo comprometido', type: 'text', required: false, placeholder: 'Ej.: dos semanas, antes del 20', help: null, defaultValue: null },
  donde: { name: 'donde', label: 'Dónde está lo que hay que cambiar', type: 'text', required: true, placeholder: 'Enlace del sitio, tienda o pro site ya entregado', help: null, defaultValue: null },
  cambio: { name: 'que_cambiar', label: 'Qué pidió cambiar', type: 'textarea', required: true, placeholder: 'Con las palabras del cliente, una cosa por línea.', help: null, defaultValue: null },
} satisfies Record<string, SkillVariable>;

const BASE_SITIO: SkillVariable[] = [V.negocio, V.rubro, V.ofrece, V.paleta, V.secciones, V.tono, V.contacto];
const BASE_TIENDA: SkillVariable[] = [V.negocio, V.rubro, V.ofrece, V.productos, V.paleta, V.tono, V.contacto];
const BASE_PROSITE: SkillVariable[] = [V.negocio, V.rubro, V.ofrece, V.paginas, V.paleta, V.tono, V.contacto];

// ── Definición de cada tipo de trabajo ─────────────────────────────────────

type Config = {
  kind: WorkKind;
  title: string;
  description: string;
  icon: SkillIcon;
  /** Lo que agrega el formulario sobre la cadena genérica de `CADENA_POR_TIPO`. */
  detalle: string[];
  variables: SkillVariable[];
  /** El formulario pregunta por las imágenes y el texto lleva el bloque `IMAGENES`. */
  imagenes?: boolean;
};

const CONFIGS: Config[] = [
  // ── Demos: pre-venta, rápidas y en volumen; no se le pide nada al cliente ──
  {
    kind: 'demo_sitio_aapp',
    title: 'Producción · Demo de sitio AAPP SPACE',
    description: 'Arma la demo de un sitio de una página en AAPP SPACE y la cierra con el enlace.',
    icon: 'sparkles',
    variables: BASE_SITIO,
    detalle: [
      'Es un sitio de UNA página tipo vcard: si el cliente pidió varias páginas esto es un pro site (gobiz_prosites_create) y no esta skill.',
      'Secciones: {{secciones}}, cada una con su texto escrito en tono {{tono}} y con los datos de {{contacto}}.',
      'Paleta y estilo: {{paleta}}. Ítems de la sección principal: 3 a 6, sacados de "qué ofrece", con texto corto.',
      'El delivery_url es el enlace que devuelve gobiz_sites_create ya publicado.',
    ],
  },
  {
    kind: 'demo_tienda_aapp',
    title: 'Producción · Demo de tienda AAPP SPACE',
    description: 'Arma la demo de una tienda en AAPP SPACE con los productos del cliente.',
    icon: 'coins',
    variables: BASE_TIENDA,
    detalle: [
      'Una tienda es gobiz_stores_create, nunca gobiz_sites_create: no se convierten entre sí y elegir mal obliga a rehacerla.',
      'Un gobiz_store_products_create por ítem de {{productos}}, con precio y categoría. Precios tal cual los pasó el cliente: no los redondees ni los conviertas de moneda.',
      'Paleta y estilo: {{paleta}}; tono de los textos: {{tono}}; contacto y envíos con {{contacto}}.',
      'El delivery_url es la URL pública de la tienda.',
    ],
  },
  {
    kind: 'demo_prosite',
    title: 'Producción · Demo de sitio profesional',
    description: 'Arma la demo de un sitio profesional de varias páginas, con el brief de imágenes primero.',
    icon: 'sparkles',
    variables: [...BASE_PROSITE, V.imagenes],
    imagenes: true,
    detalle: [
      'Un pro site es de VARIAS páginas: una gobiz_prosites_pages_create por cada página de {{paginas}}.',
      'Paleta y estilo: {{paleta}}; textos en tono {{tono}}; contacto con {{contacto}}.',
      'Sin gobiz_prosites_publish el enlace no se ve: publicar es parte de la entrega, no un extra.',
    ],
  },
  {
    kind: 'demo_html',
    title: 'Producción · Demo de sitio HTML',
    description: 'Arma una demo en HTML propio, con el brief de imágenes antes del sitio.',
    icon: 'sparkles',
    variables: [...BASE_SITIO, V.imagenes],
    imagenes: true,
    detalle: [
      'HTML propio: un solo archivo, estilos adentro, sin dependencias externas salvo tipografías de Google Fonts. Responsive y probado en pantalla de celular.',
      'Secciones: {{secciones}}, en tono {{tono}}, con la paleta {{paleta}} y los datos de {{contacto}}.',
      'El delivery_url es la URL que devuelve gobiz_html_create.',
    ],
  },
  {
    kind: 'demo_tienda_custom',
    title: 'Producción · Demo de tienda custom',
    description: 'Arma la demo navegable de una tienda a medida, con catálogo y pedido por WhatsApp.',
    icon: 'coins',
    variables: [...BASE_TIENDA, V.imagenes],
    imagenes: true,
    detalle: [
      'Una tienda custom se MUESTRA como HTML propio (gobiz_html_create), no como tienda de AAPP SPACE.',
      'Catálogo navegable con los productos de {{productos}}: grilla, filtro por categoría, ficha de producto y botón de pedido por WhatsApp.',
      'Paleta {{paleta}}, tono {{tono}}, contacto {{contacto}}. Lo que la demo no cubra queda anotado en el checklist para la versión vendida.',
    ],
  },

  // ── Producción: lo vendido, con el material real del cliente ──
  {
    kind: 'sitio_aapp',
    title: 'Producción · Sitio AAPP SPACE (vendido)',
    description: 'Produce el sitio de una página vendido, con el material real del cliente.',
    icon: 'target',
    variables: BASE_SITIO,
    detalle: [
      'Esto está vendido: textos, logo, fotos y horarios son los del cliente. Si falta algo, espera_cliente con blocked_reason; nada de relleno.',
      'Secciones: {{secciones}}, en tono {{tono}}, con la paleta {{paleta}} y los datos de {{contacto}}.',
    ],
  },
  {
    kind: 'tienda_aapp',
    title: 'Producción · Tienda AAPP SPACE (vendida)',
    description: 'Produce la tienda vendida con el catálogo completo y los precios que pasó el cliente.',
    icon: 'coins',
    variables: BASE_TIENDA,
    detalle: [
      'Está vendida: el catálogo va completo. Si el cliente pasó la mitad, cargá esa mitad y dejá el pedido en espera_cliente con lo que falta.',
      'Un producto por línea de {{productos}}, con precio y categoría exactos. Contacto y envíos con {{contacto}}; paleta {{paleta}}.',
    ],
  },
  {
    kind: 'prosite',
    title: 'Producción · Sitio profesional (vendido)',
    description: 'Produce el sitio profesional vendido, con el brief de imágenes antes de armar las páginas.',
    icon: 'target',
    variables: [...BASE_PROSITE, V.imagenes],
    imagenes: true,
    detalle: [
      'Está vendido: las páginas son las acordadas ({{paginas}}) y el material es el del cliente.',
      'Paleta {{paleta}}, tono {{tono}}, contacto {{contacto}}. Publicar con gobiz_prosites_publish es parte de la entrega.',
    ],
  },
  {
    kind: 'sitio_html',
    title: 'Producción · Sitio HTML (vendido)',
    description: 'Produce el sitio HTML propio vendido, con el brief de imágenes antes del sitio.',
    icon: 'target',
    variables: [...BASE_SITIO, V.imagenes],
    imagenes: true,
    detalle: [
      'Está vendido: si falta material del cliente, espera_cliente antes que improvisar.',
      'Un solo archivo HTML, responsive, probado en celular. Secciones {{secciones}}, paleta {{paleta}}, tono {{tono}}, contacto {{contacto}}.',
    ],
  },
  {
    kind: 'tienda_custom',
    title: 'Producción · Tienda custom (vendida)',
    description: 'Abre el proyecto en Tareas OS de una tienda a medida y lo deja listo para trabajar por entregables.',
    icon: 'coins',
    variables: [...BASE_TIENDA, V.integraciones, V.plazo, V.imagenes],
    imagenes: true,
    detalle: [
      'Una tienda custom NO se arma de una pasada ni con las tools de AAPP SPACE: se planifica como proyecto en Tareas OS y se entrega por partes.',
      'Una whatspro_manage_task por entregable y en orden: catálogo y categorías de {{productos}}, diseño y paleta {{paleta}}, carrito y checkout, medios de pago y envíos de {{integraciones}}, dominio y publicación, carga de contenido real, revisión en el celular.',
      'Fechas según {{plazo}}; si el plazo no está claro, no lo inventes. Si el proyecto del cliente ya existe, sumale tareas en vez de duplicarlo.',
      'El delivery_url del pedido es la URL de la tienda cuando esté publicada, nunca el proyecto.',
    ],
  },
  {
    kind: 'desarrollo',
    title: 'Producción · Desarrollo a medida',
    description: 'Convierte un desarrollo a medida en un proyecto de Tareas OS con entregables en orden.',
    icon: 'zap',
    variables: [V.negocio, V.rubro, V.alcance, V.integraciones, V.plazo],
    detalle: [
      'Un desarrollo a medida no se genera con tools de AAPP SPACE: se planifica.',
      'El brief técnico (whatspro_manage_document) sale de {{alcance}} y {{integraciones}}: alcance cerrado por escrito, accesos, modelo de datos, pantallas, pruebas, puesta en producción, capacitación.',
      'Una whatspro_manage_task por entregable, con un resultado verificable en el título y fechas según {{plazo}}.',
      'El delivery_url del pedido es el enlace de lo que quede funcionando (o el documento de entrega), nunca el proyecto vacío.',
    ],
  },

  // ── Cambios: sobre lo ya entregado ──
  {
    kind: 'cambio',
    title: 'Producción · Cambio de cliente',
    description: 'Aplica un retoque sobre algo ya entregado, sin rehacerlo y sin escribirle al cliente.',
    icon: 'brush',
    variables: [V.donde, V.cambio, V.tono, V.contacto],
    detalle: [
      'Identificá primero DÓNDE vive {{donde}} con el listado que corresponda (gobiz_sites_list, gobiz_stores_list, gobiz_prosites_list, gobiz_html_list) y trabajá con el id real; en sitios conviene el card_id, porque las URL de tarjeta pueden repetirse.',
      'Aplicá SÓLO lo que pide {{que_cambiar}}: un cambio no es una excusa para rediseñar. Lo que te parezca mejorable, anotalo aparte en el resumen.',
      'Textos nuevos en tono {{tono}}; datos de contacto según {{contacto}} si el cambio los toca.',
      'Después de tocar un pro site hay que volver a publicarlo (gobiz_prosites_publish). Revisá que lo que ya funcionaba siga funcionando, sobre todo el botón de WhatsApp y los precios.',
    ],
  },
];

// ── Armado del texto ───────────────────────────────────────────────────────

/** La cadena genérica, sin pedido concreto todavía: el id lo pone quien la corre. */
function pasosDe(kind: WorkKind): string[] {
  return CADENA_POR_TIPO[kind].steps.map((step) => step.replace(/\{id\}/g, '<id del pedido>'));
}

function texto(cfg: Config): string {
  const meta = WORK_KIND_META[cfg.kind];
  const partes = [
    `Sos producción. Este pedido es de tipo "${cfg.kind}" (${meta.label}): ${meta.ayuda}`,
    REGLAS,
    ['LO QUE TE PASARON PARA ESTE TRABAJO:', ...cfg.variables.map((v) => `- ${v.label}: {{${v.name}}}`)].join('\n'),
    ['QUÉ PRODUCIR — cadena exacta de tools, en este orden:', ...pasosDe(cfg.kind).map((p, i) => `${i + 1}. ${p}`)].join('\n'),
    ['CÓMO SE APLICA A ESTE PEDIDO:', ...cfg.detalle.map((d) => `- ${d}`)].join('\n'),
    cfg.imagenes ? IMAGENES : null,
    `TOOLS DE ESTE TRABAJO: ${CADENA_POR_TIPO[cfg.kind].tools.join(' → ')}`,
    CIERRE,
  ];
  return partes.filter((p): p is string => Boolean(p)).join('\n\n');
}

type SeedSkill = {
  key: string;
  title: string;
  text: string;
  toolChain: string[];
  description: string;
  category: SkillCategory;
  icon: SkillIcon;
  recurrence: SkillRecurrence;
  execution: SkillExecution;
  scope: SkillScope;
  variables: SkillVariable[];
  /**
   * `workKinds` no existe en `SkillRecommendFor` (esa lista es del Command
   * Center comercial: gates, señales, responsables). Se guarda igual en el JSON
   * de la columna y lo lee `GET /prompts/recommended?workKind=…`.
   */
  recommendFor: SkillRecommendFor & { workKinds: WorkKind[] };
};

const SKILLS: SeedSkill[] = CONFIGS.map((cfg) => ({
  // La key ES el tipo de trabajo, sin traducir: con el `work_kind` en la mano
  // se encuentra la skill sin buscar en ninguna tabla de equivalencias.
  key: `prod.${cfg.kind}`,
  title: cfg.title,
  description: cfg.description,
  // No hay categoría "producción" en la lista cerrada de skills (ese archivo lo
  // comparte el Command Center comercial): las agrupa el prefijo `prod.` y el
  // título. Todas comparten categoría para que un solo filtro las muestre.
  category: 'general',
  icon: cfg.icon,
  recurrence: 'on_demand',
  execution: 'connector',
  scope: 'both',
  toolChain: CADENA_POR_TIPO[cfg.kind].tools,
  variables: cfg.variables,
  recommendFor: { workKinds: [cfg.kind] },
  text: texto(cfg),
}));

/** Todo lo que describe a la skill, para insertar y para actualizar por igual. */
function valores(a: SeedSkill) {
  return {
    title: a.title,
    userTemplate: a.text,
    toolChain: a.toolChain,
    notes: null,
    description: a.description,
    category: a.category,
    icon: a.icon,
    recurrence: a.recurrence,
    execution: a.execution,
    scope: a.scope,
    variables: a.variables as unknown as Record<string, unknown>[],
    recommendFor: a.recommendFor as unknown as Record<string, unknown>,
    pinned: false,
    audience: 'connector',
  };
}

/**
 * JSON con las claves de cada objeto ordenadas.
 *
 * `variables` y `recommend_for` son `jsonb`, y Postgres reordena las claves de
 * un objeto jsonb al guardarlo. Comparando con `JSON.stringify` a secas, la
 * huella de la semilla nunca coincide con la de la fila y el seed crea una
 * versión nueva de las 12 skills cada vez que se corre, aunque no haya
 * cambiado una coma. El orden de los arrays sí se respeta y sí importa.
 */
function estable(value: unknown): string {
  const orden = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(orden);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, orden((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  // El round-trip primero, para que `undefined` desaparezca igual que al guardar.
  return JSON.stringify(orden(JSON.parse(JSON.stringify(value))));
}

/** Lo que define a la skill, en un orden fijo, para comparar la semilla con la fila activa. */
function huella(v: ReturnType<typeof valores>): string {
  return estable([v.title, v.userTemplate, v.toolChain, v.notes, v.description, v.category, v.icon, v.recurrence, v.execution, v.scope, v.variables, v.recommendFor, v.pinned, v.audience]);
}
function huellaFila(p: typeof teamPrompts.$inferSelect): string {
  return estable([p.title, p.userTemplate, p.toolChain ?? [], p.notes ?? null, p.description ?? '', p.category, p.icon, p.recurrence, p.execution, p.scope, p.variables ?? [], p.recommendFor ?? {}, p.pinned ?? false, p.audience]);
}

async function main() {
  // Un WORK_KIND nuevo sin prompt es un pedido que llega a producción sin
  // receta y nadie se entera hasta que alguien lo abre.
  const faltantes = WORK_KINDS.filter((k) => !CONFIGS.some((c) => c.kind === k));
  if (faltantes.length) console.warn(`⚠ tipos de trabajo sin skill: ${faltantes.join(', ')}`);

  let creadas = 0;
  let iguales = 0;
  for (const a of SKILLS) {
    const v = valores(a);
    const previas = await db.query.teamPrompts.findMany({ where: and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, a.key)) });
    const activa = previas.find((p) => p.status === 'active');
    if (activa && huellaFila(activa) === huella(v)) {
      console.log(`= ${a.key} v${activa.version} ya dice esto`);
      iguales += 1;
      continue;
    }
    // Misma regla que upsertSkill: versión siguiente, la anterior queda
    // retirada, y el uso acumulado (que es de la skill, no de la versión) se arrastra.
    const version = previas.reduce((max, p) => Math.max(max, p.version), 0) + 1;
    const usageCount = previas.reduce((max, p) => Math.max(max, p.usageCount ?? 0), 0);
    const lastUsedAt = previas.reduce<Date | null>((latest, p) => (p.lastUsedAt && (!latest || p.lastUsedAt > latest) ? p.lastUsedAt : latest), null);
    const row = await db.transaction(async (tx) => {
      if (previas.length) {
        await tx.update(teamPrompts).set({ status: 'retired', updatedAt: new Date() }).where(and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, a.key)));
      }
      const [inserted] = await tx
        .insert(teamPrompts)
        .values({ teamId: TEAM_ID, key: a.key, purpose: 'custom', version, status: 'active', systemPrompt: '', createdBy: USER_ID, usageCount, lastUsedAt, ...v })
        .returning({ id: teamPrompts.id });
      return inserted;
    });
    console.log(`${previas.length ? '^' : '+'} ${a.key} v${version} ${previas.length ? `creada, v${activa?.version ?? '?'} retirada` : 'creada'} (id ${row.id})`);
    creadas += 1;
  }
  console.log(`\n${SKILLS.length} skills de producción: ${creadas} versiones nuevas, ${iguales} sin cambios (${SKILLS.filter((s) => s.variables.some((v) => v.name === 'necesita_imagenes')).length} con diseño de imágenes).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
