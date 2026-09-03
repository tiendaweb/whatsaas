import { NextResponse } from 'next/server';
import { getTeamForUser } from '@/lib/db/queries';

export async function GET() {
  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.EVOLUTION_WEBHOOK_TOKEN
    || process.env.NEXT_PUBLIC_EVOLUTION_WEBHOOK_TOKEN
    || '';

  return NextResponse.json({ token });
}
