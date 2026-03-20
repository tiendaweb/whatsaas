import { getUser } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null);

  const session = await getSession();
  const impersonatorId = session?.impersonatedBy?.id ?? null;

  return Response.json({
    ...user,
    impersonation: {
      isImpersonating: Boolean(impersonatorId),
      impersonatorId,
    },
  });
}
