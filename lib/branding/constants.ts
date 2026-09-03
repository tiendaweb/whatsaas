/**
 * Punto único de la marca. Antes el nombre por defecto estaba repetido en ~18 archivos
 * con dos valores distintos ('WhatsPro' y 'WhatSaaS'); con marca blanca cada lector
 * tiene que resolverlo contra el branding del tenant, no contra un literal.
 */
export const DEFAULT_BRAND_NAME = 'WhatsPro';
export const DEFAULT_BRAND_HOSTNAME = 'whatspro.uno';

/** Placeholder que se usa en el copy guardado en BD para interpolar la marca en el render. */
export const BRAND_PLACEHOLDER = '{brand}';

type BrandingLike = { name?: string | null } | null | undefined;

type BrandingIdentityLike = {
  name?: string | null;
  supportEmail?: string | null;
} | null | undefined;

export type BrandIdentity = {
  name: string;
  hostname: string;
  supportEmail: string;
};

export function brandName(branding: BrandingLike): string {
  return branding?.name?.trim() || DEFAULT_BRAND_NAME;
}

export function buildBrandIdentity(
  branding: BrandingIdentityLike,
  hostname?: string | null,
): BrandIdentity {
  const resolvedHostname = hostname?.trim().toLowerCase() || DEFAULT_BRAND_HOSTNAME;
  return {
    name: brandName(branding),
    hostname: resolvedHostname,
    supportEmail: branding?.supportEmail?.trim() || `support@${resolvedHostname}`,
  };
}

/**
 * Sustituye `{brand}` por el nombre de la marca. Se aplica en el render y no al guardar,
 * para que el texto que un reseller escriba con su propia marca siga siendo suyo.
 */
export function renderBrandText(text: string, name: string): string {
  return text.split(BRAND_PLACEHOLDER).join(name);
}

/**
 * Normaliza copy controlado por la plataforma para el tenant actual. No debe
 * aplicarse a chats, tareas, contactos ni ningún otro contenido del usuario.
 */
export function renderTenantText(text: string, identity: BrandIdentity): string {
  return text
    .split(BRAND_PLACEHOLDER).join(identity.name)
    .split('{domain}').join(identity.hostname)
    .replace(/\bwhatspro\.(?:uno|com)\b/gi, identity.hostname)
    .replace(/\b(?:whatspro|whatsaas)\b/gi, identity.name);
}

/** Recorre DTOs de copy administrado sin alterar Date ni otras instancias. */
export function renderTenantCopy<T>(value: T, identity: BrandIdentity): T {
  if (typeof value === 'string') {
    return renderTenantText(value, identity) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderTenantCopy(entry, identity)) as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, renderTenantCopy(entry, identity)]),
    ) as T;
  }
  return value;
}
