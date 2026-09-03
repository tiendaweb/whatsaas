"use client";

import React from "react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  LayoutGrid,
  Maximize2,
  PanelLeft,
  PauseCircle,
  PlayCircle,
  Plus,
  Presentation,
  Save,
  Settings2,
  Sparkles,
  X,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { RenameFlowButton } from "./RenameFlowButton";
import { DeleteFlowButton } from "./DeleteFlowButton";
import { AutomationNoteButton } from "./AutomationNoteButton";

type FlowEditorViewMode = 'visual' | 'map' | 'simulator' | 'steps-list' | 'text-script';

interface FlowEditorHeaderProps {
  automationId: number;
  automationName: string;
  automationNote?: string | null;
  isActive: boolean;
  onToggleActive: () => void;
  onSave: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;

  // AI
  isAIFlowGeneratorEnabled: boolean;
  onOpenAIGenerator: () => void;
  aiDraftMetadata: any;
  requiresManualReview: boolean;
  onConfirmReview: () => void;

  // Sidebars & presentation
  selectedNode: any;
  onOpenPropertiesModal: () => void;

  // AI Assistant toggle
  aiAssistantActive?: boolean;
  onToggleAIAssistant?: () => void;

  isPresentationMode: boolean;
  onEnterPresentation: () => void;
  onExitPresentation: () => void;

  // Presentation navigation
  presentationIndex?: number;
  presentationTotal?: number;
  onPrevPresentation?: () => void;
  onNextPresentation?: () => void;

  // Organize + templates
  onOrganize: (mode: any) => void;
  isAutoArrangeEnabled: boolean;
  onOpenInsertTemplate: () => void;
  onOpenSaveTemplate: () => void;

  // Loop warning
  hasLoopWarning: boolean;
  onShowLoopWarning: () => void;

  // New: Full flow text + list editors (integrated in header)
  flowViewMode?: FlowEditorViewMode;
  onSetFlowViewMode?: (mode: FlowEditorViewMode) => void;
}

export function FlowEditorHeader({
  automationId,
  automationName,
  automationNote,
  isActive,
  onToggleActive,
  onSave,
  isSaving,
  hasUnsavedChanges,
  isAIFlowGeneratorEnabled,
  onOpenAIGenerator,
  aiDraftMetadata,
  requiresManualReview,
  onConfirmReview,
  selectedNode,
  onOpenPropertiesModal,
  isPresentationMode,
  onEnterPresentation,
  onExitPresentation,
  presentationIndex = 0,
  presentationTotal = 0,
  onPrevPresentation,
  onNextPresentation,
  onOrganize,
  isAutoArrangeEnabled,
  onOpenInsertTemplate,
  onOpenSaveTemplate,
  hasLoopWarning,
  onShowLoopWarning,
  aiAssistantActive = false,
  onToggleAIAssistant,
  flowViewMode = 'visual',
  onSetFlowViewMode,
}: FlowEditorHeaderProps) {
  const t = useTranslations("Automation");
  const locale = useLocale();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 z-20 text-sm">
      {/* Left: Navigation + Title (compact) */}
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/automation')}
          className="h-8 px-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-[220px] truncate font-semibold tracking-tight md:max-w-[360px]">
              {automationName}
            </span>
            <RenameFlowButton id={automationId} currentName={automationName} />
            <AutomationNoteButton
              id={automationId}
              note={automationNote}
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
            <DeleteFlowButton
              id={automationId}
              name={automationName}
              redirectTo={`/${locale}/automation`}
            />
            <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">#{automationId}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] leading-none mt-0.5">
            <span className="hidden rounded bg-muted px-1.5 py-px text-muted-foreground md:inline">
              {t("header_title")}
            </span>
            <span className={cn("px-1.5 py-px rounded", isActive ? "bg-primary/10 text-primary" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400")}>
              {isActive ? t("status_active") : t("status_draft")}
            </span>
            {aiDraftMetadata && (
              <span className={cn("px-1.5 py-px rounded", requiresManualReview ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400")}>
                {requiresManualReview ? t("status_ai_draft_generated") : t("status_ai_reviewed")}
              </span>
            )}
            {hasUnsavedChanges && <span className="text-orange-600">{t("status_unsaved")}</span>}
          </div>
        </div>
      </div>

      {/* Center / Actions - minimalist icon-heavy for desktop + any device (components & properties toggles removed from header per reqs) */}
      <div className="flex items-center gap-1 flex-1 justify-end">
        {/* AI actions - compact icons */}
        <div className="flex items-center gap-1">
          {aiDraftMetadata && (
            <Button variant={requiresManualReview ? "default" : "outline"} size="sm" className="h-7 w-7 p-0" onClick={onConfirmReview} disabled={!requiresManualReview} title={t("review_ai_draft_title")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {isAIFlowGeneratorEnabled && (
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={onOpenAIGenerator} title={t("ai_generator_title")}>
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* View switcher - integrated in header for Visual + 2 massive text-based full flow editors */}
        {onSetFlowViewMode && (
          <div className="flex items-center rounded border bg-muted/30 p-0.5 text-[11px] font-medium">
            <Button
              variant={flowViewMode === 'visual' ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-sm"
              onClick={() => onSetFlowViewMode('visual')}
            >
              Visual
            </Button>
            <Button
              variant={flowViewMode === 'map' ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-sm"
              onClick={() => onSetFlowViewMode('map')}
            >
              Mapa
            </Button>
            <Button
              variant={flowViewMode === 'simulator' ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-sm"
              onClick={() => onSetFlowViewMode('simulator')}
            >
              Simulador
            </Button>
            <Button
              variant={flowViewMode === 'steps-list' ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-sm"
              onClick={() => onSetFlowViewMode('steps-list')}
            >
              Lista Pasos
            </Button>
            <Button
              variant={flowViewMode === 'text-script' ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-sm"
              onClick={() => onSetFlowViewMode('text-script')}
            >
              Editor Texto
            </Button>
          </div>
        )}

        {/* Minimalist remaining controls (icon only, rounded groups) */}
        <div className="flex items-center gap-0.5 rounded border bg-muted/30 p-0.5">
          <Button
            variant={isPresentationMode ? "default" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={isPresentationMode ? onExitPresentation : onEnterPresentation}
            title={t("presentation_mode")}
          >
            <Presentation className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Arrange dropdown (kept compact) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" title={t("ai_generator.organize_btn")}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOrganize("hierarchy_ignore_back_edges")}>
              {t("ai_generator.organize_modes.ignore_back_edges")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOrganize("orthogonal_connectors")}>
              {t("ai_generator.organize_modes.orthogonal_connectors")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOrganize("straight_lines")}>
              {t("ai_generator.organize_modes.straight_lines")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOrganize("spaced_tree")}>
              {t("ai_generator.organize_modes.spaced_tree")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOrganize("mind_map")}>
              {t("ai_generator.organize_modes.mind_map")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOrganize("auto_focus")}>
              {isAutoArrangeEnabled
                ? t("ai_generator.organize_modes.auto_focus_enabled")
                : t("ai_generator.organize_modes.auto_focus")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenInsertTemplate}>{t("template_insert.open_btn")}</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSaveTemplate}>{t("template_save.open_btn")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New AI Assistant button (toggles easy code/prompt view for AI agents) */}
        {onToggleAIAssistant && (
          <Button
            variant={aiAssistantActive ? "default" : "outline"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleAIAssistant}
            title={aiAssistantActive ? "Volver a flujo visual" : "Vista IA / Código (fácil para agentes de IA)"}
          >
            <Bot className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Activate + Save - right aligned, icon minimal */}
        <div className="flex items-center gap-1 pl-1 border-l">
          <Button
            variant="outline"
            size="sm"
            className={cn("h-7 w-7 p-0", isActive ? "text-orange-600" : "text-primary")}
            onClick={onToggleActive}
            disabled={!isActive && requiresManualReview}
            title={isActive ? t("pause") : t("activate")}
          >
            {isActive ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
          </Button>

          {hasLoopWarning && (
            <Button variant="destructive" size="sm" className="h-7 w-7 p-0" onClick={onShowLoopWarning} title={t("loop_alert_btn")}>
              !
            </Button>
          )}

          <Button
            className="bg-primary h-7 px-2 text-xs"
            onClick={onSave}
            disabled={isSaving}
            size="sm"
            title={t("save_btn")}
          >
            {isSaving ? "..." : t("save_btn")}
          </Button>
        </div>
      </div>
    </header>
  );
}
