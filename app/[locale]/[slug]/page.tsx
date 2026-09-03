import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/interface/Logo";
import { PublicLandingPageBuilder } from "@/components/landing/public-page-builder";
import { RuntimeLandingPageRenderer } from "@/components/landing/runtime-page-renderer";
import { HtmlLandingRenderer } from "@/components/landing/html-page-renderer";
import { sanitizeLandingCss, sanitizeLandingHtml } from "@/lib/landing/sanitize";
import { Button } from "@/components/ui/button";
import { getBranding } from "@/lib/db/queries/branding";
import { getLandingPageBySlug } from "@/lib/db/queries/landing";
import { compileLandingPageComponent } from "@/lib/landing/runtime";
import { brandName } from '@/lib/branding/constants';
import { getTenantId } from "@/lib/tenant/context";

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = await params;
  const resellerId = await getTenantId();
  const page = await getLandingPageBySlug(slug, resellerId);

  if (!page) {
    notFound();
  }

  const branding = await getBranding();
  const siteName = brandName(branding);

  // Igual que en la home: la rama HTML va antes, o el markup se imprimiría como texto.
  if (page.contentMode === "html") {
    return (
      <main className="min-h-screen bg-background">
        <HtmlLandingRenderer
          html={sanitizeLandingHtml(page.content)}
          customCss={sanitizeLandingCss(page.customCss)}
        />
      </main>
    );
  }

  const shouldRenderReact =
    page.contentMode === "react" && page.content.trim().length > 0;
  const compiledCode = shouldRenderReact
    ? await compileLandingPageComponent(page.content)
    : null;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Logo />
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio
            </Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          {siteName}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">/{page.slug}</p>

        <div className="mt-8">
          {shouldRenderReact ? (
            <RuntimeLandingPageRenderer
              compiledCode={compiledCode}
              sourceCode={page.content}
            />
          ) : (
            <PublicLandingPageBuilder sections={page.sections} />
          )}
        </div>

        {!shouldRenderReact && page.content.trim() ? (
          <article className="prose prose-zinc mt-10 max-w-none whitespace-pre-wrap rounded-[32px] border border-border/60 bg-muted/20 p-8 text-base leading-8 text-foreground dark:prose-invert">
            {page.content}
          </article>
        ) : null}
      </section>
    </main>
  );
}
