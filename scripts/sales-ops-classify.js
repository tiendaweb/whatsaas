// Called by PM2 or an external scheduler (every 15 minutes is plenty).
// Drains the sales-ops classification queue with the server engine.
const https = require('https');
const http = require('http');

const appUrl = process.env.APP_URL || 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}
const url = new URL(`${appUrl}/api/cron/sales-ops-classify`);
// Optional passthrough: node scripts/sales-ops-classify.js 40 2 stale
if (process.argv[2]) url.searchParams.set('limit', process.argv[2]);
if (process.argv[3]) url.searchParams.set('team', process.argv[3]);
if (process.argv[4]) url.searchParams.set('source', process.argv[4]);

const client = url.protocol === 'https:' ? https : http;
const request = client.request(url, { method: 'GET', headers: { Authorization: `Bearer ${secret}` } }, (response) => {
  let body = '';
  response.on('data', (chunk) => (body += chunk));
  response.on('end', () => {
    console.log(`[${new Date().toISOString()}] Sales-ops classify (${response.statusCode}): ${body}`);
    if ((response.statusCode || 500) >= 400) process.exitCode = 1;
  });
});
request.on('error', (error) => { console.error('Sales-ops classify error:', error.message); process.exitCode = 1; });
request.end();
