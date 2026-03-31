import { db } from '@/lib/db/drizzle';
import { marketplaceItems } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

const defaultItems: Array<
  Omit<typeof marketplaceItems.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
> = [
  {
    title: 'Sitio Web',
    subtitle: 'Presencia online profesional para tu negocio',
    description:
      'Obten un sitio web moderno y responsivo que represente tu marca. Incluye diseno personalizado, optimizacion SEO basica y formulario de contacto. Perfecto para dar tus primeros pasos en el mundo digital.',
    category: 'web',
    tags: ['gratis'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 p-8 text-white text-center"><h3 class="text-xl font-bold">Tu Sitio Web</h3><p class="mt-2 opacity-80">Diseno moderno y responsivo</p></div>' },
    ],
    customFields: [
      { label: 'Paginas incluidas', key: 'pages', value: '5' },
      { label: 'Dominio personalizado', key: 'custom_domain', value: 'Si' },
      { label: 'Certificado SSL', key: 'ssl', value: 'Incluido' },
    ],
    status: 'active',
  },
  {
    title: 'Tienda Online',
    subtitle: 'Vende tus productos las 24 horas del dia',
    description:
      'Tienda online completa con catalogo de productos, carrito de compras, pasarela de pagos y gestion de inventario. Incluye integracion con los principales metodos de pago y envio automatizado de notificaciones.',
    category: 'ecommerce',
    tags: ['popular'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg border p-6"><div class="grid grid-cols-3 gap-4"><div class="bg-muted rounded p-4 text-center text-sm">Producto 1</div><div class="bg-muted rounded p-4 text-center text-sm">Producto 2</div><div class="bg-muted rounded p-4 text-center text-sm">Producto 3</div></div></div>' },
    ],
    customFields: [
      { label: 'Productos', key: 'products', value: 'Ilimitados' },
      { label: 'Pasarelas de pago', key: 'payment_gateways', value: 'Stripe, MercadoPago' },
      { label: 'Gestion de inventario', key: 'inventory', value: 'Incluido' },
    ],
    status: 'active',
  },
  {
    title: 'Sitio Web Profesional',
    subtitle: 'Diseno premium con funcionalidades avanzadas',
    description:
      'Sitio web de alto rendimiento con diseno UI/UX profesional, animaciones, blog integrado, panel de administracion, analiticas avanzadas y optimizacion SEO completa. Ideal para empresas que buscan diferenciarse de la competencia.',
    category: 'web',
    tags: ['premium'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg bg-gradient-to-br from-purple-600 to-pink-500 p-8 text-white"><h3 class="text-xl font-bold">Profesional</h3><p class="mt-2 opacity-80">Diseno premium + Blog + SEO avanzado</p><div class="mt-4 flex gap-2"><span class="rounded bg-white/20 px-2 py-1 text-xs">Blog</span><span class="rounded bg-white/20 px-2 py-1 text-xs">SEO</span><span class="rounded bg-white/20 px-2 py-1 text-xs">Analytics</span></div></div>' },
    ],
    customFields: [
      { label: 'Paginas incluidas', key: 'pages', value: 'Ilimitadas' },
      { label: 'Blog', key: 'blog', value: 'Incluido' },
      { label: 'SEO avanzado', key: 'seo', value: 'Completo' },
      { label: 'Soporte prioritario', key: 'support', value: '24/7' },
    ],
    status: 'active',
  },
  {
    title: 'Tienda Online Profesional',
    subtitle: 'E-commerce completo para escalar tu negocio',
    description:
      'La solucion de comercio electronico mas completa. Incluye todo lo de la tienda basica mas: multiples monedas, cupones y descuentos, programa de fidelidad, reportes avanzados, integracion con ERPs y marketplace multi-vendor.',
    category: 'ecommerce',
    tags: ['premium'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg border-2 border-amber-500 p-6"><div class="flex items-center gap-2 mb-4"><span class="text-amber-500 text-lg">&#9733;</span><span class="font-bold">E-Commerce Pro</span></div><div class="space-y-2 text-sm"><div class="flex justify-between"><span>Ventas del mes</span><span class="font-bold">$12,450</span></div><div class="flex justify-between"><span>Pedidos</span><span class="font-bold">186</span></div><div class="flex justify-between"><span>Conversion</span><span class="font-bold">3.2%</span></div></div></div>' },
    ],
    customFields: [
      { label: 'Multi-moneda', key: 'multi_currency', value: 'Si' },
      { label: 'Cupones', key: 'coupons', value: 'Ilimitados' },
      { label: 'Multi-vendor', key: 'multi_vendor', value: 'Disponible' },
      { label: 'API acceso', key: 'api', value: 'Completo' },
    ],
    status: 'active',
  },
  {
    title: 'Conexion con n8n',
    subtitle: 'Automatiza flujos de trabajo sin limites',
    description:
      'Conecta tu plataforma con mas de 400 aplicaciones a traves de n8n. Automatiza procesos como sincronizacion de contactos, envio de emails, actualizacion de CRMs, notificaciones y mucho mas. Configuracion inicial incluida.',
    category: 'automatizacion',
    tags: ['esencial'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-6 text-center"><div class="text-3xl mb-2">&#9889;</div><p class="font-medium">n8n + WhatsApp</p><p class="text-sm text-muted-foreground mt-1">400+ integraciones disponibles</p></div>' },
    ],
    customFields: [
      { label: 'Integraciones', key: 'integrations', value: '400+' },
      { label: 'Workflows', key: 'workflows', value: 'Ilimitados' },
      { label: 'Configuracion inicial', key: 'setup', value: 'Incluida' },
    ],
    status: 'active',
  },
  {
    title: 'Formularios',
    subtitle: 'Captura leads y datos de forma inteligente',
    description:
      'Crea formularios personalizados con logica condicional, validacion avanzada y diseno adaptable. Integra formularios directamente en tu sitio web o comparte enlaces. Los datos se sincronizan automaticamente con tus contactos.',
    category: 'herramientas',
    tags: ['popular'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg border p-6 space-y-3"><div class="space-y-1"><label class="text-xs font-medium">Nombre</label><div class="h-8 rounded border bg-muted"></div></div><div class="space-y-1"><label class="text-xs font-medium">Email</label><div class="h-8 rounded border bg-muted"></div></div><div class="space-y-1"><label class="text-xs font-medium">Mensaje</label><div class="h-16 rounded border bg-muted"></div></div><div class="h-8 w-24 rounded bg-primary"></div></div>' },
    ],
    customFields: [
      { label: 'Formularios', key: 'forms', value: 'Ilimitados' },
      { label: 'Logica condicional', key: 'conditional_logic', value: 'Si' },
      { label: 'Exportar datos', key: 'export', value: 'CSV, Excel' },
    ],
    status: 'active',
  },
  {
    title: 'Tablas',
    subtitle: 'Organiza y gestiona datos de forma visual',
    description:
      'Crea tablas de datos personalizadas para gestionar informacion de tu equipo. Soporta filtros avanzados, ordenamiento, vistas personalizadas y exportacion. Perfecto para tracking de proyectos, inventarios y listas personalizadas.',
    category: 'herramientas',
    tags: ['gratis'],
    interfaceBlocks: [
      { html: '<div class="rounded-lg border overflow-hidden"><table class="w-full text-sm"><thead class="bg-muted"><tr><th class="p-2 text-left">Nombre</th><th class="p-2 text-left">Estado</th><th class="p-2 text-left">Fecha</th></tr></thead><tbody><tr class="border-t"><td class="p-2">Proyecto A</td><td class="p-2"><span class="rounded bg-green-100 text-green-700 px-2 py-0.5 text-xs">Activo</span></td><td class="p-2">Mar 2026</td></tr><tr class="border-t"><td class="p-2">Proyecto B</td><td class="p-2"><span class="rounded bg-yellow-100 text-yellow-700 px-2 py-0.5 text-xs">Pendiente</span></td><td class="p-2">Abr 2026</td></tr></tbody></table></div>' },
    ],
    customFields: [
      { label: 'Tablas', key: 'tables', value: 'Ilimitadas' },
      { label: 'Columnas personalizadas', key: 'custom_columns', value: 'Si' },
      { label: 'Exportar', key: 'export', value: 'CSV' },
    ],
    status: 'active',
  },
];

export async function seedMarketplaceItems() {
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketplaceItems);

  if (Number(existing[0]?.count) > 0) {
    return { skipped: true, message: 'Marketplace items already seeded' };
  }

  await db.insert(marketplaceItems).values(
    defaultItems.map((item) => ({
      ...item,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );

  return { skipped: false, message: `Seeded ${defaultItems.length} marketplace items` };
}
