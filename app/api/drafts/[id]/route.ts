import { NextRequest, NextResponse } from 'next/server';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { ensureDraftStorage } from '@/lib/drafts/bootstrap';
import { parseDraftWritePayload } from '@/lib/drafts/payload';
import { DraftError, deleteDraft, getDraft, updateDraft } from '@/lib/drafts/service';

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function handleError(error: any, label: string) {
  if (error instanceof DraftError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`Error ${label} draft:`, error?.message || error);
  if (error?.code === '23503') return NextResponse.json({ error: 'Invalid related reference.' }, { status: 400 });
  if (error?.code === '23505') return NextResponse.json({ error: 'Duplicated draft tag relation.' }, { status: 409 });
  return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.[id].GET');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const draftId = parseId((await params).id);
    if (!draftId) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });

    const draft = await getDraft(context.teamId, draftId);
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    return NextResponse.json(draft);
  } catch (error: any) {
    return handleError(error, 'getting');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.[id].PUT');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const draftId = parseId((await params).id);
    if (!draftId) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const payloadResult = parseDraftWritePayload(body);
    if (!payloadResult.ok) {
      return NextResponse.json({ error: payloadResult.error }, { status: 400 });
    }

    const draft = await updateDraft(context.teamId, context.userId, draftId, {
      ...payloadResult.value,
      isArchived: Boolean((body as any)?.isArchived),
    });

    return NextResponse.json(draft);
  } catch (error: any) {
    return handleError(error, 'updating');
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.[id].DELETE');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const draftId = parseId((await params).id);
    if (!draftId) return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 });

    await deleteDraft(context.teamId, draftId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleError(error, 'deleting');
  }
}
