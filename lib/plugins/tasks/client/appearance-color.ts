const HEX_COLOR_RE = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i;

function clampOpacity(opacity: number) {
  return Math.max(0, Math.min(100, Math.round(opacity)));
}

function opacityToAlpha(opacity: number) {
  return Math.round((clampOpacity(opacity) / 100) * 255)
    .toString(16)
    .padStart(2, '0');
}

function alphaToOpacity(alpha: string | undefined) {
  if (!alpha) return 100;
  return clampOpacity((parseInt(alpha, 16) / 255) * 100);
}

export function parseAppearanceColor(color: string | null | undefined) {
  const match = color?.trim().match(HEX_COLOR_RE);
  if (!match) return { base: '#3b82f6', opacity: 100, hasColor: false };

  return {
    base: `#${match[1].toLowerCase()}`,
    opacity: alphaToOpacity(match[2]),
    hasColor: true,
  };
}

export function composeAppearanceColor(base: string, opacity: number) {
  const parsed = parseAppearanceColor(base);
  if (!parsed.hasColor) return null;
  const cleanOpacity = clampOpacity(opacity);
  return cleanOpacity >= 100 ? parsed.base : `${parsed.base}${opacityToAlpha(cleanOpacity)}`;
}

export function getAppearanceBaseColor(color: string | null | undefined) {
  const parsed = parseAppearanceColor(color);
  return parsed.hasColor ? parsed.base : null;
}

export function getAppearanceOpacity(color: string | null | undefined) {
  return parseAppearanceColor(color).opacity;
}

export function withAppearanceAlpha(color: string | null | undefined, fallbackOpacity: number) {
  const parsed = parseAppearanceColor(color);
  if (!parsed.hasColor) return undefined;
  return composeAppearanceColor(parsed.base, parsed.opacity < 100 ? parsed.opacity : fallbackOpacity) ?? undefined;
}

export function sameAppearanceBase(a: string | null | undefined, b: string | null | undefined) {
  return getAppearanceBaseColor(a) === getAppearanceBaseColor(b);
}
