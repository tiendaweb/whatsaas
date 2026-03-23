import type { ReactElement } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  KanbanSquare,
  LayoutGrid,
  MessageSquareMore,
  MousePointerClick,
  Save,
  Sparkles,
  Users2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LandingHomeSection } from '@/lib/landing/types';

function AutomationShowcaseCard() {
  const nodePalette = [
    { label: 'Enviar mensaje', tone: 'bg-emerald-500/10 text-emerald-600' },
    { label: 'Pedir dato clave', tone: 'bg-violet-500/10 text-violet-600' },
    { label: 'Condición de compra', tone: 'bg-amber-500/10 text-amber-600' },
    { label: 'Asignar asesor', tone: 'bg-sky-500/10 text-sky-600' },
  ];

  return (
    <div className="overflow-hidden rounded-[32px] border border-border/60 bg-[#0d1020] text-white shadow-2xl shadow-primary/10">
      <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Flow builder</p>
          <h4 className="mt-1 text-lg font-semibold">Constructor de automatización</h4>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="border-0 bg-white/10 text-white">
            <LayoutGrid className="mr-1 h-3.5 w-3.5" /> Organizar nodos
          </Badge>
          <Badge className="border-0 bg-primary/90 text-primary-foreground">
            <Save className="mr-1 h-3.5 w-3.5" /> Guardado automático
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_250px]">
        <div className="border-r border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold">Componentes</p>
          <p className="mt-1 text-xs text-white/45">Arrastra y activa ventas, soporte y seguimiento sin depender de nadie.</p>
          <div className="mt-5 space-y-3">
            {nodePalette.map((node) => (
              <div key={node.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${node.tone}`}>
                  <MousePointerClick className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{node.label}</p>
                  <p className="text-xs text-white/45">Listo para soltar</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_center,rgba(78,88,255,0.12),transparent_45%),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:auto,22px_22px,22px_22px] p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-[#1c2033] p-4 shadow-lg shadow-black/20">
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Sparkles className="h-4 w-4 text-primary" /> Trigger de entrada
              </div>
              <p className="mt-4 text-sm font-semibold">Nuevo lead desde anuncio o QR</p>
              <div className="mt-4 space-y-2">
                <div className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Nombre del contacto</div>
                <div className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Producto de interés</div>
              </div>
            </div>

            <div className="relative rounded-3xl border border-white/10 bg-[#1c2033] p-4 shadow-lg shadow-black/20 md:mt-10">
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Clock3 className="h-4 w-4 text-amber-400" /> Delay inteligente
              </div>
              <p className="mt-4 text-sm font-semibold">Espera 2 minutos y evita sonar como robot</p>
              <p className="mt-3 text-xs leading-6 text-white/55">Perfecto para dar seguimiento sin perseguir al cliente ni dejarlo enfriarse.</p>
            </div>

            <div className="rounded-3xl border border-emerald-400/40 bg-[#1c2033] p-4 shadow-lg shadow-emerald-500/10 md:mt-3">
              <div className="flex items-center gap-2 text-sm text-white/70">
                <MessageSquareMore className="h-4 w-4 text-emerald-400" /> Enviar mensaje
              </div>
              <p className="mt-4 text-sm font-semibold">Mensaje de cierre con CTA directo</p>
              <p className="mt-3 text-sm leading-6 text-white/80">
                {'Hola {{nombre}}, vi que te interesa automatizar tus ventas. ¿Quieres que te muestre el plan que más rápido te recupera clientes?'}
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute left-[29%] top-[44%] hidden h-px w-[18%] bg-gradient-to-r from-primary/70 to-white/20 md:block" />
          <div className="pointer-events-none absolute left-[61%] top-[39%] hidden h-px w-[14%] bg-gradient-to-r from-white/30 to-emerald-400/60 md:block" />

          <div className="mt-10 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">Objetivo del flujo</p>
              <h5 className="mt-2 text-base font-semibold">Responder, filtrar y empujar a compra en automático</h5>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ['+41%', 'Leads atendidos'],
                  ['-67%', 'Tiempo perdido'],
                  ['24/7', 'Seguimiento activo'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-lg font-semibold">{value}</p>
                    <p className="mt-1 text-xs text-white/50">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">Acción final</p>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                  <p className="text-sm font-semibold text-emerald-300">Asignar asesor premium</p>
                  <p className="mt-1 text-xs text-white/60">Cuando el lead muestra intención real, el flujo lo pasa al vendedor correcto.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-sm font-semibold">Guardar etiqueta “Listo para demo”</p>
                  <p className="mt-1 text-xs text-white/60">Tu equipo entra sabiendo qué ofrecer y cuándo cerrar.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-l border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold">Propiedades</p>
          <p className="mt-1 text-xs text-white/45">Edita el mensaje que dispara ventas sin salir del flujo.</p>
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/45">Texto del mensaje</p>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/80">
              {'Hola {{nombre}}. Este flujo detectó que quieres vender más rápido, responder sin demora y dejar de perder clientes. Si quieres, te enseño la ruta exacta para activar eso hoy.'}
            </div>
          </div>
          <Button className="mt-5 h-11 w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90">
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsShowcaseCard() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-xl shadow-primary/5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Analytics</p>
          <h4 className="mt-1 text-lg font-semibold">Rendimiento del equipo</h4>
        </div>
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['+34%', 'Conversión'],
          ['1.8m', '1ra respuesta'],
          ['93%', 'SLA cumplido'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-border/50 bg-background/80 p-4">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
        <div className="flex items-end gap-3">
          {[45, 65, 58, 80, 74, 96, 88].map((height, index) => (
            <div key={index} className="flex-1 rounded-t-2xl bg-primary/80" style={{ height }} />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Tendencia semanal de conversaciones con seguimiento.</p>
      </div>
    </div>
  );
}

function CollaborationShowcaseCard() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-xl shadow-primary/5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Workspace</p>
          <h4 className="mt-1 text-lg font-semibold">Caso compartido</h4>
        </div>
        <Users2 className="h-5 w-5 text-primary" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-2xl border border-border/50 bg-background/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium">Cliente enterprise</p>
            <Badge variant="outline">Prioridad alta</Badge>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-2xl bg-muted/60 p-3">
              <p className="font-medium">Nota interna</p>
              <p className="mt-1 text-muted-foreground">Solicita demo con integración y revisión de facturación.</p>
            </div>
            <div className="rounded-2xl bg-primary/5 p-3">
              <p className="font-medium text-primary">Próximo paso</p>
              <p className="mt-1 text-muted-foreground">Asignar a ventas senior y enviar propuesta hoy.</p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { icon: KanbanSquare, label: 'Etapa', value: 'Negociación' },
            { icon: Clock3, label: 'Siguiente tarea', value: 'Llamar 16:30' },
            { icon: Users2, label: 'Responsable', value: 'Equipo Revenue' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-border/50 bg-background/80 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <item.icon className="h-4 w-4" /> {item.label}
              </div>
              <p className="mt-2 font-medium">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const showcaseById: Record<string, () => ReactElement> = {
  'section-automation': AutomationShowcaseCard,
  'section-analytics': AnalyticsShowcaseCard,
  'section-collaboration': CollaborationShowcaseCard,
};

export function LandingFeatureShowcase({
  section,
  reverse = false,
}: {
  section: LandingHomeSection;
  reverse?: boolean;
}) {
  const Showcase = showcaseById[section.id] ?? AutomationShowcaseCard;

  return (
    <section className="py-20">
      <div className={`mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:px-8 lg:grid-cols-2 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="max-w-xl">
          <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary">
            {section.eyebrow}
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{section.title}</h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{section.description}</p>
          <div className="mt-6 space-y-3">
            {section.bullets.map((bullet) => (
              <div key={bullet} className="flex items-start gap-3 text-sm md:text-base">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="mt-6 px-0 text-primary hover:bg-transparent hover:text-primary/80">
            Ver cómo funciona
          </Button>
        </div>
        <Showcase />
      </div>
    </section>
  );
}
