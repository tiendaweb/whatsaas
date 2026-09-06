/**
 * Párrafos para mensajes de WhatsApp escritos por una IA.
 *
 * El 2026-09-02 salieron 23 programados de 350 a 650 caracteres en un solo
 * bloque: el conector que los redactó no puso ni un salto de línea, y en el
 * celular un bloque así se lee como un muro. Nuestro pipeline no tocaba los
 * saltos —se verificó hasta la base de Evolution—, así que el arreglo va en la
 * puerta de entrada de lo que escriben los conectores: si el texto es largo y
 * no tiene ningún salto, se parte en párrafos por oración.
 *
 * Es deliberadamente conservador: sólo actúa cuando NO hay ningún salto (un
 * texto con párrafos ya viene decidido por quien lo escribió) y nunca corta
 * dentro de una URL ni de un número.
 */

/** Convierte "\n" escrito como dos caracteres (barra y ene) en un salto real. Algunos clientes lo mandan así. */
export function desescaparSaltos(texto: string): string {
  if (!texto.includes('\\n')) return texto;
  return texto.replace(/\\r\\n|\\n/g, '\n');
}

/** Largo a partir del cual un bloque sin saltos se parte en párrafos. */
export const LARGO_MINIMO_PARRAFOS = 240;
/** Largo aproximado de cada párrafo resultante. */
const LARGO_PARRAFO = 200;

/** Corta en oraciones: después de . ! ? … seguido de espacio y un carácter que no sea espacio. No corta "www.sitio.com" ni "$40.000". */
function oraciones(texto: string): string[] {
  const partes = texto.split(/(?<=[.!?…])\s+(?=\S)/u).map((s) => s.trim()).filter(Boolean);
  return partes.length ? partes : [texto.trim()];
}

/**
 * Devuelve el texto con párrafos separados por una línea en blanco.
 *
 * - Con un salto ya presente: se devuelve tal cual (sólo se desescapan "\n").
 * - Sin saltos y más corto que `minimo`: tal cual.
 * - Sin saltos y largo: se agrupan oraciones hasta ~200 caracteres por
 *   párrafo. La primera oración corta ("Hola 👋 Soy Noelia.") queda sola como
 *   saludo si le sigue algo largo.
 */
export function asegurarParrafos(texto: string, opts: { minimo?: number } = {}): string {
  const limpio = desescaparSaltos(texto).replace(/[ \t]+\n/g, '\n').trim();
  if (!limpio) return limpio;
  if (limpio.includes('\n')) return limpio;
  const minimo = opts.minimo ?? LARGO_MINIMO_PARRAFOS;
  if (limpio.length <= minimo) return limpio;

  const frases = oraciones(limpio);
  if (frases.length < 2) return limpio;

  const parrafos: string[] = [];
  let actual = '';
  for (const frase of frases) {
    if (!actual) {
      actual = frase;
      continue;
    }
    // Saludo corto al principio: va solo, como en cualquier mensaje escrito a mano.
    const esSaludo = parrafos.length === 0 && actual.length <= 60 && /^(hola|buen)/i.test(actual);
    if (esSaludo || actual.length + 1 + frase.length > LARGO_PARRAFO) {
      parrafos.push(actual);
      actual = frase;
    } else {
      actual = `${actual} ${frase}`;
    }
  }
  if (actual) parrafos.push(actual);
  return parrafos.join('\n\n');
}
