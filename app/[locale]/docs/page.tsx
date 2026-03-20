import { getBranding } from '@/lib/db/queries/branding';
import Link from 'next/link';
import { ArrowLeft, Book, Code, Zap, MessageSquare, Shield, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export const metadata = {
  title: 'Documentación',
  description: 'Aprende a usar nuestra plataforma.',
};

export default async function DocsPage() {
  const branding = await getBranding();
  const siteName = branding?.name || 'WhatsPro';

  const categories = [
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
      icon: UsersIcon,
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

        <div className="mt-20 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">¿No encuentras lo que buscas?</h3>
            <p className="text-muted-foreground">Nuestro equipo de soporte puede ayudarte con cualquier duda.</p>
          </div>
          <Link href="/contact">
            <Button size="lg">Contactar soporte</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

function UsersIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
