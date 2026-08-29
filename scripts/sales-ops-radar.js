// Called every ten minutes by PM2 or an external scheduler.
// Classifies new incoming WhatsApp messages into commercial signals (sales-ops radar).
const https = require('https');
const http = require('http');

const appUrl = process.env.APP_URL || 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}
const url = new URL(`${appUrl}/api/cron/sales-ops-radar`);
// Optional passthrough for manual runs: node scripts/sales-ops-radar.js 100 2 rules
if (process.argv[2]) url.searchParams.set('limit', process.argv[2]);
if (process.argv[3]) url.searchParams.set('team', process.argv[3]);
if (process.argv[4]) url.searchParams.set('engine', process.argv[4]);

const client = url.protocol === 'https:' ? https : http;
const request = client.request(url, { method: 'GET', headers: { Authorization: `Bearer ${secret}` } }, (response) => {
  let body = '';
  response.on('data', (chunk) => (body += chunk));
  response.on('end', () => {
    console.log(`[${new Date().toISOString()}] Sales-ops radar (${response.statusCode}): ${body}`);
    if ((response.statusCode || 500) >= 400) process.exitCode = 1;
  });
});
request.on('error', (error) => { console.error('Sales-ops radar error:', error.message); process.exitCode = 1; });
request.end();
