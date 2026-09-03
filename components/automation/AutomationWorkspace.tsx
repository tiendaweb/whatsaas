"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Bot,
  Edit3,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Folders,
  GitMerge,
  MoreHorizontal,
  Smartphone,
  Trash2,
  Unlink,
} from "lucide-react";
import { useRouter } from "@/i18n/routing";
import {
  createAutomationFolder,
  deleteAutomationFolder,
  moveAutomationToFolder,
  renameAutomationFolder,
} from "@/app/[locale]/(dashboard)/automation/actions";
import { automationRequiresManualReview } from "@/lib/automation/ai-draft";
import type { AutomationFlowNode } from "@/lib/automation/flow-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CreateAutomationButton } from "./CreateAutomationButton";
import { AutomationStatusToggle } from "./AutomationStatusToggle";
import { AutomationNoteButton } from "./AutomationNoteButton";
import { RenameFlowButton } from "./RenameFlowButton";
import { DeleteFlowButton } from "./DeleteFlowButton";
import {
  AutomationConnectionsMap,
  type AutomationMapItem,
} from "./AutomationConnectionsMap";
import { AutomationChatSimulator } from "./AutomationChatSimulator";
import { AutomationFlowNavigator } from "./AutomationFlowNavigator";
import { AutomationRelationshipGraph } from "./AutomationRelationshipGraph";

type AutomationFolderItem = {
  id: number;
  parentId: number | null;
  name: string;
  color: string;
  position: number;
};

type AutomationWorkspaceItem = AutomationMapItem & {
  edges?: unknown;
  instanceId?: number | null;
  updatedAt?: Date | string;
};

type FolderDialogState =
  | { mode: "create"; parentId: number | null }
  | { mode: "rename"; folder: AutomationFolderItem }
  | null;

const FOLDER_COLORS = [
  "#111827",
  "#374151",
  "#6B7280",
  "#9CA3AF",
  "#D1D5DB",
  "#F3F4F6",
];

export function AutomationWorkspace({
  automations,
  folders,
  locale,
}: {
  automations: AutomationWorkspaceItem[];
  folders: AutomationFolderItem[];
  locale: string;
}) {
  const t = useTranslations("Automation");
  const router = useRouter();
  const [selectedScope, setSelectedScope] = useState("all");
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationFolderItem | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [isPending, startTransition] = useTransition();
  const [collapsedFolders, setCollapsedFolders] = useState<Set<number>>(new Set());

  const toggleFolderCollapse = (folderId: number) => {
    const newCollapsed = new Set(collapsedFolders);
    if (newCollapsed.has(folderId)) {
      newCollapsed.delete(folderId);
    } else {
      newCollapsed.add(folderId);
    }
    setCollapsedFolders(newCollapsed);
  };

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, AutomationFolderItem[]>();
    folders.forEach((folder) => {
      const children = map.get(folder.parentId) ?? [];
      children.push(folder);
      map.set(folder.parentId, children);
    });
    map.forEach((items) =>
      items.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    );
    return map;
  }, [folders]);

  const descendantIds = useMemo(() => {
    const result = new Map<number, Set<number>>();
    const visit = (folderId: number): Set<number> => {
      const cached = result.get(folderId);
      if (cached) return cached;
      const ids = new Set<number>([folderId]);
      for (const child of childrenByParent.get(folderId) ?? []) {
        visit(child.id).forEach((id) => ids.add(id));
      }
      result.set(folderId, ids);
      return ids;
    };
    folders.forEach((folder) => visit(folder.id));
    return result;
  }, [childrenByParent, folders]);

  const folderPath = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    return (folderId: number) => {
      const parts: string[] = [];
      const seen = new Set<number>();
      let current = byId.get(folderId);
      while (current && !seen.has(current.id)) {
        parts.unshift(current.name);
        seen.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return parts.join(" / ");
    };
  }, [folders]);

  const selectedFolderId = selectedScope.startsWith("folder:")
    ? Number(selectedScope.slice(7))
    : null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const selectedFolderIds =
    selectedFolderId !== null ? descendantIds.get(selectedFolderId) : undefined;
  const visibleAutomations = useMemo(() => {
    if (selectedScope === "all") return automations;
    if (selectedScope === "unfiled") {
      return automations.filter((automation) => automation.folderId == null);
    }
    return automations.filter(
      (automation) =>
        automation.folderId != null && selectedFolderIds?.has(automation.folderId),
    );
  }, [automations, selectedFolderIds, selectedScope]);

  const scopeName =
    selectedScope === "all"
      ? t("folders.all")
      : selectedScope === "unfiled"
        ? t("folders.unfiled")
        : selectedFolder?.name ?? t("folders.all");

  const countForFolder = (folderId: number) => {
    const ids = descendantIds.get(folderId) ?? new Set([folderId]);
    return automations.filter(
      (automation) => automation.folderId != null && ids.has(automation.folderId),
    ).length;
  };

  const openCreateFolder = (parentId: number | null) => {
    setFolderName("");
    setFolderColor(
      parentId
        ? folders.find((folder) => folder.id === parentId)?.color ?? FOLDER_COLORS[0]
        : FOLDER_COLORS[0],
    );
    setFolderDialog({ mode: "create", parentId });
  };

  const openRenameFolder = (folder: AutomationFolderItem) => {
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setFolderDialog({ mode: "rename", folder });
  };

  const saveFolder = () => {
    if (!folderDialog || !folderName.trim()) return;
    startTransition(async () => {
      try {
        if (folderDialog.mode === "create") {
          const created = await createAutomationFolder({
            name: folderName,
            parentId: folderDialog.parentId,
            color: folderColor,
          });
          setSelectedScope(`folder:${created.id}`);
          toast.success(t("folders.created"));
        } else {
          await renameAutomationFolder(folderDialog.folder.id, folderName);
          toast.success(t("folders.renamed"));
        }
        setFolderDialog(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("folders.error"));
      }
    });
  };

  const confirmDeleteFolder = () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    startTransition(async () => {
      try {
        await deleteAutomationFolder(deletedId);
        if (selectedFolderIds?.has(deletedId) || selectedFolderId === deletedId) {
          setSelectedScope(
            deleteTarget.parentId ? `folder:${deleteTarget.parentId}` : "all",
          );
        }
        setDeleteTarget(null);
        router.refresh();
        toast.success(t("folders.deleted"));
      } catch {
        toast.error(t("folders.error"));
      }
    });
  };

  const moveAutomation = (automationId: number, folderId: number | null) => {
    startTransition(async () => {
      try {
        await moveAutomationToFolder(automationId, folderId);
        router.refresh();
        toast.success(t("folders.moved"));
      } catch {
        toast.error(t("folders.move_error"));
      }
    });
  };

  const renderFolderBranch = (parentId: number | null, depth = 0): React.ReactNode =>
    (childrenByParent.get(parentId) ?? []).map((folder) => {
      const selected = selectedScope === `folder:${folder.id}`;
      const isCollapsed = collapsedFolders.has(folder.id);
      const hasChildren = (childrenByParent.get(folder.id) ?? []).length > 0;
      return (
        <React.Fragment key={folder.id}>
          <div
            className={[
              "group flex items-center rounded-lg transition-all",
              selected
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            ].join(" ")}
            style={{
              paddingLeft: `${depth * 12 + 8}px`,
              borderLeft: `2px solid ${selected ? "var(--primary)" : "transparent"}`,
            }}
          >
            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleFolderCollapse(folder.id)}
                className="flex h-7 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {!hasChildren && <div className="w-6" />}
            <button
              type="button"
              onClick={() => setSelectedScope(`folder:${folder.id}`)}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
            >
              <Folder className="h-4 w-4 shrink-0" style={{ color: folder.color }} />
              <span className="truncate text-xs font-medium">{folder.name}</span>
              <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {countForFolder(folder.id)}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => openCreateFolder(folder.id)}>
                  <FolderPlus /> {t("folders.new_subfolder")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openRenameFolder(folder)}>
                  <Edit3 /> {t("folders.rename")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteTarget(folder)}
                >
                  <Trash2 /> {t("folders.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {!isCollapsed && renderFolderBranch(folder.id, depth + 1)}
        </React.Fragment>
      );
    });

  const mapLabels = {
    title: `${t("graph.title")} · ${scopeName}`,
    description: t("graph.description"),
    noLinks: t("graph.no_links"),
    linkedCount: t("graph.linked_count"),
    active: t("graph.active"),
    paused: t("graph.paused"),
    opensFlow: t("graph.opens_flow"),
    resetLayout: t("graph.reset_layout"),
    dragHint: t("graph.drag_hint"),
    fullscreen: t("graph.fullscreen"),
    exitFullscreen: t("graph.exit_fullscreen"),
    noteFallback: t("graph.note_fallback"),
    legendForward: t("graph.legend_forward"),
    legendSameLevel: t("graph.legend_same_level"),
    legendBack: t("graph.legend_back"),
    viewGraph: t("graph.view_graph"),
    viewList: t("graph.view_list"),
    sendsTo: t("graph.sends_to"),
    receivesFrom: t("graph.receives_from"),
    returnsBadge: t("graph.returns_badge"),
    selfBadge: t("graph.self_badge"),
    noConnections: t("graph.no_connections"),
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-4 text-foreground sm:p-6">
      <Tabs defaultValue="list" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="mb-6 flex shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
              <Folders className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <div className="text-sm font-semibold text-foreground">{scopeName}</div>
            <div className="text-xs text-muted-foreground">
              {t("flow_list.description", { count: visibleAutomations.length })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <TabsList className="h-10 rounded-lg border border-border bg-muted/40 p-1.5">
            <TabsTrigger value="list" className="h-8 rounded-md px-3.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              {t("flow_list.tab")}
            </TabsTrigger>
            <TabsTrigger value="map" className="h-8 rounded-md px-3.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              {t("graph.tab")}
            </TabsTrigger>
            <TabsTrigger value="relationship-graph" className="h-8 rounded-md px-3.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              {t("relationship_graph.tab")}
            </TabsTrigger>
            <TabsTrigger value="navigate" className="h-8 rounded-md px-3.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              {t("navigator.tab")}
            </TabsTrigger>
            <TabsTrigger value="simulator" className="h-8 rounded-md px-3.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              {t("simulator.tab")}
            </TabsTrigger>
          </TabsList>
          <CreateAutomationButton
            folderId={selectedFolderId}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col border-b border-border px-4 py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold tracking-tight">{t("folders.title")}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("folders.description")}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={() => openCreateFolder(selectedFolderId)}
                title={t("folders.new")}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
            <button
              type="button"
              onClick={() => setSelectedScope("all")}
              className={[
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all",
                selectedScope === "all"
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              ].join(" ")}
              style={{
                borderLeft: selectedScope === "all" ? "2.5px solid var(--primary)" : "2.5px solid transparent",
              }}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t("folders.all")}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {automations.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope("unfiled")}
              className={[
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all",
                selectedScope === "unfiled"
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              ].join(" ")}
              style={{
                borderLeft: selectedScope === "unfiled" ? "2.5px solid var(--primary)" : "2.5px solid transparent",
              }}
            >
              <Unlink className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t("folders.unfiled")}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {automations.filter((automation) => automation.folderId == null).length}
              </span>
            </button>
            {folders.length > 0 && <div className="my-2 h-px bg-border" />}
            {folders.length > 0 ? (
              renderFolderBranch(null)
            ) : (
              <button
                type="button"
                onClick={() => openCreateFolder(null)}
                className="mt-4 flex w-full flex-col items-center rounded-lg border border-dashed border-border px-3 py-5 text-center text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <FolderPlus className="mb-2 h-5 w-5 text-foreground" />
                <span className="text-xs font-medium">{t("folders.empty")}</span>
                <span className="mt-1 text-[10px]">{t("folders.empty_hint")}</span>
              </button>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden">

          <TabsContent value="list" className="mt-0 min-h-0 flex-1 overflow-auto">
            {visibleAutomations.length === 0 ? (
              <div className="flex h-full min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-gradient-to-b from-card to-muted/30 text-center p-6">
                <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <GitMerge className="h-8 w-8" />
                </span>
                <h3 className="text-lg font-bold text-foreground">{t("folders.scope_empty")}</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
                  {t("folders.scope_empty_hint", { folder: scopeName })}
                </p>
                <div className="mt-6">
                  <CreateAutomationButton folderId={selectedFolderId} />
                </div>
              </div>
            ) : (
              <div className="grid auto-rows-max grid-cols-1 gap-3 pb-2 md:grid-cols-2 xl:grid-cols-3">
                {visibleAutomations.map((automation) => {
                  const requiresManualReview = automationRequiresManualReview(
                    automation.nodes as AutomationFlowNode[],
                  );
                  const folder = folders.find((item) => item.id === automation.folderId);
                  return (
                    <Card
                      key={automation.id}
                      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-primary/50 hover:shadow-md"
                    >
                      <CardHeader className="border-b border-border p-4 pb-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={[
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-sm",
                              automation.isActive
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            <Bot className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-base font-semibold" title={automation.name}>
                              {automation.name}
                            </CardTitle>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Smartphone className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate" title={automation.instance?.instanceName || t("no_instance")}>
                                {automation.instance?.instanceName || t("no_instance")}
                              </span>
                            </div>
                          </div>
                          <AutomationStatusToggle
                            id={automation.id}
                            initialActive={automation.isActive}
                            requiresManualReview={requiresManualReview}
                          />
                        </div>
                        {folder && (
                          <div className="mt-3 flex items-center gap-1.5">
                            <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: folder.color }} />
                            <span
                              className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                              title={folderPath(folder.id)}
                            >
                              {folderPath(folder.id)}
                            </span>
                          </div>
                        )}
                      </CardHeader>
                      {(requiresManualReview || automation.note?.trim()) && (
                        <CardContent className="px-4 py-2.5 text-xs">
                          {requiresManualReview && (
                            <p className="font-medium text-foreground">
                              {t("ai_review.activation_blocked_hint")}
                            </p>
                          )}
                          {automation.note?.trim() && (
                            <div
                              className={`${requiresManualReview ? "mt-2 pt-2 border-t border-border" : ""} text-muted-foreground`}
                              title={automation.note.trim()}
                            >
                              {automation.note.trim()}
                            </div>
                          )}
                        </CardContent>
                      )}
                      <CardFooter className="mt-auto flex items-center justify-between gap-2 border-t border-border p-3">
                        <Link href={`/${locale}/automation/${automation.id}`} className="flex-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 rounded-lg border-border bg-transparent text-xs font-medium hover:bg-muted/50"
                          >
                            {t("edit_flow_btn")}
                          </Button>
                        </Link>
                        <div className="flex items-center gap-0.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg hover:bg-muted/60"
                                title={t("folders.move")}
                                disabled={isPending}
                              >
                                <FolderInput className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>{t("folders.move_to")}</DropdownMenuLabel>
                              <DropdownMenuItem
                                onSelect={() => moveAutomation(automation.id, null)}
                              >
                                <Unlink /> {t("folders.unfiled")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {folders.map((item) => (
                                <DropdownMenuItem
                                  key={item.id}
                                  disabled={automation.folderId === item.id}
                                  onSelect={() => moveAutomation(automation.id, item.id)}
                                >
                                  <Folder />
                                  {folderPath(item.id)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <AutomationNoteButton
                            id={automation.id}
                            note={automation.note}
                            labels={{
                              button: t("note.button"),
                              title: t("note.title"),
                              description: t("note.description"),
                              placeholder: t("note.placeholder"),
                              cancel: t("note.cancel"),
                              save: t("note.save"),
                              error: t("note.error"),
                            }}
                          />
                          <RenameFlowButton
                            id={automation.id}
                            currentName={automation.name}
                          />
                          <DeleteFlowButton id={automation.id} name={automation.name} />
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="map" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <AutomationConnectionsMap
              automations={visibleAutomations}
              locale={locale}
              labels={mapLabels}
              scopeKey={selectedScope}
              className="h-full"
              viewportClassName="min-h-0 flex-1"
            />
          </TabsContent>

          <TabsContent value="relationship-graph" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <AutomationRelationshipGraph automations={visibleAutomations} />
          </TabsContent>

          <TabsContent value="navigate" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <AutomationFlowNavigator
              scopedAutomations={visibleAutomations}
              allAutomations={automations}
              scopeKey={selectedScope}
            />
          </TabsContent>

          <TabsContent value="simulator" className="mt-0 min-h-0 flex-1 overflow-hidden">
            {visibleAutomations.length > 0 ? (
              <AutomationChatSimulator
                automations={visibleAutomations}
                title={`${t("simulator.title")} · ${scopeName}`}
                description={t("simulator.description")}
                className="h-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground">
                {t("folders.scope_empty")}
              </div>
            )}
          </TabsContent>
        </main>
      </div>
      </Tabs>

      <Dialog open={folderDialog !== null} onOpenChange={(open) => !open && setFolderDialog(null)}>
        <DialogContent className="rounded-2xl border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {folderDialog?.mode === "rename"
                ? t("folders.rename_title")
                : t("folders.create_title")}
            </DialogTitle>
            <DialogDescription className="text-sm">{t("folders.dialog_description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2.5">
              <Label htmlFor="automation-folder-name" className="text-sm font-medium">{t("folders.name")}</Label>
              <Input
                id="automation-folder-name"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={t("folders.name_placeholder")}
                maxLength={120}
                autoFocus
                className="h-10 rounded-lg border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/50"
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveFolder();
                }}
              />
            </div>
            {folderDialog?.mode === "create" && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">{t("folders.color")}</Label>
                <div className="flex gap-3">
                  {FOLDER_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFolderColor(color)}
                      className={[
                        "h-9 w-9 rounded-lg border-2 transition-all hover:scale-110",
                        folderColor === color
                          ? "scale-110 border-primary shadow-md"
                          : "border-transparent hover:shadow-sm",
                      ].join(" ")}
                      style={{ backgroundColor: color }}
                      aria-label={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFolderDialog(null)} className="rounded-lg">
              {t("cancel_btn")}
            </Button>
            <Button
              onClick={saveFolder}
              disabled={isPending || !folderName.trim()}
              className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {folderDialog?.mode === "rename"
                ? t("folders.save")
                : t("folders.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">{t("folders.delete_title")}</DialogTitle>
            <DialogDescription className="text-sm">
              {t("folders.delete_description", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive/80">
            {t("folders.delete_safe_hint")}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-lg">
              {t("cancel_btn")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteFolder}
              disabled={isPending}
              className="rounded-lg"
            >
              <Trash2 className="h-4 w-4" />
              {t("folders.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
