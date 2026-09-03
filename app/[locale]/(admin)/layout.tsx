import { getUser } from '@/lib/db/queries';
import { notFound, redirect } from 'next/navigation';
import { getTenantId } from '@/lib/tenant/context';
import { AdminSidebar } from './AdminSidebar';
import { getResellerForUser } from '@/lib/db/queries/resellers';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // El admin de la plataforma no existe en los dominios de marca blanca: ni
  // siquiera debe revelar que la ruta existe.
  if (await getTenantId()) {
    notFound();
  }

  const user = await getUser();

  if (!user || user.role !== 'admin') {
    redirect(`/${locale}/dashboard`);
  }

  const ownedReseller = await getResellerForUser(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 sm:flex-row">
      <AdminSidebar ownedResellerName={ownedReseller?.companyName ?? null} />
      <main className="flex min-w-0 flex-1 flex-col sm:pl-64">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
