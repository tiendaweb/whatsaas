import {
  GATE_BASE_PROBABILITY,
  OBJECTION_FACTOR,
  SPEED_FACTOR,
  ageFactor,
  impactsFactor,
  type CollectionSpeed,
  type Gate,
  type Objection,
} from '../shared/taxonomy';

/**
 * Prioridad (doc 04 §9). Función pura: la importan B/C/D para reordenar sin
 * volver a clasificar (el housekeeping recalcula `f_antigüedad` a diario).
 *
 *   P = base(gate) × f_antigüedad × f_impactos × f_objeción × f_evidencia, acotado a [0,01, 0,95]
 *   priorityScore = P × valor_usd × velocidad  →  entero (equivale a P% × valor × velocidad / 100)
 *
 * Con la tabla del doc: Oscar (G10, USD 220, 6 h, 0 impactos, inmediata) = 0,85 × 220 = 187;
 * Carina (G9, USD 130, 1 impacto, 8-30 d, meses) = 0,70 × 0,8 × 0,85 × 130 × 0,25 = 15;
 * un G0 de abril (2 seguimientos, USD 45, indefinida) = 0,03 × 0,55 × 0,65 × 45 × 0,15 ≈ 0.
 */
export type PriorityInput = {
  gate: Gate;
  /** Días desde el último mensaje efectivo del cliente. `null` = nunca escribió: se usa 1,0. */
  daysSilent: number | null;
  followupsTotal: number;
  objection: Objection;
  collectionSpeed: CollectionSpeed;
  potentialValueUsd: number;
  evidenceGap: boolean;
  autoReply: boolean;
  confidence: number;
};

export type PriorityFactors = {
  base: number;
  age: number;
  impacts: number;
  objection: number;
  evidence: number;
  speed: number;
};

export type PriorityResult = {
  /** 0-100, entero. */
  recoveryProbability: number;
  /** Entero para ordenar. */
  priorityScore: number;
  factors: PriorityFactors;
};

export function evidenceFactor(input: Pick<PriorityInput, 'evidenceGap' | 'autoReply' | 'confidence'>): number {
  let factor = 1;
  if (input.evidenceGap) factor *= 0.8;
  if (input.autoReply) factor *= 0.7;
  if (input.confidence < 55) factor *= 0.6;
  return factor;
}

export function computePriority(input: PriorityInput): PriorityResult {
  const base = GATE_BASE_PROBABILITY[input.gate] ?? 0;
  const age = input.daysSilent == null ? 1 : ageFactor(Math.max(0, input.daysSilent));
  const impacts = impactsFactor(Math.max(0, input.followupsTotal));
  const objection = OBJECTION_FACTOR[input.objection] ?? 1;
  const evidence = evidenceFactor(input);
  const speed = SPEED_FACTOR[input.collectionSpeed] ?? SPEED_FACTOR.indefinida;

  let probability = base * age * impacts * objection * evidence;
  // G11 y GX quedan fuera de la cola: base 0 no se levanta al piso.
  if (base > 0) probability = Math.min(0.95, Math.max(0.01, probability));

  const value = Number.isFinite(input.potentialValueUsd) ? Math.max(0, input.potentialValueUsd) : 0;
  const recoveryProbability = Math.round(probability * 100);
  const priorityScore = Math.round(probability * value * speed);

  return {
    recoveryProbability,
    priorityScore,
    factors: { base, age, impacts, objection, evidence, speed },
  };
}
