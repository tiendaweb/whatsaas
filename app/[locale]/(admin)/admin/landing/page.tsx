import { getLandingContent } from '@/lib/db/queries/landing';
import { LandingAdminClient } from './LandingAdminClient';

export default async function AdminLandingPage() {
  const landingContent = await getLandingContent();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Landing</h1>
        <p className="text-muted-foreground">
          Administra únicamente el home principal y las preguntas frecuentes desde este espacio.
        </p>
      </div>
      <LandingAdminClient initialContent={landingContent} />
    </div>
  );
}
