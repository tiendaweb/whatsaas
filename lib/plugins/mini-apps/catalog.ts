export type MiniAppMeta = {
  slug: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // gradient classes
  tags: string[];
};

export const MINI_APPS_CATALOG: MiniAppMeta[] = [
  {
    slug: 'business-woman-planner',
    name: 'Business Woman Planner',
    description: 'Planner ejecutivo diario: agenda, clientes, ventas, pagos, dominios, casa y crecimiento personal. Todos los datos guardados en la nube.',
    icon: 'Sparkles',
    color: 'from-rose-400 to-pink-600',
    tags: ['productividad', 'planner', 'negocios'],
  },
];

export const KNOWN_SLUGS = MINI_APPS_CATALOG.map(a => a.slug);
