import type { MarketplaceItem } from '@/lib/db/schema';

type GeneratedItemContent = {
  title: string;
  subtitle: string;
  description: string;
  category: string;
  tags: string[];
};

async function callAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no configurada. Configurala en las variables de entorno.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Eres un experto en marketing digital y SaaS. Generas contenido en espanol para articulos de un marketplace de mejoras/servicios digitales. Responde SIEMPRE en formato JSON valido sin markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error de OpenAI: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function generateItemContent(topic: string): Promise<GeneratedItemContent> {
  const prompt = `Genera contenido para un articulo de marketplace sobre: "${topic}".

Responde con este JSON exacto:
{
  "title": "titulo corto y atractivo",
  "subtitle": "subtitulo descriptivo de una linea",
  "description": "descripcion detallada de 2-3 parrafos explicando beneficios y caracteristicas",
  "category": "una categoria como: web, ecommerce, automatizacion, formularios, herramientas",
  "tags": ["etiqueta1", "etiqueta2"]
}`;

  const raw = await callAI(prompt);
  return JSON.parse(raw) as GeneratedItemContent;
}

export async function batchGenerateItems(topics: string[]): Promise<GeneratedItemContent[]> {
  const results: GeneratedItemContent[] = [];

  for (const topic of topics) {
    const item = await generateItemContent(topic);
    results.push(item);
  }

  return results;
}

export async function improveItemContent(
  item: MarketplaceItem,
  field?: string,
): Promise<Partial<GeneratedItemContent>> {
  const fieldHint = field
    ? `Mejora SOLO el campo "${field}" del siguiente articulo.`
    : 'Mejora TODOS los campos de texto del siguiente articulo.';

  const prompt = `${fieldHint}

Articulo actual:
- Titulo: ${item.title}
- Subtitulo: ${item.subtitle ?? '(vacio)'}
- Descripcion: ${item.description}
- Categoria: ${item.category}
- Etiquetas: ${(item.tags ?? []).join(', ') || '(vacio)'}

Responde con un JSON que contenga SOLO los campos mejorados:
{
  "title": "...",
  "subtitle": "...",
  "description": "...",
  "category": "...",
  "tags": ["..."]
}

Si solo mejoras un campo, incluye solo ese campo en el JSON.`;

  const raw = await callAI(prompt);
  return JSON.parse(raw) as Partial<GeneratedItemContent>;
}
