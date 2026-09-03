'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TaskOsModal } from './TaskOsModal';

export type TaskOsConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function TaskOsConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onClose,
}: TaskOsConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <TaskOsModal onClose={onClose} size="sm" elevated className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/50">{description}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="rounded-xl px-4 py-2 text-sm text-white/55 transition-colors hover:text-white disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
            destructive
              ? 'border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25'
              : 'border-white/25 bg-white/15 text-white hover:bg-white/22',
          )}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </TaskOsModal>
  );
}