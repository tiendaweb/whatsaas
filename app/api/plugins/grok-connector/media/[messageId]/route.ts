import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import {
  CHATGPT_CONNECTOR_PLUGIN_ID,
  CLAUDE_CONNECTOR_PLUGIN_ID,
  GROK_CONNECTOR_PLUGIN_ID,
  authenticateMcp,
  mcpResource,
  requestOrigin,
} from '@/lib/plugins/grok-connector/server/oauth';
import { resolvePrivateChatMediaDownload } from '@/lib/plugins/grok-connector/server/media-actions';
import { verificarEnlaceFirmado } from '@/lib/plugins/grok-connector/server/media-link';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';

/** Dueño (o admin) del equipo, para resolver un enlace firmado con un sujeto real. */
async function usuarioDelEquipo(teamId: number) {
  const fila = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner')),
    columns: { userId: true },
  });
  return fila?.userId ?? null;
}

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
  'Access-Control-Max-Age': '600',
};

function connectorId(pathname: string) {
  if (pathname.includes('/plugins/chatgpt-connector/')) return CHATGPT_CONNECTOR_PLUGIN_ID;
  if (pathname.includes('/plugins/claude-code-connector/')) return CLAUDE_CONNECTOR_PLUGIN_ID;
  return GROK_CONNECTOR_PLUGIN_ID;
}

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').slice(0, 180) || 'whatspro-media';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;

  /**
   * Dos formas de autorizar, en este orden:
   *
   * 1. El Bearer del conector — lo de siempre, cuando el propio conector pide.
   * 2. Una firma en la URL — para cuando el enlace tiene que viajar a algo que
   *    no manda cabeceras. Ver `media-link.ts`.
   *
   * En AMBOS casos se resuelve después con `resolvePrivateChatMediaDownload`,
   * que revalida equipo, permiso y visibilidad del chat: la firma autoriza a
   * pedir el recurso, no saltea el control de acceso.
   */
  const firma = verificarEnlaceFirmado(messageId, request.nextUrl.searchParams);
  let teamId: number;
  let userId: number;

  if (firma.ok) {
    teamId = firma.teamId;
    // El enlace firmado no representa a una persona: se resuelve con el
    // usuario dueño del equipo para que la comprobación de permisos y de
    // visibilidad de chat siga corriendo con un sujeto real.
    const dueno = await usuarioDelEquipo(teamId);
    if (!dueno) {
      return NextResponse.json({ error: 'team_not_found' }, { status: 404, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
    }
    userId = dueno;
  } else {
    const id = connectorId(request.nextUrl.pathname);
    const resource = mcpResource(requestOrigin(request), id);
    const auth = await authenticateMcp(request.headers.get('authorization'), resource);
    if (!auth.ok) {
      // Si venía con firma pero inválida, se dice por qué: distinguir
      // "venció" de "no autorizado" evita que alguien reintente a ciegas.
      const motivo = request.nextUrl.searchParams.get('sig') ? firma.motivo : auth.code;
      return NextResponse.json(
        { error: motivo },
        { status: auth.status, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
      );
    }
    teamId = auth.teamId;
    userId = auth.userId;
  }

  try {
    const media = await resolvePrivateChatMediaDownload(messageId, { teamId, userId });
    const stream = Readable.toWeb(createReadStream(media.absolutePath));
    return new NextResponse(stream as BodyInit, {
      headers: {
        ...corsHeaders,
        'Content-Type': media.mimeType,
        'Content-Length': String(media.sizeBytes),
        'Content-Disposition': contentDisposition(media.fileName),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media file is not available.';
    const status = message.startsWith('Permission denied') ? 403 : 404;
    return NextResponse.json({ error: message }, { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

