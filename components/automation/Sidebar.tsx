import React, { useState } from 'react';
import { 
  MessageSquare, 
  List, 
  Clock, 
  PenLine, 
  Save, 
  Image, 
  XCircle, 
  MousePointerClick, 
  ListChecks, 
  ExternalLink, 
  Bot, 
  Split,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SidebarSection({ title, children, defaultOpen = true }: SidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {title}
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      
      {isOpen && (
        <div className="p-2 pt-0 flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-200">
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
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

function DraggableNode({ type, label, icon: Icon, colorClass, iconColorClass, onDragStart }: DraggableNodeProps) {
  return (
    <div 
      className="flex items-center gap-2.5 p-2 rounded-lg border border-border bg-card hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all shadow-sm hover:shadow-md" 
      onDragStart={(event) => onDragStart(event, type)} 
      draggable
    >
      <div className={cn("p-1.5 rounded-md", colorClass)}>
        <Icon className={cn("h-3.5 w-3.5", iconColorClass)} />
      </div>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}

export function Sidebar() {
  const t = useTranslations('Automation');

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="flex w-64 min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background">
      <div className="p-3 border-b border-border shrink-0 bg-background z-10">
        <h2 className="font-semibold text-sm">{t('sidebar_title')}</h2>
        <p className="text-[10px] text-muted-foreground">{t('sidebar_desc')}</p>
      </div>
      
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pb-4">
        <SidebarSection title={t('groups.messages')}>
          <DraggableNode 
            type="message" 
            label={t('nodes.message')} 
            icon={MessageSquare} 
            colorClass="bg-primary/10" 
            iconColorClass="text-primary" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="media" 
            label={t('nodes.media')} 
            icon={Image} 
            colorClass="bg-pink-500/10" 
            iconColorClass="text-pink-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="button_message" 
            label={t('nodes.buttons')} 
            icon={MousePointerClick} 
            colorClass="bg-indigo-500/10" 
            iconColorClass="text-indigo-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="list_message" 
            label={t('nodes.list')} 
            icon={ListChecks} 
            colorClass="bg-teal-500/10" 
            iconColorClass="text-teal-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="call_to_action" 
            label={t('nodes.cta')} 
            icon={ExternalLink} 
            colorClass="bg-sky-500/10" 
            iconColorClass="text-sky-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="options" 
            label={t('nodes.options')} 
            icon={List} 
            colorClass="bg-orange-500/10" 
            iconColorClass="text-orange-500" 
            onDragStart={onDragStart} 
          />
        </SidebarSection>

        <SidebarSection title={t('groups.logic')}>
          <DraggableNode 
            type="condition" 
            label={t('nodes.condition')} 
            icon={Split} 
            colorClass="bg-yellow-500/10" 
            iconColorClass="text-yellow-600" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="delay" 
            label={t('nodes.delay')} 
            icon={Clock} 
            colorClass="bg-blue-500/10" 
            iconColorClass="text-blue-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="end" 
            label={t('nodes.end')} 
            icon={XCircle} 
            colorClass="bg-destructive/10" 
            iconColorClass="text-destructive" 
            onDragStart={onDragStart} 
          />
        </SidebarSection>

        <SidebarSection title={t('groups.integrations')}>
          <DraggableNode 
            type="collect" 
            label={t('nodes.collect')} 
            icon={PenLine} 
            colorClass="bg-purple-500/10" 
            iconColorClass="text-purple-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="save_contact" 
            label={t('nodes.save_contact')} 
            icon={Save} 
            colorClass="bg-green-500/10" 
            iconColorClass="text-green-500" 
            onDragStart={onDragStart} 
          />
          <DraggableNode 
            type="ai_control" 
            label={t('nodes.ai_control')} 
            icon={Bot} 
            colorClass="bg-violet-600/10" 
            iconColorClass="text-violet-600" 
            onDragStart={onDragStart} 
          />
        </SidebarSection>
      </div>
    </aside>
  );
}