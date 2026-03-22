import type { ReactElement } from 'react';
import { ArrowRightLeft, BarChart3, Bot, CheckCircle2, Clock3, KanbanSquare, MessageSquareMore, Sparkles, Users2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LandingHomeSection } from '@/lib/landing/types';

function AutomationShowcaseCard() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-xl shadow-primary/5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Flow builder</p>
          <h4 className="mt-1 text-lg font-semibold">Secuencia de calificación</h4>
        </div>
        <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" /> IA activa
        </Badge>
      </div>
      <div className="space-y-3">
        {[
          { title: 'Nuevo lead', icon: MessageSquareMore, color: 'bg-sky-500/10 text-sky-600' },
          { title: 'Detectar intención', icon: Bot, color: 'bg-violet-500/10 text-violet-600' },
          { title: 'Asignar asesor', icon: ArrowRightLeft, color: 'bg-emerald-500/10 text-emerald-600' },
        ].map((step) => (
          <div key={step.title} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/80 p-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${step.color}`}>
              <step.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">Con contexto, reglas y prioridad.</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
        ))}
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
