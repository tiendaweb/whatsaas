/**
 * Vistas del hub de IA y las apps que agrupa.
 *
 * Español rioplatense hardcodeado, igual que Empresa y Marketing.
 */
export const VISTAS = [
  'inicio',
  'agente',
  'funciones',
  'automatizaciones',
  'conectores',
  'banco',
  'apps',
] as const;

export type Vista = (typeof VISTAS)[number];

export const VISTA_LABELS: Record<Vista, string> = {
  inicio: 'Inicio',
  agente: 'Agente',
  funciones: 'Funciones',
  automatizaciones: 'Automatizaciones',
  conectores: 'Conectores',
  banco: 'Banco de APIs',
  apps: 'Apps',
};

export function isVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v);
}

/**
 * Qué app respalda cada vista. `null` = es del hub o del producto y está
 * siempre (el agente y las automatizaciones son del núcleo, no plugins).
 */
export const PLUGIN_POR_VISTA: Record<Vista, string | null> = {
  inicio: null,
  agente: null,
  funciones: null,
  automatizaciones: null,
  conectores: 'grok-connector',
  banco: 'gemini',
  apps: null,
};

export type SectorId = 'cerebro' | 'puertas' | 'motor';

export const SECTOR_LABELS: Record<SectorId, string> = {
  cerebro: 'El agente',
  puertas: 'Puertas de entrada',
  motor: 'Motor y cuota',
};

export type AppAgrupada = {
  /** Plugin que hay que tener activo. `null` = ruta del producto. */
  pluginId: string | null;
  /** `true` = atajo: el hub la ofrece pero la app sigue en el menú principal. */
  soloAtajo?: boolean;
  href: string;
  label: string;
  descripcion: string;
  sector: SectorId;
  icono: string;
  contador: 'automatizacionesActivas' | 'funcionesActivas' | 'conectoresActivos' | 'keysActivas' | null;
};

export const APPS_AGRUPADAS: AppAgrupada[] = [
  {
    pluginId: null,
    href: '/settings/ai',
    label: 'Agente IA',
    descripcion: 'Instrucciones, modelo y comportamiento del bot que atiende.',
    sector: 'cerebro',
    icono: 'Bot',
    contador: null,
    soloAtajo: true,
  },
  {
    pluginId: null,
    href: '/automation',
    label: 'Automatizaciones',
    descripcion: 'Flujos que responden solos según lo que escribe el cliente.',
    sector: 'cerebro',
    icono: 'Zap',
    contador: 'automatizacionesActivas',
    soloAtajo: true,
  },
  {
    pluginId: 'grok-connector',
    href: '/plugins/grok-connector',
    label: 'Grok',
    descripcion: 'Conector MCP para trabajar sobre WhatsPro desde Grok.',
    sector: 'puertas',
    icono: 'Plug',
    contador: null,
  },
  {
    pluginId: 'chatgpt-connector',
    href: '/plugins/chatgpt-connector',
    label: 'ChatGPT',
    descripcion: 'Conector MCP de consulta desde ChatGPT.',
    sector: 'puertas',
    icono: 'Plug',
    contador: null,
  },
  {
    pluginId: 'claude-code-connector',
    href: '/plugins/claude-code-connector',
    label: 'Claude Code',
    descripcion: 'Conector MCP para trabajar desde Claude Code.',
    sector: 'puertas',
    icono: 'Plug',
    contador: null,
  },
  {
    pluginId: 'gemini',
    href: '/plugins/gemini',
    label: 'Banco de APIs',
    descripcion: 'Las claves de Gemini y su cuota diaria.',
    sector: 'motor',
    icono: 'KeyRound',
    contador: 'keysActivas',
  },
];
