import type {
  LandingPageCtaSection,
  LandingPageComponentsSection,
  LandingPageHeroSection,
  LandingPageHighlightsSection,
  LandingPageSection,
  LandingPageStatsSection,
  LandingSectionUiPlacement,
} from '@/lib/landing/types';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultCustomCode(type: LandingPageSection['type']) {
  if (type === 'hero') {
    return `<div className="rounded-[28px] border border-primary/20 bg-background p-6 shadow-sm">
  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
  <div className="mt-4 space-y-3">
    <div className="h-3 w-24 rounded-full bg-primary/20" />
    <div className="h-3 w-full rounded-full bg-muted" />
    <div className="h-3 w-4/5 rounded-full bg-muted" />
  </div>
  <div className="mt-6 flex flex-wrap gap-3">
    <Button className="rounded-full">{section.primaryCtaLabel}</Button>
    <Button variant="outline" className="rounded-full">{section.secondaryCtaLabel}</Button>
  </div>
</div>`;
  }

  if (type === 'stats') {
    return `<div className="grid gap-3 sm:grid-cols-3">
  {section.items.map((item) => (
    <Card key={item.id} className="rounded-3xl border-border/60">
      <CardContent className="space-y-2 p-5">
        <p className="text-2xl font-bold text-primary">{item.value}</p>
        <p className="font-medium">{item.label}</p>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </CardContent>
    </Card>
  ))}
</div>`;
  }

  if (type === 'highlights') {
    return `<div className="grid gap-3">
  {section.items.map((item) => (
    <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-5 shadow-sm">
      <p className="font-semibold">{item.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
    </div>
  ))}
</div>`;
  }

  if (type === 'components') {
    return `<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {section.items.map((item) => (
    <div key={item.id} className="rounded-2xl border border-border/50 bg-card p-6 hover:border-primary/50 transition-all">
      <Badge className="mb-4">{item.category}</Badge>
      <p className="font-semibold mb-2">{item.label}</p>
      <p className="text-sm text-muted-foreground">{item.description}</p>
    </div>
  ))}
</div>`;
  }

  return `<Card className="rounded-[28px] border-primary/20 bg-primary/10 shadow-sm">
  <CardContent className="space-y-4 p-6 text-center">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{section.eyebrow}</p>
    <p className="text-xl font-semibold">{section.primaryCtaLabel}</p>
    <div className="mx-auto h-24 w-24 rounded-full bg-primary/15" />
  </CardContent>
</Card>`;
}

function ensureSectionShell<T extends LandingPageSection>(
  section: Omit<T, "uiPlacement" | "customCode" | "compiledCustomCode"> &
    Partial<Pick<T, "uiPlacement" | "customCode" | "compiledCustomCode">>,
  placement: LandingSectionUiPlacement,
): T {
  return {
    ...section,
    uiPlacement: section.uiPlacement ?? placement,
    customCode: section.customCode ?? getDefaultCustomCode(section.type),
    compiledCustomCode: section.compiledCustomCode ?? null,
  } as T;
}

function createHeroSection(title: string, description: string): LandingPageHeroSection {
  return ensureSectionShell(
    {
      id: createId('hero'),
      type: 'hero',
      eyebrow: 'Página estratégica',
      title,
      description,
      primaryCtaLabel: 'Quiero una demo',
      primaryCtaHref: '/sign-up',
      secondaryCtaLabel: 'Volver al inicio',
      secondaryCtaHref: '/',
    },
    'right',
  );
}

function createStatsSection(): LandingPageStatsSection {
  return ensureSectionShell(
    {
      id: createId('stats'),
      type: 'stats',
      eyebrow: 'Impacto visible',
      title: 'Lo que esta página empuja dentro de tu operación',
      description: 'Usa esta franja para dejar claro qué mejora el cliente cuando activa esta solución.',
      items: [
        {
          id: createId('stat'),
          value: '24/7',
          label: 'Atención activa',
          description: 'El negocio sigue respondiendo aunque el equipo no esté pegado a la pantalla.',
        },
        {
          id: createId('stat'),
          value: '+35%',
          label: 'Más avance',
          description: 'Las conversaciones se mueven al siguiente paso con más rapidez y constancia.',
        },
        {
          id: createId('stat'),
          value: '-60%',
          label: 'Menos caos',
          description: 'Se reducen olvidos, rebotes y tiempos muertos en el proceso comercial.',
        },
      ],
    },
    'bottom',
  );
}

function createHighlightsSection(): LandingPageHighlightsSection {
  return ensureSectionShell(
    {
      id: createId('highlights'),
      type: 'highlights',
      eyebrow: 'Bloques reutilizados del sistema',
      title: 'Secciones editables que puedes reorganizar y ampliar sin tocar el core',
      description: 'Este builder ahora te deja mover, duplicar y sumar bloques con UI embebida para cada página.',
      items: [
        {
          id: createId('highlight'),
          title: 'Hero de conversión',
          description: 'Abre fuerte con promesa, contexto, CTA y una UI personalizada al costado.',
        },
        {
          id: createId('highlight'),
          title: 'Métricas de impacto',
          description: 'Demuestra resultados rápidos con números claros y visuales reusables.',
        },
        {
          id: createId('highlight'),
          title: 'Beneficios clave',
          description: 'Explica la solución en tarjetas simples enfocadas en dolor y resultado.',
        },
        {
          id: createId('highlight'),
          title: 'Cierre con CTA',
          description: 'Remata la intención y empuja al siguiente paso sin distracciones.',
        },
      ],
    },
    'left',
  );
}

function createCtaSection(): LandingPageCtaSection {
  return ensureSectionShell(
    {
      id: createId('cta'),
      type: 'cta',
      eyebrow: 'Cierre directo',
      title: 'Si esta página conecta con tu oferta, conviértela en una ruta que sí genere acción.',
      description: 'Invita al visitante a escribir, agendar o pedir demo con un mensaje corto y agresivo.',
      primaryCtaLabel: 'Empezar ahora',
      primaryCtaHref: '/sign-up',
    },
    'right',
  );
}

function createComponentsSection(): LandingPageComponentsSection {
  return ensureSectionShell(
    {
      id: createId('components'),
      type: 'components',
      eyebrow: 'Componentes disponibles',
      title: 'Elementos versátiles para construir tu flujo',
      description: 'Accede a una librería completa de nodos y bloques para automatizar cualquier proceso.',
      items: [
        {
          id: createId('component'),
          label: 'Inicio del flujo',
          description: 'Disparador que activa el automatismo cuando ocurre un evento específico.',
          icon: 'Sparkles',
          category: 'trigger',
        },
        {
          id: createId('component'),
          label: 'Enviar mensaje',
          description: 'Comunica con el contacto de forma automática con texto, imágenes o multimedia.',
          icon: 'MessageSquareMore',
          category: 'action',
        },
        {
          id: createId('component'),
          label: 'Mensaje con botones',
          description: 'Presenta opciones interactivas para que el contacto elija su camino en el flujo.',
          icon: 'MousePointerClick',
          category: 'action',
        },
        {
          id: createId('component'),
          label: 'Pedir dato clave',
          description: 'Recolecta información importante como nombre, email, teléfono o preferencias.',
          icon: 'ListChecks',
          category: 'action',
        },
        {
          id: createId('component'),
          label: 'Condición lógica',
          description: 'Ramifica el flujo basado en respuestas, datos o variables dinámicas.',
          icon: 'Split',
          category: 'condition',
        },
        {
          id: createId('component'),
          label: 'Esperar tiempo',
          description: 'Introduce pausas estratégicas antes de continuar a la siguiente acción.',
          icon: 'Clock3',
          category: 'utility',
        },
      ],
    },
    'bottom',
  );
}

export function createLandingPageSectionTemplate(
  type: LandingPageSection['type'],
  pageName = 'Nueva sección',
  content?: string,
): LandingPageSection {
  const supportText = content?.trim();
  const summary = supportText
    ? supportText.slice(0, 180)
    : `Explica con claridad por qué ${pageName} ayuda a tu equipo a vender más, responder más rápido y operar con menos fricción.`;

  if (type === 'hero') {
    return createHeroSection(pageName, summary);
  }

  if (type === 'stats') {
    return createStatsSection();
  }

  if (type === 'highlights') {
    return createHighlightsSection();
  }

  if (type === 'components') {
    return createComponentsSection();
  }

  return createCtaSection();
}

export function createDefaultLandingPageSections(pageName: string, content?: string): LandingPageSection[] {
  const supportText = content?.trim();
  const summary = supportText
    ? supportText.slice(0, 180)
    : `Explica con claridad por qué ${pageName} ayuda a tu equipo a vender más, responder más rápido y operar con menos fricción.`;

  return [
    createHeroSection(pageName, summary),
    createStatsSection(),
    createHighlightsSection(),
    createCtaSection(),
  ];
}

export function normalizeLandingPageSections(
  sections: LandingPageSection[] | null | undefined,
  pageName: string,
  content?: string,
): LandingPageSection[] {
  if (!sections || sections.length === 0) {
    return createDefaultLandingPageSections(pageName, content);
  }

  return sections.map((section) => {
    if (section.type === 'hero') {
      return ensureSectionShell(section, 'right');
    }

    if (section.type === 'stats') {
      return ensureSectionShell(section, 'bottom');
    }

    if (section.type === 'highlights') {
      return ensureSectionShell(section, 'left');
    }

    if (section.type === 'components') {
      return ensureSectionShell(section, 'bottom');
    }

    return ensureSectionShell(section, 'right');
  });
}
