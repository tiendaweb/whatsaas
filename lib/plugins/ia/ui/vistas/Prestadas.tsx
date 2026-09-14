'use client';

import { ExternalLink, Zap } from 'lucide-react';
import { BuiltinToolsManager } from '@/components/ai/BuiltinToolsManager';
import { ToolsManager } from '@/components/ai/ToolsManager';
import { GrokConnectorDashboard } from '@/lib/plugins/grok-connector/ui/GrokConnectorDashboard';
import { GeminiKeysDashboard } from '@/lib/plugins/gemini/ui/GeminiKeysDashboard';
import { cn } from '@/lib/utils';
import type { ResumenIa } from '../../shared/api-types';
import { CH } from '../estilo';
import { fmtInt } from '../componentes/format';
import { LimiteDeError } from '../componentes/LimiteDeError';

/**
 * Las vistas que el hub NO reescribe.
 *
 * El gestor de funciones, el panel del conector y el banco de keys ya existen y
 * funcionan. El hub los agrupa en vez de clonarlos: copiar el editor de una
 * herramienta acá significaría mantener dos editores y que el día que cambie uno
 * el otro mienta.
 *
 * Cada uno adentro de su propio límite de error: son pantallas de otras partes
 * del sistema y un reventón suyo no puede llevarse el rail.
 */

/**
 * Funciones: las que trae el sistema y las que armó el equipo, juntas.
 *
 * Están en la misma pantalla porque para el agente son lo mismo —cosas que
 * puede llamar—, aunque se administren distinto.
 */
export function FuncionesView() {
  return (
    <div className="space-y-5">
      <section aria-labelledby="fn-integradas" className="space-y-2">
        <h2 id="fn-integradas" className={CH.titulo}>
          Integradas
        </h2>
        <p className={CH.ayuda}>Las que trae cada app. Se prenden y se apagan; no se editan.</p>
        <LimiteDeError nombre="Funciones integradas">
          <BuiltinToolsManager />
        </LimiteDeError>
      </section>

      <section aria-labelledby="fn-propias" className="space-y-2">
        <h2 id="fn-propias" className={CH.titulo}>
          Propias
        </h2>
        <p className={CH.ayuda}>Las que arma el equipo: enviar un archivo, mover de etapa, avisar a alguien.</p>
        <LimiteDeError nombre="Funciones propias">
          <ToolsManager />
        </LimiteDeError>
      </section>
    </div>
  );
}

export function ConectoresView() {
  return (
    <LimiteDeError nombre="Conectores">
      <GrokConnectorDashboard />
    </LimiteDeError>
  );
}

export function BancoView() {
  return (
    <LimiteDeError nombre="Banco de APIs">
      <GeminiKeysDashboard />
    </LimiteDeError>
  );
}

/**
 * Agente y Automatizaciones son pantallas del producto con ruta propia
 * (`/settings/ai`, `/automation`) y editores a pantalla completa. Acá va el
 * estado y el camino, no una copia: importar el `page.tsx` de una ruta para
 * embeberlo ata este hub a la estructura de carpetas de otro.
 */
export function AgenteView({ agente }: { agente: ResumenIa['agente'] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Estado', valor: agente.activo ? 'Prendido' : 'Apagado' },
          { rotulo: 'Proveedor', valor: agente.proveedor ?? '—' },
          { rotulo: 'Modelo', valor: agente.modelo ?? '—' },
          { rotulo: 'Conversaciones', valor: fmtInt(agente.sesiones) },
        ].map((b) => (
          <div key={b.rotulo} className={cn(CH.card, 'p-3')}>
            <p className={CH.rotulo}>{b.rotulo}</p>
            <p className="mt-1 truncate text-lg font-bold text-foreground">{b.valor}</p>
          </div>
        ))}
      </div>
      <Acceso
        href="/settings/ai"
        titulo="Abrir la configuración del agente"
        ayuda="Instrucciones, modelo, temperatura y en qué chats contesta."
      />
    </div>
  );
}

export function AutomatizacionesView({ automatizaciones }: { automatizaciones: ResumenIa['automatizaciones'] }) {
  const dormidas = Math.max(0, automatizaciones.total - automatizaciones.activas);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Activas', valor: automatizaciones.activas },
          { rotulo: 'Apagadas', valor: dormidas },
          { rotulo: 'Creadas', valor: automatizaciones.total },
          { rotulo: 'Carpetas', valor: automatizaciones.carpetas },
        ].map((b) => (
          <div key={b.rotulo} className={cn(CH.card, 'p-3')}>
            <p className={CH.rotulo}>{b.rotulo}</p>
            <p className={cn(CH.numeroChico, 'mt-1')}>{fmtInt(b.valor)}</p>
          </div>
        ))}
      </div>

      {/* Esto explica silencios que se investigan durante horas. */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2" role="note">
        <Zap className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Si una automatización procesa el mensaje, <strong className="font-semibold text-foreground">el agente IA no se entera</strong>: los dos
          no contestan el mismo mensaje. Un flujo prendido de más es la explicación más común de que el bot “deje de responder”.
        </p>
      </div>

      <Acceso href="/automation" titulo="Abrir el constructor de flujos" ayuda="Crear, editar y prender o apagar automatizaciones." />
    </div>
  );
}

function Acceso({ href, titulo, ayuda }: { href: string; titulo: string; ayuda: string }) {
  return (
    <a href={href} className={cn(CH.card, 'flex items-center gap-3 p-3 transition-colors hover:bg-muted/40')}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{titulo}</span>
        <span className={cn(CH.ayuda, 'block')}>{ayuda}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}
