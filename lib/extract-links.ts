const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const EMAIL_REGEX = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

function stripTrailingPunctuation(value: string) {
  return value.replace(/[),.;:!?'"]+$/g, '');
}

export type ExtractedLink = {
  kind: 'url' | 'email';
  value: string;
};

export function extractLinksAndEmails(text: string | null | undefined): ExtractedLink[] {
  if (!text) return [];

  const results: ExtractedLink[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(URL_REGEX)) {
    const raw = stripTrailingPunctuation(match[0]);
    const value = raw.startsWith('www.') ? `https://${raw}` : raw;
    if (seen.has(value)) continue;
    seen.add(value);
    results.push({ kind: 'url', value });
  }

  for (const match of text.matchAll(EMAIL_REGEX)) {
    const value = stripTrailingPunctuation(match[0]);
    if (seen.has(value)) continue;
    seen.add(value);
    results.push({ kind: 'email', value });
  }

  return results;
}
