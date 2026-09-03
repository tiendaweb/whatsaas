import { NextResponse } from 'next/server';
import { getFormBuilderRequestContext } from '@/lib/plugins/form-builder/server/auth';
import {
  FormBuilderError,
  deleteForm,
  getFormWithInstanceForTeam,
  updateForm,
} from '@/lib/plugins/form-builder/server/service';
import { formBuilderFormInputSchema } from '@/lib/plugins/form-builder/server/schema';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(id: string) {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const ctx = await getFormBuilderRequestContext('formBuilderRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const formId = parseId(id);
  if (!formId) return NextResponse.json({ error: 'Invalid form id' }, { status: 400 });

  const row = await getFormWithInstanceForTeam(formId, ctx.team.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ...row.form, instanceName: row.instanceName });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const ctx = await getFormBuilderRequestContext('formBuilderWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const formId = parseId(id);
  if (!formId) return NextResponse.json({ error: 'Invalid form id' }, { status: 400 });

  const body = await request.json();
  const parsed = formBuilderFormInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await updateForm(ctx.team.id, ctx.user.id, formId, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof FormBuilderError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const ctx = await getFormBuilderRequestContext('formBuilderWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const formId = parseId(id);
  if (!formId) return NextResponse.json({ error: 'Invalid form id' }, { status: 400 });

  await deleteForm(ctx.team.id, formId);

  return NextResponse.json({ ok: true });
}
