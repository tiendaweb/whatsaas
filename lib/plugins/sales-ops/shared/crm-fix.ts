import { z } from 'zod';

/**
 * Corrección de CRM propuesta por quien clasifica, en forma accionable.
 *
 * `crm_to_fix` (texto) explica qué está mal y por qué; esto dice qué tocar, para
 * que la ficha pueda ofrecer un botón en vez de obligar a repetir el cambio a
 * mano. Los dos conviven: el texto es el argumento, esto es la ejecución.
 *
 * Va por NOMBRE y no por id: lo escribe un conector que leyó el expediente, no
 * la base, y no tiene por qué conocer los ids internos del equipo. El servidor
 * los resuelve al aplicar y saltea —sin fallar— lo que no existe: una etiqueta
 * inventada no puede tumbar una corrección que además arreglaba la etapa.
 */
export const crmFixSchema = z.object({
  /** Nombre de la etapa del embudo. `null` = sacarlo del embudo. */
  stage: z.string().trim().max(120).nullable().optional(),
  add_tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  remove_tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /** Campos personalizados por nombre visible. Valor vacío o `null` = borrar. */
  fields: z.record(z.string().trim().min(1).max(100), z.string().max(2000).nullable()).optional(),
  /** Por qué, en una línea. Se muestra al lado del botón. */
  reason: z.string().trim().max(300).nullable().optional(),
});

export type CrmFixInput = z.infer<typeof crmFixSchema>;

/** Como se guarda y como lo lee la UI (camelCase, igual que el resto del payload). */
export type CrmFix = {
  stage?: string | null;
  addTags?: string[];
  removeTags?: string[];
  fields?: Record<string, string | null>;
  reason?: string | null;
};

export function normalizeCrmFix(input: CrmFixInput | null | undefined): CrmFix | null {
  if (!input) return null;
  const fix: CrmFix = {};
  if (input.stage !== undefined) fix.stage = input.stage;
  if (input.add_tags?.length) fix.addTags = input.add_tags;
  if (input.remove_tags?.length) fix.removeTags = input.remove_tags;
  if (input.fields && Object.keys(input.fields).length) fix.fields = input.fields;
  if (input.reason) fix.reason = input.reason;
  // Una propuesta que no propone nada no se guarda: dejaría un botón que no hace nada.
  const proponeAlgo = fix.stage !== undefined || fix.addTags || fix.removeTags || fix.fields;
  return proponeAlgo ? fix : null;
}

/** Lo que el botón va a hacer, en castellano, para mostrarlo antes de apretarlo. */
export function describeCrmFix(fix: CrmFix): string[] {
  const out: string[] = [];
  if (fix.stage !== undefined) out.push(fix.stage ? `Mover a la etapa “${fix.stage}”` : 'Sacarlo del embudo');
  if (fix.addTags?.length) out.push(`Agregar ${fix.addTags.map((t) => `“${t}”`).join(', ')}`);
  if (fix.removeTags?.length) out.push(`Sacar ${fix.removeTags.map((t) => `“${t}”`).join(', ')}`);
  for (const [nombre, valor] of Object.entries(fix.fields ?? {})) {
    out.push(valor == null || valor === '' ? `Borrar “${nombre}”` : `${nombre}: “${valor}”`);
  }
  return out;
}
