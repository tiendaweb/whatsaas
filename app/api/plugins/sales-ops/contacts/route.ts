import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listAnalyses } from '@/lib/plugins/sales-ops/server/queries';
import type { ListQuery } from '@/lib/plugins/sales-ops/shared/api-types';
import { ANALYSIS_STATUSES, GATES, NEEDS, OBJECTIONS, OWNERS, SOURCES } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { SITUACIONES } from '@/lib/plugins/sales-ops/shared/situacion';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Parseo tolerante: un valor inválido se ignora, nunca rompe la lista. */
const boolParam = z
  .enum(['1', '0', 'true', 'false'])
  .transform((v) => v === '1' || v === 'true')
  .optional()
  .catch(undefined);

const listOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter((x) => (values as readonly string[]).includes(x)) as Array<T[number]>)
    .optional()
    .catch(undefined);

const querySchema = z.object({
  vista: z.enum(['dinero', 'oportunidades', 'barrido', 'limpieza', 'revisar', 'todos']).optional().catch(undefined),
  gates: listOf(GATES),
  status: listOf(ANALYSIS_STATUSES),
  owner: z.enum(OWNERS).optional().catch(undefined),
  objection: z.enum(OBJECTIONS).optional().catch(undefined),
  need: z.enum(NEEDS).optional().catch(undefined),
  source: z.enum(SOURCES).optional().catch(undefined),
  ageBucket: z.enum(['lt7', '7to30', '30to90', '90to180', 'gt180']).optional().catch(undefined),
  followups: z.enum(['0', '1', '2', '3plus']).optional().catch(undefined),
  evidenceGap: boolParam,
  automationActive: boolParam,
  stale: boolParam,
  toReview: boolParam,
  scheduled: z.enum(['con', 'sin']).optional().catch(undefined),
  followUp: z.enum(['con', 'sin']).optional().catch(undefined),
  executed: z.enum(['con', 'sin']).optional().catch(undefined),
  snoozed: z.enum(['con', 'sin']).optional().catch(undefined),
  queued: z.enum(['con', 'sin', 'decision']).optional().catch(undefined),
  situaciones: listOf(SITUACIONES),
  cliente: z.enum(['con', 'sin']).optional().catch(undefined),
  conConteos: boolParam,
  q: z.string().max(120).optional().catch(undefined),
  sort: z.enum(['priority', 'age', 'oldest', 'lastFollowup', 'name', 'gate']).optional().catch(undefined),
  cursor: z.string().max(400).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(200).optional().catch(undefined),
});

function parseListQuery(searchParams: URLSearchParams): ListQuery {
  const raw: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) if (v !== '') raw[k] = v;
  const parsed = querySchema.safeParse(raw);
  const q = parsed.success ? parsed.data : {};
  const out: ListQuery = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function GET(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const query = parseListQuery(new URL(request.url).searchParams);
  const payload = await listAnalyses(ctx.team.id, query);
  return NextResponse.json(payload);
}
