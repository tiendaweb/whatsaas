import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { SeguimientoApp } from '@/components/seguimiento/SeguimientoApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Seguimiento',
  description: 'Agenda de contactos por etapa del embudo.',
};

export default async function SeguimientoPage() {
  const ctx = await getUserPermissionContext();
  if (!ctx) redirect('/sign-in');
  if (ctx.role !== 'owner' && ctx.permissions.contacts !== true) redirect('/dashboard');

  return (
    <Suspense fallback={null}>
      <SeguimientoApp />
    </Suspense>
  );
}
