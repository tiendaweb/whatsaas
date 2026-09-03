import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { buildChatContext, runSkillWithApi } from '@/lib/plugins/sales-ops/server/skill-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  /** El prompt guardado del programado: qué tiene que hacer con el texto. */
  prompt: z.string().min(5).max(4000),
  /** Texto actual del programado. Vacío = escribirlo de cero. */
  message: z.string().max(4000).nullable().optional(),
  /** Chat del contacto, para que la IA lea el historial antes de reescribir. */
  chatId: z.number().int().positive().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
});

/**
 * POST → reescribe el texto de un mensaje programado con la IA del equipo.
 *
 * El prompt vive guardado en el programado (`ai_prompt`), así que corregir el
 * texto la semana que viene no obliga a volver a explicarle el tono ni los
 * datos: se aprieta el botón y sale con las mismas reglas.
 *
 * Devuelve texto y NO guarda nada: lo que se guarda lo decide la persona
 * apretando "Guardar" en el formulario, después de leerlo.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { prompt, message?, chatId? }' }, { status: 400 });
  const { prompt, message, chatId, name } = parsed.data;

  const contexto = chatId ? await buildChatContext(ctx.team.id, chatId) : null;
  const instruccion = [
    `Vas a escribir el texto de un mensaje de WhatsApp programado${name ? ` para ${name}` : ''}.`,
    message?.trim() ? `TEXTO ACTUAL:\n${message.trim()}` : 'Todavía no hay texto: escribilo de cero.',
    `INDICACIÓN:\n${prompt.trim()}`,
    'Devolvé SOLAMENTE el texto del mensaje, listo para pegar. Sin comillas, sin encabezados, sin explicaciones. Español rioplatense.',
  ].join('\n\n');

  const outcome = await runSkillWithApi(ctx.team.id, instruccion, contexto);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 422 });
  return NextResponse.json({ message: outcome.output, provider: outcome.provider, model: outcome.model });
}
