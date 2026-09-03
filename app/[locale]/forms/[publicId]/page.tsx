import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formBuilderForms } from '@/lib/db/schema';
import { isFormBuilderActiveForTeam } from '@/lib/plugins/form-builder/server/service';
import { PublicForm } from '@/lib/plugins/form-builder/ui/PublicForm';
import type { FormField, FormStyle } from '@/lib/plugins/form-builder/server/schema';

type PageProps = {
  params: Promise<{ publicId: string; locale: string }>;
};

export default async function FormPublicPage({ params }: PageProps) {
  const { publicId } = await params;
  const form = await db.query.formBuilderForms.findFirst({
    where: eq(formBuilderForms.publicId, publicId),
  });

  if (!form || form.status !== 'published') {
    notFound();
  }

  const isActive = await isFormBuilderActiveForTeam(form.teamId);
  if (!isActive) {
    notFound();
  }

  return (
    <PublicForm
      form={{
        publicId: form.publicId,
        name: form.name,
        description: form.description,
        fields: form.fields as FormField[],
        style: form.style as FormStyle,
        submitButtonLabel: form.submitButtonLabel,
        successMessage: form.successMessage,
      }}
    />
  );
}
