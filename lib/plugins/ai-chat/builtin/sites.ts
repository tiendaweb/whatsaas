import { listSites } from '@/lib/plugins/sites/server/service';
import { ok, type BuiltinToolDefinition } from './types';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/** Sitios: links públicos del negocio para compartir. */
export const sitesTools: BuiltinToolDefinition[] = [
  {
    name: 'get_business_links',
    pluginId: 'sites',
    label: 'Links del negocio',
    summary: 'URLs públicas de los sitios publicados del equipo (web, catálogo, landing) para compartir con el cliente.',
    risk: 'read',
    description: 'Devuelve los links públicos de los sitios web publicados del negocio (web institucional, catálogo, landing de un producto) para compartírselos al cliente cuando pida "la página", "el catálogo" o "dónde veo más info".',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const sites = await listSites(context.teamId);
      const published = sites.filter((s) => s.published);
      return ok({
        sites: published.slice(0, 10).map((s) => ({
          name: s.name,
          category: s.category,
          url: s.customDomain ? `https://${s.customDomain}` : s.subdomainHost ? `https://${s.subdomainHost}` : `${BASE_URL}${s.publicPath}`,
        })),
        note: published.length === 0 ? 'El equipo no tiene sitios publicados.' : undefined,
      });
    },
  },
];
