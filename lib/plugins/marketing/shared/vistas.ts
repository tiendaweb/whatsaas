/**
 * Vistas de Marketing y las apps que agrupa.
 *
 * Español rioplatense hardcodeado, igual que Empresa y el Command Center: la
 * app se escribe en paralelo al resto y no pasa por i18n.
 */
export const VISTAS = [
  'inicio',
  'anuncios',
  'difusion',
  'publicaciones',
  'comentarios',
  'formularios',
  'apps',
] as const;

export type Vista = (typeof VISTAS)[number];

export const VISTA_LABELS: Record<Vista, string> = {
  inicio: 'Inicio',
  anuncios: 'Meta Ads',
  difusion: 'Difusión',
  publicaciones: 'Publicaciones',
  comentarios: 'Comentarios',
  formularios: 'Formularios',
  apps: 'Apps',
};

export function isVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v);
}

/**
 * Qué app respalda cada vista.
 *
 * Marketing agrupa, no reemplaza. Si el equipo no tiene la app activa, la
 * vista no se dibuja en el rail: mostrarla llevaría a una pantalla que pide
 * datos que el servidor le va a negar, y el error se leería como un problema
 * de Marketing.
 *
 * `null` = la vista es de Marketing misma y está siempre. La difusión de
 * WhatsApp no es un plugin sino una feature del producto (`/campaigns`), así
 * que su disponibilidad la resuelve el servidor por feature flag, no por acá.
 */
export const PLUGIN_POR_VISTA: Record<Vista, string | null> = {
  inicio: null,
  anuncios: 'meta-ads',
  difusion: null,
  publicaciones: 'social-publisher',
  // Los comentarios usan las cuentas que conectó el publicador: sin esa app no
  // hay token con el que leerlos.
  comentarios: 'social-publisher',
  formularios: 'form-builder',
  apps: null,
};

export type SectorId = 'publicidad' | 'contenido' | 'captacion' | 'medicion';

export const SECTOR_LABELS: Record<SectorId, string> = {
  publicidad: 'Publicidad paga',
  contenido: 'Contenido',
  captacion: 'Captación',
  medicion: 'Medición',
};

export type AppAgrupada = {
  /**
   * Plugin que hay que tener activo. `null` = ruta del producto (Campañas,
   * Borradores, Plantillas): no se activa ni se desactiva por plugin.
   */
  pluginId: string | null;
  /**
   * `true` = el hub la ofrece como atajo pero NO se la queda: sigue en el menú
   * principal. Es la diferencia entre mudar una pantalla acá adentro y tener un
   * acceso cómodo a algo que se usa todo el día desde otro lado.
   */
  soloAtajo?: boolean;
  href: string;
  label: string;
  descripcion: string;
  sector: SectorId;
  /** Nombre del icono de lucide; el mapa vive en la UI. */
  icono: string;
  /** Clave del contador que el servidor devuelve para esta app, si tiene. */
  contador: 'metaCampanasActivas' | 'difusionCampanas' | 'publicacionesProgramadas' | 'formulariosEnvios' | 'borradores' | null;
};

export const APPS_AGRUPADAS: AppAgrupada[] = [
  {
    pluginId: 'meta-ads',
    href: '/plugins/meta-ads',
    label: 'Meta Ads',
    descripcion: 'Campañas de Facebook e Instagram, con gasto y resultados.',
    sector: 'publicidad',
    icono: 'Megaphone',
    contador: 'metaCampanasActivas',
  },
  {
    pluginId: null,
    href: '/campaigns',
    label: 'Difusión WhatsApp',
    descripcion: 'Envíos masivos a listas de contactos.',
    sector: 'publicidad',
    icono: 'Send',
    contador: 'difusionCampanas',
  },
  {
    pluginId: 'social-publisher',
    href: '/plugins/social-publisher',
    label: 'Publicaciones',
    descripcion: 'Posteos programados a Facebook e Instagram.',
    sector: 'contenido',
    icono: 'Share2',
    contador: 'publicacionesProgramadas',
  },
  {
    pluginId: 'documents',
    href: '/plugins/documents',
    label: 'Documentos',
    descripcion: 'Guiones, propuestas y material de campaña.',
    sector: 'contenido',
    icono: 'FileStack',
    contador: null,
  },
  {
    pluginId: 'files',
    href: '/plugins/files',
    label: 'Archivos',
    descripcion: 'Piezas, videos y creatividades.',
    sector: 'contenido',
    icono: 'Files',
    contador: null,
  },
  {
    pluginId: null,
    href: '/drafts',
    label: 'Borradores',
    descripcion: 'Mensajes guardados para reutilizar en campañas.',
    sector: 'contenido',
    icono: 'FileText',
    contador: 'borradores',
    // Se usa a diario desde la bandeja: acá es un atajo, no su casa.
    soloAtajo: true,
  },
  {
    pluginId: null,
    href: '/analytics',
    label: 'Analytics',
    descripcion: 'Métricas y reportes del equipo.',
    sector: 'medicion',
    icono: 'PieChart',
    contador: null,
  },
  {
    pluginId: 'calendar',
    href: '/plugins/calendar',
    label: 'Calendario',
    descripcion: 'Fechas de campaña, publicaciones y entregas.',
    sector: 'contenido',
    icono: 'CalendarDays',
    contador: null,
  },
  {
    pluginId: 'form-builder',
    href: '/plugins/form-builder',
    label: 'Formularios',
    descripcion: 'Captación de leads con envío al WhatsApp del equipo.',
    sector: 'captacion',
    icono: 'ClipboardList',
    contador: 'formulariosEnvios',
  },
  {
    pluginId: null,
    href: '/templates',
    label: 'Plantillas',
    descripcion: 'Plantillas aprobadas de WhatsApp para difusión.',
    sector: 'captacion',
    icono: 'LayoutTemplate',
    contador: null,
  },
];
