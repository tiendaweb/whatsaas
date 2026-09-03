import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { ensureDraftStorage } from '@/lib/drafts/bootstrap';
import { parseDraftWritePayload } from '@/lib/drafts/payload';
import { DraftError, createDraft, normalizeDraft } from '@/lib/drafts/service';
import { messageDrafts, messageDraftTagLinks } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function parseOptionalInt(value: string | null): number | null {
  if (!value || value === 'null' || value === 'undefined' || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTagIds(searchParams: URLSearchParams): number[] {
  const fromMulti = searchParams
    .getAll('tagIds')
    .flatMap((value) => value.split(','))
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return Array.from(new Set(fromMulti));
}

export async function GET(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.GET');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json([], { status: 200 });

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const categoryId = parseOptionalInt(request.nextUrl.searchParams.get('categoryId'));
    const assignedUserId = parseOptionalInt(request.nextUrl.searchParams.get('assignedUserId'));
    const departmentId = parseOptionalInt(request.nextUrl.searchParams.get('departmentId'));
    const contactId = parseOptionalInt(request.nextUrl.searchParams.get('contactId'));
    const tagIds = parseTagIds(request.nextUrl.searchParams);

    const conditions = [eq(messageDrafts.teamId, context.teamId), eq(messageDrafts.isArchived, false)];

    if (q) {
      conditions.push(
        or(ilike(messageDrafts.title, `%${q}%`), ilike(messageDrafts.content, `%${q}%`))!,
      );
    }
    if (categoryId) conditions.push(eq(messageDrafts.categoryId, categoryId));
    if (assignedUserId) conditions.push(eq(messageDrafts.assignedUserId, assignedUserId));
    if (departmentId) conditions.push(eq(messageDrafts.departmentId, departmentId));
    if (contactId) conditions.push(eq(messageDrafts.contactId, contactId));

    if (tagIds.length > 0) {
      const taggedDraftRows = await db
        .selectDistinct({ draftId: messageDraftTagLinks.draftId })
        .from(messageDraftTagLinks)
        .innerJoin(messageDrafts, eq(messageDraftTagLinks.draftId, messageDrafts.id))
        .where(
          and(
            eq(messageDrafts.teamId, context.teamId),
            inArray(messageDraftTagLinks.tagId, tagIds),
          ),
        );

      const draftIds = taggedDraftRows.map((row) => row.draftId);
      if (draftIds.length === 0) return NextResponse.json([]);
      conditions.push(inArray(messageDrafts.id, draftIds));
    }

    const teamDrafts = await db.query.messageDrafts.findMany({
      where: and(...conditions),
      orderBy: [desc(messageDrafts.updatedAt)],
      with: {
        category: true,
        contact: { columns: { id: true, name: true } },
        assignedUser: { columns: { id: true, name: true, email: true } },
        department: { columns: { id: true, name: true } },
        tagLinks: {
          with: {
            tag: true,
          },
        },
      },
    });

    return NextResponse.json(teamDrafts.map(normalizeDraft));
  } catch (error: any) {
    console.error('Error fetching drafts:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storageReady = await ensureDraftStorage('api.drafts.POST');
    if (!storageReady.ok) {
      return NextResponse.json({ error: storageReady.clientMessage }, { status: storageReady.status });
    }

    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const payloadResult = parseDraftWritePayload(rawBody);
    if (!payloadResult.ok) {
      return NextResponse.json({ error: payloadResult.error }, { status: 400 });
    }

    const created = await createDraft(context.teamId, context.userId, payloadResult.value);

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error instanceof DraftError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error creating draft:', error?.message || error);

    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Invalid related reference.' }, { status: 400 });
    }
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Duplicated draft tag relation.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
