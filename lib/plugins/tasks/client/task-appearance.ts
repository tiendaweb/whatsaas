import {
  Bookmark,
  Briefcase,
  Bug,
  Calendar,
  Flag,
  Heart,
  Lightbulb,
  Rocket,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const TASK_APPEARANCE_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

export const TASK_APPEARANCE_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'Star', Icon: Star },
  { name: 'Flag', Icon: Flag },
  { name: 'Zap', Icon: Zap },
  { name: 'Target', Icon: Target },
  { name: 'Heart', Icon: Heart },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'Rocket', Icon: Rocket },
  { name: 'Lightbulb', Icon: Lightbulb },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Calendar', Icon: Calendar },
  { name: 'Bug', Icon: Bug },
];

const iconMap = new Map(TASK_APPEARANCE_ICONS.map((entry) => [entry.name, entry.Icon]));

export function resolveTaskIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return iconMap.get(name) ?? null;
}