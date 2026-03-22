import { ChevronRight } from 'lucide-react';
import type { LandingFaqItem } from '@/lib/landing/types';

export function LandingFaqSection({ items }: { items: LandingFaqItem[] }) {
  return (
    <section className="border-t border-border bg-muted/20 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Preguntas frecuentes</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Todo lo que tu equipo necesita saber antes de empezar.</h2>
          <p className="mt-4 text-lg text-muted-foreground">Respuestas rápidas sobre operación, personalización, colaboración y administración del sistema.</p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                  <ChevronRight className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{item.question}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground md:text-base">{item.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
