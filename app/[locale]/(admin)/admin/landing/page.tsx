import { getLandingContent, getLandingPages } from '@/lib/db/queries/landing';
import { LandingAdminClient } from './LandingAdminClient';

export default async function AdminLandingPage() {
  const [landingContent, landingPages] = await Promise.all([
    getLandingContent(),
    getLandingPages(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Landing</h1>
        <p className="text-muted-foreground">
          Administra las nuevas secciones del home, las preguntas frecuentes y páginas extra del sitio.
        </p>
      </div>
      <LandingAdminClient initialContent={landingContent} initialPages={landingPages} />
    </div>
  );
}
