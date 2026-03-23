import { getLandingPages } from '@/lib/db/queries/landing';
import { LandingPagesAdminClient } from './LandingPagesAdminClient';

export default async function AdminLandingPagesPage() {
  const pages = await getLandingPages();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Páginas de la landing</h1>
        <p className="text-muted-foreground">
          Gestiona cada página por separado y entra a su builder visual individual.
        </p>
      </div>
      <LandingPagesAdminClient initialPages={pages} />
    </div>
  );
}
