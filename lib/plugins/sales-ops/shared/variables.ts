/**
 * Las variables de un mensaje (`{{variable}}` o `[[variable]]`), resueltas donde se escribe y no en el
 * prompt.
 *
 * Un mensaje preparado puede llegar con huecos —`{{nombre}}`, `{{fecha}}`,
 * `{{hora}}`— y hasta ahora completarlos era editar el texto a mano y acordarse
 * de no dejar ninguno. Un `{{nombre}}` que se escapa se manda literal al
 * cliente; el error se ve recién en el chat, cuando ya salió.
 *
 * Acá se detectan, se les infiere el tipo por el nombre y se resuelven. Sin
 * llamar a ningún modelo: es una lectura del texto, y hacerla en el servidor
 * con IA costaría una llamada por tarjeta para adivinar lo que la palabra ya
 * dice.
 */

export type TipoVariable = 'nombre' | 'fecha' | 'hora' | 'texto';

export type VariableDetectada = {
  /** Tal cual aparece entre llaves. */
  name: string;
  /** Cómo se muestra arriba del campo. */
  label: string;
  tipo: TipoVariable;
};

const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}|\[\[\s*([^\[\]]+?)\s*\]\]/g;

/** `{{ nombre }}` / `[[nombre]]` → `nombre`, sin repetir y en el orden en que aparecen. */
export function detectarVariables(texto: string): VariableDetectada[] {
  const vistas = new Set<string>();
  const salida: VariableDetectada[] = [];
  for (const m of texto.matchAll(VARIABLE_PATTERN)) {
    const name = (m[1] ?? m[2] ?? '').trim();
    if (!name || vistas.has(name)) continue;
    vistas.add(name);
    salida.push({ name, label: etiqueta(name), tipo: tipoDe(name) });
  }
  return salida;
}

/** `fecha_de_entrega` → `Fecha de entrega`. */
function etiqueta(name: string): string {
  const limpio = name.replace(/[_-]+/g, ' ').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * El tipo sale del nombre de la variable, que es lo único que hay.
 *
 * Se compara sin acentos: quien escribe la plantilla pone `{{día}}` tanto como
 * `{{dia}}`.
 */
function tipoDe(name: string): TipoVariable {
  const n = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (/(^|_|\s)(hora|horario|hs)(_|\s|$)/.test(n)) return 'hora';
  if (/fecha|dia|vencimiento|vence|cuando|entrega|reunion|turno/.test(n)) return 'fecha';
  if (/nombre|cliente|contacto|persona|destinatario/.test(n)) return 'nombre';
  return 'texto';
}

/**
 * ¿Este texto sirve para saludar a alguien?
 *
 * En la base conviven personas ("Cacho Jara") con teléfonos sin agendar
 * ("5491160001672"), nombres de negocio ("vidrieria urgencia 24") y cosas como
 * ".". Meter cualquiera de ésos en un `{{nombre}}` produce "Hola
 * 5491160001672", que es peor que no saludar.
 *
 * La regla es conservadora a propósito: ante la duda, `false` y que la persona
 * decida.
 */
export function esNombrePropio(valor: string | null | undefined): boolean {
  const nombre = (valor ?? '').trim();
  if (nombre.length < 2 || nombre.length > 40) return false;
  // Un teléfono, un id o algo que arranca con número no es un nombre.
  if (/\d/.test(nombre)) return false;
  if (/[@/\\|#*<>]/.test(nombre)) return false;
  // Sólo letras (con acentos y ñ), espacios, apóstrofes y guiones.
  if (!/^[\p{L}][\p{L}\s'.-]*$/u.test(nombre)) return false;
  const palabras = nombre.split(/\s+/);
  if (palabras.length > 3) return false;
  // "TIENDA DEL SOL" o "distribuidora norte" son negocios, no personas.
  const comercial = /(tienda|shop|store|srl|s\.?a\.?|sas|distribuidora|deposito|kiosco|farmacia|estudio|taller|servicio|urgencia|express|market|market|centro|inmobiliaria|constructora|clinica|hotel|resto|bar|gym|academia)/i;
  if (comercial.test(nombre)) return false;
  return true;
}

/** El nombre para saludar: sólo el primero, capitalizado. */
export function nombreParaSaludo(valor: string | null | undefined): string | null {
  if (!esNombrePropio(valor)) return null;
  const primero = (valor ?? '').trim().split(/\s+/)[0];
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

/**
 * Reemplaza las variables por sus valores. Lo que no tenga valor **queda como
 * está**: borrar el hueco escondería que faltaba completarlo.
 */
export function aplicarVariables(texto: string, valores: Record<string, string>): string {
  return texto.replace(VARIABLE_PATTERN, (original, curlyName: string | undefined, squareName: string | undefined) => {
    const name = (curlyName ?? squareName ?? '').trim();
    const valor = valores[name];
    return valor && valor.trim() ? valor.trim() : original;
  });
}

/** Barrera compartida por UI, aprobación y ejecutor: ningún marcador puede salir al cliente. */
export function tieneVariablesPendientes(texto: string): boolean {
  return detectarVariables(texto).length > 0;
}

/** Las que siguen sin completar. */
export function variablesPendientes(texto: string, valores: Record<string, string>): VariableDetectada[] {
  return detectarVariables(texto).filter((v) => !(valores[v.name] ?? '').trim());
}

/** `2026-09-12` → `viernes 12 de septiembre`. */
export function fechaLegible(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  } catch {
    return iso;
  }
}

/** `15:30` → `15:30 h`; deja pasar cualquier cosa rara sin romper. */
export function horaLegible(valor: string): string {
  return /^\d{1,2}:\d{2}$/.test(valor.trim()) ? `${valor.trim()} h` : valor;
}
