// Called by PM2 or external cron (recommended: once or a few times per day)
// Usage: node scripts/membership-reminders.js
// Env vars: APP_URL, CRON_SECRET

const https = require('https');
const http = require('http');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret';

const url = new URL(`${APP_URL}/api/cron/membership-reminders`);
const lib = url.protocol === 'https:' ? https : http;

const req = lib.request(url, {
  method: 'GET',
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
}, (res) => {
  let data = '';
  res.on('data', (d) => (data += d));
  res.on('end', () => console.log(`[${new Date().toISOString()}] Membership reminders result:`, data));
});

req.on('error', (e) => console.error('Membership reminders cron error:', e.message));
req.end();
