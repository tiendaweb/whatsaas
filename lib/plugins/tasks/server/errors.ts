import 'server-only';

/**
 * Error de dominio de Tareas con el status HTTP que le corresponde.
 *
 * Las operaciones de `lib/plugins/tasks/server/**` se comparten entre las routes
 * de la pantalla y las tools del conector MCP. La route traduce el status a la
 * respuesta; el conector sólo necesita el mensaje. Sin esto cada consumidor
 * tendría que volver a decidir qué es 404 y qué es 400.
 */
export class TaskOpsError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
