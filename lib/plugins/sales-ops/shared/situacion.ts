/**
 * La situación del contacto: qué está pasando con esta persona ahora mismo.
 *
 * Hasta acá el Command Center tenía dos ejes —el grado del embudo (G0…GX, qué
 * tan cerca está de comprar) y la etapa (Dinero, Oportunidades, Barrido,
 * Limpieza)—, y ninguno de los dos contesta la pregunta que uno se hace al
 * abrir una lista: *¿este ya lo tocó alguien?*. Eso vivía en cuatro iconitos
 * al costado del nombre, sin nombre y sin filtro, así que para saber quién
 * estaba esperando respuesta y quién ni se había mirado había que abrir de a
 * uno.
 *
 * Son once estados y **cada contacto está en uno solo**: el primero de esta
 * lista que cumple. El orden no es alfabético ni cronológico, es el de la
 * pregunta que hay que hacerse antes de escribirle:
 *
 *   1. ¿Está cerrado?            → descartado (no se trabaja)
 *   2. ¿Está dormido?            → pospuesto (no se trabaja HOY)
 *   3. ¿Contestó y nadie fue?    → lo más urgente que hay
 *   4. ¿Hay un bot escribiendo?  → no escribas encima
 *   5. ¿Ya tiene algo por salir? → no lo trabajes de nuevo
 *   6. ¿Está analizado?          → si no, primero pasa por el clasificador
 *   7. ¿Debe plata?              → cobrar antes que vender
 *   8. ¿Le mandamos una demo?    → ya le dimos trabajo hecho
 *   9. ¿Le escribimos ya?        → esperando respuesta
 *  10. ¿Es cliente?              → sin nada pendiente, es cartera
 *  11. lo demás                  → auditado y nadie lo tocó NUNCA
 *
 * La derivación real vive en UN solo lugar —`situacionExpr` en
 * `server/queries.ts`, un CASE de SQL— y viaja en cada fila. Acá están sólo
 * los nombres y el orden, que los lee tanto el servidor (para armar el filtro)
 * como la interfaz (para pintar el icono). Si alguna vez se calcula la
 * situación en el cliente, el icono y el filtro empiezan a discrepar.
 */

export const SITUACIONES = [
  'descartado',
  'pospuesto',
  'contesto',
  'automatizacion',
  'en_cola',
  'sin_analizar',
  'cobro',
  'con_demo',
  'escrito',
  'cliente',
  'sin_tocar',
] as const;

export type Situacion = (typeof SITUACIONES)[number];

export type SituacionMeta = {
  label: string;
  /** Qué significa, en la lengua de quien trabaja la lista. */
  hint: string;
  /** Familia de color; el mapa concreto de clases vive en la interfaz. */
  tono: 'gris' | 'ambar' | 'rojo' | 'azul' | 'celeste' | 'violeta' | 'verde' | 'esmeralda';
};

export const SITUACION_META: Record<Situacion, SituacionMeta> = {
  descartado: { label: 'Descartado', tono: 'gris', hint: 'Cerrado: GX o pre-descarte. No se trabaja.' },
  pospuesto: { label: 'Pospuesto', tono: 'violeta', hint: 'Dormido hasta una fecha. Vuelve solo cuando llega.' },
  contesto: { label: 'Contestó, sin atender', tono: 'rojo', hint: 'Escribió después de nuestro último mensaje y nadie lo tomó.' },
  automatizacion: { label: 'Automatización activa', tono: 'ambar', hint: 'Hay un flujo escribiéndole ahora. No le escribas encima.' },
  en_cola: { label: 'Esperando salida', tono: 'azul', hint: 'Ya tiene algo por salir: acción aprobada, prompt encolado o mensaje programado.' },
  sin_analizar: { label: 'Sin analizar', tono: 'gris', hint: 'Nunca pasó por el clasificador: no hay grado ni acción recomendada.' },
  cobro: { label: 'Cobro pendiente', tono: 'verde', hint: 'Decidió comprar y falta el pago.' },
  con_demo: { label: 'Le mandamos trabajo', tono: 'violeta', hint: 'Tiene una demo o un pedido de producción hecho para él. Es lo más fuerte que le dimos: no es alguien a quien "no se tocó".' },
  escrito: { label: 'Le escribimos', tono: 'celeste', hint: 'Ya le escribimos al menos una vez —a mano, por la cola o por un conector— y todavía no contestó.' },
  cliente: { label: 'Ya es cliente', tono: 'esmeralda', hint: 'Tiene registro, venta o suscripción, y nada pendiente.' },
  sin_tocar: { label: 'Auditado, sin tocar', tono: 'ambar', hint: 'Nunca le escribimos ni le mandamos nada: el análisis está hecho y no salió nada de nuestro lado en toda la historia del chat.' },
};

export const esSituacion = (v: unknown): v is Situacion =>
  typeof v === 'string' && (SITUACIONES as readonly string[]).includes(v);

/**
 * El orden en que conviene trabajarlas, que NO es el de precedencia.
 *
 * La precedencia contesta "cuál de las diez es la de este contacto"; esto
 * contesta "en qué orden las muestro". Arriba lo que reclama a una persona,
 * abajo lo que está esperando algo que no depende de nadie.
 */
export const SITUACIONES_EN_ORDEN_DE_TRABAJO: Situacion[] = [
  'contesto',
  'sin_tocar',
  'cobro',
  'sin_analizar',
  'con_demo',
  'escrito',
  'en_cola',
  'automatizacion',
  'cliente',
  'pospuesto',
  'descartado',
];
