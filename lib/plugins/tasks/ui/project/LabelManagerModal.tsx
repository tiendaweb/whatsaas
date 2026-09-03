'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { LayoutTemplate, Loader2, Plus, X } from 'lucide-react';
import { createLabelTemplate, getLabelTemplatesEndpoint, taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import { LABEL_COLORS } from '@/lib/plugins/tasks/client/constants';
import type { Project, TaskLabel, TaskTemplate } from '@/lib/plugins/tasks/client/types';
import { nanoid } from '@/lib/plugins/tasks/client/utils';
import { TaskOsInputDialog, TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';

export type LabelManagerModalProps = {
  project: Project;
  onClose: () => void;
  onSave: (labels: TaskLabel[]) => Promise<void>;
};

export function LabelManagerModal({ project, onClose, onSave }: LabelManagerModalProps) {
  const [labels, setLabels] = useState<TaskLabel[]>(project.labels);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const { data: labelTemplates = [], mutate: mutateTemplates } = useSWR<TaskTemplate[]>(getLabelTemplatesEndpoint(), taskOsFetcher);

  const addLabel = () => {
    if (!newName.trim()) return;
    setLabels((prev) => [...prev, { id: nanoid(), name: newName.trim(), color: newColor }]);
    setNewName('');
  };

  const removeLabel = (id: string) => setLabels((prev) => prev.filter((l) => l.id !== id));

  const handleSave = async () => {
    setSaving(true);
    await onSave(labels);
    setSaving(false);
    onClose();
  };

  const saveTemplate = async (name: string) => {
    await createLabelTemplate({ type: 'labels', name, payload: { labels } });
    mutateTemplates();
  };

  return (
    <>
    <TaskOsModal onClose={onClose} size="sm" className="space-y-4 p-5">
      <TaskOsModalHeader title="Etiquetas del proyecto" onClose={onClose} />
      <div className="max-h-48 space-y-1.5 overflow-y-auto">
        {labels.map((l) => (
          <div key={l.id} className="group/lbl flex items-center gap-2">
            <div className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="flex-1 text-sm text-white/80">{l.name}</span>
            <button onClick={() => removeLabel(l.id)} className="text-white/30 opacity-0 transition-all hover:text-red-400 group-hover/lbl:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {labels.length === 0 && <p className="py-2 text-center text-sm text-white/30">Sin etiquetas</p>}
      </div>
      <div className="space-y-2">
        {labelTemplates.length > 0 && (
          <div className="space-y-1 rounded-xl border border-white/10 bg-white/6 p-2">
            <p className="text-[10px] uppercase tracking-wider text-white/35">Plantillas</p>
            {labelTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => setLabels(template.payload?.labels ?? [])}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-white/60 hover:bg-white/10 hover:text-white"
              >
                <span className="truncate">{template.name}</span>
                <LayoutTemplate className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLabel()}
          placeholder="Nombre de etiqueta..."
          className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
        />
        <div className="flex flex-wrap gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              className={`h-5 w-5 rounded-full border-2 transition-all ${newColor === c ? 'scale-110 border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          onClick={addLabel}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
        <button
          onClick={() => setShowTemplateInput(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/12 hover:text-white"
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          Guardar como plantilla
        </button>
      </div>
      <button
        onClick={() => void handleSave()}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/20 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/30 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Guardar etiquetas
      </button>
    </TaskOsModal>

    <TaskOsInputDialog
      open={showTemplateInput}
      title="Guardar plantilla de etiquetas"
      description="Podrás reutilizar este conjunto de etiquetas en otros proyectos."
      defaultValue={`${project.name} etiquetas`}
      placeholder="Nombre de la plantilla..."
      submitLabel="Guardar plantilla"
      onSubmit={saveTemplate}
      onClose={() => setShowTemplateInput(false)}
    />
    </>
  );
}