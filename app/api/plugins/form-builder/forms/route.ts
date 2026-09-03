import { NextResponse } from 'next/server';
import { getFormBuilderRequestContext } from '@/lib/plugins/form-builder/server/auth';
import { FormBuilderError, createForm, listFormsForTeam } from '@/lib/plugins/form-builder/server/service';
import { formBuilderFormInputSchema } from '@/lib/plugins/form-builder/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getFormBuilderRequestContext('formBuilderRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const forms = await listFormsForTeam(ctx.team.id);
  return NextResponse.json(forms);
}

export async function POST(request: Request) {
  const ctx = await getFormBuilderRequestContext('formBuilderWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = formBuilderFormInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const created = await createForm(ctx.team.id, ctx.user.id, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof FormBuilderError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
