/**
 * Vistas de Empresa y el catálogo de apps que agrupa.
 *
 * Español rioplatense hardcodeado, igual que el Command Center: la app se
 * escribe en paralelo al resto y no pasa por i18n.
 */
export const VISTAS = [
  'inicio',
  'ficha',
  'crm',
  'marcas',
  'planes',
  'suscripciones',
  'clientes',
  'ventas',
  'oportunidades',
  'contratos',
  'proyectos',
  'apps',
] as const;

export type Vista = (typeof VISTAS)[number];

export const VISTA_LABELS: Record<Vista, string> = {
  inicio: 'Inicio',
  ficha: 'Ficha general',
  crm: 'CRM',
  marcas: 'Marcas',
  planes: 'Planes',
  suscripciones: 'Suscripciones',
  clientes: 'Clientes',
  ventas: 'Ventas',
  oportunidades: 'Oportunidades',
  contratos: 'Contratos',
  proyectos: 'Proyectos',
  apps: 'Apps',
};

export function isVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v);
}

/**
 * Qué app respalda cada vista.
 *
 * Empresa agrupa, no reemplaza: Ventas es la app Ventas y Contratos es la app
 * Contratos. Si el equipo no las tiene activas, la vista no se dibuja en el
 * rail —mostrarla llevaría a una pantalla que pide datos que el servidor le va
 * a negar, y el error se leería como un problema de Empresa—.
 *
 * `null` = la vista es de Empresa misma y está siempre.
 */
export const PLUGIN_POR_VISTA: Record<Vista, string | null> = {
  inicio: null,
  ficha: null,
  // El CRM es del producto, no de un plugin: las etapas y los contactos son
  // los mismos de Contactos y del Command Center.
  crm: null,
  marcas: 'memberships',
  planes: 'memberships',
  suscripciones: 'memberships',
  clientes: 'customers',
  ventas: 'sales',
  oportunidades: 'deals',
  contratos: 'contracts',
  // Proyectos son los de TAREAS OS: sin esa app activa, la vista pediría datos
  // que el servidor le va a negar.
  proyectos: 'tasks',
  apps: null,
};

/**
 * Vistas que Empresa muestra pero cuya app NO se queda.
 *
 * Empresa agrupa: cuando una vista respalda a una app, esa app deja de
 * aparecer suelta en el lanzador y en el menú (`lib/menu/agrupadas.ts`). Con
 * Tareas OS eso no corresponde: acá se MIRA el estado de los proyectos, pero
 * el trabajo diario —crear, mover, editar, la vista de enfoque, Producción—
 * vive en su propia app, que sigue teniendo su acceso.
 */
export const VISTAS_ATAJO: Vista[] = ['proyectos'];

/**
 * Las apps que Empresa agrupa pero NO reescribe: son aplicaciones enteras con
 * su propia pantalla (Finanzas OS ocupa toda la ventana) o herramientas de las
 * que acá sólo interesa el número. Se entra por el Inicio, en su sector.
 *
 * `pluginId` es lo que el servidor consulta para saber si el equipo (o esta
 * persona, en las de activación por usuario) la tiene activa: mostrar un
 * acceso que lleva a un 404 es peor que no mostrarlo.
 */
export type SectorId = 'plata' | 'gente' | 'catalogo' | 'activos' | 'trabajo';

export const SECTOR_LABELS: Record<SectorId, string> = {
  plata: 'Plata',
  gente: 'Gente',
  catalogo: 'Catálogo',
  activos: 'Activos digitales',
  trabajo: 'Trabajo',
};

export type AppAgrupada = {
  pluginId: string;
  /** `true` = atajo: el hub la ofrece pero la app sigue en el menú principal. */
  soloAtajo?: boolean;
  href: string;
  label: string;
  descripcion: string;
  sector: SectorId;
  /** Nombre del icono de lucide; el mapa vive en la UI. */
  icono: string;
  /** Clave del contador que el servidor devuelve para esta app, si tiene. */
  contador: 'finanzasPorCobrar' | 'comprasPendientes' | 'soporteAbiertos' | 'articulos' | null;
};

export const APPS_AGRUPADAS: AppAgrupada[] = [
  {
    pluginId: 'finance',
    href: '/plugins/finance',
    label: 'Finanzas OS',
    descripcion: 'Caja, cobros y gastos por moneda.',
    sector: 'plata',
    icono: 'BadgeDollarSign',
    contador: 'finanzasPorCobrar',
  },
  {
    pluginId: 'purchases',
    href: '/plugins/purchases',
    label: 'Compras',
    descripcion: 'Órdenes a proveedores.',
    sector: 'plata',
    icono: 'ShoppingCart',
    contador: 'comprasPendientes',
  },
  {
    pluginId: 'hr',
    href: '/plugins/hr',
    label: 'RRHH',
    descripcion: 'Legajos del equipo.',
    sector: 'gente',
    icono: 'UserCog',
    contador: null,
  },
  {
    pluginId: 'support',
    href: '/plugins/support',
    label: 'Soporte',
    descripcion: 'Tickets de clientes.',
    sector: 'gente',
    icono: 'LifeBuoy',
    contador: 'soporteAbiertos',
  },
  {
    pluginId: 'articles',
    href: '/plugins/articles',
    label: 'Artículos',
    descripcion: 'Catálogo de productos y servicios.',
    sector: 'catalogo',
    icono: 'Package',
    contador: 'articulos',
  },
  {
    pluginId: 'intelligence',
    href: '/plugins/intelligence',
    label: 'Inteligencia',
    descripcion: 'Informes del negocio.',
    sector: 'catalogo',
    icono: 'PieChart',
    contador: null,
  },
  {
    pluginId: 'domains',
    href: '/plugins/domains',
    label: 'Dominios',
    descripcion: 'Dominios del negocio y de los clientes, con sus vencimientos.',
    sector: 'activos',
    icono: 'Globe',
    contador: null,
  },
  {
    pluginId: 'hostinger',
    href: '/plugins/hostinger',
    label: 'Hostinger',
    descripcion: 'Servidores, dominios y hosting de la cuenta.',
    sector: 'activos',
    icono: 'Server',
    contador: null,
  },
  {
    pluginId: 'documents',
    href: '/plugins/documents',
    label: 'Documentos',
    descripcion: 'Procedimientos, propuestas y documentación del negocio.',
    sector: 'trabajo',
    icono: 'FileStack',
    contador: null,
  },
  {
    pluginId: 'files',
    href: '/plugins/files',
    label: 'Archivos',
    descripcion: 'Comprobantes, contratos firmados y material.',
    sector: 'trabajo',
    icono: 'Files',
    contador: null,
  },
  {
    pluginId: 'calendar',
    href: '/plugins/calendar',
    label: 'Calendario',
    descripcion: 'Reuniones, entregas y vencimientos del negocio.',
    sector: 'trabajo',
    icono: 'CalendarDays',
    contador: null,
  },
];
