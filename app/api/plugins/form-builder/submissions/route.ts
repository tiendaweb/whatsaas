import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { evolutionInstances, formBuilderForms, formBuilderSubmissions } from '@/lib/db/schema';
import { getFormBuilderRequestContext } from '@/lib/plugins/form-builder/server/auth';
import { submissionStatusSchema } from '@/lib/plugins/form-builder/server/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getFormBuilderRequestContext('formBuilderRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const formId = Number(url.searchParams.get('formId') ?? '');
  const status = url.searchParams.get('status') ?? '';

  const conditions = [eq(formBuilderSubmissions.teamId, ctx.team.id)];
  if (Number.isInteger(formId) && formId > 0) {
    conditions.push(eq(formBuilderSubmissions.formId, formId));
  }
  if (status && submissionStatusSchema.safeParse(status).success) {
    conditions.push(eq(formBuilderSubmissions.status, status));
  }

  const rows = await db
    .select({
      submission: formBuilderSubmissions,
      formName: formBuilderForms.name,
      formPublicId: formBuilderForms.publicId,
      instanceName: evolutionInstances.instanceName,
    })
    .from(formBuilderSubmissions)
    .leftJoin(formBuilderForms, eq(formBuilderSubmissions.formId, formBuilderForms.id))
    .leftJoin(evolutionInstances, eq(formBuilderSubmissions.instanceId, evolutionInstances.id))
    .where(and(...conditions))
    .orderBy(desc(formBuilderSubmissions.submittedAt));

  return NextResponse.json(
    rows.map((row) => ({
      ...row.submission,
      formName: row.formName,
      formPublicId: row.formPublicId,
      instanceName: row.instanceName,
    })),
  );
}
