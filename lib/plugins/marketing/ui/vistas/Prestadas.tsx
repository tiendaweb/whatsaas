'use client';

import { ExternalLink, Send } from 'lucide-react';
import { MetaAdsDashboard } from '@/lib/plugins/meta-ads/ui/MetaAdsDashboard';
import { SocialPublisherDashboard } from '@/lib/plugins/social-publisher/ui/SocialPublisherDashboard';
import { FormBuilderDashboard } from '@/lib/plugins/form-builder/ui/FormBuilderDashboard';
import { cn } from '@/lib/utils';
import type { ResumenMarketing } from '../../shared/api-types';
import { CH } from '../estilo';
import { fmtInt } from '../componentes/format';
import { LimiteDeError } from '../componentes/LimiteDeError';

/**
 * Las vistas que Marketing NO reescribe.
 *
 * Meta Ads, Publicaciones y Formularios ya existen y funcionan, con sus altas,
 * sus bajas y sus validaciones. Marketing las agrupa —que es lo que faltaba— en
 * vez de clonarlas: copiar el editor de un posteo acá significaría mantener dos
 * editores y que el día que cambie uno el otro mienta.
 *
 * Cada una va adentro de su propio límite de error: son pantallas de otras apps
 * y un reventón suyo no puede llevarse el rail, que es justo lo que necesitás
 * para irte a otro lado.
 */

export function AnunciosView() {
  return (
    <LimiteDeError nombre="Meta Ads">
      <MetaAdsDashboard />
    </LimiteDeError>
  );
}

export function PublicacionesView() {
  return (
    <LimiteDeError nombre="Publicaciones">
      <SocialPublisherDashboard />
    </LimiteDeError>
  );
}

export function FormulariosView() {
  return (
    <LimiteDeError nombre="Formularios">
      <FormBuilderDashboard />
    </LimiteDeError>
  );
}

/**
 * Difusión de WhatsApp: no es un plugin sino una pantalla del producto
 * (`/campaigns`), con su propia ruta y su propio permiso. Acá va el estado y el
 * camino, no una copia de la lista: importar el `page.tsx` de una ruta para
 * embeberlo ata esta app a la estructura de carpetas de la otra.
 */
export function DifusionView({ difusion }: { difusion: ResumenMarketing['difusion'] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Campañas', valor: difusion.campanas },
          { rotulo: 'Enviados', valor: difusion.enviados },
          { rotulo: 'Programadas', valor: difusion.programadas },
          { rotulo: 'Fallidos', valor: difusion.fallidos },
        ].map((b) => (
          <div key={b.rotulo} className={cn(CH.card, 'p-3')}>
            <p className={CH.rotulo}>{b.rotulo}</p>
            <p className={cn(CH.numeroChico, 'mt-1')}>{fmtInt(b.valor)}</p>
          </div>
        ))}
      </div>
      <a href="/campaigns" className={cn(CH.card, 'flex items-center gap-3 p-3 transition-colors hover:bg-muted/40')}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
          <Send className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Abrir Difusión de WhatsApp</span>
          <span className={cn(CH.ayuda, 'block')}>Crear un envío masivo, ver el estado de los anteriores y sus leads.</span>
        </span>
        <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </a>
    </div>
  );
}
