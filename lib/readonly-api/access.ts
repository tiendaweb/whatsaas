import 'server-only';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getTeamForUser, getUser } from '@/lib/db/queries';

const DOCS_COOKIE = 'readonly-api-docs';
const DOCS_SESSION_SECONDS = 8 * 60 * 60;
const DEFAULT_ALLOWED_EMAIL = 'noelia@whatspro.uno';

function allowedEmails() {
  return new Set(
    (process.env.READ_ONLY_API_ALLOWED_EMAILS || DEFAULT_ALLOWED_EMAIL)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function signingSecret() {
  return process.env.AUTH_SECRET || '';
}

function sign(value: string) {
  return crypto.createHmac('sha256', signingSecret()).update(value).digest('hex');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isReadOnlyApiDocsConfigured() {
  return /^[a-f0-9]{64}$/i.test(process.env.READ_ONLY_API_DOCS_CODE_HASH || '') && Boolean(signingSecret());
}

export async function getReadOnlyApiManager() {
  const [user, team] = await Promise.all([getUser(), getTeamForUser()]);
  if (!user || !team || !allowedEmails().has(user.email.trim().toLowerCase())) return null;
  return { user, team };
}

export async function unlockReadOnlyApiDocs(code: string, userId: number) {
  const expectedHash = process.env.READ_ONLY_API_DOCS_CODE_HASH || '';
  if (!isReadOnlyApiDocsConfigured()) return false;

  const candidateHash = crypto.createHash('sha256').update(code.trim(), 'utf8').digest('hex');
  if (!safeEqual(candidateHash, expectedHash.toLowerCase())) return false;

  const expiresAt = Math.floor(Date.now() / 1000) + DOCS_SESSION_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  (await cookies()).set(DOCS_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: DOCS_SESSION_SECONDS,
  });
  return true;
}

export async function lockReadOnlyApiDocs() {
  (await cookies()).delete(DOCS_COOKIE);
}

export async function isReadOnlyApiDocsUnlocked(userId: number) {
  if (!isReadOnlyApiDocsConfigured()) return false;
  const value = (await cookies()).get(DOCS_COOKIE)?.value;
  if (!value) return false;

  const [cookieUserId, expiresAtValue, signature] = value.split('.');
  const payload = `${cookieUserId}.${expiresAtValue}`;
  const expiresAt = Number(expiresAtValue);
  return (
    cookieUserId === String(userId) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Math.floor(Date.now() / 1000) &&
    Boolean(signature) &&
    safeEqual(sign(payload), signature)
  );
}
