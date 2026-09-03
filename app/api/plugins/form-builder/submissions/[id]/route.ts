import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFormBuilderRequestContext } from '@/lib/plugins/form-builder/server/auth';
import { submissionStatusSchema } from '@/lib/plugins/form-builder/server/schema';
import { FormBuilderError, setSubmissionStatus } from '@/lib/plugins/form-builder/server/service';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: submissionStatusSchema,
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(id: string) {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const ctx = await getFormBuilderRequestContext('formBuilderWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const submissionId = parseId(id);
  if (!submissionId) return NextResponse.json({ error: 'Invalid submission id' }, { status: 400 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await setSubmissionStatus(ctx.team.id, ctx.user.id, submissionId, parsed.data.status);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof FormBuilderError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
