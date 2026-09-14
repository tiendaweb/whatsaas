/**
 * Lo que APP MAKER agrupa: las herramientas con las que el equipo construye
 * cosas propias.
 *
 * Sitios y Mis Apps andaban sueltas en el lanzador aunque son el mismo trabajo
 * —armar algo y publicarlo—, y las apps publicadas con APP MAKER aparecían
 * además como mosaicos individuales, así que el lanzador crecía solo cada vez
 * que alguien creaba una app.
 */
export type AppAgrupada = {
  pluginId: string | null;
  soloAtajo?: boolean;
  href: string;
  label: string;
  descripcion: string;
  icono: string;
};

export const APPS_AGRUPADAS: AppAgrupada[] = [
  {
    pluginId: 'sites',
    href: '/plugins/sites',
    label: 'Sitios',
    descripcion: 'Las páginas y sitios publicados del equipo.',
    icono: 'PanelsTopLeft',
  },
  {
    pluginId: 'mini-apps',
    href: '/plugins/mini-apps',
    label: 'Mis Apps',
    descripcion: 'Las mini apps instaladas para el equipo.',
    icono: 'LayoutGrid',
  },
];
