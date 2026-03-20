import { getBranding } from '@/lib/db/queries/branding';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Términos del Servicio',
  description: 'Consulta las condiciones de uso de la plataforma.',
};

export default async function TermsPage() {
  const branding = await getBranding();
  const siteName = branding?.name || 'WhatsPro';

  return (
    <main className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/">
          <Button variant="ghost" className="mb-8 pl-0 hover:bg-transparent hover:text-primary">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio
          </Button>
        </Link>

        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Términos del Servicio</h1>
        <p className="text-muted-foreground mb-10">Última actualización: {new Date().toLocaleDateString()}</p>

        <div className="space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">1. Aceptación de los términos</h2>
            <p>
              Al acceder y utilizar {siteName}, aceptas estos términos y condiciones. Si utilizas funcionalidades
              específicas, también se aplicarán políticas o lineamientos adicionales publicados dentro de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">2. Uso de la plataforma</h2>
            <p>
              Debes usar {siteName} de forma legal y responsable. Nos reservamos el derecho de actualizar, modificar o
              discontinuar funciones del servicio cuando sea necesario para mejorar la operación, seguridad o
              cumplimiento normativo.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">3. Propiedad intelectual</h2>
            <p>
              Todo el contenido, marca, diseño y tecnología de {siteName} está protegido por derechos de propiedad
              intelectual. No está permitido copiar, revender, redistribuir o explotar comercialmente el contenido sin
              autorización previa y por escrito.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">4. Contenido del usuario</h2>
            <p>
              Conservas la titularidad de la información que cargas en la plataforma. Nos otorgas una licencia limitada
              para procesarla únicamente con el fin de prestar el servicio, mantener su funcionamiento y cumplir
              obligaciones legales o de seguridad.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">5. Suspensión o terminación</h2>
            <p>
              Podemos suspender o terminar el acceso en casos de incumplimiento de estos términos, uso indebido,
              actividad fraudulenta o riesgo para la plataforma y sus usuarios.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">6. Limitación de responsabilidad</h2>
            <p>
              {siteName} se proporciona “tal cual” y según disponibilidad. En la máxima medida permitida por la ley, no
              garantizamos ausencia total de interrupciones y no asumimos responsabilidad por daños indirectos derivados
              del uso del servicio.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
