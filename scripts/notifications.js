// Cron de notificaciones: recordatorios de agenda + despacho de la cola.
// Usage: node scripts/notifications.js   (cada minuto)
const https = require('https');
const http = require('http');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret';
const url = new URL(`${APP_URL}/api/cron/notifications`);
const lib = url.protocol === 'https:' ? https : http;

const req = lib.request(url, { method: 'GET', headers: { Authorization: `Bearer ${CRON_SECRET}` } }, (res) => {
  let data = '';
  res.on('data', (d) => (data += d));
  res.on('end', () => console.log(`[${new Date().toISOString()}] notifications:`, data));
});
req.on('error', (e) => console.error('Cron error:', e.message));
req.end();
