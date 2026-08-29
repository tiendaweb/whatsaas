'use client';

import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const DOC_HREF = '/plugins/documents?q=command-center-comercial';

export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Todavía no hay chats analizados', hint, className }: { title?: string; hint?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center', className)}>
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">
        {hint ?? 'Cuando el motor clasifique los chats van a aparecer acá.'}{' '}
        <a href={DOC_HREF} className="underline underline-offset-2 hover:text-foreground">
          Ver la especificación
        </a>
      </p>
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center', className)} role="alert">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">No se pudo cargar</p>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw className="size-3.5" aria-hidden /> Reintentar
        </Button>
      )}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}
