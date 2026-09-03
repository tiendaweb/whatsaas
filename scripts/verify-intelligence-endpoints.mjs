import 'dotenv/config';
import { SignJWT } from 'jose';

if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET is required.');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const userId = Number(process.argv[2] ?? 3);
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

async function sessionFor(id) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return new SignJWT({ user: { id }, expires })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1 day from now')
    .sign(key);
}

const token = await sessionFor(userId);
const headers = { Cookie: `session=${token}` };

const paths = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['/api/plugins/intelligence/overview', '/api/plugins/intelligence/revenue-trend'];

for (const path of paths) {
  const res = await fetch(`${APP_URL}${path}`, { headers });
  const body = await res.text();
  console.log(`${path} -> HTTP ${res.status}`);
  console.log(body);
  console.log('---');
}
