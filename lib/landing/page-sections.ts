import type { LandingPageSection } from '@/lib/landing/types';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultLandingPageSections(pageName: string, content?: string): LandingPageSection[] {
  const supportText = content?.trim();
  const summary = supportText
    ? supportText.slice(0, 180)
    : `Explica con claridad por qué ${pageName} ayuda a tu equipo a vender más, responder más rápido y operar con menos fricción.`;

  return [
    {
      id: createId('hero'),
      type: 'hero',
      eyebrow: 'Página estratégica',
      title: pageName,
      description: summary,
      primaryCtaLabel: 'Quiero una demo',
      primaryCtaHref: '/sign-up',
      secondaryCtaLabel: 'Volver al inicio',
      secondaryCtaHref: '/',
    },
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
    {
      id: createId('highlights'),
      type: 'highlights',
      eyebrow: 'Bloques reutilizados del sistema',
      title: 'Cuatro piezas que puedes adaptar a cada página sin tocar código',
      description: 'Este builder reutiliza patrones que ya funcionan en la landing y te deja vender con estructura.',
      items: [
        {
          id: createId('highlight'),
          title: 'Hero de conversión',
          description: 'Abre fuerte con promesa, contexto y CTA principal.',
        },
        {
          id: createId('highlight'),
          title: 'Métricas de impacto',
          description: 'Demuestra resultados rápidos con números claros y fáciles de entender.',
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
    {
      id: createId('cta'),
      type: 'cta',
      eyebrow: 'Cierre directo',
      title: 'Si esta página conecta con tu oferta, conviértela en una ruta que sí genere acción.',
      description: 'Invita al visitante a escribir, agendar o pedir demo con un mensaje corto y agresivo.',
      primaryCtaLabel: 'Empezar ahora',
      primaryCtaHref: '/sign-up',
    },
  ];
}

export function normalizeLandingPageSections(
  sections: LandingPageSection[] | null | undefined,
  pageName: string,
  content?: string,
): LandingPageSection[] {
  return sections && sections.length > 0 ? sections : createDefaultLandingPageSections(pageName, content);
}
