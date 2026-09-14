import type { ToolDefinition } from '../types';

export type BuiltinToolContext = { chatId: number; teamId: number };

/**
 * Función integrada del agente IA. A diferencia de las herramientas que el
 * equipo arma a mano en Ajustes → IA, éstas vienen en el código y se
 * encienden solas cuando el plugin que las respalda está activo.
 *
 * - `pluginId`: app que la habilita. `null` = siempre disponible (núcleo).
 * - `risk`: `read` sólo consulta; `write` modifica datos del equipo. La UI lo
 *   muestra para que quien administra sepa qué le está dejando hacer al bot.
 * - `silent`: el cliente no se entera de que se ejecutó. Ver `ToolDefinition`.
 */
export type BuiltinToolDefinition = Omit<ToolDefinition, 'execute'> & {
  pluginId: string | null;
  label: string;
  summary: string;
  risk: 'read' | 'write';
  execute: (args: any, context: BuiltinToolContext) => Promise<any>;
};

export type BuiltinToolCatalogEntry = {
  name: string;
  pluginId: string | null;
  pluginName: string;
  label: string;
  summary: string;
  risk: 'read' | 'write';
  silent: boolean;
  pluginActive: boolean;
  enabled: boolean;
};

export function ok<T extends Record<string, unknown>>(data: T) {
  return { success: true as const, ...data };
}

export function fail(message: string, extra: Record<string, unknown> = {}) {
  return { success: false as const, error: message, ...extra };
}

/** Recorta textos largos antes de devolvérselos al modelo (ahorra tokens). */
export function clip(text: string | null | undefined, max = 600) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
