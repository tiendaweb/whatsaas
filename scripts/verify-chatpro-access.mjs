#!/usr/bin/env node

import 'dotenv/config';
import { SignJWT } from 'jose';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL || !process.env.AUTH_SECRET) {
  throw new Error('POSTGRES_URL and AUTH_SECRET are required.');
}

const baseUrl = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
const adminBaseUrl = process.env.VERIFY_ADMIN_BASE_URL || baseUrl;
const client = postgres(process.env.POSTGRES_URL, { max: 1 });
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

async function sessionFor(userId) {
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return new SignJWT({ user: { id: userId }, expires })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
}

async function request(path, token, requestBaseUrl = baseUrl) {
  return fetch(new URL(path, requestBaseUrl), {
    headers: { Cookie: `session=${token}` },
    redirect: 'manual',
  });
}

function containsPlatformBrand(value) {
  return /whatspro(?:\.uno|\.com)?|whatsaas/i.test(value);
}

try {
  const [admin] = await client`
    SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1
  `;
  const [resellerOwner] = await client`
    SELECT u.id
    FROM users u
    JOIN resellers r ON r.owner_user_id=u.id
    WHERE r.slug='chatpro' AND u.email='chatpro.uno@gmail.com' AND u.role='reseller'
    LIMIT 1
  `;
  if (!admin || !resellerOwner) throw new Error('Admin or ChatPro owner is missing.');

  const [adminToken, resellerToken] = await Promise.all([
    sessionFor(admin.id),
    sessionFor(resellerOwner.id),
  ]);

  const adminPage = await request('/es/admin/resellers', adminToken, adminBaseUrl);
  const adminHtml = await adminPage.text();
  if (!adminPage.ok || !adminHtml.includes('chatpro.uno@gmail.com')) {
    throw new Error(`Admin reseller page failed: HTTP ${adminPage.status}`);
  }

  const resellerPage = await request('/es/reseller', resellerToken);
  const resellerHtml = await resellerPage.text();
  if (!resellerPage.ok || !resellerHtml.includes('ChatPro')) {
    throw new Error(`ChatPro reseller page failed: HTTP ${resellerPage.status}`);
  }

  const dashboardPage = await request('/es/dashboard', resellerToken);
  const dashboardHtml = await dashboardPage.text();
  if (!dashboardPage.ok || !dashboardHtml.includes('ChatPro') || containsPlatformBrand(dashboardHtml)) {
    throw new Error(`ChatPro dashboard branding failed: HTTP ${dashboardPage.status}`);
  }

  // ChatPro todavía no tiene un team cliente; la identidad del API depende del
  // Host, así que una sesión admin con team basta para probar el DTO white-label.
  const marketplaceResponse = await request('/api/plugins/marketplace/items', adminToken);
  const marketplaceBody = await marketplaceResponse.text();
  if (!marketplaceResponse.ok || containsPlatformBrand(marketplaceBody)) {
    throw new Error(`ChatPro marketplace branding failed: HTTP ${marketplaceResponse.status}`);
  }

  const forbiddenAdmin = await request('/es/admin/resellers', resellerToken, adminBaseUrl);
  const forbiddenLocation = forbiddenAdmin.headers.get('location') || '';
  if (forbiddenAdmin.status < 300 || forbiddenAdmin.status >= 400 || !forbiddenLocation.includes('/dashboard')) {
    throw new Error(
      `Reseller admin isolation failed: HTTP ${forbiddenAdmin.status} location=${forbiddenLocation || 'none'}`,
    );
  }

  console.log(JSON.stringify({
    ok: true,
    adminResellers: adminPage.status,
    resellerPanel: resellerPage.status,
    dashboardBranding: dashboardPage.status,
    marketplaceBranding: marketplaceResponse.status,
    resellerAdminIsolation: {
      status: forbiddenAdmin.status,
      location: forbiddenLocation,
    },
  }, null, 2));
} finally {
  await client.end();
}
