"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LandingPage } from "@/lib/db/schema";
import type { LandingPageSection } from "@/lib/landing/types";
import {
  generateLandingPageCode,
  updateLandingPage,
} from "../../landing-actions";

function encodeStats(
  items: { value: string; label: string; description: string }[],
) {
  return items
    .map((item) => `${item.value} | ${item.label} | ${item.description}`)
    .join("\n");
}

function decodeStats(
  raw: string,
  current: Extract<LandingPageSection, { type: "stats" }>["items"],
) {
  return raw
    .split("\n")
    .map((line, index) => {
      const [value = "", label = "", description = ""] = line
        .split("|")
        .map((item) => item.trim());
      return {
        id: current[index]?.id ?? `stat-${index + 1}`,
        value,
        label,
        description,
      };
    })
    .filter((item) => item.value || item.label || item.description)
    .slice(0, 3);
}

function encodeHighlights(items: { title: string; description: string }[]) {
  return items.map((item) => `${item.title} | ${item.description}`).join("\n");
}

function decodeHighlights(
  raw: string,
  current: Extract<LandingPageSection, { type: "highlights" }>["items"],
) {
  return raw
    .split("\n")
    .map((line, index) => {
      const [title = "", description = ""] = line
        .split("|")
        .map((item) => item.trim());
      return {
        id: current[index]?.id ?? `highlight-${index + 1}`,
        title,
        description,
      };
    })
    .filter((item) => item.title || item.description)
    .slice(0, 4);
}

function getSectionName(section: LandingPageSection) {
  if (section.type === "hero") return "Hero";
  if (section.type === "stats") return "Métricas";
  if (section.type === "highlights") return "Highlights";
  return "CTA final";
}

const defaultExternalPrompt = `Crea una página en TSX para React/Next.js App Router usando Tailwind del sistema y componentes estilo shadcn/ui.
Requisitos:
- export default function LandingPage()
- Sin imports
- Responsive
- Usar clases utilitarias ya presentes en el sistema: bg-background, text-foreground, text-muted-foreground, border-border, rounded-3xl, px-6, py-16, grid, gap-6
- CTAs visibles y una jerarquía clara
- Compatible con scope: React, Link, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, cn y algunos iconos lucide.
Entrega solo TSX.`;

export function LandingPageEditorClient({
  initialPage,
}: {
  initialPage: LandingPage;
}) {
  const router = useRouter();
  const [page, setPage] = useState<LandingPage>({
    ...initialPage,
    contentMode: initialPage.contentMode ?? "builder",
    externalPrompt: initialPage.externalPrompt || defaultExternalPrompt,
  });
  const [generatorPrompt, setGeneratorPrompt] = useState(
    "Genera una página de alto impacto con hero, beneficios, prueba social, métricas y CTA final.",
  );
  const [isSaving, startSaving] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  const sectionSummary = useMemo(
    () =>
      page.sections.map((section) => ({
        id: section.id,
        label: getSectionName(section),
        title: section.title,
      })),
    [page.sections],
  );

  function updateSection(
    sectionId: string,
    updater: (section: LandingPageSection) => LandingPageSection,
  ) {
    setPage((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? updater(section) : section,
      ),
    }));
  }

  function handleSave() {
    startSaving(async () => {
      const result = await updateLandingPage(page);
      if (!result.success) {
        toast.error("No se pudo guardar la página", {
          description: result.message,
        });
        return;
      }

      toast.success("Página actualizada", {
        description: `Se guardaron los cambios de /${result.slug}.`,
      });
      router.refresh();
    });
  }

  function handleGenerateWithAi() {
    startGenerating(async () => {
      const result = await generateLandingPageCode({
        pageId: page.id,
        name: page.name,
        slug: page.slug,
        prompt: generatorPrompt,
        externalPrompt: page.externalPrompt || "",
      });

      if (!result.success) {
        toast.error("No se pudo generar el código", {
          description: result.message,
        });
        return;
      }

      setPage((current) => ({
        ...current,
        contentMode: "react",
        content: result.code,
        externalPrompt: result.prompt,
      }));
      toast.success("Código generado", {
        description:
          "Revisa el resultado, ajusta lo que necesites y guarda la página.",
      });
    });
  }

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{page.name}</CardTitle>
            <CardDescription>
              Editor individual con builder visual o código React. Ruta pública:
              /{page.slug}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/landing/pages">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver a páginas
              </Button>
            </Link>
            <Link href={`/${page.slug}`} target="_blank">
              <Button variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" /> Ver pública
              </Button>
            </Link>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />{" "}
              {isSaving ? "Guardando..." : "Guardar página"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos base</CardTitle>
          <CardDescription>
            El sistema actual renderiza páginas custom con React/Next.js +
            Tailwind CSS + componentes estilo shadcn/ui.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={page.name}
              onChange={(event) =>
                setPage((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input
              value={page.slug}
              onChange={(event) =>
                setPage((current) => ({ ...current, slug: event.target.value }))
              }
            />
          </div>
          <div className="space-y-3 md:col-span-2">
            <Label>Modo de contenido</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className={`rounded-2xl border p-4 text-left transition ${page.contentMode === "builder" ? "border-primary bg-primary/5" : "border-border/60 bg-background"}`}
                onClick={() =>
                  setPage((current) => ({ ...current, contentMode: "builder" }))
                }
              >
                <p className="font-semibold">Builder visual</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usa las 4 secciones tipadas del sistema para editar la página
                  sin código.
                </p>
              </button>
              <button
                type="button"
                className={`rounded-2xl border p-4 text-left transition ${page.contentMode === "react" ? "border-primary bg-primary/5" : "border-border/60 bg-background"}`}
                onClick={() =>
                  setPage((current) => ({ ...current, contentMode: "react" }))
                }
              >
                <p className="font-semibold">Código React</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Renderiza TSX con el stack actual: React + Next + Tailwind +
                  UI del sistema.
                </p>
              </button>
            </div>
          </div>

          {page.contentMode === "builder" ? (
            <div className="space-y-2 md:col-span-2">
              <Label>Contenido legacy / notas extra</Label>
              <Textarea
                rows={5}
                value={page.content}
                onChange={(event) =>
                  setPage((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                placeholder="Texto libre opcional para reforzar la página builder."
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {page.contentMode === "builder" ? (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit xl:sticky xl:top-6">
            <CardHeader>
              <CardTitle>Mapa visual</CardTitle>
              <CardDescription>
                Estas son las 4 secciones activas de esta página.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sectionSummary.map((section, index) => (
                <div
                  key={section.id}
                  className="rounded-2xl border border-border/60 bg-muted/20 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                    Bloque {index + 1}
                  </p>
                  <p className="mt-2 font-medium">{section.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {section.title}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {page.sections.map((section) => {
              if (section.type === "hero") {
                return (
                  <Card key={section.id}>
                    <CardHeader>
                      <CardTitle>Builder · Hero</CardTitle>
                      <CardDescription>
                        Reutiliza el bloque de apertura y CTA principal del
                        sistema.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
                        <p className="text-xs uppercase tracking-[0.3em] text-primary">
                          {section.eyebrow}
                        </p>
                        <h3 className="mt-3 text-2xl font-bold">
                          {section.title}
                        </h3>
                        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                          {section.description}
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Eyebrow</Label>
                          <Input
                            value={section.eyebrow}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                eyebrow: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Título</Label>
                          <Textarea
                            rows={3}
                            value={section.title}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Descripción</Label>
                          <Textarea
                            rows={4}
                            value={section.description}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CTA principal</Label>
                          <Input
                            value={section.primaryCtaLabel}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                primaryCtaLabel: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>URL CTA principal</Label>
                          <Input
                            value={section.primaryCtaHref}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                primaryCtaHref: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CTA secundaria</Label>
                          <Input
                            value={section.secondaryCtaLabel}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                secondaryCtaLabel: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>URL CTA secundaria</Label>
                          <Input
                            value={section.secondaryCtaHref}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                secondaryCtaHref: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              if (section.type === "stats") {
                return (
                  <Card key={section.id}>
                    <CardHeader>
                      <CardTitle>Builder · Métricas</CardTitle>
                      <CardDescription>
                        Recicla la franja de impacto del home para contar
                        resultados rápidos.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Eyebrow</Label>
                          <Input
                            value={section.eyebrow}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                eyebrow: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Título</Label>
                          <Textarea
                            rows={3}
                            value={section.title}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Descripción</Label>
                          <Textarea
                            rows={4}
                            value={section.description}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>
                            Métricas (formato: valor | etiqueta | descripción)
                          </Label>
                          <Textarea
                            rows={5}
                            value={encodeStats(section.items)}
                            onChange={(event) =>
                              updateSection(section.id, (current) =>
                                current.type === "stats"
                                  ? {
                                      ...current,
                                      items: decodeStats(
                                        event.target.value,
                                        current.items,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              if (section.type === "highlights") {
                return (
                  <Card key={section.id}>
                    <CardHeader>
                      <CardTitle>Builder · Highlights</CardTitle>
                      <CardDescription>
                        Reutiliza tarjetas informativas del sistema para vender
                        beneficios sin código.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Eyebrow</Label>
                          <Input
                            value={section.eyebrow}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                eyebrow: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Título</Label>
                          <Textarea
                            rows={3}
                            value={section.title}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Descripción</Label>
                          <Textarea
                            rows={4}
                            value={section.description}
                            onChange={(event) =>
                              updateSection(section.id, (current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>
                            Tarjetas (formato: título | descripción)
                          </Label>
                          <Textarea
                            rows={6}
                            value={encodeHighlights(section.items)}
                            onChange={(event) =>
                              updateSection(section.id, (current) =>
                                current.type === "highlights"
                                  ? {
                                      ...current,
                                      items: decodeHighlights(
                                        event.target.value,
                                        current.items,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={section.id}>
                  <CardHeader>
                    <CardTitle>Builder · CTA final</CardTitle>
                    <CardDescription>
                      Cierra la página con el bloque final que ya usas en la
                      landing principal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Eyebrow</Label>
                        <Input
                          value={section.eyebrow}
                          onChange={(event) =>
                            updateSection(section.id, (current) => ({
                              ...current,
                              eyebrow: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Título</Label>
                        <Textarea
                          rows={3}
                          value={section.title}
                          onChange={(event) =>
                            updateSection(section.id, (current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Descripción</Label>
                        <Textarea
                          rows={4}
                          value={section.description}
                          onChange={(event) =>
                            updateSection(section.id, (current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Texto del botón</Label>
                        <Input
                          value={section.primaryCtaLabel}
                          onChange={(event) =>
                            updateSection(section.id, (current) => ({
                              ...current,
                              primaryCtaLabel: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>URL del botón</Label>
                        <Input
                          value={section.primaryCtaHref}
                          onChange={(event) =>
                            updateSection(section.id, (current) => ({
                              ...current,
                              primaryCtaHref: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Generador React</CardTitle>
                  <CardDescription>
                    Crea código TSX compatible con el stack actual y úsalo como
                    render principal de la página.
                  </CardDescription>
                </div>
                <Button onClick={handleGenerateWithAi} disabled={isGenerating}>
                  <Sparkles className="mr-2 h-4 w-4" />{" "}
                  {isGenerating ? "Generando..." : "Generar con IA"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt de generación</Label>
                <Textarea
                  rows={4}
                  value={generatorPrompt}
                  onChange={(event) => setGeneratorPrompt(event.target.value)}
                  placeholder="Describe la estructura, tono, secciones, CTA y estilo que quieres para la página."
                />
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                Se compila como TSX y se renderiza con el stack detectado del
                sistema:{" "}
                <span className="font-medium text-foreground">
                  React + Next.js App Router + Tailwind CSS + shadcn/ui
                </span>
                .
              </div>
              <div className="space-y-2">
                <Label>Código de la página</Label>
                <Textarea
                  rows={24}
                  value={page.content}
                  onChange={(event) =>
                    setPage((current) => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                  placeholder={`export default function LandingPage() {\n  return <section className="px-6 py-16">...</section>;\n}`}
                  className="font-mono text-xs leading-6"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prompt reusable para otras plataformas</CardTitle>
          <CardDescription>
            Déjalo listo para copiar/pegar en otras IA o generadores externos.
            Este cuadro queda guardado con la página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={12}
            value={page.externalPrompt || ""}
            onChange={(event) =>
              setPage((current) => ({
                ...current,
                externalPrompt: event.target.value,
              }))
            }
            className="font-mono text-xs leading-6"
          />
        </CardContent>
      </Card>
    </div>
  );
}
