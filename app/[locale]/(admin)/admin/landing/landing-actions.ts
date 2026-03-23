"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getUser } from "@/lib/db/queries";
import { db } from "@/lib/db/drizzle";
import { landingContent, landingPages } from "@/lib/db/schema";
import { defaultLandingContent } from "@/lib/landing/default-content";
import { createDefaultLandingPageSections, normalizeLandingPageSections } from "@/lib/landing/page-sections";
import { ensureLandingTables } from "@/lib/landing/storage";
import { compileLandingSectionWidget } from "@/lib/landing/runtime";
import { GeminiProvider } from "@/lib/plugins/ai-chat/providers/gemini";
import { OpenAIProvider } from "@/lib/plugins/ai-chat/providers/openai";
import type { AIMessage, AIProvider } from "@/lib/plugins/ai-chat/types";

const homeSectionSchema = z.object({
  id: z.string().min(1),
  eyebrow: z.string().trim().min(1, "El badge es requerido.").max(120),
  title: z.string().trim().min(1, "El título es requerido.").max(220),
  description: z
    .string()
    .trim()
    .min(1, "La descripción es requerida.")
    .max(600),
  bullets: z.array(z.string().trim().min(1).max(180)).min(1).max(6),
});

const faqSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1, "La pregunta es requerida.").max(220),
  answer: z.string().trim().min(1, "La respuesta es requerida.").max(700),
});

const statItemSchema = z.object({
  id: z.string().min(1),
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(220),
});

const highlightItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(220),
});

const sectionUiSchema = z.enum(["left", "right", "bottom"]);

const sharedPageSectionSchema = {
  id: z.string().min(1),
  eyebrow: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(220),
  description: z.string().trim().min(1).max(500),
  uiPlacement: sectionUiSchema.default("right"),
  customCode: z.string().max(12000).default(""),
  compiledCustomCode: z.string().max(40000).nullable().optional().default(null),
};

const pageSectionSchema = z.discriminatedUnion("type", [
  z.object({
    ...sharedPageSectionSchema,
    type: z.literal("hero"),
    primaryCtaLabel: z.string().trim().min(1).max(80),
    primaryCtaHref: z.string().trim().min(1).max(200),
    secondaryCtaLabel: z.string().trim().min(1).max(80),
    secondaryCtaHref: z.string().trim().min(1).max(200),
  }),
  z.object({
    ...sharedPageSectionSchema,
    type: z.literal("stats"),
    items: z.array(statItemSchema).min(1).max(3),
  }),
  z.object({
    ...sharedPageSectionSchema,
    type: z.literal("highlights"),
    items: z.array(highlightItemSchema).min(1).max(4),
  }),
  z.object({
    ...sharedPageSectionSchema,
    type: z.literal("cta"),
    primaryCtaLabel: z.string().trim().min(1).max(80),
    primaryCtaHref: z.string().trim().min(1).max(200),
  }),
]);

const landingContentSchema = z.object({
  homeSections: z.array(homeSectionSchema).length(3),
  faqItems: z.array(faqSchema).min(15).max(30),
});

const landingPageSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido.").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "El slug es requerido.")
    .max(140)
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      "Usa solo letras, números y guiones.",
    ),
  contentMode: z.enum(["builder", "react"]).default("builder"),
  content: z.string().max(30000).default(""),
  externalPrompt: z.string().max(20000).default(""),
  sections: z.array(pageSectionSchema).min(1).max(16),
});

const createLandingPageSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido.").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "El slug es requerido.")
    .max(140)
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      "Usa solo letras, números y guiones.",
    ),
});

const generatePageCodeSchema = z.object({
  pageId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(140),
  prompt: z
    .string()
    .trim()
    .min(10, "Describe mejor lo que quieres generar.")
    .max(6000),
  externalPrompt: z.string().max(20000).optional().default(""),
});

async function verifyAdmin() {
  const user = await getUser();

  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

function revalidateLanding(slug?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/admin/landing");
  revalidatePath("/admin/landing/pages");
  if (slug) {
    revalidatePath(`/${slug}`);
  }
}

function getLandingPageGeneratorProvider(): AIProvider {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (openAiApiKey) {
    return new OpenAIProvider({
      apiKey: openAiApiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      maxOutputTokens: 2200,
      systemPrompt: "You generate production-ready TSX for a Next.js app.",
    });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiApiKey) {
    return new GeminiProvider({
      apiKey: geminiApiKey,
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      temperature: 0.4,
      maxOutputTokens: 2200,
      systemPrompt: "You generate production-ready TSX for a Next.js app.",
    });
  }

  throw new Error(
    "No hay proveedor de IA configurado. Define OPENAI_API_KEY o GEMINI_API_KEY/GOOGLE_API_KEY en el servidor.",
  );
}

function buildLandingPageGenerationPrompt(
  input: z.infer<typeof generatePageCodeSchema>,
) {
  return [
    "Genera únicamente código TSX válido para una página custom del sistema.",
    "Stack actual identificado: React 19 + Next.js App Router + Tailwind CSS v4 + componentes shadcn/ui.",
    "No uses imports. Debes asumir que ya existen en el scope: React, Link, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, cn, ArrowRight, CheckCircle2, Sparkles, Bot, MessageSquare, BarChart3, Users, ShieldCheck, Workflow, Target, Zap.",
    "Entrega SOLO código. Sin markdown, sin fences, sin explicaciones.",
    "Debes exportar default una función llamada LandingPage.",
    "Usa className con utilidades Tailwind compatibles con el sistema. Prefiere tokens existentes como bg-background, text-foreground, text-muted-foreground, border-border, bg-primary/10, rounded-3xl, grid, gap-6, px-6, py-16.",
    "No uses hooks ni acceso a window/document.",
    'Si agregas links internos usa <Link href="/...">.',
    "La página debe ser visualmente completa y responsive.",
    `Nombre de página: ${input.name}`,
    `Slug público: /${input.slug}`,
    input.externalPrompt?.trim()
      ? `Prompt base adicional para reutilizar: ${input.externalPrompt.trim()}`
      : "",
    `Solicitud específica del usuario: ${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function compileSectionsForStorage(sections: z.infer<typeof pageSectionSchema>[]) {
  return Promise.all(
    normalizeLandingPageSections(sections, "Página custom").map(async (section) => ({
      ...section,
      compiledCustomCode: section.customCode.trim()
        ? await compileLandingSectionWidget(section.customCode)
        : null,
    })),
  );
}

function normalizeGeneratedTsx(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("La IA no devolvió código.");
  }

  const withoutFence = trimmed
    .replace(/^```(?:tsx|jsx|ts|js)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  if (!withoutFence.includes("export default")) {
    throw new Error(
      "La IA no devolvió un componente válido con export default.",
    );
  }

  return withoutFence;
}

export async function updateLandingContent(
  payload: z.infer<typeof landingContentSchema>,
) {
  try {
    await verifyAdmin();
    const validated = landingContentSchema.parse(payload);
    await ensureLandingTables();
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
      message:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el contenido.",
    };
  }
}

export async function resetLandingContent() {
  try {
    await verifyAdmin();
    await ensureLandingTables();
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
      message:
        error instanceof Error
          ? error.message
          : "No se pudo restaurar el contenido.",
    };
  }
}

export async function createLandingPage(
  payload: z.infer<typeof createLandingPageSchema>,
) {
  try {
    await verifyAdmin();
    const validated = createLandingPageSchema.parse(payload);
    await ensureLandingTables();

    const [created] = await db
      .insert(landingPages)
      .values({
        name: validated.name,
        slug: validated.slug,
        contentMode: "builder",
        content: "",
        externalPrompt: "",
        sections: createDefaultLandingPageSections(validated.name),
      })
      .returning({ id: landingPages.id, slug: landingPages.slug });

    revalidateLanding(validated.slug);
    return { success: true as const, pageId: created.id, slug: created.slug };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        error instanceof Error ? error.message : "No se pudo crear la página.",
    };
  }
}

export async function updateLandingPage(
  payload: z.infer<typeof landingPageSchema> & { id: number },
) {
  try {
    await verifyAdmin();
    const validatedPage = landingPageSchema.parse(payload);
    const compiledSections = await compileSectionsForStorage(validatedPage.sections);
    await ensureLandingTables();

    const [existing] = await db
      .select({ slug: landingPages.slug })
      .from(landingPages)
      .where(eq(landingPages.id, payload.id))
      .limit(1);

    if (!existing) {
      throw new Error("La página no existe.");
    }

    await db
      .update(landingPages)
      .set({
        name: validatedPage.name,
        slug: validatedPage.slug,
        contentMode: validatedPage.contentMode,
        content: validatedPage.content,
        externalPrompt: validatedPage.externalPrompt,
        sections: compiledSections,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, payload.id));

    revalidateLanding(existing.slug);
    revalidateLanding(validatedPage.slug);
    return { success: true as const, slug: validatedPage.slug };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la página.",
    };
  }
}

export async function compileLandingSectionCode(payload: { code: string }) {
  try {
    await verifyAdmin();
    const compiledCode = await compileLandingSectionWidget(payload.code);

    return { success: true as const, compiledCode };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo compilar la UI de la sección.",
    };
  }
}

export async function generateLandingPageCode(
  payload: z.infer<typeof generatePageCodeSchema>,
) {
  try {
    await verifyAdmin();
    const validated = generatePageCodeSchema.parse(payload);
    const provider = getLandingPageGeneratorProvider();

    const messages: AIMessage[] = [
      {
        role: "system",
        content: buildLandingPageGenerationPrompt(validated),
      },
      {
        role: "user",
        content: `Genera el TSX completo para /${validated.slug}.`,
      },
    ];

    const response = await provider.generateResponse(messages);
    const code = normalizeGeneratedTsx(response.content ?? "");

    return {
      success: true as const,
      code,
      prompt: buildLandingPageGenerationPrompt(validated),
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo generar el código.",
    };
  }
}

export async function deleteLandingPage(id: number) {
  try {
    await verifyAdmin();
    await ensureLandingTables();
    const [existing] = await db
      .select({ slug: landingPages.slug })
      .from(landingPages)
      .where(eq(landingPages.id, id))
      .limit(1);

    if (!existing) {
      throw new Error("La página no existe.");
    }

    await db.delete(landingPages).where(eq(landingPages.id, id));

    revalidateLanding(existing.slug);
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la página.",
    };
  }
}
