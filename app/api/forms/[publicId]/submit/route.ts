import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formBuilderForms, formBuilderSubmissions } from '@/lib/db/schema';
import { publicSubmissionSchema, type FormField } from '@/lib/plugins/form-builder/server/schema';
import {
  extractContactName,
  extractContactPhone,
  isFormBuilderActiveForTeam,
  normalizePhoneToJid,
  sendSubmissionConfirmation,
  validateSubmissionData,
} from '@/lib/plugins/form-builder/server/service';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ publicId: string }>;
};

function getSourceIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const { publicId } = await params;

  const form = await db.query.formBuilderForms.findFirst({
    where: eq(formBuilderForms.publicId, publicId),
  });

  if (!form || form.status !== 'published') {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const isActive = await isFormBuilderActiveForTeam(form.teamId);
  if (!isActive) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const parsed = publicSubmissionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fields = (form.fields ?? []) as FormField[];
  const data = parsed.data.data as Record<string, unknown>;
  const validationError = validateSubmissionData(fields, data);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const contactPhone = extractContactPhone(fields, data);
  const contactJid = normalizePhoneToJid(contactPhone);
  if (!contactPhone || !contactJid) {
    return NextResponse.json({ error: 'El formulario necesita un telefono valido.' }, { status: 400 });
  }

  const [submission] = await db
    .insert(formBuilderSubmissions)
    .values({
      teamId: form.teamId,
      formId: form.id,
      instanceId: form.instanceId ?? null,
      contactName: extractContactName(fields, data),
      contactPhone,
      contactJid,
      data,
      status: 'new',
      messageStatus: 'pending',
      sourceIp: getSourceIp(request),
      userAgent: request.headers.get('user-agent'),
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: formBuilderSubmissions.id });

  const messageResult = await sendSubmissionConfirmation(submission.id);

  return NextResponse.json({
    ok: true,
    submissionId: submission.id,
    successMessage: form.successMessage,
    message: messageResult,
  });
}
