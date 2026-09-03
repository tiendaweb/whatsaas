'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Sparkles, X } from 'lucide-react';
import { C } from '../data/clases';
import { ES } from '../i18n/es';

export type PromptScope = {
  kind: 'workspace' | 'project';
  id: number;
  name: string;
  prompt: string;
  inheritedPrompt?: string;
};

export function ModalPromptIA({
  scope,
  onClose,
  onSave,
}: {
  scope: PromptScope;
  onClose: () => void;
  onSave: (prompt: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(scope.prompt);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(scope.prompt), [scope]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(value);
    setSaving(false);
    if (ok) onClose();
  };

  const label = scope.kind === 'workspace' ? ES.ia.espacio : ES.ia.proyecto;

  return (
    <div className={C.overlay} onClick={onClose} role="presentation">
      <section
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--t-border)] bg-[var(--t-surface)] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-ai-prompt-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)] text-[var(--tareas-accent)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={C.rotulo}>{label}</p>
              <h2 id="task-ai-prompt-title" className="truncate text-xl font-black text-[var(--t-text)]">
                {scope.name}
              </h2>
              <p className="mt-1 text-xs text-[var(--t-text-secondary)]">{ES.ia.ayudaNivel}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={C.iconBtn} aria-label={ES.modal.cerrar}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {scope.inheritedPrompt?.trim() ? (
          <div className="mt-5 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface-2)] px-4 py-3">
            <p className={C.rotulo}>{ES.ia.heredadoEspacio}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--t-text-secondary)]">
              {scope.inheritedPrompt}
            </p>
          </div>
        ) : null}

        <label className="mt-5 block space-y-2">
          <span className={C.rotulo}>{ES.ia.prompt}</span>
          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={8}
            maxLength={20000}
            placeholder={scope.kind === 'workspace' ? ES.ia.placeholderEspacio : ES.ia.placeholderProyecto}
            className="w-full resize-y rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)] px-4 py-3 text-sm leading-6 text-[var(--t-text)] outline-none transition-colors placeholder:text-[var(--t-muted)] focus:border-[var(--tareas-accent)]"
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--t-text-secondary)]">{ES.ia.jerarquia}</p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--tareas-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? ES.ia.guardando : ES.modal.guardar}
          </button>
        </div>
      </section>
    </div>
  );
}
