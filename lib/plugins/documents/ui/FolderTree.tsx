'use client';

import { useCallback, useState } from 'react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderClosed,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MAX_DEPTH, type DocumentSummary, type FolderNode } from './tree';

const ROOT_DROPPABLE_ID = 'documents:root';
const documentListId = (folderId: number) => `documents:folder:${folderId}`;
const folderTargetId = (folderId: number) => `documents:target:${folderId}`;

type Props = {
  nodes: FolderNode[];
  rootDocuments: DocumentSummary[];
  activeDocumentId: number | null;
  expanded: Record<number, boolean>;
  isMoving: boolean;
  onToggle: (folderId: number) => void;
  /** Además de expandir/colapsar: navega la vista principal a esa carpeta (grilla de íconos / lista). */
  onOpenFolder?: (folderId: number) => void;
  onOpenDocument: (id: number) => void;
  onCreateDocument: (folderId: number | null) => void;
  onCreateFolder: (parentId: number | null) => void;
  onRenameFolder: (folder: FolderNode) => void;
  onDeleteFolder: (folder: FolderNode) => void;
  onDeleteDocument: (document: DocumentSummary) => void;
  onMoveDocument: (documentId: number, folderId: number | null, position: number) => void;
};

type BranchProps = Omit<Props, 'nodes' | 'rootDocuments'> & { isDragging: boolean };

export function FolderTree(props: Props) {
  const t = useTranslations('Documents');
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      setIsDragging(false);
      const { destination, draggableId, source } = result;
      if (!destination || props.isMoving) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const documentId = Number(draggableId.replace('document:', ''));
      if (!Number.isInteger(documentId)) return;

      if (destination.droppableId === ROOT_DROPPABLE_ID) {
        props.onMoveDocument(documentId, null, destination.index);
        return;
      }

      const listMatch = destination.droppableId.match(/^documents:folder:(\d+)$/);
      if (listMatch) {
        props.onMoveDocument(documentId, Number(listMatch[1]), destination.index);
        return;
      }

      const targetMatch = destination.droppableId.match(/^documents:target:(\d+)$/);
      if (targetMatch) {
        const folderId = Number(targetMatch[1]);
        props.onMoveDocument(documentId, folderId, countFolderDocuments(props.nodes, folderId) ?? 0);
      }
    },
    [props],
  );

  const branchProps: BranchProps = { ...props, isDragging };

  return (
    <DragDropContext
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-0.5">
        {props.nodes.map((node) => (
          <FolderBranch key={node.id} node={node} {...branchProps} />
        ))}

        <DocumentList
          droppableId={ROOT_DROPPABLE_ID}
          documents={props.rootDocuments}
          depth={0}
          activeDocumentId={props.activeDocumentId}
          isDragging={isDragging}
          isMoving={props.isMoving}
          rootLabel={t('root_drop_zone')}
          emptyLabel={t('root_drop_zone')}
          onOpen={props.onOpenDocument}
          onDelete={props.onDeleteDocument}
        />
      </div>
    </DragDropContext>
  );
}

function FolderBranch({ node, ...props }: BranchProps & { node: FolderNode }) {
  const t = useTranslations('Documents');
  const isOpen = props.expanded[node.id] ?? node.depth === 1;
  // El padding va inline: las clases dinámicas de Tailwind no se generan en el build.
  const paddingLeft = (node.depth - 1) * 12 + 8;

  return (
    <div>
      <Droppable
        droppableId={folderTargetId(node.id)}
        type="DOCUMENT"
        isDropDisabled={props.isMoving}
      >
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'group rounded-md border border-transparent transition-colors',
              snapshot.isDraggingOver && 'border-primary/40 bg-primary/10',
            )}
          >
            <div
              className="flex items-center gap-1 rounded-xl pr-1 text-sm transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
              style={{ paddingLeft }}
            >
              <button
                type="button"
                onClick={() => {
                  props.onToggle(node.id);
                  props.onOpenFolder?.(node.id);
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                )}
                {node.emoji ? (
                  <span className="shrink-0 text-sm leading-none">{node.emoji}</span>
                ) : isOpen ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-indigo-500" />
                ) : (
                  <FolderClosed className="h-4 w-4 shrink-0 text-neutral-400" />
                )}
                <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{node.name}</span>
                {node.documents.length ? (
                  <span className="ml-auto shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {node.documents.length}
                  </span>
                ) : null}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent focus:opacity-100 group-hover:opacity-100"
                    aria-label={t('folder_actions_label', { name: node.name })}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => props.onCreateDocument(node.id)}>
                    {t('create_document_here')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={node.depth >= MAX_DEPTH}
                    onClick={() => props.onCreateFolder(node.id)}
                  >
                    {t('new_subfolder')}
                    {node.depth >= MAX_DEPTH ? (
                      <span className="ml-auto text-xs">{t('depth_limit', { count: MAX_DEPTH })}</span>
                    ) : null}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => props.onRenameFolder(node)}>{t('rename')}</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => props.onDeleteFolder(node)}>
                    {t('delete_folder')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {isOpen && (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <FolderBranch key={child.id} node={child} {...props} />
          ))}

          <DocumentList
            droppableId={documentListId(node.id)}
            documents={node.documents}
            depth={node.depth}
            activeDocumentId={props.activeDocumentId}
            isDragging={props.isDragging}
            isMoving={props.isMoving}
            emptyLabel={props.isDragging ? t('drop_here') : t('empty_folder')}
            onOpen={props.onOpenDocument}
            onDelete={props.onDeleteDocument}
          />
        </div>
      )}
    </div>
  );
}

function DocumentList({
  droppableId,
  documents,
  depth,
  activeDocumentId,
  isDragging,
  isMoving,
  emptyLabel,
  rootLabel,
  onOpen,
  onDelete,
}: {
  droppableId: string;
  documents: DocumentSummary[];
  depth: number;
  activeDocumentId: number | null;
  isDragging: boolean;
  isMoving: boolean;
  emptyLabel: string;
  rootLabel?: string;
  onOpen: (id: number) => void;
  onDelete: (document: DocumentSummary) => void;
}) {
  return (
    <Droppable droppableId={droppableId} type="DOCUMENT" isDropDisabled={isMoving}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            'rounded-md border border-transparent transition-colors',
            snapshot.isDraggingOver && 'border-primary/40 bg-primary/10',
            isDragging && rootLabel && 'mt-1 border-dashed border-border py-1',
          )}
        >
          {documents.map((document, index) => (
            <DocumentRow
              key={document.id}
              document={document}
              index={index}
              depth={depth}
              active={activeDocumentId === document.id}
              isMoving={isMoving}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
          {provided.placeholder}

          {!documents.length && (!rootLabel || isDragging) ? (
            <p
              className={cn(
                'py-1 text-xs text-muted-foreground/70',
                isDragging && 'min-h-7 border border-dashed border-border/70',
              )}
              style={{ paddingLeft: depth * 12 + 24 }}
            >
              {emptyLabel}
            </p>
          ) : null}

          {isDragging && rootLabel && documents.length ? (
            <p className="px-2 py-1 text-center text-xs text-muted-foreground">{rootLabel}</p>
          ) : null}
        </div>
      )}
    </Droppable>
  );
}

function DocumentRow({
  document,
  index,
  depth,
  active,
  isMoving,
  onOpen,
  onDelete,
}: {
  document: DocumentSummary;
  index: number;
  depth: number;
  active: boolean;
  isMoving: boolean;
  onOpen: (id: number) => void;
  onDelete: (document: DocumentSummary) => void;
}) {
  const t = useTranslations('Documents');

  return (
    <Draggable draggableId={`document:${document.id}`} index={index} isDragDisabled={isMoving}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'group flex items-center gap-1 rounded-xl border border-transparent pr-1 text-sm transition-all duration-200',
            active
              ? 'bg-indigo-500/10 font-semibold text-indigo-600 dark:text-indigo-400'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60',
            snapshot.isDragging && 'border-indigo-500/30 bg-white shadow-sm dark:bg-neutral-800',
          )}
          style={{
            ...provided.draggableProps.style,
            paddingLeft: depth * 12 + 10,
          }}
        >
          <button
            type="button"
            {...provided.dragHandleProps}
            aria-label={t('drag_handle_label', { title: document.title })}
            className="flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-neutral-400 opacity-40 transition hover:bg-neutral-100 hover:opacity-100 focus:opacity-100 active:cursor-grabbing group-hover:opacity-100 dark:hover:bg-neutral-800"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onOpen(document.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
          >
            {document.emoji ? (
              <span className="shrink-0 text-sm leading-none">{document.emoji}</span>
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
            )}
            <span className="truncate">{document.title}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent focus:opacity-100 group-hover:opacity-100"
                aria-label={t('document_actions_label', { title: document.title })}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(document)}>
                {t('delete_document')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </Draggable>
  );
}

function countFolderDocuments(nodes: FolderNode[], folderId: number): number | null {
  for (const node of nodes) {
    if (node.id === folderId) return node.documents.length;
    const childCount = countFolderDocuments(node.children, folderId);
    if (childCount !== null) return childCount;
  }
  return null;
}
