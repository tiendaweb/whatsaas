import { NextResponse } from 'next/server';
import { buildEmbedBoard, getTaskEmbedContext } from '@/lib/plugins/tasks/server/embed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params;
  const ctx = await getTaskEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const board = await buildEmbedBoard(ctx);
  if (!board) return NextResponse.json({ error: 'Embed not found.' }, { status: 404 });

  return NextResponse.json(board);
}
