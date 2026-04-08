'use client';

import { useState } from 'react';
import {
  Sparkles,
  MessageSquareMore,
  MousePointerClick,
  ListChecks,
  Split,
  Clock3,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LandingPageComponentsSection } from '@/lib/landing/types';

const COMPONENT_ICONS: Record<string, React.ReactNode> = {
  'Sparkles': <Sparkles className="h-6 w-6" />,
  'MessageSquareMore': <MessageSquareMore className="h-6 w-6" />,
  'MousePointerClick': <MousePointerClick className="h-6 w-6" />,
  'ListChecks': <ListChecks className="h-6 w-6" />,
  'Split': <Split className="h-6 w-6" />,
  'Clock3': <Clock3 className="h-6 w-6" />,
};

const CATEGORY_COLORS = {
  trigger: { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: 'text-blue-400' },
  action: { badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: 'text-emerald-400' },
  condition: { badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: 'text-amber-400' },
  utility: { badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: 'text-purple-400' },
};

const CATEGORY_LABELS = {
  trigger: 'Disparador',
  action: 'Acción',
  condition: 'Condición',
  utility: 'Utilidad',
};

export function ComponentsShowcase({ section }: { section: LandingPageComponentsSection }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const itemsPerView = 3; // Desktop view
  const maxIndex = Math.ceil(section.items.length / itemsPerView) - 1;

  const visibleItems = section.items.slice(
    currentIndex * itemsPerView,
    (currentIndex + 1) * itemsPerView
  );

  const handlePrev = () => {
    setCurrentIndex(prev => (prev === 0 ? maxIndex : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev === maxIndex ? 0 : prev + 1));
  };

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mb-12">
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
        </div>

        {/* Components Carousel */}
        <div className="relative">
          {/* Carousel Container */}
          <div className="overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-background to-background/50 shadow-2xl shadow-primary/5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {visibleItems.map((item) => {
                const colors = CATEGORY_COLORS[item.category];
                const iconComponent = COMPONENT_ICONS[item.icon] || COMPONENT_ICONS['Sparkles'];

                return (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl border border-border/50 bg-card p-6 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1"
                  >
                    {/* Category Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <Badge
                        variant="outline"
                        className={`${colors.badge} border`}
                      >
                        {CATEGORY_LABELS[item.category]}
                      </Badge>
                      <div className="hidden group-hover:block">
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </div>
                    </div>

                    {/* Icon */}
                    <div className={`mb-4 inline-block rounded-xl bg-primary/5 p-3 ${colors.icon}`}>
                      {iconComponent}
                    </div>

                    {/* Content */}
                    <h3 className="font-semibold text-base mb-2">
                      {item.label}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>

                    {/* Decorative background */}
                    <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 group-hover:opacity-10 transition-opacity ${colors.icon}`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          {section.items.length > itemsPerView && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                className="rounded-full h-10 w-10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Dots Indicator */}
              <div className="flex gap-2">
                {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentIndex
                        ? 'bg-primary w-6'
                        : 'bg-border w-2 hover:bg-primary/50'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                className="rounded-full h-10 w-10"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Slide Counter */}
          <div className="text-center mt-6 text-sm text-muted-foreground">
            Mostrando {currentIndex * itemsPerView + 1} - {Math.min((currentIndex + 1) * itemsPerView, section.items.length)} de {section.items.length} componentes
          </div>
        </div>
      </div>
    </section>
  );
}
