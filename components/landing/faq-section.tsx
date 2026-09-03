'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import type { LandingFaqItem } from '@/lib/landing/types';
import { useBranding } from '@/providers/branding-provider';
import { renderTenantText } from '@/lib/branding/constants';

export function LandingFaqSection({ items }: { items: LandingFaqItem[] }) {
  const { identity } = useBranding();
  const [openItems, setOpenItems] = useState<string[]>(items.slice(0, 2).map((item) => item.id));

  function toggleItem(id: string) {
    setOpenItems((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  }

  return (
    <section className="border-t border-border bg-muted/20 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Preguntas frecuentes</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Resuelve tus dudas y entiende por qué {identity.name} te deja vender más sin quemar a tu equipo.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Abre solo lo que quieras ver. Puedes publicar tantas preguntas como necesites y mantener la sección limpia, clara y lista para convertir visitas en clientes.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-5xl gap-4">
          {items.map((item) => {
            const isOpen = openItems.includes(item.id);

            return (
              <div key={item.id} className="overflow-hidden rounded-3xl border border-border/60 bg-background shadow-sm transition-all duration-300">
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                      <HelpCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold md:text-lg">{renderTenantText(item.question, identity)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {isOpen ? 'Toca para ocultar la respuesta.' : 'Toca para ver la respuesta completa.'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                </button>
                <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="border-t border-border/50 px-6 pb-6 pt-4 text-sm leading-7 text-muted-foreground md:text-base">
                      {renderTenantText(item.answer, identity)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
