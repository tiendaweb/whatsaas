import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';

export type RadarPriorityValue = 'P1' | 'P2' | 'P3' | 'descartado';

export type PriorityContact = {
  contactId: number;
  contactName: string;
  remoteJid: string | null;
  priority: RadarPriorityValue | null;
  score: number | null;
  intencion: string | null;
  objecion: string | null;
  recuperabilidad: string | null;
  confianza: number | null;
  estrategia: string | null;
  fechaAnalisis: string | null;
  needsReview: boolean;
};

export type RadarOverview = {
  counts: { analyzed: number; p1: number; p2: number; p3: number; descartado: number; needsReview: number };
  lastAnalysisAt: string | null;
  priorityContacts: PriorityContact[];
};

export type RadarClient = PriorityContact & {
  instanceId: number | null;
  fechaAnalisis: string;
  reportCount: number;
  hasReports: boolean;
  openTaskCount: number;
  lastNoteAt: string | null;
};

export type RadarClientsResponse = {
  total: number;
  counts: { p1: number; p2: number; p3: number; descartado: number; needsReview: number; withReports: number };
  clients: RadarClient[];
};

export type RadarReportItem = {
  id: number;
  title: string;
  emoji: string | null;
  format: 'markdown' | 'html';
  updatedAt: string;
  linked?: boolean;
  summary?: string | null;
};

export type RadarClientDetail = {
  contact: { id: number; name: string; chatId: number };
  fields: Record<string, string | null>;
  analyzed: boolean;
  noteHeader: {
    date: string | null;
    priority: string | null;
    score: number | null;
    confidence: number | null;
    isReview: boolean;
    raw: string;
  } | null;
  noteBlocks: RadarBlock[];
  notes: Array<{ text: string; date: string }>;
  tasks: Array<{ id: number; title: string; status: string; dueDate: string | null; projectName: string; columnName: string }>;
  reports: RadarReportItem[];
  documents: Array<{
    documentId: number;
    summary: string | null;
    document: { id: number; title: string; emoji: string | null; format: 'markdown' | 'html'; updatedAt: string };
  }>;
  error?: string;
};
