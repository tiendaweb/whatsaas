export const PLACEHOLDER_REGEX = /\{\{([\w\-. ]+)\}\}|\[\[([\w\-. ]+)\]\]/g;

export function extractPlaceholders(content: string): string[] {
  const placeholderSet = new Set<string>();
  if (!content) return [];
  for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
    const key = (match[1] ?? match[2] ?? '').trim();
    if (key) placeholderSet.add(key);
  }
  return Array.from(placeholderSet);
}

export function normalizePlaceholderName(raw: string): string {
  return raw.trim().replace(/\s+/g, '_');
}

/**
 * Renders the draft content replacing placeholders with provided variables.
 * Unfilled placeholders remain as [[key]] for preview.
 */
export function renderDraftContent(
  content: string,
  variables: Record<string, string> = {}
): string {
  if (!content) return '';
  return content.replace(PLACEHOLDER_REGEX, (_, keyA: string, keyB: string) => {
    const key = (keyA ?? keyB ?? '').trim();
    const val = (variables[key] ?? '').trim();
    return val || `[[${key}]]`;
  });
}

/**
 * Extracts only [[var]] style for editor (backward compat with older content).
 */
export const EDITOR_PLACEHOLDER_REGEX = /\[\[([\w\-. ]+)\]\]/g;

export function extractEditorPlaceholders(content: string): string[] {
  const set = new Set<string>();
  if (!content) return [];
  for (const match of content.matchAll(EDITOR_PLACEHOLDER_REGEX)) {
    const key = match[1]?.trim();
    if (key) set.add(key);
  }
  return Array.from(set);
}
