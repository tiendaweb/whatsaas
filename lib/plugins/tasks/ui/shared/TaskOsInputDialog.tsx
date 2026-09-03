'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TaskOsModal } from './TaskOsModal';
import { TaskOsModalHeader } from './TaskOsModalHeader';

export type TaskOsInputDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
};

export function TaskOsInputDialog({
  open,
  title,
  description,
  defaultValue = '',
  placeholder,
  submitLabel = 'Guardar',
  onSubmit,
  onClose,
}: TaskOsInputDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <TaskOsModal onClose={onClose} size="sm" elevated className="space-y-4 p-5">
      <TaskOsModalHeader title={title} subtitle={description} onClose={onClose} />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit();
          if (e.key === 'Escape') onClose();
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="rounded-xl px-4 py-2 text-sm text-white/55 transition-colors hover:text-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || !value.trim()}
          className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/22 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </TaskOsModal>
  );
}