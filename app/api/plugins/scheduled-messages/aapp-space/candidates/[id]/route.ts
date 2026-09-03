import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamAappRenewalCandidates } from '@/lib/db/schema';
import { getAappRenewalRequestContext } from '@/lib/plugins/scheduled-messages/aapp-renewal-access';
import {
  applyAappRenewalAction,
  auditAappRenewal,
  listAappRenewalRecipientOptions,
  resolveAappRenewalRecipient,
  resolveAappRenewalRecipientOption,
} from '@/lib/plugins/scheduled-messages/aapp-renewals';

const schema = z.object({
  action: z.enum(['approve', 'reject', 'revoke', 'reopen', 'retry']).optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  recipientSource: z.enum(['account', 'website', 'store']).optional(),
  recipientOptionKey: z.string().trim().min(1).max(80).optional(),
}).refine((data) => Boolean(data.action || data.message || data.recipientSource || data.recipientOptionKey), { message: 'No changes supplied' });

function candidateId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAappRenewalRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = candidateId((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid candidate' }, { status: 400 });
  const candidate = await db.query.teamAappRenewalCandidates.findFirst({
    where: and(eq(teamAappRenewalCandidates.id, id), eq(teamAappRenewalCandidates.teamId, ctx.team.id)),
    columns: {
      id: true,
      customerId: true,
      recipientPhone: true,
      recipientStoreId: true,
      resolvedRecipientSource: true,
    },
  });
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const options = await listAappRenewalRecipientOptions(ctx.team.id, candidate.customerId);
  const selectedOption = options.find((option) => (
    candidate.recipientStoreId
      ? option.storeId === candidate.recipientStoreId
      : option.source === candidate.resolvedRecipientSource && option.phone === candidate.recipientPhone
  ));
  return NextResponse.json({
    candidateId: candidate.id,
    selectedOptionKey: selectedOption?.key ?? null,
    options,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAappRenewalRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = candidateId((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid candidate' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const candidate = await db.query.teamAappRenewalCandidates.findFirst({
    where: and(eq(teamAappRenewalCandidates.id, id), eq(teamAappRenewalCandidates.teamId, ctx.team.id)),
  });
  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((parsed.data.message || parsed.data.recipientSource || parsed.data.recipientOptionKey) && candidate.status !== 'pending') {
    return NextResponse.json({ error: 'Revoke the approval before editing this notice' }, { status: 409 });
  }
  if (parsed.data.message || parsed.data.recipientSource || parsed.data.recipientOptionKey) {
    const source = parsed.data.recipientSource ?? candidate.requestedRecipientSource;
    let recipient;
    try {
      recipient = parsed.data.recipientOptionKey
        ? await resolveAappRenewalRecipientOption(ctx.team.id, candidate.customerId, parsed.data.recipientOptionKey)
        : await resolveAappRenewalRecipient(ctx.team.id, candidate.customerId, source);
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Invalid recipient number',
      }, { status: 409 });
    }
    await db.update(teamAappRenewalCandidates).set({
      ...(parsed.data.message ? { message: parsed.data.message } : {}),
      requestedRecipientSource: recipient.requestedSource,
      resolvedRecipientSource: recipient.resolvedSource,
      recipientPhone: recipient.phone,
      recipientStoreId: recipient.storeId,
      usedAccountFallback: recipient.usedAccountFallback,
      updatedAt: new Date(),
    }).where(and(eq(teamAappRenewalCandidates.id, id), eq(teamAappRenewalCandidates.teamId, ctx.team.id)));
    await auditAappRenewal(ctx.team.id, ctx.user.id, 'candidate_edited', {
      candidateId: id,
      recipientSource: recipient.requestedSource,
      recipientStoreId: recipient.storeId,
    });
  }
  const result = parsed.data.action
    ? await applyAappRenewalAction({ teamId: ctx.team.id, userId: ctx.user.id, ids: [id], action: parsed.data.action })
    : { changed: 1 };
  return NextResponse.json({ ok: true, ...result });
}
