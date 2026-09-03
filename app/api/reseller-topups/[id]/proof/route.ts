import { readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { resellerTopups } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getResellerForUser } from '@/lib/db/queries/resellers';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number((await params).id);
  const topup = Number.isInteger(id)
    ? await db.query.resellerTopups.findFirst({ where: eq(resellerTopups.id, id) })
    : null;
  if (!topup?.proofUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const reseller = await getResellerForUser(user.id);
  if (user.role !== 'admin' && reseller?.id !== topup.resellerId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const filename = basename(topup.proofUrl);
  if (filename !== topup.proofUrl) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  try {
    const file = await readFile(join(process.cwd(), 'storage', 'topup-proofs', filename));
    return new NextResponse(file, {
      headers: {
        'Content-Type': CONTENT_TYPES[extname(filename).toLowerCase()] ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="comprobante${extname(filename)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
