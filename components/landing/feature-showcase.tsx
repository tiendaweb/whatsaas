"use client";

import { useEffect, useState, type ReactElement } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Filter,
  KanbanSquare,
  Pause,
  PieChart,
  Play,
  Timer,
  Users2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutomationExplainerVideo } from "@/components/landing/automation-explainer-video";
import type { LandingHomeSection } from "@/lib/landing/types";

function AutomationShowcaseCard() {
  return <AutomationExplainerVideo />;
}

const ANALYTICS_VIEW_COUNT = 4;
const ANALYTICS_ROTATION_MS = 4800;

function ConversationTrendChart() {
  const t = useTranslations("LandingPage.analytics_showcase");
  const points = "18,168 100,142 182,151 264,103 346,116 428,62 510,79 582,34";

  return (
    <div className="grid min-h-[286px] grid-cols-[42px_1fr] border border-[#30342d] bg-black">
      <div className="flex flex-col justify-between border-r border-[#30342d] px-2 py-5 text-right text-[10px] text-[#8b9284]">
        <span>60</span><span>40</span><span>20</span><span>0</span>
      </div>
      <div className="flex min-w-0 flex-col p-4">
        <svg viewBox="0 0 600 200" className="min-h-0 w-full flex-1" role="img" aria-label={t("trend.chart_label")}>
          {[40, 90, 140, 190].map((y) => (
            <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#242821" strokeWidth="1" />
          ))}
          <polyline points={points} fill="none" stroke="#C6FF4A" strokeWidth="5" vectorEffect="non-scaling-stroke" />
          {points.split(" ").map((point) => {
            const [cx, cy] = point.split(",");
            return <circle key={point} cx={cx} cy={cy} r="5" fill="#0B0C0A" stroke="#C6FF4A" strokeWidth="3" />;
          })}
        </svg>
        <div className="grid grid-cols-7 border-t border-[#30342d] pt-3 text-center text-[10px] text-[#8b9284]">
          {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => <span key={day}>{t(`days.${day}`)}</span>)}
        </div>
      </div>
    </div>
  );
}

function SalesFunnelChart() {
  const t = useTranslations("LandingPage.analytics_showcase");
  const stages = [
    { key: "conversations", value: 100, width: "100%" },
    { key: "qualified", value: 68, width: "78%" },
    { key: "opportunities", value: 42, width: "58%" },
    { key: "sales", value: 24, width: "38%" },
  ] as const;

  return (
    <div className="flex min-h-[286px] flex-col justify-center border border-[#30342d] bg-black p-5">
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.key} className="mx-auto" style={{ width: stage.width }}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-[#c4c9bf]">{t(`funnel.stages.${stage.key}`)}</span>
              <span className="tabular-nums text-[#C6FF4A]">{stage.value}</span>
            </div>
            <div className="h-8 border border-[#3b4037] bg-[#151713] p-1">
              <div className="h-full bg-[#C6FF4A]" style={{ opacity: 1 - index * 0.18 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelDistributionChart() {
  const t = useTranslations("LandingPage.analytics_showcase");
  const channels = [
    { key: "direct", value: 46, color: "#C6FF4A" },
    { key: "automations", value: 31, color: "#7e9f39" },
    { key: "campaigns", value: 23, color: "#3f4d2a" },
  ] as const;

  return (
    <div className="grid min-h-[286px] gap-6 border border-[#30342d] bg-black p-6 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.75fr)] sm:items-center">
      <div className="relative mx-auto aspect-square w-full max-w-[210px] rounded-full" style={{ background: "conic-gradient(#C6FF4A 0 46%, #7e9f39 46% 77%, #3f4d2a 77% 100%)" }}>
        <div className="absolute inset-[24%] flex items-center justify-center rounded-full border border-[#30342d] bg-black text-center">
          <span className="text-[11px] leading-4 text-[#c4c9bf]">{t("channels.center")}</span>
        </div>
      </div>
      <div className="border-t border-[#30342d] pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        {channels.map((channel) => (
          <div key={channel.key} className="flex items-center justify-between gap-3 border-b border-[#242821] py-3 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2 text-xs text-[#c4c9bf]">
              <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: channel.color }} />
              <span className="truncate">{t(`channels.items.${channel.key}`)}</span>
            </div>
            <span className="tabular-nums text-sm text-white">{channel.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponseTimeChart() {
  const t = useTranslations("LandingPage.analytics_showcase");
  const rows = [
    { key: "sales", previous: 72, current: 42 },
    { key: "support", previous: 88, current: 55 },
    { key: "billing", previous: 61, current: 31 },
    { key: "general", previous: 76, current: 46 },
  ] as const;

  return (
    <div className="flex min-h-[286px] flex-col border border-[#30342d] bg-black p-5">
      <div className="mb-5 flex justify-end gap-5 text-[10px] text-[#a7ada2]">
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-[#3f463c]" />{t("response.before")}</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-[#C6FF4A]" />{t("response.with_whatsaas")}</span>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-4">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[82px_1fr] items-center gap-3">
            <span className="truncate text-[11px] text-[#c4c9bf]">{t(`response.teams.${row.key}`)}</span>
            <div className="space-y-1.5 border-l border-[#30342d] pl-2">
              <div className="h-2 bg-[#3f463c]" style={{ width: `${row.previous}%` }} />
              <div className="h-2 bg-[#C6FF4A]" style={{ width: `${row.current}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 border-t border-[#30342d] pt-3 text-[10px] text-[#8b9284]">{t("response.axis")}</p>
    </div>
  );
}

function AnalyticsShowcaseCard() {
  const t = useTranslations("LandingPage.analytics_showcase");
  const [activeView, setActiveView] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const views = [
    { key: "trend", icon: Activity, chart: ConversationTrendChart },
    { key: "funnel", icon: Filter, chart: SalesFunnelChart },
    { key: "channels", icon: PieChart, chart: ChannelDistributionChart },
    { key: "response", icon: Timer, chart: ResponseTimeChart },
  ] as const;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!isPlaying || reducedMotion) return;

    const interval = window.setInterval(() => {
      setActiveView((current) => (current + 1) % ANALYTICS_VIEW_COUNT);
    }, ANALYTICS_ROTATION_MS);

    return () => window.clearInterval(interval);
  }, [isPlaying]);

  const active = views[activeView];
  const ActiveChart = active.chart;

  return (
    <div className="overflow-hidden border border-[#30342d] bg-[#0B0C0A] font-mono text-white">
      <div className="grid border-b border-[#30342d] sm:grid-cols-[1fr_auto]">
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[#C6FF4A]">
            <span>{t("eyebrow")}</span>
            <span className="border border-[#59634f] px-2 py-1 text-[#a7ada2]">{t("sample_badge")}</span>
          </div>
          <h4 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("title")}</h4>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a7ada2]">{t("description")}</p>
        </div>
        <div className="flex items-center justify-between border-t border-[#30342d] px-5 py-3 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:px-4">
          <span className="text-[10px] tabular-nums text-[#a7ada2]">{String(activeView + 1).padStart(2, "0")} / 04</span>
          <button
            type="button"
            onClick={() => setIsPlaying((current) => !current)}
            className="mt-0 border border-[#59634f] p-2 text-[#C6FF4A] transition-colors hover:bg-[#C6FF4A] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C6FF4A] sm:mt-3"
            aria-label={isPlaying ? t("pause") : t("play")}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 border-b border-[#30342d] lg:grid-cols-1 lg:border-b-0 lg:border-r">
          {views.map((view, index) => {
            const Icon = view.icon;
            const selected = index === activeView;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => setActiveView(index)}
                className={`flex min-h-16 items-center gap-3 border-b border-r border-[#30342d] px-4 py-3 text-left text-xs transition-colors last:border-b-0 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C6FF4A] lg:border-r-0 ${selected ? "bg-[#C6FF4A] text-black" : "text-[#a7ada2] hover:bg-[#151713] hover:text-white"}`}
                aria-pressed={selected}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(`views.${view.key}.tab`)}</span>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 p-4 sm:p-6">
          <div key={active.key} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-white">{t(`views.${active.key}.title`)}</p>
                <p className="mt-1 text-xs leading-5 text-[#8b9284]">{t(`views.${active.key}.description`)}</p>
              </div>
              <active.icon className="h-5 w-5 shrink-0 text-[#C6FF4A]" />
            </div>
            <ActiveChart />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 border-t border-[#30342d]" aria-hidden="true">
        {views.map((view, index) => (
          <span key={view.key} className={`h-1 ${index === activeView ? "bg-[#C6FF4A]" : "bg-[#242821]"}`} />
        ))}
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
            Espacio de trabajo
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
