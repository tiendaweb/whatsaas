/**
 * Contenido de las carpetas "Documentación de la Plataforma" y "Capacitación de Uso"
 * para la cuenta de Noelia (team 2). El markdown vive en archivos aparte, en
 * scripts/seed-noelia-docs-content/, y se lee acá para evitar problemas de escapado
 * de backticks dentro de template literals de JS.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SeedDocument = {
  slug: string;
  title: string;
  emoji: string;
  markdown: string;
};

export type SeedFolder = {
  name: string;
  emoji: string;
  documents: SeedDocument[];
};

const CONTENT_DIR = path.join(__dirname, 'seed-noelia-docs-content');
const read = (file: string) => readFileSync(path.join(CONTENT_DIR, file), 'utf8');

export const FOLDERS: SeedFolder[] = [
  {
    name: 'Documentación de la Plataforma',
    emoji: '📚',
    documents: [
      {
        slug: 'documentacion-tecnica-de-la-plataforma',
        title: 'Documentación técnica de la plataforma',
        emoji: '⚙️',
        markdown: read('doc-tecnico.md'),
      },
      {
        slug: 'como-funciona-la-plataforma',
        title: 'Cómo funciona la plataforma',
        emoji: '🧭',
        markdown: read('doc-no-tecnico.md'),
      },
      {
        slug: 'todo-lo-que-la-plataforma-le-ofrece-a-tus-clientes',
        title: 'Todo lo que la plataforma le ofrece a tus clientes',
        emoji: '🚀',
        markdown: read('doc-ventas.md'),
      },
    ],
  },
  {
    name: 'Capacitación de Uso',
    emoji: '🎓',
    documents: [
      {
        slug: 'editor-de-flujos-de-automatizacion',
        title: 'Editor de flujos de automatización',
        emoji: '🧩',
        markdown: read('cap-flujos.md'),
      },
      {
        slug: 'automatizaciones-triggers-variables-y-motor',
        title: 'Automatizaciones: triggers, variables y motor',
        emoji: '⚡',
        markdown: read('cap-automatizaciones.md'),
      },
      {
        slug: 'inteligencia-artificial-configurar-el-agente',
        title: 'Inteligencia Artificial: configurar el agente',
        emoji: '🤖',
        markdown: read('cap-ia.md'),
      },
      {
        slug: 'funciones-de-llamada-de-ia-function-calling',
        title: 'Funciones de llamada de IA (Function Calling)',
        emoji: '🛠️',
        markdown: read('cap-ia-tools.md'),
      },
    ],
  },
];
