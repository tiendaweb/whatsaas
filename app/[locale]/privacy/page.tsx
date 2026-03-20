import { getBranding } from '@/lib/db/queries/branding';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Política de Privacidad',
  description: 'Cómo recopilamos, usamos y protegemos tus datos.',
};

export default async function PrivacyPage() {
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

        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Política de Privacidad</h1>
        <p className="text-muted-foreground mb-10">Última actualización: {new Date().toLocaleDateString()}</p>

        <div className="space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">1. Información que recopilamos</h2>
            <p>
              En {siteName} recopilamos únicamente la información necesaria para prestar el servicio: datos de cuenta
              (como nombre, correo y empresa), información de facturación y datos de uso de la plataforma (por ejemplo,
              registros técnicos, actividad dentro del sistema y configuración de integraciones).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">2. Cómo usamos la información</h2>
            <p>
              Usamos tus datos para operar, mantener y mejorar {siteName}, procesar pagos, brindar soporte técnico,
              prevenir fraudes, cumplir obligaciones legales y comunicar novedades relevantes del servicio. No usamos tus
              datos para fines incompatibles con estos propósitos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">3. Compartición de datos</h2>
            <p>
              No vendemos tu información personal. Solo compartimos datos con proveedores que nos ayudan a operar la
              plataforma (por ejemplo, infraestructura, analítica o pagos), bajo obligaciones de confidencialidad y
              seguridad, o cuando la ley lo exige.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">4. Seguridad y conservación</h2>
            <p>
              Aplicamos medidas técnicas y organizativas razonables para proteger tu información frente a accesos no
              autorizados, pérdida o alteración. Conservamos los datos durante el tiempo necesario para cumplir la
              finalidad del servicio, obligaciones contractuales y requerimientos legales.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">5. Tus derechos</h2>
            <p>
              Puedes solicitar acceso, rectificación o eliminación de tus datos, así como oponerte a determinados
              tratamientos, escribiéndonos por los canales oficiales de soporte. Responderemos dentro de plazos
              razonables y de acuerdo con la normativa aplicable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">6. Cambios a esta política</h2>
            <p>
              Podemos actualizar esta Política de Privacidad para reflejar mejoras del producto o cambios normativos.
              Publicaremos la versión vigente en esta página e indicaremos la fecha de última actualización.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
