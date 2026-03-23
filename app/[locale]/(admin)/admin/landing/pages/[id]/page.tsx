import { notFound } from 'next/navigation';
import { getLandingPageById } from '@/lib/db/queries/landing';
import { LandingPageEditorClient } from './LandingPageEditorClient';

export default async function AdminLandingPageEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const page = await getLandingPageById(Number(id));

  if (!page) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Editor de página</h1>
        <p className="text-muted-foreground">
          Ajusta esta página con un editor por tabs, subsidebar de secciones y bloques dinámicos reordenables.
        </p>
      </div>
      <LandingPageEditorClient initialPage={page} />
    </div>
  );
}
