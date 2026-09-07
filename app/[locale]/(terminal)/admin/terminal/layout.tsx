import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';
import { getTenantId } from '@/lib/tenant/context';
import { isTerminalOperator } from '@/lib/terminal/access';

/**
 * `/admin/terminal` vive en su propio grupo de rutas, fuera de `(admin)`:
 * ese layout deja pasar sólo `role = 'admin'`, y la terminal no se da por rol
 * sino persona por persona (hoy: noelia@whatspro.uno, que es `owner`). Un
 * admin que no esté en la lista tampoco entra.
 *
 * `notFound()` y no `redirect()`: quien no tiene acceso no tiene por qué saber
 * que la ruta existe.
 */
export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  if (await getTenantId()) notFound();
  const [user, session] = await Promise.all([getUser(), getSession().catch(() => null)]);
  if (!user || !session || session.impersonatedBy || !isTerminalOperator(user)) notFound();
  return <div className="min-h-screen bg-[#0b0f14] text-neutral-100">{children}</div>;
}
