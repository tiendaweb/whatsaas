import { PublicLandingPageBuilder } from "@/components/landing/public-page-builder";
import { PublicHeader } from "@/components/landing/public-header";
import { RuntimeLandingPageRenderer } from "@/components/landing/runtime-page-renderer";
import { HtmlLandingRenderer } from "@/components/landing/html-page-renderer";
import { sanitizeLandingCss, sanitizeLandingHtml } from "@/lib/landing/sanitize";
import { getBranding } from "@/lib/db/queries/branding";
import { getLandingPageBySlug } from "@/lib/db/queries/landing";
import { compileLandingPageComponent } from "@/lib/landing/runtime";
import DashboardHomePage from "./(dashboard)/home-content";
import { brandName } from '@/lib/branding/constants';
import { getTenantId } from "@/lib/tenant/context";

export default async function PublicHomePage() {
  // La landing raíz es la del tenant del dominio: cada reseller tiene la suya.
  const resellerId = await getTenantId();
  const page = await getLandingPageBySlug("", resellerId);

  if (!page) {
    return (
      <>
        <PublicHeader />
        <DashboardHomePage />
      </>
    );
  }

  const branding = await getBranding();
  const siteName = brandName(branding);

  // El modo HTML se resuelve ANTES que nada: si cayera al bloque `prose` de abajo,
  // el HTML del reseller se imprimiría como texto plano, con etiquetas y todo.
  if (page.contentMode === "html") {
    // Se sanea aquí, en el servidor, para que el HTML sin filtrar ni siquiera viaje
    // en el payload que se manda al navegador.
    return (
      <main className="min-h-screen bg-background">
        {page.hideChrome ? null : <PublicHeader />}
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
      <PublicHeader />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          {siteName}
        </p>

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
