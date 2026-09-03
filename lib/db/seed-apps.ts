import { db } from "@/lib/db/drizzle";
import { and, eq } from "drizzle-orm";
import { marketplaceItemPrices, marketplaceItems } from "@/lib/db/schema";

type SeedPrice = {
  billingType: 'one_time' | 'monthly' | 'yearly' | 'setup';
  amount: number;
  currency?: string;
  enabled?: boolean;
};

type SeedMarketplaceItem = {
  title: string;
  subtitle: string;
  description: string;
  category: string;
  isDefault: boolean;
  isFunctional: boolean;
  appType: 'installable' | 'default';
  iconUrl?: string;
  imageUrl?: string;
  features: Array<{ id: string; name: string; description: string; enabled?: boolean }>;
  tags: string[];
  prices: SeedPrice[];
};

export const SEED_APPS = [
  // Mejoras (4 apps)
  {
    title: "Reportes Avanzados",
    subtitle: "Análisis y reportes personalizados",
    description: "Crea reportes personalizados con gráficos interactivos, filtros avanzados y exportación a múltiples formatos. Ideal para analizar datos en tiempo real.",
    category: "Mejoras",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/reports.svg",
    imageUrl: "/images/reports.png",
    features: [],
    tags: ["análisis", "reportes", "datos"],
  },
  {
    title: "Panel Personalizado",
    subtitle: "Dashboards a medida",
    description: "Diseña tu propio dashboard con widgets personalizables. Arrastra, suelta y configura el layout perfecto para tu equipo.",
    category: "Mejoras",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/dashboard.svg",
    imageUrl: "/images/dashboard.png",
    features: [],
    tags: ["dashboard", "personalización", "widgets"],
  },
  {
    title: "API Completa",
    subtitle: "Integración sin límites",
    description: "Acceso total a la API REST de WhatsaaS para integraciones avanzadas. Documentación completa y webhooks en tiempo real.",
    category: "Mejoras",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/api.svg",
    imageUrl: "/images/api.png",
    features: [],
    tags: ["api", "integraciones", "desarrollador"],
  },
  {
    title: "Integraciones Premium",
    subtitle: "Conecta con 100+ servicios",
    description: "Integración con Google Workspace, Salesforce, HubSpot, Stripe, y más. Sincronización bidireccional automática.",
    category: "Mejoras",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/integrations.svg",
    imageUrl: "/images/integrations.png",
    features: [],
    tags: ["integraciones", "terceros", "automatización"],
  },

  // Productividad (4 apps)
  {
    title: "Gestor de Tareas",
    subtitle: "Organiza tu trabajo",
    description: "Crea, asigna y monitorea tareas con diferentes prioridades. Kanban, lista y calendario. Colabora con tu equipo en tiempo real.",
    category: "Productividad",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/tasks.svg",
    imageUrl: "/images/tasks.png",
    features: [],
    tags: ["tareas", "productividad", "equipo"],
  },
  {
    title: "Gestión de Proyectos",
    subtitle: "Planifica y ejecuta proyectos",
    description: "Planificación de proyectos con timeline, dependencias, asignación de recursos. Seguimiento de progreso y reportes de Gantt.",
    category: "Productividad",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/projects.svg",
    imageUrl: "/images/projects.png",
    features: [],
    tags: ["proyectos", "gestión", "planificación"],
  },
  {
    title: "Gestor de Documentos",
    subtitle: "Colaboración en documentos",
    description: "Crea, edita y colabora en documentos en tiempo real. Control de versiones, comentarios y permisos granulares.",
    category: "Productividad",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/documents.svg",
    imageUrl: "/images/documents.png",
    features: [],
    tags: ["documentos", "colaboración", "almacenamiento"],
  },
  {
    title: "Control de Tiempo",
    subtitle: "Trackea tiempo de trabajo",
    description: "Monitoreo de horas trabajadas, proyectos y tareas. Reportes de productividad y facturación automática basada en horas.",
    category: "Productividad",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/timetracking.svg",
    imageUrl: "/images/timetracking.png",
    features: [],
    tags: ["tiempo", "productividad", "facturación"],
  },

  // Automatización (4 apps)
  {
    title: "Constructor de Workflows",
    subtitle: "Automatiza procesos",
    description: "Crea flujos de trabajo visuales sin código. Triggers, acciones condicionales y automatizaciones complejas.",
    category: "Automatización",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/workflows.svg",
    imageUrl: "/images/workflows.png",
    features: [],
    tags: ["automatización", "workflows", "procesos"],
  },
  {
    title: "Automatización de Emails",
    subtitle: "Campañas de email automatizadas",
    description: "Crea secuencias de email automáticas basadas en comportamiento. Segmentación, A/B testing y reportes detallados.",
    category: "Automatización",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/email-automation.svg",
    imageUrl: "/images/email-automation.png",
    features: [],
    tags: ["email", "marketing", "automatización"],
  },
  {
    title: "Webhooks Avanzados",
    subtitle: "Conecta en tiempo real",
    description: "Recibe eventos en tiempo real de tu aplicación. Webhooks seguros, reintentos automáticos y debugging.",
    category: "Automatización",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/webhooks.svg",
    imageUrl: "/images/webhooks.png",
    features: [],
    tags: ["webhooks", "integraciones", "tiempo real"],
  },
  {
    title: "Integración Zapier",
    subtitle: "Conecta con 5000+ apps",
    description: "Integración nativa con Zapier para conectar WhatsaaS con miles de aplicaciones sin código.",
    category: "Automatización",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/zapier.svg",
    imageUrl: "/images/zapier.png",
    features: [],
    tags: ["zapier", "integraciones", "automatización"],
  },

  // Nodos (4 apps)
  {
    title: "Nodo de Decisión",
    subtitle: "Lógica condicional en flujos",
    description: "Crea ramificaciones en tus flujos basadas en condiciones. IF/ELSE, switch y lógica compleja con interfaz visual.",
    category: "Nodos",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/decision-node.svg",
    imageUrl: "/images/decision-node.png",
    features: [],
    tags: ["nodos", "lógica", "flujos"],
  },
  {
    title: "Nodo de Base de Datos",
    subtitle: "Consulta y manipula datos",
    description: "Ejecuta queries SQL, inserta, actualiza y elimina datos. Soporte para múltiples bases de datos.",
    category: "Nodos",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/database-node.svg",
    imageUrl: "/images/database-node.png",
    features: [],
    tags: ["database", "datos", "sql"],
  },
  {
    title: "Nodo de API",
    subtitle: "Llamadas HTTP personalizadas",
    description: "Realiza peticiones HTTP a cualquier API externa. Headers, autenticación y transformación de respuestas.",
    category: "Nodos",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/api-node.svg",
    imageUrl: "/images/api-node.png",
    features: [],
    tags: ["api", "http", "integraciones"],
  },
  {
    title: "Nodo Personalizado",
    subtitle: "Desarrolla nodos con código",
    description: "Crea nodos personalizados con JavaScript/TypeScript. Librería de código reutilizable y marketplace de nodos.",
    category: "Nodos",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/custom-node.svg",
    imageUrl: "/images/custom-node.png",
    features: [],
    tags: ["nodos", "desarrollo", "código"],
  },

  // Apps (4 apps)
  {
    title: "Constructor de Formularios",
    subtitle: "Crea formularios sin código",
    description: "Drag & drop para crear formularios profesionales. Validaciones, campos personalizados y temas automáticos.",
    category: "Apps",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/forms.svg",
    imageUrl: "/images/forms.png",
    features: [],
    tags: ["formularios", "captura", "datos"],
  },
  {
    title: "Gestor de Encuestas",
    subtitle: "Crea y analiza encuestas",
    description: "Encuestas interactivas con lógica condicional. Análisis en tiempo real, exportación de resultados y reportes.",
    category: "Apps",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/surveys.svg",
    imageUrl: "/images/surveys.png",
    features: [],
    tags: ["encuestas", "feedback", "análisis"],
  },
  {
    title: "Constructor de Landing Pages",
    subtitle: "Páginas de conversión optimizadas",
    description: "Crea landing pages profesionales sin código. Templates optimizados, A/B testing y seguimiento de conversiones.",
    category: "Apps",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/landing-pages.svg",
    imageUrl: "/images/landing-pages.png",
    features: [],
    tags: ["landing pages", "conversión", "marketing"],
  },
  {
    title: "Tienda E-commerce",
    subtitle: "Vende productos en línea",
    description: "Catálogo de productos, carrito de compras, pagos seguros y gestión de inventario. Integraciones con Stripe y PayPal.",
    category: "Apps",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/ecommerce.svg",
    imageUrl: "/images/ecommerce.png",
    features: [],
    tags: ["ecommerce", "ventas", "tienda"],
  },

  // Marketing (4 apps)
  {
    title: "Email Marketing Pro",
    subtitle: "Campañas de email profesionales",
    description: "Crea campañas de email hermosas. Templates, segmentación avanzada, automatización y analítica detallada.",
    category: "Marketing",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/email-marketing.svg",
    imageUrl: "/images/email-marketing.png",
    features: [],
    tags: ["email", "marketing", "campañas"],
  },
  {
    title: "SMS Marketing",
    subtitle: "Mensajes SMS masivos",
    description: "Envía SMS a tus clientes. Segmentación, plantillas, seguimiento y cumplimiento GDPR.",
    category: "Marketing",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/sms-marketing.svg",
    imageUrl: "/images/sms-marketing.png",
    features: [],
    tags: ["sms", "marketing", "mensajes"],
  },
  {
    title: "Gestor de Redes Sociales",
    subtitle: "Publica en todas tus redes",
    description: "Programación de posts, análisis de engagement, calendar view. Conecta Instagram, Facebook, Twitter, LinkedIn.",
    category: "Marketing",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/social-media.svg",
    imageUrl: "/images/social-media.png",
    features: [],
    tags: ["redes sociales", "marketing", "social"],
  },
  {
    title: "Analítica Avanzada",
    subtitle: "Comprende el comportamiento",
    description: "Seguimiento avanzado de usuarios, eventos personalizados, análisis de cohortes y predictivos.",
    category: "Marketing",
    isDefault: false,
    isFunctional: false,
    appType: "installable" as const,
    iconUrl: "/icons/analytics.svg",
    imageUrl: "/images/analytics.png",
    features: [],
    tags: ["analítica", "datos", "comportamiento"],
  },
  {
    title: "Gestión de Dominios",
    subtitle: "Controla vencimientos y renovaciones",
    description: "Centraliza todos tus dominios web en un solo lugar. Controla fechas de vencimiento, registradores, precios y renovaciones automáticas. Ideal para agencias, desarrolladores y empresas SaaS. Incluye calendario de vencimientos y alertas configurables.",
    category: "Productividad",
    isDefault: false,
    isFunctional: true,
    appType: "default" as const,
    iconUrl: "/icons/domains.svg",
    imageUrl: "/images/domains.png",
    features: [
      { id: "expiry-calendar", name: "Calendario de vencimientos", description: "Vista calendario con todos los vencimientos próximos", enabled: true },
      { id: "contact-link", name: "Vinculación a contactos", description: "Asocia dominios a contactos de tu CRM", enabled: true },
      { id: "notifications", name: "Alertas configurables", description: "Avisa N días antes del vencimiento", enabled: true },
      { id: "multi-registrar", name: "Multi-registrador", description: "Soporta GoDaddy, Namecheap, Cloudflare y más", enabled: true },
    ],
    tags: ["dominios", "vencimientos", "hosting", "agencia", "saas"],
    prices: [],
  },
];

export const SEED_MARKETPLACE_SERVICES: SeedMarketplaceItem[] = [
  {
    title: 'HubSpot CRM Sync',
    subtitle: 'Sincroniza leads y deals con HubSpot',
    description: 'Conecta contactos, empresas y estados de oportunidad con sincronización bidireccional y mapeo de campos.',
    category: 'Mejoras',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['hubspot', 'crm', 'sync'],
    prices: [
      { billingType: 'setup', amount: 9900 },
      { billingType: 'monthly', amount: 4900 },
      { billingType: 'yearly', amount: 49000 },
    ],
  },
  {
    title: 'Salesforce CRM Sync',
    subtitle: 'Pipeline y contactos sincronizados',
    description: 'Lleva clientes, cuentas y oportunidades a Salesforce con reglas de asignación y sincronización programada.',
    category: 'Mejoras',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['salesforce', 'crm', 'sync'],
    prices: [
      { billingType: 'setup', amount: 24900 },
      { billingType: 'monthly', amount: 9900 },
      { billingType: 'yearly', amount: 99000 },
    ],
  },
  {
    title: 'Google Sheets Sync',
    subtitle: 'Exporta datos a hojas en tiempo real',
    description: 'Sincroniza contactos, mensajes y eventos hacia Google Sheets para reportes y operaciones ligeras.',
    category: 'Productividad',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['google sheets', 'export', 'reportes'],
    prices: [
      { billingType: 'monthly', amount: 1900 },
      { billingType: 'yearly', amount: 19000 },
    ],
  },
  {
    title: 'Shopify Commerce Inbox',
    subtitle: 'Atiende ventas y pedidos de Shopify',
    description: 'Recibe notificaciones de carrito, pedido y cliente para responder ventas sin salir del inbox.',
    category: 'Apps',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['shopify', 'commerce', 'inbox'],
    prices: [
      { billingType: 'setup', amount: 14900 },
      { billingType: 'monthly', amount: 5900 },
      { billingType: 'yearly', amount: 59000 },
    ],
  },
  {
    title: 'WooCommerce Orders Sync',
    subtitle: 'Pedidos y clientes de WooCommerce',
    description: 'Sincroniza pedidos, clientes y eventos de ecommerce para dar seguimiento y soporte más rápido.',
    category: 'Apps',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['woocommerce', 'ecommerce', 'sync'],
    prices: [
      { billingType: 'setup', amount: 9900 },
      { billingType: 'monthly', amount: 3900 },
      { billingType: 'yearly', amount: 39000 },
    ],
  },
  {
    title: 'Stripe Payments Automation',
    subtitle: 'Automatiza cobros y estados',
    description: 'Conecta pagos, suscripciones y eventos de Stripe con automatizaciones y disparadores internos.',
    category: 'Automatización',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['stripe', 'pagos', 'automatización'],
    prices: [
      { billingType: 'setup', amount: 9900 },
      { billingType: 'monthly', amount: 3900 },
      { billingType: 'yearly', amount: 39000 },
    ],
  },
  {
    title: 'Mercado Pago Checkout',
    subtitle: 'Cobros y checkout en LATAM',
    description: 'Integra checkout y estados de pago de Mercado Pago para ventas regionales con validación de webhook.',
    category: 'Automatización',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['mercado pago', 'checkout', 'pagos'],
    prices: [
      { billingType: 'setup', amount: 9900 },
      { billingType: 'monthly', amount: 3900 },
      { billingType: 'yearly', amount: 39000 },
    ],
  },
  {
    title: 'Calendly + Google Calendar',
    subtitle: 'Agenda y reservas sincronizadas',
    description: 'Convierte reservas en citas reales, sincroniza disponibilidad y evita dobles reservas.',
    category: 'Herramientas',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['calendly', 'calendar', 'reservas'],
    prices: [
      { billingType: 'monthly', amount: 2900 },
      { billingType: 'yearly', amount: 29000 },
    ],
  },
  {
    title: 'Slack / Microsoft Teams Alerts',
    subtitle: 'Alertas operativas a tu equipo',
    description: 'Recibe avisos de leads, tickets y pagos en Slack o Teams con reglas por canal y prioridad.',
    category: 'Herramientas',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['slack', 'teams', 'alertas'],
    prices: [
      { billingType: 'monthly', amount: 1900 },
      { billingType: 'yearly', amount: 19000 },
    ],
  },
  {
    title: 'Zapier / Make Bridge',
    subtitle: 'Conexión con miles de apps',
    description: 'Expone eventos y acciones para conectar WhatsaaS con automatizadores externos sin tocar código.',
    category: 'Automatización',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['zapier', 'make', 'bridge'],
    prices: [
      { billingType: 'monthly', amount: 2900 },
      { billingType: 'yearly', amount: 29000 },
    ],
  },
  {
    title: 'OpenAI / Gemini Agent Pack',
    subtitle: 'Asistentes IA para atención y ventas',
    description: 'Despliega asistentes de IA con prompts, límites y conexión a fuentes internas para soporte y cierre.',
    category: 'Mejoras',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['openai', 'gemini', 'ia'],
    prices: [
      { billingType: 'setup', amount: 19900 },
      { billingType: 'monthly', amount: 7900 },
      { billingType: 'yearly', amount: 79000 },
    ],
  },
  {
    title: 'Knowledge Base / RAG Setup',
    subtitle: 'Base de conocimiento para IA',
    description: 'Implementa búsqueda semántica sobre tus documentos, FAQs y contenidos internos para respuestas consistentes.',
    category: 'Mejoras',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['rag', 'knowledge base', 'ia'],
    prices: [
      { billingType: 'setup', amount: 29900 },
      { billingType: 'monthly', amount: 4900 },
    ],
  },
  {
    title: 'Advanced Webhooks',
    subtitle: 'Enrutado y reintentos de eventos',
    description: 'Publica eventos, reintenta envíos y administra webhooks con observabilidad y trazabilidad.',
    category: 'Automatización',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['webhooks', 'eventos', 'reintentos'],
    prices: [
      { billingType: 'monthly', amount: 2900 },
      { billingType: 'yearly', amount: 29000 },
    ],
  },
  {
    title: 'Custom API Connector',
    subtitle: 'Conecta APIs internas y externas',
    description: 'Servicio para integrar APIs con autenticación, mapeo de payloads y manejo de errores.',
    category: 'Nodos',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['api', 'connector', 'integraciones'],
    prices: [
      { billingType: 'setup', amount: 39900 },
      { billingType: 'monthly', amount: 4900 },
    ],
  },
  {
    title: 'WABA Onboarding Service',
    subtitle: 'Alta y validación de WhatsApp Business',
    description: 'Acompañamiento para configurar números, plantillas y requisitos iniciales de WhatsApp Business API.',
    category: 'Herramientas',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['waba', 'onboarding', 'whatsapp'],
    prices: [
      { billingType: 'setup', amount: 19900 },
    ],
  },
  {
    title: 'Data Migration WhatsApp/CRM',
    subtitle: 'Migración de datos y contactos',
    description: 'Servicio puntual para migrar contactos, etiquetas y metadatos entre sistemas sin perder trazabilidad.',
    category: 'Mejoras',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['migración', 'crm', 'datos'],
    prices: [
      { billingType: 'one_time', amount: 24900 },
    ],
  },
  {
    title: 'Premium Support SLA',
    subtitle: 'Soporte prioritario y más rápido',
    description: 'Canal prioritario, tiempos de respuesta cortos y seguimiento dedicado para equipos que no pueden parar.',
    category: 'Herramientas',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['soporte', 'sla', 'prioridad'],
    prices: [
      { billingType: 'monthly', amount: 9900 },
      { billingType: 'yearly', amount: 99000 },
    ],
  },
  {
    title: 'Security & Access Audit',
    subtitle: 'Revisión de accesos y permisos',
    description: 'Auditoría puntual de usuarios, roles, llaves y accesos para reducir exposición innecesaria.',
    category: 'Herramientas',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['seguridad', 'auditoría', 'accesos'],
    prices: [
      { billingType: 'one_time', amount: 14900 },
    ],
  },
  {
    title: 'BI Dashboard + Exports',
    subtitle: 'Tableros ejecutivos y exportaciones',
    description: 'Dashboards operativos con exportación CSV/PDF y reportes listos para dirección o clientes.',
    category: 'Productividad',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['bi', 'dashboard', 'reportes'],
    prices: [
      { billingType: 'setup', amount: 19900 },
      { billingType: 'monthly', amount: 5900 },
      { billingType: 'yearly', amount: 59000 },
    ],
  },
  {
    title: 'Flow Builder Pro Templates',
    subtitle: 'Plantillas listas para flujos',
    description: 'Pack de plantillas para onboarding, ventas y soporte que acelera la puesta en marcha de flujos.',
    category: 'Apps',
    isDefault: false,
    isFunctional: false,
    appType: 'installable',
    features: [],
    tags: ['flows', 'plantillas', 'automatización'],
    prices: [
      { billingType: 'one_time', amount: 9900 },
    ],
  },
];

async function upsertSeedMarketplaceItem(item: SeedMarketplaceItem) {
  const existing = await db.query.marketplaceItems.findFirst({
    where: and(eq(marketplaceItems.title, item.title), eq(marketplaceItems.category, item.category)),
  });

  const payload = {
    title: item.title,
    subtitle: item.subtitle,
    description: item.description,
    category: item.category,
    isDefault: item.isDefault,
    isFunctional: item.isFunctional,
    appType: item.appType,
    iconUrl: item.iconUrl ?? null,
    imageUrl: item.imageUrl ?? null,
    features: item.features,
    tags: item.tags,
    status: 'active' as const,
    updatedAt: new Date(),
  };

  const itemId = existing
    ? (
        await db
          .update(marketplaceItems)
          .set(payload)
          .where(eq(marketplaceItems.id, existing.id))
          .returning({ id: marketplaceItems.id })
      )[0]?.id ?? existing.id
    : (
        await db
          .insert(marketplaceItems)
          .values({ ...payload, createdAt: new Date() })
          .returning({ id: marketplaceItems.id })
      )[0]?.id;

  if (!itemId) {
    throw new Error(`No se pudo guardar el item seed: ${item.title}`);
  }

  await db.delete(marketplaceItemPrices).where(eq(marketplaceItemPrices.itemId, itemId));
  if (item.prices.length > 0) {
    await db.insert(marketplaceItemPrices).values(
      item.prices.map((price) => ({
        itemId,
        billingType: price.billingType,
        amount: price.amount,
        currency: (price.currency ?? 'usd').toLowerCase(),
        enabled: price.enabled ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  }
}

export async function seedApps() {
  try {
    // Primero, crear las apps de ejemplo
    for (const app of SEED_APPS) {
      await upsertSeedMarketplaceItem({
        ...app,
        prices: [],
      });
    }

    console.log("✅ Apps de ejemplo cargadas exitosamente");
    return true;
  } catch (error) {
    console.error("❌ Error cargando apps:", error);
    throw error;
  }
}

export async function seedMarketplaceServices() {
  try {
    for (const item of SEED_MARKETPLACE_SERVICES) {
      await upsertSeedMarketplaceItem(item);
    }

    console.log("✅ Servicios del marketplace cargados exitosamente");
    return true;
  } catch (error) {
    console.error("❌ Error cargando servicios del marketplace:", error);
    throw error;
  }
}

export async function seedDefaultApps() {
  try {
    // Crear Notas app por defecto
    await upsertSeedMarketplaceItem({
      title: "Notas",
      subtitle: "Toma notas rápidas",
      description:
        "Aplicación integrada para tomar notas rápidas. Sincroniza automáticamente entre dispositivos. Esta es una aplicación preinstalada que no puede ser desinstalada.",
      category: "Herramientas",
      isDefault: true,
      isFunctional: false,
      appType: "default",
      features: [
        {
          id: "note-creation",
          name: "Creación de notas",
          description: "Crea notas sin límite",
        },
        {
          id: "note-sync",
          name: "Sincronización",
          description: "Sincronización en tiempo real",
        },
      ],
      tags: [],
      prices: [],
    });

    // Crear Calendario app por defecto
    await upsertSeedMarketplaceItem({
      title: "Calendario",
      subtitle: "Gestiona eventos y citas",
      description:
        "Calendario integrado para gestionar eventos, citas y reuniones. Sincronización con Google Calendar y Outlook. Esta es una aplicación preinstalada que no puede ser desinstalada.",
      category: "Herramientas",
      isDefault: true,
      isFunctional: false,
      appType: "default",
      features: [
        {
          id: "event-creation",
          name: "Creación de eventos",
          description: "Crea eventos ilimitados",
        },
        {
          id: "calendar-sync",
          name: "Sincronización",
          description: "Sincronización con otros calendarios",
        },
        {
          id: "reminders",
          name: "Recordatorios",
          description: "Notificaciones de eventos próximos",
        },
      ],
      tags: [],
      prices: [],
    });

    console.log("✅ Apps por defecto cargadas exitosamente");
    return true;
  } catch (error) {
    console.error("❌ Error cargando apps por defecto:", error);
    throw error;
  }
}
