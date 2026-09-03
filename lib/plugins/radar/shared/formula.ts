/**
 * Evaluador de FÓRMULAS del RADAR Engine. Aritmética pura sobre variables con
 * nombre — nada de eval ni Function: tokenizador + parser de descenso
 * recursivo propio, así una fórmula escrita por una IA jamás ejecuta código.
 *
 * Gramática:
 *   expr    := term (('+'|'-') term)*
 *   term    := factor (('*'|'/') factor)*
 *   factor  := number | ident | ident '(' args ')' | '(' expr ')' | '-' factor
 *
 * Identificadores: campos o métricas (letras, números, '_', '.', '-'), p. ej.
 * `custom.radar_score` o `pipeline-activo`. Funciones disponibles:
 *   days_since(x) / hours_since(x)  — x es una fecha (ISO o Date); ahora - x.
 *   abs(x), min(a,b), max(a,b), round(x)
 * División por cero y variables sin valor devuelven null (el caller decide
 * si eso es 0, un guion o un error).
 */

export type FormulaResolver = (name: string) => unknown;

const FUNCTIONS = ['days_since', 'hours_since', 'abs', 'min', 'max', 'round'] as const;
type FormulaFunction = (typeof FUNCTIONS)[number];

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'comma' };

const IDENT_REGEX = /^[a-zA-Z_][a-zA-Z0-9_.-]*/;
const NUMBER_REGEX = /^\d+(?:\.\d+)?/;

export function tokenizeFormula(input: string): Token[] {
  const tokens: Token[] = [];
  let rest = input.trim();
  if (!rest) throw new Error('la fórmula está vacía');
  if (rest.length > 300) throw new Error('la fórmula supera los 300 caracteres');

  while (rest.length) {
    rest = rest.replace(/^\s+/, '');
    if (!rest.length) break;
    const char = rest[0];
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'op', value: char });
      rest = rest.slice(1);
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char });
      rest = rest.slice(1);
      continue;
    }
    if (char === ',') {
      tokens.push({ kind: 'comma' });
      rest = rest.slice(1);
      continue;
    }
    const number = rest.match(NUMBER_REGEX);
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[0]) });
      rest = rest.slice(number[0].length);
      continue;
    }
    const ident = rest.match(IDENT_REGEX);
    if (ident) {
      tokens.push({ kind: 'ident', value: ident[0] });
      rest = rest.slice(ident[0].length);
      continue;
    }
    throw new Error(`carácter inválido en la fórmula: "${char}" (solo números, nombres, + - * / paréntesis y comas)`);
  }
  return tokens;
}

/** Devuelve los identificadores (variables, no funciones) que usa la fórmula. */
export function formulaIdentifiers(formula: string): string[] {
  const tokens = tokenizeFormula(formula);
  const names = new Set<string>();
  tokens.forEach((token, index) => {
    if (token.kind !== 'ident') return;
    if ((FUNCTIONS as readonly string[]).includes(token.value)) {
      // Un nombre de función seguido de '(' no es una variable.
      const next = tokens[index + 1];
      if (next && next.kind === 'paren' && next.value === '(') return;
    }
    names.add(token.value);
  });
  return [...names];
}

/** Valida la sintaxis sin evaluar. Devuelve el error, o null si está bien. */
export function checkFormulaSyntax(formula: string): string | null {
  try {
    evaluateFormula(formula, () => 0);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toDateMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

/**
 * Evalúa la fórmula. `resolve` provee el valor de cada variable (campo de la
 * fila o valor de otra métrica). Cualquier operando nulo propaga null.
 */
export function evaluateFormula(formula: string, resolve: FormulaResolver): number | null {
  const tokens = tokenizeFormula(formula);
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];

  function parseExpr(): number | null {
    let left = parseTerm();
    while (peek()?.kind === 'op' && (peek() as { value: string }).value.match(/[+-]/)) {
      const op = (next() as { value: '+' | '-' }).value;
      const right = parseTerm();
      if (left === null || right === null) left = null;
      else left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    while (peek()?.kind === 'op' && (peek() as { value: string }).value.match(/[*/]/)) {
      const op = (next() as { value: '*' | '/' }).value;
      const right = parseFactor();
      if (left === null || right === null) left = null;
      else if (op === '*') left = left * right;
      else left = right === 0 ? null : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    const token = peek();
    if (!token) throw new Error('la fórmula termina de forma inesperada');

    if (token.kind === 'op' && token.value === '-') {
      next();
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (token.kind === 'number') {
      next();
      return token.value;
    }
    if (token.kind === 'paren' && token.value === '(') {
      next();
      const value = parseExpr();
      const closing = next();
      if (!closing || closing.kind !== 'paren' || closing.value !== ')') {
        throw new Error('falta cerrar un paréntesis');
      }
      return value;
    }
    if (token.kind === 'ident') {
      next();
      const following = peek();
      const isCall = following && following.kind === 'paren' && following.value === '(';
      if (isCall && (FUNCTIONS as readonly string[]).includes(token.value)) {
        return parseCall(token.value as FormulaFunction);
      }
      if (isCall) {
        throw new Error(`función desconocida "${token.value}" (disponibles: ${FUNCTIONS.join(', ')})`);
      }
      return toNumber(resolve(token.value));
    }
    throw new Error('fórmula inválida: se esperaba un número, un nombre o un paréntesis');
  }

  function parseCall(name: FormulaFunction): number | null {
    next(); // '('
    // days_since / hours_since reciben una VARIABLE fecha, no una expresión.
    if (name === 'days_since' || name === 'hours_since') {
      const argument = next();
      if (!argument || argument.kind !== 'ident') {
        throw new Error(`${name}() espera el nombre de un campo fecha`);
      }
      const closing = next();
      if (!closing || closing.kind !== 'paren' || closing.value !== ')') {
        throw new Error(`falta cerrar el paréntesis de ${name}()`);
      }
      const ms = toDateMs(resolve(argument.value));
      if (ms === null) return null;
      const elapsed = Date.now() - ms;
      return name === 'days_since' ? elapsed / 86_400_000 : elapsed / 3_600_000;
    }

    const args: Array<number | null> = [parseExpr()];
    while (peek()?.kind === 'comma') {
      next();
      args.push(parseExpr());
    }
    const closing = next();
    if (!closing || closing.kind !== 'paren' || closing.value !== ')') {
      throw new Error(`falta cerrar el paréntesis de ${name}()`);
    }

    if (name === 'abs') return args[0] === null ? null : Math.abs(args[0]);
    if (name === 'round') return args[0] === null ? null : Math.round(args[0]);
    const clean = args.filter((value): value is number => value !== null);
    if (!clean.length) return null;
    return name === 'min' ? Math.min(...clean) : Math.max(...clean);
  }

  const result = parseExpr();
  if (position < tokens.length) throw new Error('la fórmula tiene tokens de más al final');
  return result;
}
