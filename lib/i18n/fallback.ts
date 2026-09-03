import { IntlErrorCode, type IntlError } from 'next-intl';

const reportedMissingMessages = new Set<string>();

function getErrorFingerprint(error: IntlError) {
  return `${error.code}:${error.message}`;
}

export function handleIntlError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    const fingerprint = getErrorFingerprint(error);

    if (!reportedMissingMessages.has(fingerprint)) {
      reportedMissingMessages.add(fingerprint);
      console.warn(error);
    }

    return;
  }

  console.error(error);
}

export function getIntlMessageFallback({
  key,
  namespace
}: {
  key: string;
  namespace?: string;
}) {
  const fullKey = [namespace, key].filter(Boolean).join('.');
  const label = key.split('.').pop() || fullKey || key;

  return label
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
