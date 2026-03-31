import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { seedMarketplaceItems } from '@/lib/plugins/marketplace/server/seed';

export async function POST() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await seedMarketplaceItems();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al ejecutar seed' },
      { status: 500 },
    );
  }
}
