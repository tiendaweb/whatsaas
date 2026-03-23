import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LandingPageSection } from '@/lib/landing/types';

export function PublicLandingPageBuilder({ sections }: { sections: LandingPageSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (section.type === 'hero') {
          return (
            <section key={section.id} className="overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-16 shadow-sm sm:px-10">
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
        }

        if (section.type === 'stats') {
          return (
            <section key={section.id} className="rounded-[32px] border border-border/60 bg-muted/20 px-6 py-14 sm:px-10">
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
        }

        if (section.type === 'highlights') {
          return (
            <section key={section.id} className="rounded-[32px] border border-border/60 bg-background px-6 py-14 shadow-sm sm:px-10">
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
        }

        return (
          <section key={section.id} className="rounded-[32px] border border-primary/20 bg-primary/5 px-6 py-16 text-center sm:px-10">
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
      })}
    </div>
  );
}
