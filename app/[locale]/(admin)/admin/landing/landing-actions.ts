'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { landingContent, landingPages } from '@/lib/db/schema';
import { defaultLandingContent } from '@/lib/landing/default-content';

const homeSectionSchema = z.object({
  id: z.string().min(1),
  eyebrow: z.string().trim().min(1, 'El badge es requerido.').max(120),
  title: z.string().trim().min(1, 'El título es requerido.').max(220),
  description: z.string().trim().min(1, 'La descripción es requerida.').max(600),
  bullets: z.array(z.string().trim().min(1).max(180)).min(1).max(6),
});

const faqSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1, 'La pregunta es requerida.').max(220),
  answer: z.string().trim().min(1, 'La respuesta es requerida.').max(700),
});

const landingContentSchema = z.object({
  homeSections: z.array(homeSectionSchema).length(3),
  faqItems: z.array(faqSchema).min(15).max(30),
});

const landingPageSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido.').max(120),
  slug: z
    .string()
    .trim()
    .min(1, 'El slug es requerido.')
    .max(140)
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'Usa solo letras, números y guiones.'),
  content: z.string().trim().min(1, 'El contenido es requerido.').max(10000),
});

async function verifyAdmin() {
  const user = await getUser();

  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function revalidateLanding(slug?: string) {
  revalidatePath('/', 'layout');
  revalidatePath('/admin/landing');
  if (slug) {
    revalidatePath(`/${slug}`);
  }
}

export async function updateLandingContent(payload: z.infer<typeof landingContentSchema>) {
  try {
    await verifyAdmin();
    const validated = landingContentSchema.parse(payload);
    const current = await db.query.landingContent.findFirst();

    if (current) {
      await db
        .update(landingContent)
        .set({
          homeSections: validated.homeSections,
          faqItems: validated.faqItems,
          updatedAt: new Date(),
        })
        .where(eq(landingContent.id, current.id));
    } else {
      await db.insert(landingContent).values({
        homeSections: validated.homeSections,
        faqItems: validated.faqItems,
      });
    }

    revalidateLanding();
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'No se pudo guardar el contenido.',
    };
  }
}

export async function resetLandingContent() {
  try {
    await verifyAdmin();
    const current = await db.query.landingContent.findFirst();

    if (current) {
      await db
        .update(landingContent)
        .set({
          homeSections: defaultLandingContent.homeSections,
          faqItems: defaultLandingContent.faqItems,
          updatedAt: new Date(),
        })
        .where(eq(landingContent.id, current.id));
    } else {
      await db.insert(landingContent).values(defaultLandingContent);
    }

    revalidateLanding();
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'No se pudo restaurar el contenido.',
    };
  }
}

export async function createLandingPage(payload: z.infer<typeof landingPageSchema>) {
  try {
    await verifyAdmin();
    const validated = landingPageSchema.parse(payload);

    await db.insert(landingPages).values({
      name: validated.name,
      slug: validated.slug,
      content: validated.content,
    });

    revalidateLanding(validated.slug);
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'No se pudo crear la página.',
    };
  }
}

export async function updateLandingPage(payload: z.infer<typeof landingPageSchema> & { id: number }) {
  try {
    await verifyAdmin();
    const validatedPage = landingPageSchema.parse(payload);

    const [existing] = await db
      .select({ slug: landingPages.slug })
      .from(landingPages)
      .where(eq(landingPages.id, payload.id))
      .limit(1);

    if (!existing) {
      throw new Error('La página no existe.');
    }

    await db
      .update(landingPages)
      .set({
        name: validatedPage.name,
        slug: validatedPage.slug,
        content: validatedPage.content,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, payload.id));

    revalidateLanding(existing.slug);
    revalidateLanding(validatedPage.slug);
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'No se pudo actualizar la página.',
    };
  }
}

export async function deleteLandingPage(id: number) {
  try {
    await verifyAdmin();
    const [existing] = await db
      .select({ slug: landingPages.slug })
      .from(landingPages)
      .where(eq(landingPages.id, id))
      .limit(1);

    if (!existing) {
      throw new Error('La página no existe.');
    }

    await db.delete(landingPages).where(eq(landingPages.id, id));

    revalidateLanding(existing.slug);
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message: error instanceof Error ? error.message : 'No se pudo eliminar la página.',
    };
  }
}
