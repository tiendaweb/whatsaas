import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { LaunchError, launchRun } from '@/lib/plugins/sales-ops/server/prompt-queue';
import { RUN_MODES } from '@/lib/plugins/sales-ops/shared/skills';

export const dynamic = 'force-dynamic';
/** El modo `api` llama al modelo dentro del request: puede tardar bastante más que una escritura. */
export const maxDuration = 120;

const schema = z.object({
  skillId: z.number().int().positive().nullable().optional(),
  text: z.string().max(20000).nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  targetKind: z.enum(['chat', 'team', 'batch']),
  targetId: z.number().int().positive().nullable().optional(),
  /** batchId cuando targetKind es `batch`. */
  targetRef: z.string().max(64).nullable().optional(),
  variables: z.record(z.string().max(60), z.string().max(4000)).optional(),
  mode: z.enum(RUN_MODES).optional(),
  /** Default true: quien lanza desde la interfaz ya la aprobó. false = dejarla en revisión. */
  approved: z.boolean().optional(),
});

/**
 * Lanza una skill.
 *
 * `mode: "queue"` deja la corrida para un conector y contesta al instante;
 * `mode: "api"` la ejecuta acá con la IA del equipo y devuelve la salida en la
 * misma respuesta. Las dos dejan la misma fila en `team_prompt_runs`, así que
 * la actividad del Studio se lee igual sin importar quién la corrió.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { skillId? | text, targetKind, targetId? | targetRef?, variables?, mode? }' }, { status: 400 });
  try {
    const { run, skill } = await launchRun(ctx.team.id, ctx.user.id, { ...parsed.data, approved: parsed.data.approved ?? true });
    return NextResponse.json({ run, skill }, { status: 201 });
  } catch (error) {
    if (error instanceof LaunchError) {
      return NextResponse.json({ error: error.message, missing: error.missing }, { status: 422 });
    }
    console.error('[sales-ops/prompts/launch]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
