// Called every six hours by PM2 or an external scheduler.
const https = require('https');
const http = require('http');

const appUrl = process.env.APP_URL || 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}
const url = new URL(`${appUrl}/api/cron/aapp-sync`);
const client = url.protocol === 'https:' ? https : http;
const request = client.request(url, { method: 'GET', headers: { Authorization: `Bearer ${secret}` } }, (response) => {
  let body = '';
  response.on('data', (chunk) => (body += chunk));
  response.on('end', () => {
    console.log(`[${new Date().toISOString()}] AAPP sync (${response.statusCode}): ${body}`);
    if ((response.statusCode || 500) >= 400) process.exitCode = 1;
  });
});
request.on('error', (error) => { console.error('AAPP sync error:', error.message); process.exitCode = 1; });
request.end();
