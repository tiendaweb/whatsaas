import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getResellerForUser } from '@/lib/db/queries/resellers';
import { ResellerSidebar } from './ResellerSidebar';

export default async function ResellerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const reseller = await getResellerForUser(user.id);

  // Tener el rol no basta: hace falta un reseller asociado, que es de donde sale
  // el scope de todo lo que el panel puede leer y escribir.
  if (!reseller || (user.role !== 'reseller' && user.role !== 'admin')) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 sm:flex-row">
      <ResellerSidebar isAdmin={user.role === 'admin'} />
      <main className="flex min-w-0 flex-1 flex-col sm:pl-64">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
