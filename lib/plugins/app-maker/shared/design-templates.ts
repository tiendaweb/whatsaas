export const APP_MAKER_DESIGN_TEMPLATE_KEYS = [
  'adaptive-light-dark',
  'saas-neutral',
  'swiss-grid',
  'industrial-control',
  'organic-workspace',
  'aurora-flow',
] as const;

export type AppMakerDesignTemplateKey = (typeof APP_MAKER_DESIGN_TEMPLATE_KEYS)[number];

export type AppMakerDesignTemplate = {
  key: AppMakerDesignTemplateKey;
  name: string;
  description: string;
  anchor: string;
  preview: {
    background: string;
    surface: string;
    foreground: string;
    accent: string;
  };
  /** El acento configurado en la aplicación manda sobre el color de señal del template. */
  usesThemeAccent?: boolean;
  runtime: {
    fontFamily: string;
    rootClassName: string;
    headerClassName: string;
    navigationClassName: string;
    cardClassName: string;
    variables: Record<string, string>;
  };
};

export const APP_MAKER_DESIGN_TEMPLATES: readonly AppMakerDesignTemplate[] = [
  {
    key: 'adaptive-light-dark',
    name: 'Claro / Oscuro',
    description: 'Sigue el modo claro u oscuro de WhatsPro con la paleta neutra de Tareas.',
    anchor: 'Sistema WhatsPro',
    preview: { background: '#FAFAFA', surface: '#FFFFFF', foreground: '#171717', accent: '#059669' },
    usesThemeAccent: true,
    runtime: {
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      // Las variables viven en app-maker.css para poder responder a `.dark`,
      // algo que un style inline no puede hacer.
      rootClassName: 'app-maker-adaptive',
      headerClassName: 'bg-card',
      navigationClassName: 'bg-card',
      cardClassName: 'rounded-xl shadow-none',
      variables: {},
    },
  },
  {
    key: 'saas-neutral',
    name: 'SaaS Neutral',
    description: 'Interfaz familiar, clara y adaptable a aplicaciones operativas.',
    anchor: 'Producto SaaS',
    preview: { background: '#F8FAFC', surface: '#FFFFFF', foreground: '#111827', accent: '#16A34A' },
    usesThemeAccent: true,
    runtime: {
      fontFamily: 'Manrope, Arial, Helvetica, sans-serif',
      rootClassName: '',
      headerClassName: 'bg-background',
      navigationClassName: 'bg-card',
      cardClassName: 'rounded-xl shadow-none',
      variables: {
        '--radius': '0.65rem', '--background': '#F8FAFC', '--foreground': '#111827', '--card': '#FFFFFF', '--card-foreground': '#111827',
        '--popover': '#FFFFFF', '--popover-foreground': '#111827', '--primary': '#16A34A', '--primary-foreground': '#FFFFFF', '--secondary': '#F1F5F9',
        '--secondary-foreground': '#111827', '--muted': '#F1F5F9', '--muted-foreground': '#64748B', '--accent': '#ECFDF5', '--accent-foreground': '#166534',
        '--border': '#E2E8F0', '--input': '#CBD5E1', '--ring': '#22C55E', '--chart-1': '#16A34A', '--chart-2': '#2563EB', '--chart-3': '#7C3AED', '--chart-4': '#EA580C', '--chart-5': '#DB2777',
      },
    },
  },
  {
    key: 'swiss-grid',
    name: 'Swiss Grid',
    description: 'Blanco, tipografía precisa, retícula visible y azul Klein.',
    anchor: 'Swiss',
    preview: { background: '#F7F7F8', surface: '#FFFFFF', foreground: '#111111', accent: '#002FA7' },
    runtime: {
      fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      rootClassName: '[background-image:linear-gradient(to_right,rgba(0,47,167,.045)_1px,transparent_1px)] [background-size:48px_100%]',
      headerClassName: 'bg-white',
      navigationClassName: 'bg-white',
      cardClassName: 'rounded-none shadow-none',
      variables: {
        '--radius': '0px', '--background': '#F7F7F8', '--foreground': '#111111', '--card': '#FFFFFF', '--card-foreground': '#111111',
        '--popover': '#FFFFFF', '--popover-foreground': '#111111', '--primary': '#002FA7', '--primary-foreground': '#FFFFFF', '--secondary': '#EEEEF0',
        '--secondary-foreground': '#111111', '--muted': '#EEEEF0', '--muted-foreground': '#5F6368', '--accent': '#E9EEFF', '--accent-foreground': '#002FA7',
        '--border': '#C9CBD0', '--input': '#AEB2BA', '--ring': '#002FA7', '--chart-1': '#002FA7', '--chart-2': '#111111', '--chart-3': '#6E778A', '--chart-4': '#7A96DD', '--chart-5': '#B8C8EE',
      },
    },
  },
  {
    key: 'industrial-control',
    name: 'Industrial Control',
    description: 'Superficie negra, datos tabulares y señal verde para operación continua.',
    anchor: 'Industrial',
    preview: { background: '#000000', surface: '#0B0C0A', foreground: '#F5F5F5', accent: '#00E676' },
    runtime: {
      fontFamily: 'JetBrains Mono, IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
      rootClassName: '[font-variant-numeric:tabular-nums]',
      headerClassName: 'bg-[#000000]',
      navigationClassName: 'bg-[#0B0C0A]',
      cardClassName: 'rounded-none shadow-none',
      variables: {
        '--radius': '0px', '--background': '#000000', '--foreground': '#F5F5F5', '--card': '#0B0C0A', '--card-foreground': '#F5F5F5',
        '--popover': '#0B0C0A', '--popover-foreground': '#F5F5F5', '--primary': '#00E676', '--primary-foreground': '#000000', '--secondary': '#151713',
        '--secondary-foreground': '#F5F5F5', '--muted': '#151713', '--muted-foreground': '#A2A69D', '--accent': '#102719', '--accent-foreground': '#00E676',
        '--border': '#334137', '--input': '#526057', '--ring': '#00E676', '--chart-1': '#00E676', '--chart-2': '#8CFFB5', '--chart-3': '#F5F5F5', '--chart-4': '#7B857D', '--chart-5': '#D2FFD9',
      },
    },
  },
  {
    key: 'organic-workspace',
    name: 'Organic Workspace',
    description: 'Tonos tierra, superficies suaves y ritmo visual relajado.',
    anchor: 'Organic',
    preview: { background: '#E8DCC7', surface: '#D4B895', foreground: '#28301F', accent: '#606C38' },
    runtime: {
      fontFamily: 'Epilogue, Greycliff, Arial, sans-serif',
      rootClassName: '[background-image:radial-gradient(rgba(96,108,56,.08)_1px,transparent_1px)] [background-size:18px_18px]',
      headerClassName: 'bg-[#D4B895]',
      navigationClassName: 'bg-[#D4B895]',
      cardClassName: 'rounded-[24px] shadow-none',
      variables: {
        '--radius': '1.5rem', '--background': '#E8DCC7', '--foreground': '#28301F', '--card': '#D4B895', '--card-foreground': '#28301F',
        '--popover': '#D4B895', '--popover-foreground': '#28301F', '--primary': '#606C38', '--primary-foreground': '#FFFFFF', '--secondary': '#CBB99C',
        '--secondary-foreground': '#28301F', '--muted': '#DCCDB5', '--muted-foreground': '#5A604D', '--accent': '#C66B3D', '--accent-foreground': '#FFFFFF',
        '--border': '#A99475', '--input': '#9C8769', '--ring': '#606C38', '--chart-1': '#606C38', '--chart-2': '#C66B3D', '--chart-3': '#C08E3A', '--chart-4': '#8B9D83', '--chart-5': '#B08B6E',
      },
    },
  },
  {
    key: 'aurora-flow',
    name: 'Aurora Flow',
    description: 'Lienzo oscuro con gradiente violeta, magenta y cian para experiencias visuales.',
    anchor: 'Aurora Maximalism',
    preview: { background: '#140B2D', surface: '#211247', foreground: '#FFFFFF', accent: '#00F0FF' },
    runtime: {
      fontFamily: 'Inter Variable, Inter, Arial, sans-serif',
      rootClassName: '[background-image:radial-gradient(circle_at_15%_10%,rgba(93,52,208,.7),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(255,0,110,.45),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(0,240,255,.25),transparent_40%)]',
      headerClassName: 'bg-[#140B2D]/80 backdrop-blur-xl',
      navigationClassName: 'bg-[#211247]/75 backdrop-blur-xl',
      cardClassName: 'rounded-2xl border-white/20 bg-[#211247]/80 shadow-[0_0_30px_rgba(0,240,255,.08)] backdrop-blur-xl',
      variables: {
        '--radius': '1rem', '--background': '#140B2D', '--foreground': '#FFFFFF', '--card': '#211247', '--card-foreground': '#FFFFFF',
        '--popover': '#211247', '--popover-foreground': '#FFFFFF', '--primary': '#00F0FF', '--primary-foreground': '#140B2D', '--secondary': '#342066',
        '--secondary-foreground': '#FFFFFF', '--muted': '#342066', '--muted-foreground': '#C9BEEB', '--accent': '#FF006E', '--accent-foreground': '#FFFFFF',
        '--border': '#604C91', '--input': '#7967A6', '--ring': '#00F0FF', '--chart-1': '#00F0FF', '--chart-2': '#FF006E', '--chart-3': '#A855F7', '--chart-4': '#5D34D0', '--chart-5': '#FFFFFF',
      },
    },
  },
] as const;

export function getAppMakerDesignTemplate(key: string | undefined) {
  return APP_MAKER_DESIGN_TEMPLATES.find((template) => template.key === key) ?? APP_MAKER_DESIGN_TEMPLATES[0];
}
