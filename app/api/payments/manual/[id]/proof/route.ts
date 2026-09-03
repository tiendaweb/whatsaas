import { readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { manualPayments, teams } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { getResellerForUser } from '@/lib/db/queries/resellers';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const paymentId = Number((await params).id);
  if (!Number.isInteger(paymentId)) {
    return NextResponse.json({ error: 'Invalid payment' }, { status: 400 });
  }

  const [row] = await db
    .select({ payment: manualPayments, teamResellerId: teams.resellerId })
    .from(manualPayments)
    .innerJoin(teams, eq(teams.id, manualPayments.teamId))
    .where(eq(manualPayments.id, paymentId))
    .limit(1);

  if (!row?.payment.proofUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [currentTeam, ownedReseller] = await Promise.all([
    getTeamForUser(),
    getResellerForUser(user.id),
  ]);
  const allowed =
    user.role === 'admin' ||
    currentTeam?.id === row.payment.teamId ||
    ownedReseller?.id === row.teamResellerId;
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filename = basename(row.payment.proofUrl);
  if (filename !== row.payment.proofUrl) {
    return NextResponse.json({ error: 'Invalid proof path' }, { status: 400 });
  }

  try {
    const file = await readFile(join(process.cwd(), 'storage', 'payment-proofs', filename));
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
