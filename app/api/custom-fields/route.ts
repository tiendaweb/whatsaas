import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { customFields } from '@/lib/db/schema';
import { ensureCustomFieldsTable } from '@/lib/contacts/custom-fields';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createCustomFieldSchema = z.object({
  name: z.string().trim().min(1, 'Field name is required').max(100, 'Field name is too long'),
  type: z.enum(['text', 'boolean']).default('text'),
});

function buildFieldKey(name: string) {
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const key = normalizedName
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);

  return key || `field_${Date.now()}`;
}

export async function GET() {
  try {
    await ensureCustomFieldsTable();

    const team = await getTeamForUser();
    if (!team) return NextResponse.json([]);

    const fields = await db.select().from(customFields).where(eq(customFields.teamId, team.id));
    return NextResponse.json(fields);
  } catch (error) {
    console.error('Error fetching custom fields:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureCustomFieldsTable();

    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const parsedPayload = createCustomFieldSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { error: parsedPayload.error.issues[0]?.message ?? 'Invalid custom field payload' },
        { status: 400 },
      );
    }

    const { name, type } = parsedPayload.data;
    const key = buildFieldKey(name);

    const existingField = await db.query.customFields.findFirst({
      where: and(eq(customFields.teamId, team.id), eq(customFields.key, key)),
    });

    if (existingField) {
      return NextResponse.json(
        { error: 'A custom field with the same name already exists.' },
        { status: 409 },
      );
    }

    const [field] = await db.insert(customFields).values({
      teamId: team.id,
      name,
      key,
      type,
    }).returning();

    return NextResponse.json(field);
  } catch (error) {
    console.error('Error creating custom field:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
    try {
        await ensureCustomFieldsTable();

        const team = await getTeamForUser();
        if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        await db.delete(customFields)
            .where(and(eq(customFields.id, parseInt(id, 10)), eq(customFields.teamId, team.id)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting custom field:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
