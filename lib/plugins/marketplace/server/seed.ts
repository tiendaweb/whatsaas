import { db } from '@/lib/db/drizzle';
import { marketplaceItems } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

const defaultItems = [
  {
    title: 'Sitio Web',
    subtitle: 'Presencia online profesional para tu negocio',
    description:
      'Obtén un sitio web moderno y responsivo que represente tu marca. Incluye diseño personalizado, optimización SEO básica y formulario de contacto. Perfecto para dar tus primeros pasos en el mundo digital.',
    category: 'web',
    tag: 'gratis',
    isFree: true,
    monthlyPrice: null,
    annualPrice: null,
    installationPrice: null,
    interfaceBlocks: [
      { html: '<div class="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 p-8 text-white text-center"><h3 class="text-xl font-bold">Tu Sitio Web</h3><p class="mt-2 opacity-80">Diseño moderno y responsivo</p></div>' },
    ],
    customFields: [
      { label: 'Páginas incluidas', key: 'pages', value: '5' },
      { label: 'Dominio personalizado', key: 'custom_domain', value: 'Sí' },
      { label: 'Certificado SSL', key: 'ssl', value: 'Incluido' },
    ],
    order: 1,
  },
  {
    title: 'Tienda Online',
    subtitle: 'Vende tus productos las 24 horas del día',
    description:
      'Tienda online completa con catálogo de productos, carrito de compras, pasarela de pagos y gestión de inventario. Incluye integración con los principales métodos de pago y envío automatizado de notificaciones.',
    category: 'ecommerce',
    tag: 'popular',
    isFree: false,
    monthlyPrice: '29.00',
    annualPrice: '290.00',
    installationPrice: null,
    interfaceBlocks: [
      { html: '<div class="rounded-lg border p-6"><div class="grid grid-cols-3 gap-4"><div class="bg-muted rounded p-4 text-center text-sm">Producto 1</div><div class="bg-muted rounded p-4 text-center text-sm">Producto 2</div><div class="bg-muted rounded p-4 text-center text-sm">Producto 3</div></div></div>' },
    ],
    customFields: [
      { label: 'Productos', key: 'products', value: 'Ilimitados' },
      { label: 'Pasarelas de pago', key: 'payment_gateways', value: 'Stripe, MercadoPago' },
      { label: 'Gestión de inventario', key: 'inventory', value: 'Incluido' },
    ],
    order: 2,
  },
  {
    title: 'Sitio Web Profesional',
    subtitle: 'Diseño premium con funcionalidades avanzadas',
    description:
      'Sitio web de alto rendimiento con diseño UI/UX profesional, animaciones, blog integrado, panel de administración, analíticas avanzadas y optimización SEO completa. Ideal para empresas que buscan diferenciarse de la competencia.',
    category: 'web',
    tag: 'premium',
    isFree: false,
    monthlyPrice: '49.00',
    annualPrice: '490.00',
    installationPrice: '99.00',
    interfaceBlocks: [
      { html: '<div class="rounded-lg bg-gradient-to-br from-purple-600 to-pink-500 p-8 text-white"><h3 class="text-xl font-bold">Profesional</h3><p class="mt-2 opacity-80">Diseño premium + Blog + SEO avanzado</p><div class="mt-4 flex gap-2"><span class="rounded bg-white/20 px-2 py-1 text-xs">Blog</span><span class="rounded bg-white/20 px-2 py-1 text-xs">SEO</span><span class="rounded bg-white/20 px-2 py-1 text-xs">Analytics</span></div></div>' },
    ],
    customFields: [
      { label: 'Páginas incluidas', key: 'pages', value: 'Ilimitadas' },
      { label: 'Blog', key: 'blog', value: 'Incluido' },
      { label: 'SEO avanzado', key: 'seo', value: 'Completo' },
      { label: 'Soporte prioritario', key: 'support', value: '24/7' },
    ],
    order: 3,
  },
  {
    title: 'Tienda Online Profesional',
    subtitle: 'E-commerce completo para escalar tu negocio',
    description:
      'La solución de comercio electrónico más completa. Incluye todo lo de la tienda básica más: múltiples monedas, cupones y descuentos, programa de fidelidad, reportes avanzados, integración con ERPs y marketplace multi-vendor.',
    category: 'ecommerce',
    tag: 'premium',
    isFree: false,
    monthlyPrice: '79.00',
    annualPrice: '790.00',
    installationPrice: '149.00',
    interfaceBlocks: [
      { html: '<div class="rounded-lg border-2 border-amber-500 p-6"><div class="flex items-center gap-2 mb-4"><span class="text-amber-500 text-lg">★</span><span class="font-bold">E-Commerce Pro</span></div><div class="space-y-2 text-sm"><div class="flex justify-between"><span>Ventas del mes</span><span class="font-bold">$12,450</span></div><div class="flex justify-between"><span>Pedidos</span><span class="font-bold">186</span></div><div class="flex justify-between"><span>Conversión</span><span class="font-bold">3.2%</span></div></div></div>' },
    ],
    customFields: [
      { label: 'Multi-moneda', key: 'multi_currency', value: 'Sí' },
      { label: 'Cupones', key: 'coupons', value: 'Ilimitados' },
      { label: 'Multi-vendor', key: 'multi_vendor', value: 'Disponible' },
      { label: 'API acceso', key: 'api', value: 'Completo' },
    ],
    order: 4,
  },
  {
    title: 'Conexión con n8n',
    subtitle: 'Automatiza flujos de trabajo sin límites',
    description:
      'Conecta tu plataforma con más de 400 aplicaciones a través de n8n. Automatiza procesos como sincronización de contactos, envío de emails, actualización de CRMs, notificaciones y mucho más. Configuración inicial incluida.',
    category: 'automatizacion',
    tag: 'esencial',
    isFree: true,
    monthlyPrice: null,
    annualPrice: null,
    installationPrice: '49.00',
    interfaceBlocks: [
      { html: '<div class="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-6 text-center"><div class="text-3xl mb-2">⚡</div><p class="font-medium">n8n + WhatsApp</p><p class="text-sm text-muted-foreground mt-1">400+ integraciones disponibles</p></div>' },
    ],
    customFields: [
      { label: 'Integraciones', key: 'integrations', value: '400+' },
      { label: 'Workflows', key: 'workflows', value: 'Ilimitados' },
      { label: 'Configuración inicial', key: 'setup', value: 'Incluida' },
    ],
    order: 5,
  },
  {
    title: 'Formularios',
    subtitle: 'Captura leads y datos de forma inteligente',
    description:
      'Crea formularios personalizados con lógica condicional, validación avanzada y diseño adaptable. Integra formularios directamente en tu sitio web o comparte enlaces. Los datos se sincronizan automáticamente con tus contactos.',
    category: 'herramientas',
    tag: 'popular',
    isFree: false,
    monthlyPrice: '9.00',
    annualPrice: '90.00',
    installationPrice: null,
    interfaceBlocks: [
      { html: '<div class="rounded-lg border p-6 space-y-3"><div class="space-y-1"><label class="text-xs font-medium">Nombre</label><div class="h-8 rounded border bg-muted"></div></div><div class="space-y-1"><label class="text-xs font-medium">Email</label><div class="h-8 rounded border bg-muted"></div></div><div class="space-y-1"><label class="text-xs font-medium">Mensaje</label><div class="h-16 rounded border bg-muted"></div></div><div class="h-8 w-24 rounded bg-primary"></div></div>' },
    ],
    customFields: [
      { label: 'Formularios', key: 'forms', value: 'Ilimitados' },
      { label: 'Lógica condicional', key: 'conditional_logic', value: 'Sí' },
      { label: 'Exportar datos', key: 'export', value: 'CSV, Excel' },
    ],
    order: 6,
  },
  {
    title: 'Tablas',
    subtitle: 'Organiza y gestiona datos de forma visual',
    description:
      'Crea tablas de datos personalizadas para gestionar información de tu equipo. Soporta filtros avanzados, ordenamiento, vistas personalizadas y exportación. Perfecto para tracking de proyectos, inventarios y listas personalizadas.',
    category: 'herramientas',
    tag: 'gratis',
    isFree: true,
    monthlyPrice: null,
    annualPrice: null,
    installationPrice: null,
    interfaceBlocks: [
      { html: '<div class="rounded-lg border overflow-hidden"><table class="w-full text-sm"><thead class="bg-muted"><tr><th class="p-2 text-left">Nombre</th><th class="p-2 text-left">Estado</th><th class="p-2 text-left">Fecha</th></tr></thead><tbody><tr class="border-t"><td class="p-2">Proyecto A</td><td class="p-2"><span class="rounded bg-green-100 text-green-700 px-2 py-0.5 text-xs">Activo</span></td><td class="p-2">Mar 2026</td></tr><tr class="border-t"><td class="p-2">Proyecto B</td><td class="p-2"><span class="rounded bg-yellow-100 text-yellow-700 px-2 py-0.5 text-xs">Pendiente</span></td><td class="p-2">Abr 2026</td></tr></tbody></table></div>' },
    ],
    customFields: [
      { label: 'Tablas', key: 'tables', value: 'Ilimitadas' },
      { label: 'Columnas personalizadas', key: 'custom_columns', value: 'Sí' },
      { label: 'Exportar', key: 'export', value: 'CSV' },
    ],
    order: 7,
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
      currency: 'usd' as const,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );

  return { skipped: false, message: `Seeded ${defaultItems.length} marketplace items` };
}
