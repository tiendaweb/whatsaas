// Called every ten minutes by PM2 or an external scheduler.
// Drains the queue of WhatsApp voice notes that still have no insight row.
const https = require('https');
const http = require('http');

const appUrl = process.env.APP_URL || 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}
const url = new URL(`${appUrl}/api/cron/audio-insights`);
// Optional passthrough for manual backfills: node scripts/audio-insights.js 100
if (process.argv[2]) url.searchParams.set('limit', process.argv[2]);

const client = url.protocol === 'https:' ? https : http;
const request = client.request(url, { method: 'GET', headers: { Authorization: `Bearer ${secret}` } }, (response) => {
  let body = '';
  response.on('data', (chunk) => (body += chunk));
  response.on('end', () => {
    console.log(`[${new Date().toISOString()}] Audio insights (${response.statusCode}): ${body}`);
    if ((response.statusCode || 500) >= 400) process.exitCode = 1;
  });
});
request.on('error', (error) => { console.error('Audio insights error:', error.message); process.exitCode = 1; });
request.end();
