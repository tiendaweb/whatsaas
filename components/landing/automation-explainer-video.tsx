'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import {
  Clock3,
  GitBranch,
  ListChecks,
  ListOrdered,
  MessageSquareMore,
  Save,
  Tag,
  UserRoundCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './automation-explainer-video.module.css';

const FLOW_INTERVAL = 12000;
const NODE_STAGGER = 720;

type NodeTone = 'message' | 'logic' | 'action' | 'utility';

type FlowNode = {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  x: number;
  y: number;
  tone: NodeTone;
};

type FlowEdge = {
  id: string;
  path: string;
  label?: string;
  labelX?: number;
  labelY?: number;
};

type FlowScenario = {
  id: string;
  title: string;
  description: string;
  outcome: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  menuGuide?: {
    description: string;
    options: string[];
  };
};

const TONE_STYLES: Record<NodeTone, { icon: string; header: string }> = {
  message: { icon: 'bg-primary/10 text-primary', header: 'bg-primary/5' },
  logic: { icon: 'bg-secondary text-secondary-foreground', header: 'bg-secondary/60' },
  action: { icon: 'bg-accent text-accent-foreground', header: 'bg-accent/60' },
  utility: { icon: 'bg-muted text-muted-foreground', header: 'bg-muted/70' },
};

function FlowNodeCard({ node, compact = false }: { node: FlowNode; compact?: boolean }) {
  const Icon = node.icon;
  const tone = TONE_STYLES[node.tone];

  return (
    <div
      className={cn(
        'relative overflow-visible rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        compact ? 'min-h-[110px]' : 'min-h-[132px]',
      )}
    >
      <span className="absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground" />
      <span className="absolute right-0 top-1/2 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" />

      <div className={cn('flex min-h-[52px] items-center gap-2 rounded-t-xl border-b border-border px-3 py-2', tone.header)}>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', tone.icon)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 text-[13px] font-semibold leading-4 [overflow-wrap:anywhere]">{node.title}</p>
      </div>
      <div className="p-3">
        <p className="line-clamp-3 text-xs leading-[1.15rem] text-muted-foreground [overflow-wrap:anywhere]">{node.detail}</p>
      </div>
    </div>
  );
}

function DesktopFlowCanvas({ scenario }: { scenario: FlowScenario }) {
  return (
    <div className="relative hidden h-[560px] min-w-0 overflow-hidden md:block">
      <div className={styles.canvasMotion}>
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {scenario.edges.map((edge, index) => (
            <g
              key={edge.id}
              className={styles.edgeStage}
              style={{ '--edge-delay': `${index * NODE_STAGGER + 640}ms` } as CSSProperties}
            >
              <path d={edge.path} className={styles.edgeBase} vectorEffect="non-scaling-stroke" />
              <path d={edge.path} className={styles.edgeSignal} vectorEffect="non-scaling-stroke" />
              {edge.label ? (
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  className={styles.edgeLabel}
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>

        {scenario.nodes.map((node, index) => (
          <div
            key={node.id}
            className={cn('absolute z-10 w-[16.5%]', styles.nodeStage)}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              '--node-delay': `${index * NODE_STAGGER}ms`,
            } as CSSProperties}
          >
            <FlowNodeCard node={node} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileFlowCanvas({ scenario }: { scenario: FlowScenario }) {
  const mainNodes = scenario.nodes.slice(0, 4);
  const branchNodes = scenario.nodes.slice(4);

  return (
    <div className={cn('space-y-0 p-4 md:hidden', styles.mobileCanvasMotion)}>
      {mainNodes.map((node, index) => (
        <div key={node.id}>
          <div
            className={styles.mobileNodeStage}
            style={{ '--node-delay': `${index * NODE_STAGGER}ms` } as CSSProperties}
          >
            <FlowNodeCard node={node} compact />
          </div>
          <div className="mx-auto h-7 w-px bg-primary/60" aria-hidden="true" />
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3">
        {branchNodes.map((node, index) => (
          <div
            key={node.id}
            className={styles.mobileNodeStage}
            style={{ '--node-delay': `${(index + 4) * NODE_STAGGER}ms` } as CSSProperties}
          >
            <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-primary">
              {scenario.edges[index + 3]?.label}
            </p>
            <FlowNodeCard node={node} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuSimpleGuide({
  guide,
  title,
  replyHint,
  fallback,
}: {
  guide: NonNullable<FlowScenario['menuGuide']>;
  title: string;
  replyHint: string;
  fallback: string;
}) {
  return (
    <div className={cn('border-t border-border bg-card p-4 sm:p-5', styles.menuGuide)}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)] xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{guide.description}</p>
            <p className="mt-2 text-xs font-medium text-primary">{replyHint}</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          {guide.options.map((option, index) => (
            <div key={option} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span className="min-w-0 text-xs font-medium text-foreground [overflow-wrap:anywhere]">{option}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 border-l-2 border-primary/40 pl-3 text-[11px] leading-5 text-muted-foreground">{fallback}</p>
    </div>
  );
}

export function AutomationExplainerVideo() {
  const t = useTranslations('LandingPage.automation_canvas');
  const [flowIndex, setFlowIndex] = useState(0);

  const scenarios = useMemo<FlowScenario[]>(
    () => [
      {
        id: 'sales',
        title: t('flows.sales.title'),
        description: t('flows.sales.description'),
        outcome: t('flows.sales.outcome'),
        nodes: [
          { id: 'sales-start', icon: Zap, title: t('flows.sales.nodes.start.title'), detail: t('flows.sales.nodes.start.detail'), x: 3, y: 39, tone: 'message' },
          { id: 'sales-menu', icon: ListOrdered, title: t('flows.sales.nodes.menu.title'), detail: t('flows.sales.nodes.menu.detail'), x: 22, y: 39, tone: 'message' },
          { id: 'sales-collect', icon: ListChecks, title: t('flows.sales.nodes.collect.title'), detail: t('flows.sales.nodes.collect.detail'), x: 41, y: 39, tone: 'action' },
          { id: 'sales-condition', icon: GitBranch, title: t('flows.sales.nodes.condition.title'), detail: t('flows.sales.nodes.condition.detail'), x: 60, y: 39, tone: 'logic' },
          { id: 'sales-assign', icon: UserRoundCheck, title: t('flows.sales.nodes.assign.title'), detail: t('flows.sales.nodes.assign.detail'), x: 81, y: 14, tone: 'action' },
          { id: 'sales-tag', icon: Tag, title: t('flows.sales.nodes.tag.title'), detail: t('flows.sales.nodes.tag.detail'), x: 81, y: 66, tone: 'utility' },
        ],
        edges: [
          { id: 'sales-e1', path: 'M 19.5 50 C 20.5 50, 21 50, 22 50' },
          { id: 'sales-e2', path: 'M 38.5 50 C 39.5 50, 40 50, 41 50' },
          { id: 'sales-e3', path: 'M 57.5 50 C 58.5 50, 59 50, 60 50' },
          { id: 'sales-e4', path: 'M 76.5 50 C 78.5 50, 77.5 25, 81 25', label: t('branches.qualified'), labelX: 78.5, labelY: 31 },
          { id: 'sales-e5', path: 'M 76.5 50 C 78.5 50, 77.5 77, 81 77', label: t('branches.nurture'), labelX: 78.5, labelY: 72 },
        ],
        menuGuide: {
          description: t('flows.sales.menu_simple.description'),
          options: [0, 1, 2].map((index) => t(`flows.sales.menu_simple.options.${index}`)),
        },
      },
      {
        id: 'support',
        title: t('flows.support.title'),
        description: t('flows.support.description'),
        outcome: t('flows.support.outcome'),
        nodes: [
          { id: 'support-start', icon: Zap, title: t('flows.support.nodes.start.title'), detail: t('flows.support.nodes.start.detail'), x: 3, y: 39, tone: 'message' },
          { id: 'support-menu', icon: ListOrdered, title: t('flows.support.nodes.menu.title'), detail: t('flows.support.nodes.menu.detail'), x: 22, y: 39, tone: 'message' },
          { id: 'support-collect', icon: ListChecks, title: t('flows.support.nodes.collect.title'), detail: t('flows.support.nodes.collect.detail'), x: 41, y: 39, tone: 'action' },
          { id: 'support-condition', icon: GitBranch, title: t('flows.support.nodes.condition.title'), detail: t('flows.support.nodes.condition.detail'), x: 60, y: 39, tone: 'logic' },
          { id: 'support-assign', icon: UserRoundCheck, title: t('flows.support.nodes.assign.title'), detail: t('flows.support.nodes.assign.detail'), x: 81, y: 14, tone: 'action' },
          { id: 'support-message', icon: MessageSquareMore, title: t('flows.support.nodes.message.title'), detail: t('flows.support.nodes.message.detail'), x: 81, y: 66, tone: 'message' },
        ],
        edges: [
          { id: 'support-e1', path: 'M 19.5 50 C 20.5 50, 21 50, 22 50' },
          { id: 'support-e2', path: 'M 38.5 50 C 39.5 50, 40 50, 41 50' },
          { id: 'support-e3', path: 'M 57.5 50 C 58.5 50, 59 50, 60 50' },
          { id: 'support-e4', path: 'M 76.5 50 C 78.5 50, 77.5 25, 81 25', label: t('branches.urgent'), labelX: 78.5, labelY: 31 },
          { id: 'support-e5', path: 'M 76.5 50 C 78.5 50, 77.5 77, 81 77', label: t('branches.standard'), labelX: 78.5, labelY: 72 },
        ],
        menuGuide: {
          description: t('flows.support.menu_simple.description'),
          options: [0, 1, 2].map((index) => t(`flows.support.menu_simple.options.${index}`)),
        },
      },
      {
        id: 'followup',
        title: t('flows.followup.title'),
        description: t('flows.followup.description'),
        outcome: t('flows.followup.outcome'),
        nodes: [
          { id: 'followup-start', icon: Zap, title: t('flows.followup.nodes.start.title'), detail: t('flows.followup.nodes.start.detail'), x: 3, y: 39, tone: 'message' },
          { id: 'followup-delay', icon: Clock3, title: t('flows.followup.nodes.delay.title'), detail: t('flows.followup.nodes.delay.detail'), x: 22, y: 39, tone: 'utility' },
          { id: 'followup-message', icon: MessageSquareMore, title: t('flows.followup.nodes.message.title'), detail: t('flows.followup.nodes.message.detail'), x: 41, y: 39, tone: 'message' },
          { id: 'followup-condition', icon: GitBranch, title: t('flows.followup.nodes.condition.title'), detail: t('flows.followup.nodes.condition.detail'), x: 60, y: 39, tone: 'logic' },
          { id: 'followup-assign', icon: UserRoundCheck, title: t('flows.followup.nodes.assign.title'), detail: t('flows.followup.nodes.assign.detail'), x: 81, y: 14, tone: 'action' },
          { id: 'followup-save', icon: Save, title: t('flows.followup.nodes.save.title'), detail: t('flows.followup.nodes.save.detail'), x: 81, y: 66, tone: 'utility' },
        ],
        edges: [
          { id: 'followup-e1', path: 'M 19.5 50 C 20.5 50, 21 50, 22 50' },
          { id: 'followup-e2', path: 'M 38.5 50 C 39.5 50, 40 50, 41 50' },
          { id: 'followup-e3', path: 'M 57.5 50 C 58.5 50, 59 50, 60 50' },
          { id: 'followup-e4', path: 'M 76.5 50 C 78.5 50, 77.5 25, 81 25', label: t('branches.replied'), labelX: 78.5, labelY: 31 },
          { id: 'followup-e5', path: 'M 76.5 50 C 78.5 50, 77.5 77, 81 77', label: t('branches.no_reply'), labelX: 78.5, labelY: 72 },
        ],
      },
    ],
    [t],
  );

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    const timer = window.setInterval(() => {
      setFlowIndex((current) => (current + 1) % scenarios.length);
    }, FLOW_INTERVAL);

    return () => window.clearInterval(timer);
  }, [scenarios.length]);

  const scenario = scenarios[flowIndex];

  return (
    <div className="overflow-hidden rounded-[28px] border border-border bg-background shadow-sm" aria-label={t('aria_label')}>
      <div className="border-b border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />
              <span>{t('canvas_label')}</span>
            </div>
            <div key={scenario.id} className={cn('mt-2', styles.titleStage)}>
              <h4 className="text-xl font-semibold leading-tight sm:text-2xl">{scenario.title}</h4>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{scenario.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" aria-label={t('available_flows')}>
            {scenarios.map((flow, index) => (
              <span
                key={flow.id}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors duration-500 motion-reduce:transition-none',
                  index === flowIndex
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                {flow.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-card lg:block" aria-label={t('library.title')}>
          <div className="border-b border-border p-4">
            <p className="text-sm font-semibold">{t('library.title')}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('library.description')}</p>
          </div>
          <div className="space-y-5 p-3">
            {(['messages', 'logic', 'actions'] as const).map((group) => (
              <div key={group}>
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t(`library.groups.${group}`)}
                </p>
                <div className="space-y-1.5">
                  {[0, 1].map((item) => {
                    const Icon = group === 'messages' ? (item === 0 ? MessageSquareMore : ListOrdered) : group === 'logic' ? (item === 0 ? GitBranch : Clock3) : item === 0 ? Save : UserRoundCheck;
                    return (
                      <div key={item} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-[11px] font-medium">{t(`library.items.${group}.${item}`)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className={cn('relative min-w-0 bg-muted/20', styles.canvasGrid)}>
          <div key={scenario.id}>
            <DesktopFlowCanvas scenario={scenario} />
            <MobileFlowCanvas scenario={scenario} />
            {scenario.menuGuide ? (
              <MenuSimpleGuide
                guide={scenario.menuGuide}
                title={t('menu_simple.title')}
                replyHint={t('menu_simple.reply_hint')}
                fallback={t('menu_simple.fallback')}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 border-t border-border bg-card px-4 py-4 sm:px-5">
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Zap className="h-3.5 w-3.5" />
        </span>
        <div key={`${scenario.id}-outcome`} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">
          <p className="text-xs font-semibold text-primary">{t('outcome_label')}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{scenario.outcome}</p>
        </div>
      </div>
    </div>
  );
}
