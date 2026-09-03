import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capacidadDelBanco, crearKey, listarKeys } from '@/lib/gemini/key-bank';
import { estadoDeLaCola } from '@/lib/audio-insights';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(10).max(200),
  model: z.string().trim().max(80).optional(),
  limitRpm: z.number().int().min(1).max(10000).optional(),
  limitRpd: z.number().int().min(1).max(1000000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function GET() {
  const context = await getPluginRequestContext('aiAgent');
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  const [keys, capacidad, cola] = await Promise.all([
    listarKeys(context.team.id),
    capacidadDelBanco(context.team.id),
    estadoDeLaCola(context.team.id),
  ]);

  // La key nunca vuelve al navegador, ni siquiera para el dueño: `hint` alcanza
  // para reconocerla y no hay motivo para que viaje otra vez.
  return NextResponse.json({ keys, capacidad, cola });
}

export async function POST(request: Request) {
  const context = await getPluginRequestContext('aiAgent');
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const creada = await crearKey({ teamId: context.team.id, createdBy: context.user.id, ...parsed.data });
    return NextResponse.json({ ok: true, id: creada?.id });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error inesperado';
    // El índice único es (team, label): el choque es de nombre, no de key.
    if (mensaje.includes('team_gemini_keys_team_label_uidx')) {
      return NextResponse.json({ error: 'Ya hay una API key con ese nombre.' }, { status: 409 });
    }
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
