import type { ChecklistItem } from './types';
import { nanoid } from './utils';

export type CascadeTask = {
  title: string;
  notes: string;
  checklist: ChecklistItem[];
};

export type CascadeColumn = {
  title: string;
  tasks: CascadeTask[];
};

export type CascadeProject = {
  title: string;
  columns: CascadeColumn[];
};

export type CascadeWorkspace = {
  title: string;
  projects: CascadeProject[];
};

export type CascadeDocument = {
  workspaces: CascadeWorkspace[];
};

export type CascadePath = {
  workspace: string;
  project: string;
  column: string;
  task: string;
};

const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const CHECKLIST_RE = /^[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/;
const NOTES_FENCE_START = /^:::notes\s*$/i;
const NOTES_FENCE_END = /^:::\s*$/;

export const CASCADE_SYNTAX_HELP = `# Ventas
## Pipeline comercial
### Por hacer
#### Revisar lead nuevo
:::notes
Notas con **markdown** seguro. Aqui puedes poner contexto, criterios o enlaces.
:::
- Validar origen del lead
- Preparar respuesta inicial
- [x] Crear contacto CRM
#### Enviar propuesta
> Nota corta opcional
- Adjuntar propuesta
- Agendar seguimiento`;

export function cascadePathKey(path: CascadePath): string {
  return [path.workspace, path.project, path.column, path.task].join('::');
}

function parseChecklistLine(line: string): ChecklistItem | null {
  const match = line.trim().match(CHECKLIST_RE);
  if (!match) return null;
  const completed = match[1] ? /x/i.test(match[1]) : false;
  return { id: nanoid(), text: match[2].trim(), completed };
}

function flushNotesBlock(lines: string[]): string {
  return lines.join('\n').trim();
}

export function parseCascadeDocument(raw: string): CascadeDocument {
  const workspaces: CascadeWorkspace[] = [];
  let workspace: CascadeWorkspace | null = null;
  let project: CascadeProject | null = null;
  let column: CascadeColumn | null = null;
  let task: CascadeTask | null = null;
  let notesMode: 'none' | 'fence' | 'quote' = 'none';
  let notesBuffer: string[] = [];

  const flushNotes = () => {
    if (!task || notesBuffer.length === 0) {
      notesBuffer = [];
      notesMode = 'none';
      return;
    }
    const block = flushNotesBlock(notesBuffer);
    task.notes = task.notes ? `${task.notes}\n\n${block}` : block;
    notesBuffer = [];
    notesMode = 'none';
  };

  const ensureWorkspace = (title: string) => {
    flushNotes();
    const found = workspaces.find((w) => w.title === title);
    if (found) {
      workspace = found;
    } else {
      workspace = { title, projects: [] };
      workspaces.push(workspace);
    }
    project = null;
    column = null;
    task = null;
  };

  const ensureProject = (title: string) => {
    flushNotes();
    if (!workspace) ensureWorkspace('Principal');
    const found = workspace!.projects.find((p) => p.title === title);
    if (found) {
      project = found;
    } else {
      project = { title, columns: [] };
      workspace!.projects.push(project);
    }
    column = null;
    task = null;
  };

  const ensureColumn = (title: string) => {
    flushNotes();
    if (!project) ensureProject('Proyecto');
    const found = project!.columns.find((c) => c.title === title);
    if (found) {
      column = found;
    } else {
      column = { title, tasks: [] };
      project!.columns.push(column);
    }
    task = null;
  };

  const ensureTask = (title: string) => {
    flushNotes();
    if (!column) ensureColumn('Por hacer');
    const found = column!.tasks.find((t) => t.title === title);
    if (found) {
      task = found;
    } else {
      task = { title, notes: '', checklist: [] };
      column!.tasks.push(task);
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    if (notesMode === 'fence') {
      if (NOTES_FENCE_END.test(line.trim())) {
        flushNotes();
      } else {
        notesBuffer.push(line);
      }
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (!title) continue;
      if (level === 1) ensureWorkspace(title);
      else if (level === 2) ensureProject(title);
      else if (level === 3) ensureColumn(title);
      else if (level === 4) ensureTask(title);
      continue;
    }

    if (NOTES_FENCE_START.test(line.trim())) {
      notesMode = 'fence';
      notesBuffer = [];
      continue;
    }

    if (line.startsWith('> ') && task) {
      if (notesMode !== 'quote') {
        flushNotes();
        notesMode = 'quote';
        notesBuffer = [];
      }
      notesBuffer.push(line.slice(2));
      continue;
    }

    const checklistItem = parseChecklistLine(line);
    if (checklistItem !== null && task !== null) {
      flushNotes();
      (task as CascadeTask).checklist.push(checklistItem);
      continue;
    }

    if (notesMode === 'quote' && task !== null && line.trim()) {
      notesBuffer.push(line);
      continue;
    }
  }

  flushNotes();
  return { workspaces };
}

function serializeTaskNotes(notes: string): string[] {
  if (!notes.trim()) return [];
  const lines = notes.split('\n');
  if (lines.length === 1) return [`> ${lines[0]}`];
  return [':::notes', ...lines, ':::'];
}

export type CascadeExportWorkspace = {
  id?: number;
  name: string;
  projects: Array<{
    id?: number;
    name: string;
    columns: Array<{
      id?: number;
      title: string;
      items: Array<{
        id?: number;
        title: string;
        notes: string;
        checklist: ChecklistItem[];
      } | null | undefined>;
    }>;
  }>;
};

export function serializeCascadeDocument(workspaces: CascadeExportWorkspace[]): string {
  const blocks: string[] = [];

  for (const ws of workspaces) {
    blocks.push(`# ${ws.name}`);
    for (const project of ws.projects) {
      blocks.push(`## ${project.name}`);
      for (const column of project.columns) {
        blocks.push(`### ${column.title}`);
        for (const item of column.items) {
          if (!item) continue;
          blocks.push(`#### ${item.title}`);
          blocks.push(...serializeTaskNotes(item.notes));
          for (const check of item.checklist) {
            blocks.push(check.completed ? `- [x] ${check.text}` : `- ${check.text}`);
          }
        }
      }
    }
    blocks.push('');
  }

  return blocks.join('\n').trim();
}

export function summarizeCascadeDocument(doc: CascadeDocument) {
  let projects = 0;
  let columns = 0;
  let tasks = 0;
  let checklist = 0;

  for (const ws of doc.workspaces) {
    projects += ws.projects.length;
    for (const project of ws.projects) {
      columns += project.columns.length;
      for (const column of project.columns) {
        tasks += column.tasks.length;
        for (const task of column.tasks) {
          checklist += task.checklist.length;
        }
      }
    }
  }

  return {
    workspaces: doc.workspaces.length,
    projects,
    columns,
    tasks,
    checklist,
  };
}
