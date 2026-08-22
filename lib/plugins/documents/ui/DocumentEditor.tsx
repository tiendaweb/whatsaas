'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import useSWR from 'swr';
import {
  Bold,
  Check,
  CheckSquare,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Rows3,
  Strikethrough,
  TableCellsMerge,
  TableCellsSplit,
  TableProperties,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buildEditorExtensions, type DocumentPick } from './editor-extensions';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SAVE_DEBOUNCE_MS = 800;
const SAVE_MAX_WAIT_MS = 5000;

type DocumentDetail = {
  id: number;
  title: string;
  emoji: string | null;
  content: Record<string, unknown>;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
  breadcrumbs: Array<{ id: number; name: string; emoji: string | null }>;
  backlinks: Array<{ id: number; title: string; emoji: string | null }>;
};

type SaveState = 'saved' | 'saving' | 'dirty' | 'conflict';

type Props = {
  documentId: number;
  onSaved: () => void;
  onOpenDocument: (id: number) => void;
};

export function DocumentEditor({ documentId, onSaved, onOpenDocument }: Props) {
  const { data, isLoading, mutate } = useSWR<DocumentDetail>(
    `/api/plugins/documents/documents/${documentId}`,
    fetcher,
  );

  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const versionRef = useRef(0);
  const pendingRef = useRef<{ title?: string; content?: unknown }>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstDirtyAtRef = useRef<number | null>(null);
  const conflictRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const flush = useCallback((): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    firstDirtyAtRef.current = null;

    if (conflictRef.current) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;

    const operation = (async () => {
      // Sólo puede existir una petición PATCH en vuelo. Si el usuario sigue
      // escribiendo, el siguiente parche espera y usa la versión recién guardada.
      while (!conflictRef.current) {
        const payload = pendingRef.current;
        if (payload.title === undefined && payload.content === undefined) break;

        pendingRef.current = {};
        setSaveState('saving');

        let response: Response;
        try {
          response = await fetch(`/api/plugins/documents/documents/${documentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, version: versionRef.current }),
          });
        } catch {
          // Conservamos tanto el parche fallido como cualquier edición más nueva.
          pendingRef.current = { ...payload, ...pendingRef.current };
          setSaveState('dirty');
          toast.error('No se pudo guardar el documento.');
          break;
        }

        if (response.status === 409) {
          pendingRef.current = { ...payload, ...pendingRef.current };
          conflictRef.current = true;
          setSaveState('conflict');
          break;
        }

        if (!response.ok) {
          pendingRef.current = { ...payload, ...pendingRef.current };
          setSaveState('dirty');
          toast.error('No se pudo guardar el documento.');
          break;
        }

        const saved = await response.json();
        versionRef.current = saved.version;
        onSavedRef.current();
      }

      const pending = pendingRef.current;
      if (
        !conflictRef.current
        && pending.title === undefined
        && pending.content === undefined
      ) {
        setSaveState('saved');
      }
    })();

    inFlightRef.current = operation;
    const clearInFlight = () => {
      if (inFlightRef.current === operation) inFlightRef.current = null;
    };
    void operation.then(clearInFlight, clearInFlight);
    return operation;
  }, [documentId]);

  const queueSave = useCallback(
    (patch: { title?: string; content?: unknown }) => {
      if (conflictRef.current) return;

      pendingRef.current = { ...pendingRef.current, ...patch };
      setSaveState('dirty');

      const now = Date.now();
      firstDirtyAtRef.current ??= now;

      if (timerRef.current) clearTimeout(timerRef.current);

      // maxWait: si alguien escribe sin parar, igual guardamos cada 5 s.
      const waited = now - firstDirtyAtRef.current;
      const delay = Math.min(SAVE_DEBOUNCE_MS, Math.max(0, SAVE_MAX_WAIT_MS - waited));
      timerRef.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  const searchDocuments = useCallback(async (query: string): Promise<DocumentPick[]> => {
    const response = await fetch(`/api/plugins/documents/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const results = await response.json();
    return results.filter((doc: DocumentPick) => doc.id !== documentId);
  }, [documentId]);

  const createLinkedDocument = useCallback(
    async (newTitle: string): Promise<DocumentPick | null> => {
      const response = await fetch('/api/plugins/documents/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!response.ok) {
        toast.error('No se pudo crear el documento.');
        return null;
      }
      const created = await response.json();
      onSavedRef.current();
      return { id: created.id, title: created.title, emoji: created.emoji };
    },
    [],
  );

  const extensions = useMemo(
    () => buildEditorExtensions({ searchDocuments, createDocument: createLinkedDocument }),
    [searchDocuments, createLinkedDocument],
  );

  const editor = useEditor(
    {
      extensions,
      // Sin esto hay error de hidratación en App Router.
      immediatelyRender: false,
      editorProps: {
        attributes: { class: 'doc-prose focus:outline-none' },
        handleClick: (_view, _pos, event) => {
          const target = (event.target as HTMLElement | null)?.closest('[data-document-id]');
          const linkedId = Number(target?.getAttribute('data-document-id'));
          if (Number.isInteger(linkedId) && linkedId > 0) {
            onOpenDocument(linkedId);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: instance }) => queueSave({ content: instance.getJSON() }),
    },
    [extensions],
  );

  // Cargar el documento cuando llega. Una revalidación vieja de SWR nunca debe
  // pisar texto local pendiente ni recrear el contenido después de guardar.
  useEffect(() => {
    if (!editor || !data) return;
    if (conflictRef.current || inFlightRef.current) return;

    const pending = pendingRef.current;
    if (pending.title !== undefined || pending.content !== undefined) return;
    if (data.version < versionRef.current) return;
    if (versionRef.current !== 0 && data.version === versionRef.current) return;

    conflictRef.current = false;
    pendingRef.current = {};
    versionRef.current = data.version;
    setTitle(data.title);
    setSaveState('saved');
    editor.commands.setContent(data.content as never, { emitUpdate: false });
  }, [editor, data]);

  const reloadFromServer = useCallback(async () => {
    const fresh = await mutate();
    if (!editor || !fresh) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    firstDirtyAtRef.current = null;
    conflictRef.current = false;
    pendingRef.current = {};
    versionRef.current = fresh.version;
    setTitle(fresh.title);
    editor.commands.setContent(fresh.content as never, { emitUpdate: false });
    setSaveState('saved');
  }, [editor, mutate]);

  // Guardar lo pendiente al salir: cambio de pestaña, cierre, o navegación a otro documento.
  useEffect(() => {
    const onLeave = () => void flush();
    document.addEventListener('visibilitychange', onLeave);
    window.addEventListener('pagehide', onLeave);

    return () => {
      document.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('pagehide', onLeave);
      // Sin este flush, cambiar de documento pierde lo último escrito.
      void flush();
    };
  }, [flush]);

  const uploadImage = useCallback(
    async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      body.append('documentId', String(documentId));

      const response = await fetch('/api/plugins/documents/media', { method: 'POST', body });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? 'No se pudo subir la imagen.');
        return;
      }
      editor?.chain().focus().setImage({ src: result.url }).run();
    },
    [documentId, editor],
  );

  if (isLoading || !editor) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!data?.id) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">El documento no existe.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-4 py-2 backdrop-blur md:px-8">
        <div className="mx-auto flex w-full max-w-[46rem] items-center justify-between gap-3">
          <nav className="min-w-0 truncate text-xs text-muted-foreground">
            {data.breadcrumbs.length
              ? data.breadcrumbs.map((crumb) => `${crumb.emoji ?? '📁'} ${crumb.name}`).join(' / ')
              : 'Documentos'}
          </nav>
          <SaveBadge state={saveState} />
        </div>
      </header>

      <Toolbar editor={editor} onUpload={uploadImage} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-6 md:px-8">
        <div className="mx-auto w-full max-w-[46rem]">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              queueSave({ title: event.target.value });
            }}
            placeholder="Documento sin título"
            className="w-full border-none bg-transparent text-3xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 md:text-4xl"
          />

          <div className="mt-6">
            <EditorContent editor={editor} />
          </div>

          {data.backlinks.length > 0 && (
            <section className="mt-16 border-t pt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documentos que enlazan acá
              </h2>
              <ul className="mt-3 space-y-1">
                {data.backlinks.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDocument(link.id)}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {link.emoji ? `${link.emoji} ` : ''}
                      {link.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {saveState === 'conflict' && (
        <div className="shrink-0 border-t border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive md:px-8">
          <div className="mx-auto flex w-full max-w-[46rem] items-center gap-3">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">
              Alguien más guardó este documento mientras lo editabas. Para no pisar su trabajo, dejamos de guardar.
            </p>
            <button
              type="button"
              onClick={() => void reloadFromServer()}
              className="shrink-0 rounded-md border border-destructive/30 px-3 py-1 text-xs font-medium hover:bg-destructive/10"
            >
              Recargar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'conflict') return <span className="shrink-0 text-xs text-destructive">Conflicto</span>;
  if (state === 'saving') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
      </span>
    );
  }
  if (state === 'dirty') return <span className="shrink-0 text-xs text-muted-foreground">Sin guardar</span>;
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <Check className="h-3 w-3" /> Guardado
    </span>
  );
}

function Toolbar({ editor, onUpload }: { editor: Editor; onUpload: (file: File) => void }) {
  const t = useTranslations('Documents');
  const fileRef = useRef<HTMLInputElement>(null);
  const isInTable = editor.isActive('table');

  const button = (
    key: string,
    Icon: typeof Bold,
    isActive: boolean,
    action: () => void,
    label: string,
  ) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition',
        isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    // En móvil queda fija sobre el teclado; en escritorio, debajo del header.
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-2 py-1 backdrop-blur md:static md:border-b md:px-8 md:py-1.5">
      <div className="mx-auto flex w-full max-w-[46rem] items-center gap-0.5 overflow-x-auto">
        {button('bold', Bold, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Negrita')}
        {button('italic', Italic, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Cursiva')}
        {button('strike', Strikethrough, editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Tachado')}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        {button('h1', Heading1, editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'Título 1')}
        {button('h2', Heading2, editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Título 2')}
        {button('h3', Heading3, editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Título 3')}
        {button('ul', List, editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Lista')}
        {button('ol', ListOrdered, editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Lista numerada')}
        {button('task', CheckSquare, editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), 'Tareas')}
        {button('quote', Quote, editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Cita')}
        {button('code', Code, editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), 'Código')}
        {button('hr', Minus, false, () => editor.chain().focus().setHorizontalRule().run(), t('horizontal_rule'))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={isInTable ? t('table_options') : t('table_insert')}
              aria-label={isInTable ? t('table_options') : t('table_insert')}
              className={cn(
                'h-9 w-9 shrink-0 rounded-md text-muted-foreground',
                isInTable && 'bg-accent text-accent-foreground',
              )}
            >
              <TableProperties className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            {!isInTable ? (
              <DropdownMenuItem onSelect={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                <TableProperties />
                {t('table_insert')}
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuLabel>{t('table_options')}</DropdownMenuLabel>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Rows3 className="h-4 w-4 text-muted-foreground" />
                    {t('table_rows')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem onSelect={() => editor.chain().focus().addRowBefore().run()}>{t('table_row_before')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => editor.chain().focus().addRowAfter().run()}>{t('table_row_after')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => editor.chain().focus().deleteRow().run()}>
                      <Trash2 />
                      {t('table_row_delete')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <Columns3 className="h-4 w-4 text-muted-foreground" />
                    {t('table_columns')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem onSelect={() => editor.chain().focus().addColumnBefore().run()}>{t('table_column_before')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => editor.chain().focus().addColumnAfter().run()}>{t('table_column_after')}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => editor.chain().focus().deleteColumn().run()}>
                      <Trash2 />
                      {t('table_column_delete')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderRow().run()}>
                  <Heading3 />
                  {t('table_header_toggle')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor.can().mergeCells()} onSelect={() => editor.chain().focus().mergeCells().run()}>
                  <TableCellsMerge />
                  {t('table_cells_merge')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!editor.can().splitCell()} onSelect={() => editor.chain().focus().splitCell().run()}>
                  <TableCellsSplit />
                  {t('table_cell_split')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => editor.chain().focus().deleteTable().run()}>
                  <Trash2 />
                  {t('table_delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        {button('link', Link2, editor.isActive('link'), () => {
          const previous = editor.getAttributes('link').href ?? '';
          const href = window.prompt('URL del enlace', previous);
          if (href === null) return;
          if (!href) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().setLink({ href }).run();
        }, 'Enlace')}
        {button('image', ImageIcon, false, () => fileRef.current?.click(), 'Imagen')}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
