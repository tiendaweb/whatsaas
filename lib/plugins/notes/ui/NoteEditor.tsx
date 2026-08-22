'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  X, Bold, Italic, List, Code,
  Pin, PinOff, Circle, Loader2,
  Clock, CheckCircle2, AlertCircle, Tag,
  Plus, ListChecks, Check,
} from 'lucide-react';

type NoteStatus = 'todo' | 'in_progress' | 'done';

export interface NoteCommitment {
  text: string;
  assigneeUserId?: number;
  dueDate?: string;
  taskItemId?: number;
  /** Solo lectura: estado real de la tarea de Tareas OS vinculada (la trae ya armada la API). */
  taskStatus?: string;
  taskCompletedAt?: string | null;
}

export interface NoteEditorData {
  id?: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  status: NoteStatus;
  dueDate: string;
  eventId?: number | null;
  commitments?: NoteCommitment[];
}

interface TeamMemberOption {
  userId: number;
  label: string;
}

interface NoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: NoteEditorData) => Promise<void>;
  initialData?: NoteEditorData;
  /** Preseteado al crear una nota desde el detalle de una reunión/llamada. */
  defaultEventId?: number | null;
  /** Para el selector de responsable de cada compromiso. */
  teamMembers?: TeamMemberOption[];
}

const STATUS_OPTIONS: {
  value: NoteStatus;
  label: string;
  icon: React.ElementType;
  activeClass: string;
  dotClass: string;
}[] = [
  {
    value: 'todo',
    label: 'Pendiente',
    icon: Circle,
    activeClass: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
  {
    value: 'in_progress',
    label: 'En progreso',
    icon: AlertCircle,
    activeClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  {
    value: 'done',
    label: 'Completado',
    icon: CheckCircle2,
    activeClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
];

const STATUS_HEADER: Record<NoteStatus, string> = {
  todo:        'border-t-blue-500',
  in_progress: 'border-t-amber-500',
  done:        'border-t-emerald-500',
};

const MARKDOWN_SHORTCUTS = [
  { prefix: '**', suffix: '**', label: 'Negrita',  icon: Bold },
  { prefix: '*',  suffix: '*',  label: 'Itálica',  icon: Italic },
  { prefix: '• ', suffix: '',   label: 'Lista',    icon: List },
  { prefix: '`',  suffix: '`',  label: 'Código',   icon: Code },
];

export function NoteEditor({ open, onOpenChange, onSave, initialData, defaultEventId, teamMembers = [] }: NoteEditorProps) {
  const [title,    setTitle]    = useState('');
  const [content,  setContent]  = useState('');
  const [tags,     setTags]     = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [status,   setStatus]   = useState<NoteStatus>('todo');
  const [dueDate,  setDueDate]  = useState('');
  const [pinned,   setPinned]   = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [eventId,  setEventId]  = useState<number | null>(null);
  const [commitments, setCommitments] = useState<NoteCommitment[]>([]);
  const [newCommitmentText, setNewCommitmentText] = useState('');
  const [togglingTaskId, setTogglingTaskId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setTitle(initialData.title);
        setContent(initialData.content);
        setTags(initialData.tags);
        setStatus(initialData.status);
        setDueDate(initialData.dueDate);
        setPinned(initialData.pinned ?? false);
        setEventId(initialData.eventId ?? defaultEventId ?? null);
        setCommitments(initialData.commitments ?? []);
      } else {
        resetForm();
        setEventId(defaultEventId ?? null);
      }
    }
  }, [initialData, open, defaultEventId]);

  function resetForm() {
    setTitle(''); setContent(''); setTags([]);
    setTagInput(''); setStatus('todo'); setDueDate(''); setPinned(false);
    setEventId(null); setCommitments([]); setNewCommitmentText('');
  }

  function addCommitment() {
    const text = newCommitmentText.trim();
    if (!text) return;
    setCommitments([...commitments, { text }]);
    setNewCommitmentText('');
  }

  function updateCommitment(index: number, patch: Partial<NoteCommitment>) {
    setCommitments(commitments.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCommitment(index: number) {
    setCommitments(commitments.filter((_, i) => i !== index));
  }

  /** Marca/desmarca la tarea real de Tareas OS vinculada a este compromiso. Optimista, con rollback si falla. */
  async function toggleCommitmentTask(index: number) {
    const commitment = commitments[index];
    if (!commitment.taskItemId) return;
    const wasDone = commitment.taskStatus === 'done';
    const nextStatus = wasDone ? 'open' : 'done';

    setTogglingTaskId(commitment.taskItemId);
    setCommitments((prev) => prev.map((c, i) => (i === index ? { ...c, taskStatus: nextStatus } : c)));
    try {
      const res = await fetch(`/api/plugins/tasks/items/${commitment.taskItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar la tarea');
    } catch {
      setCommitments((prev) => prev.map((c, i) => (i === index ? { ...c, taskStatus: wasDone ? 'done' : 'open' } : c)));
    } finally {
      setTogglingTaskId(null);
    }
  }

  function handleAddTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput(''); }
  }

  function insertMarkdown(prefix: string, suffix: string, placeholder: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.substring(s, e) || placeholder;
    const newText = ta.value.substring(0, s) + prefix + sel + suffix + ta.value.substring(e);
    setContent(newText);
    ta.value = newText;
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length + sel.length);
    }, 0);
  }

  async function handleSave() {
    if (!title.trim()) { alert('El título es requerido'); return; }
    setIsSaving(true);
    try {
      await onSave({ id: initialData?.id, title, content, tags, pinned, status, dueDate, eventId, commitments });
      onOpenChange(false);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  }

  const activeStatus = STATUS_OPTIONS.find(s => s.value === status)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-2xl max-h-[92vh] overflow-y-auto border-t-4 ${STATUS_HEADER[status]} p-0`}>
        <DialogHeader className="px-6 pt-5 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              {initialData ? 'Editar nota' : 'Nueva nota'}
            </DialogTitle>
            <button
              onClick={() => setPinned(!pinned)}
              title={pinned ? 'Quitar fijado' : 'Fijar nota'}
              className={`p-1.5 rounded-md transition-colors ${
                pinned
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5 mt-4">
          {/* Title */}
          <input
            type="text"
            placeholder="Título de la nota..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            className="w-full text-lg font-semibold bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none pb-2 placeholder:text-muted-foreground/50 transition-colors"
          />

          {/* Status selector */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</p>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? opt.activeClass
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? opt.dotClass : 'bg-muted-foreground'}`} />
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contenido</p>
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                {MARKDOWN_SHORTCUTS.map(({ prefix, suffix, label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    onClick={() => insertMarkdown(prefix, suffix, label)}
                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              ref={textareaRef}
              placeholder="Escribe tu nota aquí..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={7}
              className="resize-none text-sm leading-relaxed bg-muted/20 border-border/50 focus:bg-background transition-colors"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Etiquetas</p>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Agregar etiqueta..."
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddTag} className="h-8 px-3 text-xs">
                Agregar
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                  >
                    {tag}
                    <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:opacity-70">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha de vencimiento</p>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="h-8 text-sm w-48"
              />
              {dueDate && (
                <button type="button" onClick={() => setDueDate('')} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Meeting note: commitments — preview simple estilo ToDoS de las tareas reales de Tareas OS */}
          {eventId && (
            <div
              className="space-y-2.5 rounded-3xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
                <ListChecks className="h-3.5 w-3.5" />
                Compromisos de la reunión
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Cada compromiso es una tarea real de Tareas OS (proyecto "Reuniones") — se crea sola al guardar la nota.
              </p>

              <div className="space-y-1.5">
                {commitments.map((c, i) =>
                  c.taskItemId ? (
                    <div
                      key={c.taskItemId}
                      className="flex items-center gap-2.5 rounded-xl border border-neutral-100 bg-white px-3 py-2.5 transition-all duration-200 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleCommitmentTask(i)}
                        disabled={togglingTaskId === c.taskItemId}
                        title={c.taskStatus === 'done' ? 'Marcar como pendiente' : 'Marcar como hecha'}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                          c.taskStatus === 'done'
                            ? 'border-[#6366f1] bg-[#6366f1] text-white'
                            : 'border-neutral-300 hover:border-[#6366f1] dark:border-neutral-600'
                        }`}
                      >
                        {c.taskStatus === 'done' && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <span
                        className={`min-w-0 flex-1 truncate text-[15px] font-bold ${
                          c.taskStatus === 'done'
                            ? 'text-neutral-400 line-through dark:text-neutral-500'
                            : 'text-neutral-900 dark:text-white'
                        }`}
                      >
                        {c.text}
                      </span>
                      {c.assigneeUserId && (
                        <span className="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                          {teamMembers.find((m) => m.userId === c.assigneeUserId)?.label ?? 'Responsable'}
                        </span>
                      )}
                      {c.dueDate && (
                        <span className="shrink-0 text-xs font-bold text-neutral-400 dark:text-neutral-500">{c.dueDate}</span>
                      )}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 bg-white/60 p-1.5 dark:border-neutral-700 dark:bg-neutral-800/60"
                    >
                      <Input
                        value={c.text}
                        onChange={(e) => updateCommitment(i, { text: e.target.value })}
                        className="h-7 flex-1 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
                      />
                      <select
                        value={c.assigneeUserId ?? ''}
                        onChange={(e) => updateCommitment(i, { assigneeUserId: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-7 max-w-[110px] rounded border border-input bg-background px-1 text-xs"
                      >
                        <option value="">Responsable</option>
                        {teamMembers.map((m) => (
                          <option key={m.userId} value={m.userId}>{m.label}</option>
                        ))}
                      </select>
                      <Input
                        type="date"
                        value={c.dueDate ?? ''}
                        onChange={(e) => updateCommitment(i, { dueDate: e.target.value || undefined })}
                        className="h-7 w-32 text-xs"
                      />
                      <span
                        title="Se crea como tarea al guardar la nota"
                        className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 dark:bg-neutral-700"
                      >
                        pendiente
                      </span>
                      <button type="button" onClick={() => removeCommitment(i)} className="shrink-0 text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ),
                )}
              </div>

              <div className="flex gap-1.5">
                <Input
                  placeholder="Ej. Martín prepara la landing..."
                  value={newCommitmentText}
                  onChange={(e) => setNewCommitmentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCommitment(); } }}
                  className="h-8 flex-1 rounded-xl border-neutral-200 text-xs dark:border-neutral-700"
                />
                <button
                  type="button"
                  onClick={addCommitment}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#6366f1] text-white transition-all duration-200 hover:bg-[#4f46e5] disabled:opacity-30"
                  disabled={!newCommitmentText.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${activeStatus.dotClass}`} />
              <span className="text-xs text-muted-foreground">{activeStatus.label}</span>
              {pinned && <span className="text-xs text-amber-500 font-medium">· Fijada</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving} className="h-8 px-3 text-sm">
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 px-4 text-sm">
                {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando...</> : initialData ? 'Actualizar' : 'Crear nota'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
