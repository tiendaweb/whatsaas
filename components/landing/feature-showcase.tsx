import type { ReactElement } from "react";
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
  ListChecks,
  Split,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LandingHomeSection } from "@/lib/landing/types";

function AutomationShowcaseCard() {
  const nodePalette = [
    { label: "Inicio del flujo", tone: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Sparkles },
    { label: "Enviar mensaje", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: MessageSquareMore },
    { label: "Mensaje con botones", tone: "bg-purple-500/10 text-purple-400 border-purple-500/30", icon: MousePointerClick },
    { label: "Pedir dato clave", tone: "bg-violet-500/10 text-violet-400 border-violet-500/30", icon: ListChecks },
    { label: "Condición lógica", tone: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Split },
    { label: "Esperar tiempo", tone: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", icon: Clock3 },
  ];

  return (
    <div className="overflow-hidden rounded-[32px] border border-border/60 bg-[#0d1020] text-white shadow-2xl shadow-primary/10">
      <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">
            Flow builder
          </p>
          <h4 className="mt-1 text-lg font-semibold">
            Constructor de automatización
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="border-0 bg-white/10 text-white"
          >
            <LayoutGrid className="mr-1 h-3.5 w-3.5" /> Organizar nodos
          </Badge>
          <Badge className="border-0 bg-primary/90 text-primary-foreground">
            <Save className="mr-1 h-3.5 w-3.5" /> Guardado automático
          </Badge>
        </div>
      </div>

      <div className="grid gap-px bg-white/10 lg:grid-cols-1">
        <div className="bg-black/20 p-4">
          <p className="text-sm font-semibold">Componentes disponibles</p>
          <p className="mt-1 text-xs text-white/45">
            Arrastra componentes y conecta tu flujo sin código.
          </p>
          <div className="mt-5 grid gap-2 grid-cols-2 lg:grid-cols-3">
            {nodePalette.map((node) => {
              const Icon = node.icon;
              return (
                <div
                  key={node.label}
                  className={`flex items-center gap-2 rounded-xl border ${node.tone} bg-white/5 px-3 py-2.5 cursor-move hover:bg-white/15 transition-all hover:scale-105`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-medium truncate">{node.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas with Properties Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-px bg-white/10 min-h-[520px]">
          {/* Main Canvas Area */}
          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_center,rgba(78,88,255,0.12),transparent_45%),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:auto,20px_20px,20px_20px] p-4 sm:p-6">
            {/* Canvas toolbar */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/40 p-2 backdrop-blur-sm border border-white/10">
              <button className="p-1.5 hover:bg-white/10 rounded text-xs text-white/70">
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-4 bg-white/20" />
              <span className="text-xs text-white/50 px-1.5">100%</span>
            </div>

            {/* Flow visualization */}
            <div className="flex flex-col gap-5 pt-2">
              {/* Row 1: Start */}
              <div className="flex justify-center">
                <div className="rounded-2xl border-2 border-blue-400/70 bg-[#1c2033] p-4 shadow-lg shadow-blue-500/25 w-36 hover:shadow-blue-500/40 transition-all">
                  <div className="flex items-center justify-center gap-2 text-xs text-blue-300 font-semibold">
                    <Sparkles className="h-4 w-4" /> Inicio
                  </div>
                  <p className="mt-2 text-xs text-center text-white/80">
                    Nuevo contacto
                  </p>
                </div>
              </div>

              {/* Connector with arrow */}
              <div className="flex justify-center">
                <div className="relative w-0.5 h-7">
                  <div className="absolute inset-0 bg-gradient-to-b from-blue-400/50 to-cyan-400/50" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400" />
                </div>
              </div>

              {/* Row 2: Delay */}
              <div className="flex justify-center">
                <div className="rounded-2xl border-2 border-cyan-400/70 bg-[#1c2033] p-4 shadow-lg shadow-cyan-500/25 w-36 hover:shadow-cyan-500/40 transition-all">
                  <div className="flex items-center justify-center gap-2 text-xs text-cyan-300 font-semibold">
                    <Clock3 className="h-4 w-4" /> Esperar
                  </div>
                  <p className="mt-2 text-xs text-center text-white/80">2 minutos</p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex justify-center">
                <div className="relative w-0.5 h-7">
                  <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/50 to-emerald-400/50" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>

              {/* Row 3: Message & Condition */}
              <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto w-full">
                <div className="rounded-2xl border-2 border-emerald-400/70 bg-[#1c2033] p-3 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-300 mb-2 font-semibold">
                    <MessageSquareMore className="h-3.5 w-3.5" /> Mensaje
                  </div>
                  <p className="text-xs leading-4 text-white/80">
                    "¿Interesado en automatizar tu atención?"
                  </p>
                </div>

                <div className="rounded-2xl border-2 border-amber-400/70 bg-[#1c2033] p-3 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all">
                  <div className="flex items-center gap-1.5 text-xs text-amber-300 mb-2 font-semibold">
                    <Split className="h-3.5 w-3.5" /> Condición
                  </div>
                  <p className="text-xs text-center font-semibold text-white/80">
                    ¿Respondió?
                  </p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex justify-center">
                <div className="relative w-0.5 h-7">
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-400/50 to-violet-400/50" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-violet-400" />
                </div>
              </div>

              {/* Row 4: Collect Data */}
              <div className="flex justify-center">
                <div className="rounded-2xl border-2 border-violet-400/70 bg-[#1c2033] p-4 shadow-lg shadow-violet-500/25 w-36 hover:shadow-violet-500/40 transition-all">
                  <div className="flex items-center justify-center gap-2 text-xs text-violet-300 font-semibold">
                    <ListChecks className="h-4 w-4" /> Recolectar
                  </div>
                  <p className="mt-2 text-xs text-center text-white/80">
                    Datos clave
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Properties */}
          <div className="bg-black/30 border-l border-white/10 p-4 flex flex-col gap-4 text-white/70 text-xs">
            <div>
              <p className="text-white/50 uppercase text-[10px] tracking-wider font-semibold mb-2">
                Propiedades
              </p>
              <div className="space-y-3">
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
                  <p className="text-white/70 text-[11px] mb-1">Nombre</p>
                  <p className="text-xs text-white font-medium">Esperar</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
                  <p className="text-white/70 text-[11px] mb-1">Duración</p>
                  <p className="text-xs text-white font-medium">2 minutos</p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <p className="text-white/50 uppercase text-[10px] tracking-wider font-semibold mb-2">
                Estado
              </p>
              <Badge className="w-full justify-center bg-green-500/20 text-green-400 border-green-500/30">
                Activo
              </Badge>
            </div>
          </div>
        </div>

        <div className="bg-black/20 p-4 border-t border-white/10">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Flujo de ejemplo</p>
              <p className="mt-1 text-xs text-white/45">
                Automatización de captura y seguimiento de leads
              </p>
              <div className="mt-4 space-y-2 text-xs text-white/70">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Recibe contacto automáticamente</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Espera 2 minutos antes de responder</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Envía mensaje personalizado</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Recolecta información clave</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold">Características</p>
              <p className="mt-1 text-xs text-white/45">
                Herramientas que potencian tu automatización
              </p>
              <div className="mt-4 space-y-2 text-xs text-white/70">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Variables dinámicas con &#123;&#123;nombre&#125;&#125;</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Ramificaciones lógicas por condición</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Retrasos inteligentes y sin spam</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Captura de datos en conversación</span>
                </div>
              </div>
            </div>
          </div>
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
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Analytics
          </p>
          <h4 className="mt-1 text-lg font-semibold">Rendimiento del equipo</h4>
        </div>
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["+34%", "Conversión"],
          ["1.8m", "1ra respuesta"],
          ["93%", "SLA cumplido"],
        ].map(([value, label]) => (
          <div
            key={label}
            className="rounded-2xl border border-border/50 bg-background/80 p-4"
          >
            <p className="text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
        <div className="flex items-end gap-3">
          {[45, 65, 58, 80, 74, 96, 88].map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-t-2xl bg-primary/80"
              style={{ height }}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Tendencia semanal de conversaciones con seguimiento.
        </p>
      </div>
    </div>
  );
}

function CollaborationShowcaseCard() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-xl shadow-primary/5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Workspace
          </p>
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
              <p className="mt-1 text-muted-foreground">
                Solicita demo con integración y revisión de facturación.
              </p>
            </div>
            <div className="rounded-2xl bg-primary/5 p-3">
              <p className="font-medium text-primary">Próximo paso</p>
              <p className="mt-1 text-muted-foreground">
                Asignar a ventas senior y enviar propuesta hoy.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { icon: KanbanSquare, label: "Etapa", value: "Negociación" },
            { icon: Clock3, label: "Siguiente tarea", value: "Llamar 16:30" },
            { icon: Users2, label: "Responsable", value: "Equipo Revenue" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border/50 bg-background/80 p-4"
            >
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
  "section-automation": AutomationShowcaseCard,
  "section-analytics": AnalyticsShowcaseCard,
  "section-collaboration": CollaborationShowcaseCard,
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
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <Badge
            variant="secondary"
            className="mb-4 bg-primary/10 text-primary"
          >
            {section.eyebrow}
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {section.title}
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            {section.description}
          </p>
          <div className="mt-6 space-y-3">
            {section.bullets.map((bullet) => (
              <div
                key={bullet}
                className="flex items-start gap-3 text-sm md:text-base"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-6 px-0 text-primary hover:bg-transparent hover:text-primary/80"
          >
            Ver cómo funciona
          </Button>
        </div>
        <div className="w-full">
          <Showcase />
        </div>
      </div>
    </section>
  );
}
