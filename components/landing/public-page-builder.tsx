"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LandingSectionWidgetRenderer } from '@/components/landing/section-widget-renderer';
import type { LandingPageSection } from '@/lib/landing/types';
import { cn } from '@/lib/utils';

function SectionFrame({
  section,
  content,
  fallbackWidget,
}: {
  section: LandingPageSection;
  content: ReactNode;
  fallbackWidget: ReactNode;
}) {
  const hasWidget = Boolean(section.customCode.trim()) || Boolean(section.compiledCustomCode);

  if (!hasWidget) {
    return <>{content}</>;
  }

  const widget = (
    <div className="rounded-[28px] border border-border/60 bg-muted/15 p-4">
      <LandingSectionWidgetRenderer
        section={section}
        compiledCode={section.compiledCustomCode}
        sourceCode={section.customCode}
        fallback={fallbackWidget}
      />
    </div>
  );

  if (section.uiPlacement === 'bottom') {
    return (
      <div className="space-y-5">
        {content}
        {widget}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] xl:items-center',
        section.uiPlacement === 'left' && 'xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]',
      )}
    >
      {section.uiPlacement === 'left' ? widget : content}
      {section.uiPlacement === 'left' ? content : widget}
    </div>
  );
}

function renderDefaultWidget(section: LandingPageSection) {
  if (section.type === 'hero') {
    return (
      <Card className="rounded-[28px] border-primary/20 bg-background shadow-sm">
        <CardContent className="space-y-4 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
          <div className="space-y-2">
            <div className="h-3 w-24 rounded-full bg-primary/20" />
            <div className="h-3 w-full rounded-full bg-muted" />
            <div className="h-3 w-4/5 rounded-full bg-muted" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-full">{section.primaryCtaLabel}</Button>
            <Button variant="outline" className="rounded-full">{section.secondaryCtaLabel}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (section.type === 'stats') {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {section.items.map((item) => (
          <Card key={item.id} className="rounded-3xl border-border/60">
            <CardContent className="space-y-2 p-5">
              <p className="text-2xl font-bold text-primary">{item.value}</p>
              <p className="font-medium">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (section.type === 'highlights') {
    return (
      <div className="grid gap-3">
        {section.items.slice(0, 3).map((item) => (
          <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-5 shadow-sm">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className="rounded-[28px] border-primary/20 bg-primary/10 shadow-sm">
      <CardContent className="space-y-4 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
        <p className="text-xl font-semibold">{section.primaryCtaLabel}</p>
        <div className="mx-auto h-24 w-24 rounded-full bg-primary/15" />
      </CardContent>
    </Card>
  );
}

export function PublicLandingPageBuilder({ sections }: { sections: LandingPageSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (section.type === 'hero') {
          const content = (
            <section className="overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-16 shadow-sm sm:px-10">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
              <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">{section.title}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{section.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={section.primaryCtaHref}>
                  <Button size="lg" className="rounded-full px-8">
                    {section.primaryCtaLabel} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href={section.secondaryCtaHref}>
                  <Button variant="outline" size="lg" className="rounded-full px-8">
                    {section.secondaryCtaLabel}
                  </Button>
                </Link>
              </div>
            </section>
          );

          return (
            <SectionFrame key={section.id} section={section} content={content} fallbackWidget={renderDefaultWidget(section)} />
          );
        }

        if (section.type === 'stats') {
          const content = (
            <section className="rounded-[32px] border border-border/60 bg-muted/20 px-6 py-14 sm:px-10">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">{section.title}</h2>
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{section.description}</p>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {section.items.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
                    <p className="text-4xl font-bold tracking-tight text-primary">{item.value}</p>
                    <p className="mt-2 text-lg font-semibold">{item.label}</p>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          );

          return (
            <SectionFrame key={section.id} section={section} content={content} fallbackWidget={renderDefaultWidget(section)} />
          );
        }

        if (section.type === 'highlights') {
          const content = (
            <section className="rounded-[32px] border border-border/60 bg-background px-6 py-14 shadow-sm sm:px-10">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">{section.title}</h2>
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{section.description}</p>
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {section.items.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-border/60 bg-muted/20 p-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );

          return (
            <SectionFrame key={section.id} section={section} content={content} fallbackWidget={renderDefaultWidget(section)} />
          );
        }

        const content = (
          <section className="rounded-[32px] border border-primary/20 bg-primary/5 px-6 py-16 text-center sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">{section.title}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{section.description}</p>
            <Link href={section.primaryCtaHref}>
              <Button size="lg" className="mt-8 rounded-full px-10">
                {section.primaryCtaLabel} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </section>
        );

        return <SectionFrame key={section.id} section={section} content={content} fallbackWidget={renderDefaultWidget(section)} />;
      })}
    </div>
  );
}
