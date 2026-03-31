import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  GitBranchPlus,
  Image,
  List,
  ListChecks,
  MessageSquare,
  MousePointerClick,
  PenLine,
  Save,
  Split,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  AUTOMATION_SIDEBAR_CATEGORIES,
  getSidebarNodesByCategory,
  type AutomationSidebarIconKey,
} from '@/lib/automation/node-catalog';

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
}

const ICONS_BY_KEY: Record<AutomationSidebarIconKey, React.ElementType> = {
  'message-square': MessageSquare,
  image: Image,
  'mouse-pointer-click': MousePointerClick,
  'list-checks': ListChecks,
  'external-link': ExternalLink,
  list: List,
  split: Split,
  clock: Clock,
  'x-circle': XCircle,
  'pen-line': PenLine,
  save: Save,
  bot: Bot,
  'git-branch-plus': GitBranchPlus,
};

function SidebarSection({ title, children, defaultOpen = true, compact = false }: SidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between p-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/50',
          compact && 'justify-center px-1'
        )}
        aria-label={title}
        title={title}
      >
        <span className={cn(compact && 'sr-only')}>{title}</span>
        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
      </button>

      {isOpen && (
        <div className={cn('flex flex-col gap-1.5 p-2 pt-0 animate-in slide-in-from-top-2 duration-200', compact && 'px-1')}>
          {children}
        </div>
      )}
    </div>
  );
}

interface DraggableNodeProps {
  type: string;
  label: string;
  icon: React.ElementType;
  colorClass: string;
  iconColorClass: string;
  collapsed?: boolean;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

function DraggableNode({ type, label, icon: Icon, colorClass, iconColorClass, collapsed = false, onDragStart }: DraggableNodeProps) {
  return (
    <div
      className={cn(
        'flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-card p-2 shadow-sm transition-all active:cursor-grabbing hover:border-primary/50 hover:shadow-md',
        collapsed && 'justify-center gap-0 px-2'
      )}
      onDragStart={(event) => onDragStart(event, type)}
      draggable
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <div className={cn('rounded-md p-1.5', colorClass)}>
        <Icon className={cn('h-3.5 w-3.5', iconColorClass)} />
      </div>
      <span className={cn('text-xs font-medium text-foreground', collapsed && 'hidden')}>{label}</span>
    </div>
  );
}

export function Sidebar() {
  const t = useTranslations('Automation');
  const asideRef = useRef<HTMLElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const element = asideRef.current;

    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateCompact = (width: number) => {
      setIsCompact(width < 220);
    };

    updateCompact(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      updateCompact(entry.contentRect.width);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside
      ref={asideRef}
      className="flex min-h-0 w-[clamp(15rem,18vw,18rem)] min-w-[4.75rem] max-w-[18rem] shrink-0 resize-x flex-col overflow-hidden border-r border-border bg-background"
    >
      <div className={cn('z-10 shrink-0 border-b border-border bg-background p-3', isCompact && 'px-2 text-center')}>
        <h2 className={cn('text-sm font-semibold', isCompact && 'sr-only')}>{t('sidebar_title')}</h2>
        <p className={cn('text-[10px] text-muted-foreground', isCompact && 'hidden')}>{t('sidebar_desc')}</p>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
        {AUTOMATION_SIDEBAR_CATEGORIES.map((category) => (
          <SidebarSection key={category} title={t(`groups.${category}`)} compact={isCompact}>
            {getSidebarNodesByCategory(category).map((node) => {
              const Icon = ICONS_BY_KEY[node.sidebar!.icon];

              return (
                <DraggableNode
                  key={node.type}
                  collapsed={isCompact}
                  type={node.type}
                  label={t(node.labelKey)}
                  icon={Icon}
                  colorClass={node.sidebar!.colorClass}
                  iconColorClass={node.sidebar!.iconColorClass}
                  onDragStart={onDragStart}
                />
              );
            })}
          </SidebarSection>
        ))}
      </div>
    </aside>
  );
}
