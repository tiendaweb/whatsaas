import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { duplicateSkill, getSkill, listSkillVersions, retireSkill, setSkillPinned } from '@/lib/plugins/sales-ops/server/skills';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function skillId(params: Params['params']): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET → la skill con todas sus versiones (historial del editor). */
export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = await skillId(params);
  if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const skill = await getSkill(ctx.team.id, { id });
  if (!skill) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ skill, versions: await listSkillVersions(ctx.team.id, skill.key) });
}

const patchSchema = z.object({ pinned: z.boolean() });

/** PATCH { pinned } → fija o suelta la skill. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = await skillId(params);
  if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { pinned }' }, { status: 400 });
  try {
    return NextResponse.json(await setSkillPinned(ctx.team.id, ctx.user.id, id, parsed.data.pinned));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

/** POST → duplica la skill como una nueva editable. */
export async function POST(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = await skillId(params);
  if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    return NextResponse.json(await duplicateSkill(ctx.team.id, ctx.user.id, id), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}

/** DELETE → retira todas las versiones de la skill. Las corridas encoladas no se tocan. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = await skillId(params);
  if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const skill = await getSkill(ctx.team.id, { id });
  if (!skill) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ retired: await retireSkill(ctx.team.id, ctx.user.id, skill.key) });
}
