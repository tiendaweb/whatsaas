// Lo corre PM2 cada diez minutos: trae los comentarios nuevos de Facebook e
// Instagram para que la bandeja de Marketing se llene sola. Sin esto, los
// comentarios sólo entran cuando alguien aprieta «Buscar nuevos», que es
// justamente el trabajo que se quería sacar de encima.
const https = require('https');
const http = require('http');

const appUrl = process.env.APP_URL || 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}
const url = new URL(`${appUrl}/api/cron/social-comments`);

const client = url.protocol === 'https:' ? https : http;
const request = client.request(url, { method: 'GET', headers: { Authorization: `Bearer ${secret}` } }, (response) => {
  let body = '';
  response.on('data', (chunk) => (body += chunk));
  response.on('end', () => {
    console.log(`[${new Date().toISOString()}] Comentarios sociales (${response.statusCode}): ${body}`);
    if ((response.statusCode || 500) >= 400) process.exitCode = 1;
  });
});
request.on('error', (error) => {
  console.error(`[${new Date().toISOString()}] Comentarios sociales falló:`, error.message);
  process.exitCode = 1;
});
request.end();
