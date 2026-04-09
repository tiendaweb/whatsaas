'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Bold, Italic, List, Code, Maximize2 } from 'lucide-react';

type NoteStatus = 'todo' | 'in_progress' | 'done';

export interface NoteEditorData {
  id?: number;
  title: string;
  content: string;
  tags: string[];
  status: NoteStatus;
  dueDate: string;
}

interface NoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: NoteEditorData) => Promise<void>;
  initialData?: NoteEditorData;
  isFullscreen?: boolean;
}

const MARKDOWN_SHORTCUTS = [
  { prefix: '**', suffix: '**', label: 'Bold', icon: Bold },
  { prefix: '*', suffix: '*', label: 'Italic', icon: Italic },
  { prefix: '- ', suffix: '', label: 'List', icon: List },
  { prefix: '```\n', suffix: '\n```', label: 'Code', icon: Code },
];

const STATUS_COLORS = {
  todo: 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800',
  in_progress: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  done: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
};

export function NoteEditor({
  open,
  onOpenChange,
  onSave,
  initialData,
  isFullscreen = false,
}: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState<NoteStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setContent(initialData.content);
      setTags(initialData.tags);
      setStatus(initialData.status);
      setDueDate(initialData.dueDate);
    } else {
      resetForm();
    }
  }, [initialData, open]);

  // Auto-markdown on input
  useEffect(() => {
    if (!textareaRef.current) return;

    const handleInput = () => {
      const text = textareaRef.current!.value;
      const lines = text.split('\n');
      let modified = false;

      for (let i = 0; i < lines.length; i++) {
        // Auto-bullet point: "- " at start creates bullet
        if (lines[i].startsWith('- ') && !lines[i].startsWith('- \u2022')) {
          lines[i] = lines[i].replace(/^- /, '• ');
          modified = true;
        }

        // Auto-numbering: "1. " at start
        if (lines[i].match(/^\d+\.\s/)) {
          // Keep it as is for numbering
          continue;
        }
      }

      if (modified) {
        const newText = lines.join('\n');
        textareaRef.current!.value = newText;
        setContent(newText);
      }
    };

    const textarea = textareaRef.current;
    textarea?.addEventListener('input', handleInput);
    return () => textarea?.removeEventListener('input', handleInput);
  }, []);

  function resetForm() {
    setTitle('');
    setContent('');
    setTags([]);
    setTagInput('');
    setStatus('todo');
    setDueDate('');
  }

  function handleAddTag() {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  }

  function handleRemoveTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function insertMarkdown(prefix: string, suffix: string, placeholder: string) {
    if (!textareaRef.current) return;

    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = textareaRef.current.value;
    const selectedText = text.substring(start, end) || placeholder;
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);

    setContent(newText);
    textareaRef.current.value = newText;

    // Restore cursor position
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  }

  async function handleSave() {
    if (!title.trim()) {
      alert('El título es requerido');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id: initialData?.id,
        title,
        content,
        tags,
        status,
        dueDate,
      });
      onOpenChange(false);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    onOpenChange(false);
    resetForm();
  }

  const dialogContent = (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Título</label>
        <Input
          placeholder="Título de la nota"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="text-base"
        />
      </div>

      {/* Content with markdown toolbar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Contenido</label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setFullscreen(!fullscreen)}
            className="h-8 w-8 p-0"
            title="Pantalla completa"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Markdown toolbar */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-2">
          {MARKDOWN_SHORTCUTS.map(({ prefix, suffix, label, icon: Icon }) => (
            <Button
              key={label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => insertMarkdown(prefix, suffix, label)}
              className="h-8 px-2 text-xs"
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          placeholder="Escribe tu nota aquí... Usa '- ' para listas, '**' para negrita, '*' para itálica"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={fullscreen ? 15 : 8}
          className="font-mono text-sm resize-none"
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Etiquetas</label>
        <div className="flex gap-2">
          <Input
            placeholder="Añade una etiqueta"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            className="text-sm flex-1"
          />
          <Button type="button" variant="outline" onClick={handleAddTag} className="h-10">
            Añadir
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 px-2 py-1">
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Status and Due Date */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Estado</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as NoteStatus)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="todo">Por hacer</option>
            <option value="in_progress">En progreso</option>
            <option value="done">Completado</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Fecha de vencimiento</label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Guardando...' : initialData ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="w-screen h-screen max-w-none border-0 rounded-0 p-0 flex flex-col">
          <DialogHeader className="border-b p-6">
            <DialogTitle>
              {initialData ? 'Editar nota' : 'Nueva nota'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">{dialogContent}</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? 'Editar nota' : 'Nueva nota'}
          </DialogTitle>
        </DialogHeader>
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
