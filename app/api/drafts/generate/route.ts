import { NextRequest, NextResponse } from 'next/server';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { generateDraft } from '@/lib/drafts/generate';
import { DraftError } from '@/lib/drafts/service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await checkRoutePermission('drafts');
    if (error || !context) {
      return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const result = await generateDraft(context.teamId, context.userId, {
      prompt: typeof body?.prompt === 'string' ? body.prompt : '',
      baseContent: typeof body?.baseContent === 'string' ? body.baseContent : '',
      draftType: body?.draftType === 'dynamic' ? 'dynamic' : 'static',
      mode: body?.mode,
    });

    return NextResponse.json({ content: result.content, metadata: result.metadata });
  } catch (error: any) {
    if (error instanceof DraftError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error generating draft with AI:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
