import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listTeamPrompts } from '@/lib/plugins/sales-ops/server/prompts';
import { listSkills, retireSkill, skillCategoryCounts, upsertSkill } from '@/lib/plugins/sales-ops/server/skills';
import {
  SKILL_CATEGORIES,
  SKILL_EXECUTIONS,
  SKILL_ICONS,
  SKILL_RECURRENCES,
  SKILL_SCOPES,
  SKILL_VARIABLE_TYPES,
} from '@/lib/plugins/sales-ops/shared/skills';
import { ANALYSIS_STATUSES, GATES, OWNERS, SIGNAL_KINDS } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';

/** Catálogo del Prompt Studio: skills del equipo, sus categorías y los prompts del motor. */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  try {
    const [payload, skills] = await Promise.all([
      listTeamPrompts(ctx.team.id),
      listSkills(ctx.team.id, {
        search: sp.get('search')?.trim() || undefined,
        target: sp.get('target') === 'chat' ? 'chat' : sp.get('target') === 'team' ? 'team' : undefined,
      }),
    ]);
    return NextResponse.json({
      ...payload,
      skills,
      categories: skillCategoryCounts(skills),
      counts: {
        total: skills.length,
        routines: skills.filter((s) => s.recurrence !== 'on_demand').length,
        onDemand: skills.filter((s) => s.recurrence === 'on_demand').length,
        withVariables: skills.filter((s) => s.variables.length > 0).length,
      },
      // La UI arma sus selects con esto: una lista sola, sin duplicar constantes.
      options: {
        categories: SKILL_CATEGORIES,
        icons: SKILL_ICONS,
        recurrences: SKILL_RECURRENCES,
        executions: SKILL_EXECUTIONS,
        scopes: SKILL_SCOPES,
        variableTypes: SKILL_VARIABLE_TYPES,
        gates: GATES,
        statuses: ANALYSIS_STATUSES,
        signals: SIGNAL_KINDS,
        owners: OWNERS,
      },
      // Compatibilidad con la vista anterior mientras queden clientes viejos cacheados.
      quickActions: skills,
    });
  } catch (error) {
    console.error('[sales-ops/prompts]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const variableSchema = z.object({
  name: z.string().max(60),
  label: z.string().max(80).optional(),
  type: z.enum(SKILL_VARIABLE_TYPES).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(160).nullable().optional(),
  help: z.string().max(240).nullable().optional(),
  options: z.array(z.string().max(120)).max(40).optional(),
  defaultValue: z.string().max(400).nullable().optional(),
});

const skillSchema = z.object({
  key: z.string().max(64).nullable().optional(),
  title: z.string().min(3).max(160),
  text: z.string().min(5).max(20000),
  description: z.string().max(400).nullable().optional(),
  category: z.enum(SKILL_CATEGORIES).optional(),
  icon: z.enum(SKILL_ICONS).optional(),
  recurrence: z.enum(SKILL_RECURRENCES).optional(),
  execution: z.enum(SKILL_EXECUTIONS).optional(),
  scope: z.enum(SKILL_SCOPES).optional(),
  variables: z.array(variableSchema).max(20).optional(),
  recommendFor: z
    .object({
      gates: z.array(z.enum(GATES)).optional(),
      statuses: z.array(z.enum(ANALYSIS_STATUSES)).optional(),
      signals: z.array(z.enum(SIGNAL_KINDS)).optional(),
      owners: z.array(z.enum(OWNERS)).optional(),
    })
    .optional(),
  toolChain: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
  pinned: z.boolean().optional(),
});

/** Crea o versiona una skill. */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = skillSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Body inválido${issue ? `: ${issue.path.join('.')} — ${issue.message}` : ''}` }, { status: 400 });
  }
  try {
    return NextResponse.json(await upsertSkill(ctx.team.id, ctx.user.id, parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

/** DELETE ?key= → retira todas las versiones de una skill. */
export async function DELETE(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const key = new URL(request.url).searchParams.get('key')?.trim();
  if (!key) return NextResponse.json({ error: 'Falta key' }, { status: 400 });
  return NextResponse.json({ retired: await retireSkill(ctx.team.id, ctx.user.id, key) });
}
