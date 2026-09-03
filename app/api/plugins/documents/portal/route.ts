import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import {
  DocumentPortalError,
  getDocumentPortal,
  saveDocumentPortal,
} from '@/lib/plugins/documents/server/portal';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getPluginRequestContext('documentsRead');
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  try {
    return NextResponse.json(await getDocumentPortal(context.team.id));
  } catch (error) {
    if (error instanceof DocumentPortalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function PUT(request: Request) {
  const context = await getPluginRequestContext('documentsWrite');
  if (!context.ok) return NextResponse.json({ error: context.message }, { status: context.status });

  const body = await request.json().catch(() => ({}));
  try {
    await saveDocumentPortal({
      teamId: context.team.id,
      userId: context.user.id,
      definition: body.definition,
      version: Number.isInteger(body.version) ? body.version : undefined,
    });
    return NextResponse.json(await getDocumentPortal(context.team.id));
  } catch (error) {
    if (error instanceof DocumentPortalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
