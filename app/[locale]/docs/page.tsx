import { getBranding } from '@/lib/db/queries/branding';
import { getDocsHomeData } from '@/lib/db/queries/docs';
import Link from 'next/link';
import {
  ArrowLeft,
  Book,
  Bot,
  Cable,
  ChevronRight,
  Code,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Search,
  Shield,
  Users,
  Workflow,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const iconMap = {
  Zap,
  Code,
  Users,
  Book,
  Shield,
  MessageSquare,
} as const;

const defaultCategories = [
  {
    title: 'Primeros pasos',
    description: 'Todo lo necesario para dejar tu cuenta lista y funcionando.',
    icon: Zap,
    links: ['Configuración de cuenta', 'Conectar WhatsApp', 'Invitar miembros del equipo']
  },
  {
    title: 'Automatización y flujos',
    description: 'Aprende a crear automatizaciones potentes para tu operación.',
    icon: Code,
    links: ['Constructor visual de flujos', 'Tipos de mensaje', 'Variables y lógica']
  },
  {
    title: 'CRM y contactos',
    description: 'Gestiona leads y clientes de forma ordenada y eficiente.',
    icon: Users,
    links: ['Importar contactos', 'Etiquetas y embudos', 'Filtrado de leads']
  },
  {
    title: 'API y desarrollo',
    description: 'Documentación técnica de endpoints e integraciones.',
    icon: Book,
    links: ['Autenticación', 'Envío de mensajes', 'Webhooks']
  },
  {
    title: 'Resolución de problemas',
    description: 'Errores comunes y cómo solucionarlos rápidamente.',
    icon: Shield,
    links: ['Problemas de conexión', 'Fallos de envío', 'Preguntas frecuentes de facturación']
  },
  {
    title: 'Buenas prácticas',
    description: 'Recomendaciones para mejorar resultados y evitar bloqueos.',
    icon: MessageSquare,
    links: ['Reglas anti-spam', 'Guía de plantillas', 'Estrategia de difusiones']
  }
];

const defaultModules = [
  {
    title: 'Inbox y conversaciones',
    icon: MessageSquare,
    description: 'Centro operativo para responder, organizar y dar seguimiento a conversaciones.',
    items: [
      'Vista principal de conversaciones para operación diaria.',
      'Gestión de chats, sesiones activas y estado de atención.',
      'Envío de texto, imágenes, video, documentos y audio.',
      'Marcado de lectura, reacciones y cierre de chats.'
    ]
  },
  {
    title: 'CRM y contactos',
    icon: Users,
    description: 'Base comercial para ordenar leads, clientes y ownership del equipo.',
    items: [
      'Búsqueda, filtros y segmentación de contactos.',
      'Etiquetas, notas, etapas de funnel y campos personalizados.',
      'Asignación de agente y departamento.',
      'Importación, exportación y movimiento entre instancias.'
    ]
  },
  {
    title: 'Campañas',
    icon: Megaphone,
    description: 'Difusión saliente con control de estado y seguimiento operativo.',
    items: [
      'Creación y ejecución de campañas desde dashboard.',
      'Estados DRAFT, SCHEDULED, PROCESSING y COMPLETED.',
      'Seguimiento de enviados, fallidos y total de leads.',
      'Habilitación por plan mediante feature flags.'
    ]
  },
  {
    title: 'Automatización',
    icon: Workflow,
    description: 'Flujos automatizados conectados a eventos y comportamiento del usuario.',
    items: [
      'Listado y edición de automatizaciones por equipo.',
      'Activación o desactivación por flujo.',
      'Asociación con instancias de WhatsApp.',
      'Procesamiento de eventos entrantes para disparar lógica.'
    ]
  },
  {
    title: 'Analítica y control',
    icon: LayoutDashboard,
    description: 'Visibilidad del rendimiento comercial y operativo.',
    items: [
      'Métricas de funnel.',
      'Visión por agente.',
      'Heatmaps y tráfico operativo.',
      'Panel para entender performance del equipo.'
    ]
  },
  {
    title: 'Integraciones y API',
    icon: Cable,
    description: 'Base técnica para conectar canales, servicios externos y automatizaciones.',
    items: [
      'API autenticada para envío programático.',
      'Webhooks para eventos externos.',
      'Integración con Evolution API.',
      'Base preparada para más integraciones y plugins.'
    ]
  }
];

const defaultApiGroups = [
  {
    title: 'Operación del inbox',
    endpoints: ['app/api/chats/*', 'app/api/messages/*', 'app/api/media/*']
  },
  {
    title: 'CRM y organización',
    endpoints: [
      'app/api/contacts/*',
      'app/api/tags/*',
      'app/api/funnel-stages/*',
      'app/api/departments/*',
      'app/api/custom-fields/*'
    ]
  },
  {
    title: 'Crecimiento y automatización',
    endpoints: ['app/api/campaigns/*', 'app/api/automation/*', 'app/api/templates/*']
  },
  {
    title: 'Infraestructura e integraciones',
    endpoints: [
      'app/api/instance/*',
      'app/api/webhook/evolution',
      'app/api/v1/send',
      'app/api/stripe/*'
    ]
  }
];

const defaultKeyFlows = [
  {
    title: 'Onboarding inicial',
    description:
      'Crear cuenta, conectar una instancia, invitar miembros y dejar el workspace listo para operar.'
  },
  {
    title: 'Operación comercial',
    description:
      'Capturar contactos, clasificarlos por etapa y departamento, y dar seguimiento desde conversaciones o campañas.'
  },
  {
    title: 'Automatización y escala',
    description:
      'Activar flujos, sincronizar templates y combinar operación humana con automatización para ganar velocidad.'
  },
  {
    title: 'Facturación y planes',
    description:
      'Administrar suscripción, checkout y configuración de proveedores de pago con una arquitectura en transición a plugins.'
  }
];

export const metadata = {
  title: 'Documentación',
  description: 'Aprende a usar nuestra plataforma.',
};

export default async function DocsPage() {
  const [branding, docsHomeData] = await Promise.all([getBranding(), getDocsHomeData()]);
  const siteName = branding?.name || 'WhatsPro';
  const categoryLinksBySlug = docsHomeData.featuredArticles.reduce<Record<string, string[]>>((acc, article) => {
    const categorySlug = article.category?.slug;
    if (!categorySlug || acc[categorySlug]?.length >= 3) {
      return acc;
    }
    acc[categorySlug] = [...(acc[categorySlug] ?? []), article.title];
    return acc;
  }, {});

  const categories =
    docsHomeData.categories.length > 0
      ? docsHomeData.categories.map((category) => {
          const fallbackCategory = defaultCategories.find((item) => item.title === category.name);
          const icon = iconMap[category.icon as keyof typeof iconMap] ?? fallbackCategory?.icon ?? Book;
          const links = categoryLinksBySlug[category.slug] ?? fallbackCategory?.links ?? [];

          return {
            title: category.name,
            description: category.description || fallbackCategory?.description || '',
            icon,
            links
          };
        })
      : defaultCategories;

  const modules = defaultModules;
  const apiGroups = defaultApiGroups;
  const keyFlows = defaultKeyFlows;

  return (
    <main className="min-h-screen bg-background">
      <div className="bg-muted/30 border-b border-border py-12 md:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Link href="/">
            <Button variant="ghost" className="absolute top-6 left-6 pl-0 hover:bg-transparent hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver
            </Button>
          </Link>

          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Documentación de {siteName}
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Encuentra todo lo que necesitas para automatizar tu soporte y ventas por WhatsApp.
          </p>

          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar artículos, guías o documentación de API..."
              className="pl-10 h-12 bg-background shadow-sm rounded-xl text-base"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <section className="mb-16">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Qué cubre esta documentación</h2>
            <p className="text-muted-foreground mt-3 text-base leading-7">
              Esta sección reúne una vista general del producto: operación diaria, CRM, campañas,
              automatización, integraciones, administración, API y facturación. La idea es que un
              usuario, PM o desarrollador pueda entender rápidamente qué resuelve {siteName} y
              cómo se conectan sus módulos.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category, idx) => (
            <Card key={idx} className="hover:border-primary/50 transition-colors cursor-pointer group">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <category.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>{category.title}</CardTitle>
                <CardDescription className="line-clamp-2">{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {category.links.map((link, i) => (
                    <li key={i} className="text-sm text-muted-foreground hover:text-primary flex items-center">
                      <ChevronRight className="h-3 w-3 mr-2 opacity-50" />
                      {link}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="mt-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Book className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Funciones clave del sistema</h2>
              <p className="text-muted-foreground">
                Resumen funcional de los módulos más importantes para operación y crecimiento.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {modules.map((module) => (
              <Card key={module.title} className="h-full">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                    <module.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {module.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <ChevronRight className="h-4 w-4 mt-0.5 text-primary/70" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-20 grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                APIs internas principales
              </CardTitle>
              <CardDescription>
                Mapa rápido de endpoints internos para ubicar responsabilidades técnicas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {apiGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="font-medium mb-3">{group.title}</h3>
                  <div className="flex flex-wrap gap-2">
                    {group.endpoints.map((endpoint) => (
                      <span
                        key={endpoint}
                        className="inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
                      >
                        {endpoint}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Flujos recomendados
              </CardTitle>
              <CardDescription>
                Secuencias comunes para entender el uso del producto de punta a punta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {keyFlows.map((flow, idx) => (
                <div key={flow.title} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="font-medium">{flow.title}</h3>
                    <p className="text-sm text-muted-foreground">{flow.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Pagos y arquitectura en transición
              </CardTitle>
              <CardDescription>
                El sistema hoy opera con Stripe, pero la evolución prioritaria es migrar a plugins
                de pago.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                La documentación funcional debe contemplar checkout, portal del cliente, webhooks y
                configuración por proveedor.
              </p>
              <p>
                El siguiente hito es desacoplar pagos mediante un contrato único para soportar
                Stripe, Manual Payment y Mercado Pago sin editar el core.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                IA, automatización y extensibilidad
              </CardTitle>
              <CardDescription>
                La plataforma ya cuenta con base de datos y runtime para seguir expandiendo
                capacidades inteligentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Existen configuraciones y sesiones de AI, además de un plugin local de chat con IA
                dentro de la carpeta de plugins.
              </p>
              <p>
                Esto permite documentar el producto no solo como inbox/CRM, sino como una base SaaS
                extensible para operación, atención y automatización.
              </p>
            </CardContent>
          </Card>
        </section>

        <div className="mt-20 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">¿No encuentras lo que buscas?</h3>
            <p className="text-muted-foreground">
              Nuestro equipo de soporte puede ayudarte con dudas funcionales, técnicas o de
              facturación.
            </p>
          </div>
          <Link href="/contact">
            <Button size="lg">Contactar soporte</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
