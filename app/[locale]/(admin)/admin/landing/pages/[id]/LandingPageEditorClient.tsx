"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  ExternalLink,
  Layers3,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { PublicLandingPageBuilder } from "@/components/landing/public-page-builder";
import { LandingSectionWidgetRenderer } from "@/components/landing/section-widget-renderer";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LandingPage } from "@/lib/db/schema";
import { createLandingPageSectionTemplate } from "@/lib/landing/page-sections";
import type { LandingPageSection } from "@/lib/landing/types";
import {
  compileLandingSectionCode,
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
  return "CTA";
}

function getSectionDescription(section: LandingPageSection) {
  if (section.type === "hero") {
    return "Promesa principal, CTAs y UI de apertura.";
  }
  if (section.type === "stats") {
    return "Prueba con métricas y soporte visual.";
  }
  if (section.type === "highlights") {
    return "Bloques de beneficios y contenido explicativo.";
  }
  return "Cierre final con llamada a la acción.";
}

function getSectionFallback(section: LandingPageSection) {
  if (section.type === "hero") {
    return (
      <div className="rounded-[28px] border border-primary/20 bg-background p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          {section.eyebrow}
        </p>
        <div className="mt-4 space-y-3">
          <div className="h-3 w-24 rounded-full bg-primary/20" />
          <div className="h-3 w-full rounded-full bg-muted" />
          <div className="h-3 w-4/5 rounded-full bg-muted" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button className="rounded-full">{section.primaryCtaLabel}</Button>
          <Button variant="outline" className="rounded-full">
            {section.secondaryCtaLabel}
          </Button>
        </div>
      </div>
    );
  }

  if (section.type === "stats") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {section.items.map((item) => (
          <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-4">
            <p className="text-xl font-bold text-primary">{item.value}</p>
            <p className="font-medium">{item.label}</p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === "highlights") {
    return (
      <div className="grid gap-3">
        {section.items.map((item) => (
          <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-4">
            <p className="font-medium">{item.title}</p>
            <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === "cta") {
    return (
      <div className="rounded-[28px] border border-primary/20 bg-primary/10 p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          {section.eyebrow}
        </p>
        <p className="mt-4 text-lg font-semibold">{section.primaryCtaLabel}</p>
        <div className="mx-auto mt-4 h-24 w-24 rounded-full bg-primary/15" />
      </div>
    );
  }

  // components section
  return (
    <div className="grid gap-3">
      {section.items.map((item) => (
        <div key={item.id} className="rounded-3xl border border-border/60 bg-background p-4">
          <p className="font-medium">{item.label}</p>
          <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
  );
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

type EditorTab = "general" | "sections" | "react" | "prompt";

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
  const [activeTab, setActiveTab] = useState<EditorTab>("sections");
  const [activeSectionId, setActiveSectionId] = useState(
    initialPage.sections[0]?.id ?? "",
  );
  const [generatorPrompt, setGeneratorPrompt] = useState(
    "Genera una página de alto impacto con hero, beneficios, prueba social, métricas y CTA final.",
  );
  const [isSaving, startSaving] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [isCompilingSection, startCompilingSection] = useTransition();

  const activeSection = useMemo(
    () => page.sections.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, page.sections],
  );

  useEffect(() => {
    if (!page.sections.length) {
      setActiveSectionId("");
      return;
    }

    if (!page.sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(page.sections[0]?.id ?? "");
    }
  }, [activeSectionId, page.sections]);

  function setSections(updater: (sections: LandingPageSection[]) => LandingPageSection[]) {
    setPage((current) => ({ ...current, sections: updater(current.sections) }));
  }

  function updateSection(
    sectionId: string,
    updater: (section: LandingPageSection) => LandingPageSection,
  ) {
    setSections((sections) =>
      sections.map((section) =>
        section.id === sectionId ? updater(section) : section,
      ),
    );
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    setSections((sections) => {
      const index = sections.findIndex((section) => section.id === sectionId);
      if (index === -1) return sections;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= sections.length) return sections;
      const copy = [...sections];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  function duplicateSection(sectionId: string) {
    setSections((sections) => {
      const index = sections.findIndex((section) => section.id === sectionId);
      if (index === -1) return sections;
      const source = sections[index];
      const duplicate = createLandingPageSectionTemplate(
        source.type,
        `${page.name} · ${getSectionName(source)}`,
        page.content,
      );
      const hydrated = {
        ...duplicate,
        ...source,
        id: `${source.type}-${Date.now()}`,
        title: `${source.title} copia`,
      } as LandingPageSection;
      const next = [...sections];
      next.splice(index + 1, 0, hydrated);
      return next;
    });
  }

  function removeSection(sectionId: string) {
    setSections((sections) => sections.filter((section) => section.id !== sectionId));
  }

  function addSection(type: LandingPageSection["type"]) {
    const section = createLandingPageSectionTemplate(type, page.name, page.content);
    setSections((sections) => [...sections, section]);
    setActiveSectionId(section.id);
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
      setActiveTab("react");
      toast.success("Código generado", {
        description:
          "Revisa el resultado, ajusta lo que necesites y guarda la página.",
      });
    });
  }

  function handleCompileSection() {
    if (!activeSection) return;

    startCompilingSection(async () => {
      const result = await compileLandingSectionCode({
        code: activeSection.customCode,
      });

      if (!result.success) {
        toast.error("No se pudo compilar la UI", {
          description: result.message,
        });
        return;
      }

      updateSection(activeSection.id, (current) => ({
        ...current,
        compiledCustomCode: result.compiledCode ?? null,
      }));
      toast.success("UI renderizada", {
        description:
          "La previsualización de la sección ya usa el código custom actual.",
      });
    });
  }

  const sectionSummary = page.sections.map((section, index) => ({
    id: section.id,
    label: getSectionName(section),
    title: section.title,
    placement:
      section.uiPlacement === "left"
        ? "UI izquierda"
        : section.uiPlacement === "right"
          ? "UI derecha"
          : "UI abajo",
    index,
  }));

  return (
    <div className="space-y-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{page.name}</CardTitle>
            <CardDescription>
              Editor con subsidebar por tabs para datos base, secciones,
              código React y prompts. Ruta pública: /{page.slug}
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
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar página"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EditorTab)}>
        <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
          <Card className="h-fit xl:sticky xl:top-6">
            <CardHeader>
              <CardTitle>Edición</CardTitle>
              <CardDescription>
                Usa esta subsidebar para moverte entre todas las opciones del editor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0">
                <TabsTrigger value="general" className="justify-start rounded-2xl border px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5">
                  General
                </TabsTrigger>
                <TabsTrigger value="sections" className="justify-start rounded-2xl border px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5">
                  Secciones
                </TabsTrigger>
                <TabsTrigger value="react" className="justify-start rounded-2xl border px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5">
                  React / IA
                </TabsTrigger>
                <TabsTrigger value="prompt" className="justify-start rounded-2xl border px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5">
                  Prompt externo
                </TabsTrigger>
              </TabsList>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <TabsContent value="general" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Datos base</CardTitle>
                  <CardDescription>
                    Ajusta nombre, slug y el modo principal de render.
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
                    <Label>Modo principal</Label>
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
                          La página arranca con secciones de ejemplo, permite agregar más,
                          reorganizarlas y editar UI por bloque.
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
                          Usa TSX completo para tomar el control total del render de la página.
                        </p>
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-2 rounded-3xl border border-border/60 bg-muted/20 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{page.sections.length} secciones</Badge>
                      <Badge variant="secondary">
                        {page.contentMode === "builder" ? "Modo builder activo" : "Modo React activo"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Aunque renderices en modo React, las secciones del builder quedan guardadas
                      como estructura reusable para volver atrás cuando quieras.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sections" className="mt-0 space-y-6">
              <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)]">
                <Card className="h-fit 2xl:sticky 2xl:top-6">
                  <CardHeader>
                    <CardTitle>Secciones</CardTitle>
                    <CardDescription>
                      Reorganiza, duplica o agrega nuevas secciones con UI izquierda,
                      derecha o abajo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {sectionSummary.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setActiveSectionId(section.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${activeSectionId === section.id ? "border-primary bg-primary/5" : "border-border/60 bg-background"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                                Bloque {section.index + 1}
                              </p>
                              <p className="mt-2 font-medium">{section.label}</p>
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {section.title}
                              </p>
                            </div>
                            <Badge variant="outline">{section.placement}</Badge>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-dashed border-border/60 p-4">
                      <p className="text-sm font-semibold">Agregar sección</p>
                      <div className="mt-3 grid gap-2">
                        <Button type="button" variant="outline" onClick={() => addSection("hero")}>
                          <Plus className="mr-2 h-4 w-4" /> Hero
                        </Button>
                        <Button type="button" variant="outline" onClick={() => addSection("stats")}>
                          <Plus className="mr-2 h-4 w-4" /> Métricas
                        </Button>
                        <Button type="button" variant="outline" onClick={() => addSection("highlights")}>
                          <Plus className="mr-2 h-4 w-4" /> Highlights
                        </Button>
                        <Button type="button" variant="outline" onClick={() => addSection("cta")}>
                          <Plus className="mr-2 h-4 w-4" /> CTA
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  {activeSection ? (
                    <Card>
                      <CardHeader>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Layers3 className="h-5 w-5 text-primary" />
                              {getSectionName(activeSection)}
                            </CardTitle>
                            <CardDescription>
                              {getSectionDescription(activeSection)}
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => moveSection(activeSection.id, "up")}
                            >
                              <ArrowUp className="mr-2 h-4 w-4" /> Subir
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => moveSection(activeSection.id, "down")}
                            >
                              <ArrowDown className="mr-2 h-4 w-4" /> Bajar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => duplicateSection(activeSection.id)}
                            >
                              <Copy className="mr-2 h-4 w-4" /> Duplicar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeSection(activeSection.id)}
                              disabled={page.sections.length === 1}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Eyebrow</Label>
                            <Input
                              value={activeSection.eyebrow}
                              onChange={(event) =>
                                updateSection(activeSection.id, (current) => ({
                                  ...current,
                                  eyebrow: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Posición de la UI</Label>
                            <Select
                              value={activeSection.uiPlacement}
                              onValueChange={(value) =>
                                updateSection(activeSection.id, (current) => ({
                                  ...current,
                                  uiPlacement: value as LandingPageSection["uiPlacement"],
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">Izquierda</SelectItem>
                                <SelectItem value="right">Derecha</SelectItem>
                                <SelectItem value="bottom">Abajo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>Título</Label>
                            <Textarea
                              rows={3}
                              value={activeSection.title}
                              onChange={(event) =>
                                updateSection(activeSection.id, (current) => ({
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
                              value={activeSection.description}
                              onChange={(event) =>
                                updateSection(activeSection.id, (current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                            />
                          </div>

                          {activeSection.type === "hero" ? (
                            <>
                              <div className="space-y-2">
                                <Label>CTA principal</Label>
                                <Input
                                  value={activeSection.primaryCtaLabel}
                                  onChange={(event) =>
                                    updateSection(activeSection.id, (current) =>
                                      current.type === "hero"
                                        ? {
                                            ...current,
                                            primaryCtaLabel: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>URL CTA principal</Label>
                                <Input
                                  value={activeSection.primaryCtaHref}
                                  onChange={(event) =>
                                    updateSection(activeSection.id, (current) =>
                                      current.type === "hero"
                                        ? {
                                            ...current,
                                            primaryCtaHref: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>CTA secundaria</Label>
                                <Input
                                  value={activeSection.secondaryCtaLabel}
                                  onChange={(event) =>
                                    updateSection(activeSection.id, (current) =>
                                      current.type === "hero"
                                        ? {
                                            ...current,
                                            secondaryCtaLabel: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>URL CTA secundaria</Label>
                                <Input
                                  value={activeSection.secondaryCtaHref}
                                  onChange={(event) =>
                                    updateSection(activeSection.id, (current) =>
                                      current.type === "hero"
                                        ? {
                                            ...current,
                                            secondaryCtaHref: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </div>
                            </>
                          ) : null}

                          {activeSection.type === "stats" ? (
                            <div className="space-y-2 md:col-span-2">
                              <Label>Métricas (valor | etiqueta | descripción)</Label>
                              <Textarea
                                rows={5}
                                value={encodeStats(activeSection.items)}
                                onChange={(event) =>
                                  updateSection(activeSection.id, (current) =>
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
                          ) : null}

                          {activeSection.type === "highlights" ? (
                            <div className="space-y-2 md:col-span-2">
                              <Label>Tarjetas (título | descripción)</Label>
                              <Textarea
                                rows={6}
                                value={encodeHighlights(activeSection.items)}
                                onChange={(event) =>
                                  updateSection(activeSection.id, (current) =>
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
                          ) : null}

                          {activeSection.type === "cta" ? (
                            <>
                              <div className="space-y-2">
                                <Label>Texto del botón</Label>
                                <Input
                                  value={activeSection.primaryCtaLabel}
                                  onChange={(event) =>
                                    updateSection(activeSection.id, (current) =>
                                      current.type === "cta"
                                        ? {
                                            ...current,
                                            primaryCtaLabel: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>URL del botón</Label>
                                <Input
                                  value={activeSection.primaryCtaHref}
                                  onChange={(event) =>
                                    updateSection(activeSection.id, (current) =>
                                      current.type === "cta"
                                        ? {
                                            ...current,
                                            primaryCtaHref: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </div>
                            </>
                          ) : null}
                        </div>

                        <div className="rounded-3xl border border-border/60 p-5">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="font-semibold">Cuadro de código para la UI</p>
                              <p className="text-sm text-muted-foreground">
                                Escribe JSX del bloque visual. Tendrás acceso a `section`, Button,
                                Card, Badge, Link, cn e iconos lucide del scope del editor.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleCompileSection}
                              disabled={isCompilingSection}
                            >
                              <Wand2 className="mr-2 h-4 w-4" />
                              {isCompilingSection ? "Renderizando..." : "Renderizar UI"}
                            </Button>
                          </div>
                          <Textarea
                            rows={14}
                            value={activeSection.customCode}
                            onChange={(event) =>
                              updateSection(activeSection.id, (current) => ({
                                ...current,
                                customCode: event.target.value,
                              }))
                            }
                            className="mt-4 font-mono text-xs leading-6"
                            placeholder={`<div className="rounded-3xl border border-border/60 bg-background p-6">
  <p className="text-sm font-semibold">{section.title}</p>
</div>`}
                          />
                          <div className="mt-4 rounded-3xl border border-dashed border-border/60 bg-muted/10 p-4">
                            <p className="mb-3 text-sm font-medium">Preview de la UI de la sección</p>
                            <LandingSectionWidgetRenderer
                              section={activeSection}
                              compiledCode={activeSection.compiledCustomCode}
                              sourceCode={activeSection.customCode}
                              fallback={getSectionFallback(activeSection)}
                              showErrors
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card>
                    <CardHeader>
                      <CardTitle>Preview del builder</CardTitle>
                      <CardDescription>
                        Esta página siempre nace con secciones de ejemplo y desde aquí puedes
                        seguir agregando o reacomodando bloques antes de guardar.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PublicLandingPageBuilder sections={page.sections} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="react" className="mt-0 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle>Generador React</CardTitle>
                      <CardDescription>
                        Crea TSX completo compatible con el stack actual y úsalo como render
                        principal de la página cuando quieras salir del builder.
                      </CardDescription>
                    </div>
                    <Button onClick={handleGenerateWithAi} disabled={isGenerating}>
                      <Sparkles className="mr-2 h-4 w-4" />
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
                    Se compila como TSX y se renderiza con el stack detectado del sistema:
                    <span className="font-medium text-foreground">
                      {" "}React + Next.js App Router + Tailwind CSS + shadcn/ui
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
            </TabsContent>

            <TabsContent value="prompt" className="mt-0 space-y-6">
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
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
