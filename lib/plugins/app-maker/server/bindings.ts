import 'server-only';

import type { AppInputBinding } from '../shared/contract';

export type AppMakerBindingContext = {
  form?: Record<string, unknown>;
  row?: Record<string, unknown>;
  selected?: Record<string, unknown>;
  route?: Record<string, unknown>;
  currentUser: { id: number };
  team: { id: number };
  dataSource?: Record<string, unknown>;
  actionResult?: Record<string, unknown>;
};

function getPath(value: unknown, path?: string) {
  if (!path) return value;
  return path.split('.').filter(Boolean).reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    return (current as Record<string, unknown>)[part];
  }, value);
}

function sourceValue(source: string, context: AppMakerBindingContext) {
  if (source === 'currentUser') return context.currentUser;
  if (source === 'team') return context.team;
  return context[source as keyof AppMakerBindingContext];
}

function resolveTemplate(template: string, context: AppMakerBindingContext) {
  const exact = template.match(/^\{\{\s*(form|row|selected|route|currentUser|team|dataSource|actionResult)(?:\.([^}]+))?\s*\}\}$/);
  if (exact) return getPath(sourceValue(exact[1], context), exact[2]?.trim());
  return template.replace(/\{\{\s*(form|row|selected|route|currentUser|team|dataSource|actionResult)(?:\.([^}]+))?\s*\}\}/g, (_match, source: string, path: string) => {
    const value = getPath(sourceValue(source, context), path?.trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

export function resolveAppMakerBinding(binding: AppInputBinding, context: AppMakerBindingContext) {
  if (typeof binding === 'string') return resolveTemplate(binding, context);
  if (binding.source === 'literal') return binding.value;
  const value = getPath(sourceValue(binding.source, context), binding.path);
  return value === undefined ? binding.fallback : value;
}

export function resolveAppMakerActionValues(input: {
  defaults?: Record<string, unknown>;
  bindings?: Record<string, AppInputBinding>;
  values?: Record<string, unknown>;
  context: AppMakerBindingContext;
}) {
  const values = { ...(input.defaults ?? {}), ...(input.values ?? {}) };
  for (const [key, binding] of Object.entries(input.bindings ?? {})) {
    const value = resolveAppMakerBinding(binding, input.context);
    if (value !== undefined) values[key] = value;
  }
  return values;
}
