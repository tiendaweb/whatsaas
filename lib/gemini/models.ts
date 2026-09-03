/**
 * Modelo de Gemini con el que nacen las keys nuevas.
 *
 * Vive suelto y no en `key-bank.ts` porque el formulario del dashboard es un
 * componente cliente y `key-bank.ts` es `server-only`: si el default se copia a
 * mano en los dos lados, se desincronizan y las keys nuevas quedan apuntando a
 * un modelo retirado. Pasó: Google dejó de servir `gemini-2.5-flash` a los
 * proyectos nuevos y las últimas keys cargadas devolvían 404 al primer audio.
 *
 * Al cambiarlo hay que tocar también el default de la columna en la base
 * (migración), porque las inserciones que no mandan `model` lo toman de ahí.
 */
export const MODELO_GEMINI_POR_DEFECTO = 'gemini-3.6-flash';
