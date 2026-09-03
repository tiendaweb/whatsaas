import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formBuilderSubmissions } from '@/lib/db/schema';
import { getFormBuilderRequestContext } from '@/lib/plugins/form-builder/server/auth';
import { sendSubmissionConfirmation } from '@/lib/plugins/form-builder/server/service';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(id: string) {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const ctx = await getFormBuilderRequestContext('formBuilderWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const submissionId = parseId(id);
  if (!submissionId) return NextResponse.json({ error: 'Invalid submission id' }, { status: 400 });

  const submission = await db.query.formBuilderSubmissions.findFirst({
    where: and(eq(formBuilderSubmissions.id, submissionId), eq(formBuilderSubmissions.teamId, ctx.team.id)),
    columns: { id: true },
  });
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await sendSubmissionConfirmation(submissionId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
