import type { CapturaParseada, Prioridad, Recurrencia } from './tipos';
import { hoyMediodiaIso, parseDdMm, sumarDiasIso } from './fechas';

export function parsearCaptura(raw: string, now = new Date()): CapturaParseada {
  let text = raw;
  let dueDate: string | null = null;
  let prioridad: Prioridad | null = null;
  let recurrencia: Recurrencia = 'unica';
  const etiquetas: string[] = [];

  const apply = (re: RegExp, fn: (match: string, group?: string) => void) => {
    text = text.replace(re, (match, group) => {
      fn(match, group);
      return ' ';
    });
  };

  apply(/@(próxima semana|proxima semana|next week)/gi, () => {
    dueDate = sumarDiasIso(hoyMediodiaIso(), 7);
  });
  apply(/@(mañana|manana|tomorrow)/gi, () => {
    dueDate = sumarDiasIso(hoyMediodiaIso(), 1);
  });
  apply(/@(hoy|today)/gi, () => {
    dueDate = hoyMediodiaIso();
  });
  apply(/@(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/g, (_m, group) => {
    dueDate = parseDdMm(group ?? '', now);
  });
  apply(/!(alta|high)/gi, () => {
    prioridad = 'alta';
  });
  apply(/!(media|medium)/gi, () => {
    prioridad = 'media';
  });
  apply(/!(baja|low)/gi, () => {
    prioridad = 'baja';
  });
  apply(/\*(diario|daily)/gi, () => {
    recurrencia = 'diaria';
  });
  apply(/\*(semanal|weekly)/gi, () => {
    recurrencia = 'semanal';
  });
  apply(/\*(mensual|monthly)/gi, () => {
    recurrencia = 'mensual';
  });
  apply(/#([\p{L}\p{N}_-]+)/gu, (_m, group) => {
    if (group) etiquetas.push(group);
  });

  return {
    titulo: text.replace(/\s+/g, ' ').trim(),
    dueDate,
    prioridad,
    recurrencia,
    etiquetas,
  };
}
