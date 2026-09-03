import type { Branding, BrandingTheme } from '@/lib/db/schema';

/**
 * Variables de tema que un reseller puede sobrescribir. Es una allowlist cerrada:
 * cualquier otra clave se descarta, para que nadie meta CSS arbitrario por el nombre
 * de la propiedad.
 */
const ALLOWED_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-accent',
] as const;

/**
 * Solo formatos de color conocidos. El valor se interpola dentro de un <style>,
 * así que sin esta validación un valor como `red; } body { display:none` reescribe
 * la hoja de estilos entera.
 */
const COLOR_PATTERN =
  /^(#[0-9a-fA-F]{3,8}|(oklch|rgb|rgba|hsl|hsla)\(\s*[0-9a-zA-Z.,%\s/-]+\s*\))$/;

const RADIUS_PATTERN = /^[0-9.]+(rem|px|em)$/;

function serializeTokens(tokens: Record<string, string> | undefined): string {
  if (!tokens) return '';

  return Object.entries(tokens)
    .filter(([key, value]) => {
      if (!ALLOWED_TOKENS.includes(key as (typeof ALLOWED_TOKENS)[number])) {
        return false;
      }
      return typeof value === 'string' && COLOR_PATTERN.test(value.trim());
    })
    .map(([key, value]) => `--${key}: ${value.trim()};`)
    .join('');
}

/**
 * Genera el CSS del tema del reseller. Se inyecta DESPUÉS de globals.css para
 * ganarle en cascada a los valores por defecto. Devuelve '' si no hay nada válido,
 * y en ese caso no se debe renderizar el <style>.
 */
export function buildThemeCss(branding: Branding | null | undefined): string {
  const theme = branding?.theme as BrandingTheme | undefined;
  if (!theme) return '';

  const light = serializeTokens(theme.light);
  const dark = serializeTokens(theme.dark);

  const radius =
    typeof theme.radius === 'string' && RADIUS_PATTERN.test(theme.radius.trim())
      ? `--radius: ${theme.radius.trim()};`
      : '';

  const rootBody = `${light}${radius}`;

  const blocks: string[] = [];
  if (rootBody) blocks.push(`:root{${rootBody}}`);
  if (dark) blocks.push(`.dark{${dark}}`);

  return blocks.join('');
}
