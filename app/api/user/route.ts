import { getUser } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';
import { getResellerForUser } from '@/lib/db/queries/resellers';

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null);

  const session = await getSession();
  const impersonatorId = session?.impersonatedBy?.id ?? null;
  const ownedReseller = await getResellerForUser(user.id);

  return Response.json({
    ...user,
    impersonation: {
      isImpersonating: Boolean(impersonatorId),
      impersonatorId,
    },
    ownedReseller: ownedReseller
      ? { id: ownedReseller.id, slug: ownedReseller.slug, companyName: ownedReseller.companyName }
      : null,
  });
}
