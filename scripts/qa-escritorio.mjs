#!/usr/bin/env node
/**
 * Checklist de QA del Escritorio (documento 08), la parte que una máquina
 * puede decidir sola.
 *
 * Existe porque el checklist tenía 81 ítems y cero tildados: un checklist que
 * sólo se puede recorrer a mano no se recorre. Lo que queda afuera —fidelidad
 * visual contra la referencia, modo oscuro, responsive, accesibilidad— se
 * marca como MANUAL en vez de darse por bueno en silencio.
 *
 *     node scripts/qa-escritorio.mjs
 *
 * Sale con código 1 si algo falla, para poder colgarlo de un pre-deploy.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const resultados = [];
const ok = (sec, txt, det = '') => resultados.push({ sec, txt, estado: 'OK', det });
const fallo = (sec, txt, det = '') => resultados.push({ sec, txt, estado: 'FALLA', det });
const manual = (sec, txt, det = '') => resultados.push({ sec, txt, estado: 'MANUAL', det });

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return e.stdout || ''; }
};

/** Líneas que coinciden, descartando las que son comentario. */
function grepReal(patron, rutas = 'app components lib') {
  const salida = sh(`grep -rniE '${patron}' ${rutas} 2>/dev/null | grep -v node_modules || true`);
  return salida.split('\n').filter(Boolean).filter((l) => {
    const cuerpo = l.split(':').slice(2).join(':').trim();
    return !/^(\*|\/\/|\/\*|--)/.test(cuerpo);
  });
}

// ── §1 Color ────────────────────────────────────────────────────────────
{
  const azules = grepReal('#(3b82a8|7dd3fc|dbeafe|1e3a5f|008ffb)');
  azules.length ? fallo('1', 'Sin azules del diseño original', azules.join('\n'))
                : ok('1', 'Sin azules del diseño original (fuera de comentarios)');

  const tema = readFileSync('lib/charts/theme.ts', 'utf8');
  const paletas = [...tema.matchAll(/CHART_SERIES_(LIGHT|DARK) = \[([^\]]+)\]/g)]
    .map((m) => ({ modo: m[1], hex: m[2].match(/#[0-9a-f]{6}/gi) || [] }));

  // "Azul" es hue 200–250. Mirar sólo el canal B confunde el violeta
  // (#7c3aed tiene B alto y R alto) con un azul, que era el falso positivo
  // que este chequeo daba cuando se escribió.
  const hue = (h) => {
    const r = parseInt(h.slice(1, 3), 16) / 255;
    const g = parseInt(h.slice(3, 5), 16) / 255;
    const b = parseInt(h.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    const t = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (t * 60 + 360) % 360;
  };
  const seriesAzules = paletas.flatMap((p) => p.hex.filter((h) => hue(h) >= 200 && hue(h) <= 250));
  seriesAzules.length ? fallo('1', 'Ninguna serie de gráfico es azul', seriesAzules.map((h) => `${h} hue ${Math.round(hue(h))}`).join(' '))
                : ok('1', `Ninguna serie es azul (${paletas.flatMap((p) => p.hex).length} hex, hues ${paletas[0].hex.map((h) => Math.round(hue(h))).join('/')})`);

  // Cada paleta por separado: claro y oscuro comparten #0d9488 a propósito,
  // y compararlas juntas lo denunciaba como repetido.
  const repetidos = paletas.filter((p) => new Set(p.hex.map((h) => h.toLowerCase())).size !== p.hex.length);
  repetidos.length ? fallo('1', 'Las series no repiten color', repetidos.map((p) => p.modo).join(' '))
                   : ok('1', 'Las series no repiten color dentro de cada modo');

  manual('1', 'Modo oscuro revisado en las 10 pantallas');
}

// ── §1.1 Alcance ────────────────────────────────────────────────────────
{
  existsSync('app/[locale]/(dashboard)/escritorio/page.tsx')
    ? ok('1.1', 'El rediseño reemplaza /escritorio')
    : fallo('1.1', 'Falta app/[locale]/(dashboard)/escritorio/page.tsx');

  // El árbol tiene cambios sin commitear de otros trabajos; lo que este ítem
  // pregunta es si el rediseño del Escritorio tocó /dashboard. Se mide por
  // fecha: nada de /dashboard puede ser más nuevo que el inicio del rediseño.
  const desde = process.env.QA_DESDE || '2026-08-26 06:43';
  const recientes = sh(`find "app/[locale]/(dashboard)/dashboard" -newermt "${desde}" -type f 2>/dev/null || true`)
    .split('\n').filter(Boolean);
  recientes.length ? fallo('1.1', '/dashboard quedó intacto', recientes.join('\n'))
                   : ok('1.1', `/dashboard sin tocar desde ${desde}`);
}

// ── §2 Estructura ───────────────────────────────────────────────────────
{
  const widgets = readdirSync('components/escritorio/widgets').filter((f) => f.endsWith('.tsx'));
  widgets.length === 7 ? ok('2', `7 widgets presentes`, widgets.join(' '))
                       : fallo('2', `Se esperaban 7 widgets, hay ${widgets.length}`, widgets.join(' '));

  const rutas = ['agenda', 'bandeja', 'clientes', 'contactos', 'informes', 'prospectos', 'tareas'];
  const faltan = rutas.filter((r) => !existsSync(`app/[locale]/(dashboard)/escritorio/${r}/page.tsx`));
  faltan.length ? fallo('2', 'Pantallas de la fase 5 presentes', `faltan: ${faltan.join(', ')}`)
                : ok('2', `Las ${rutas.length} pantallas de la fase 5 existen`);

  manual('2', 'Fidelidad visual contra la referencia, pantalla por pantalla');
  manual('2', 'Entrada escalonada de 100 ms por tarjeta');
}

// ── §3 Datos reales ─────────────────────────────────────────────────────
{
  const mock = grepReal('john\\.doe|acme corporation|sarah johnson|\\$45,000');
  mock.length ? fallo('3', 'Sin datos de ejemplo', mock.join('\n'))
              : ok('3', 'Sin datos de ejemplo');

  const monedaFija = sh(`grep -rn "formatMoney([^,]*, *'USD'" components/escritorio 2>/dev/null || true`)
    .split('\n').filter(Boolean);
  monedaFija.length ? fallo('3', 'La moneda sale del dato, no fija en USD', monedaFija.join('\n'))
                    : ok('3', 'La moneda sale del dato, no fija en USD');

  // Sólo divisiones reales: se descartan imports, comentarios y expresiones
  // regulares, que era lo que hacía que este chequeo denunciara "lib" y "db".
  const kpis = readFileSync('lib/desktop/kpis.ts', 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(import|\*|\/\/)/.test(l))
    .join('\n');
  const divisores = [...kpis.matchAll(/[)\w\]]\s*\/\s*([A-Za-z_$][\w.$]*)/g)].map((m) => m[1]);
  const sinGuarda = [...new Set(divisores)].filter(
    // La guarda puede escribirse de las dos formas: `x > 0 ? … :` o el
    // early-return `if (x <= 0) return …`. Pedir sólo la primera denunciaba
    // como sin guarda divisiones que sí lo estaban.
    (d) => !new RegExp(`${d.replace(/\./g, '\\.')}\\s*(<|<=|>|>=|===|!==|\\?\\?|\\|\\|)`).test(kpis),
  );
  sinGuarda.length ? fallo('3', 'Toda división tiene guarda', `sin guarda: ${sinGuarda.join(', ')}`)
                   : ok('3', `Las ${divisores.length} divisiones de KPIs tienen guarda contra cero`);
}

// ── §4 Aislamiento por equipo ───────────────────────────────────────────
{
  const archivos = [
    ...readdirSync('lib/desktop').filter((f) => f.endsWith('.ts')).map((f) => `lib/desktop/${f}`),
    ...readdirSync('lib/desktop/command-center').filter((f) => f.endsWith('.ts')).map((f) => `lib/desktop/command-center/${f}`),
  ];
  const sinTeam = archivos.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return /\bdb\s*\n?\s*\.select\(|db\.select\(/.test(src) && !/teamId/.test(src);
  });
  sinTeam.length ? fallo('4', 'Toda consulta filtra por team_id', sinTeam.join(' '))
                 : ok('4', `Las ${archivos.length} fuentes del Escritorio filtran por team_id`);

  manual('4', 'Con dos equipos cargados, ninguno ve datos del otro');
}

// ── §6 Conectores ───────────────────────────────────────────────────────
{
  const salida = sh('NODE_OPTIONS="--conditions=react-server --max-old-space-size=4096" npx tsx scripts/verify-connector-tools.mts 2>&1');
  /Todos los inputSchema/.test(salida)
    ? ok('6', 'verify-connector-tools en verde', salida.trim().split('\n').slice(-2).join(' · '))
    : fallo('6', 'verify-connector-tools', salida.trim().slice(-300));
}

// ── §7 Migraciones ──────────────────────────────────────────────────────
{
  const journal = JSON.parse(readFileSync('lib/db/migrations/meta/_journal.json', 'utf8'));
  const tags = journal.entries.map((e) => e.tag);
  const nuevas = ['0085', '0086', '0087', '0088', '0089', '0090'];
  const faltan = nuevas.filter((n) => !tags.some((t) => t.startsWith(n)));
  faltan.length ? fallo('7', 'Migraciones nuevas registradas en _journal', `faltan ${faltan.join(', ')}`)
                : ok('7', `Las ${nuevas.length} migraciones nuevas están en _journal`);

  const prefijos = nuevas.filter((n) => tags.filter((t) => t.startsWith(n)).length > 1);
  prefijos.length ? fallo('7', 'Sin prefijos duplicados en las nuevas', prefijos.join(' '))
                  : ok('7', 'Sin prefijos duplicados entre 0085-0090');

  const i85 = tags.findIndex((t) => t.startsWith('0085'));
  const i89 = tags.findIndex((t) => t.startsWith('0089'));
  i89 > i85 ? ok('7', '0089 va después de 0085') : fallo('7', '0089 va después de 0085');
}

// ── §9 i18n ─────────────────────────────────────────────────────────────
{
  const salida = sh('node scripts/check-i18n.mjs 2>&1');
  /OK/.test(salida) ? ok('9', 'i18n sin claves faltantes', salida.trim())
                    : fallo('9', 'i18n', salida.trim().slice(-300));

  const duros = sh(`grep -rnoE "^\\s+(active|inactive|prospect|pending|done): '[A-ZÁÉÍÓÚÑ]" components/escritorio 2>/dev/null || true`)
    .split('\n').filter(Boolean);
  duros.length ? fallo('9', 'Sin etiquetas hardcodeadas en las vistas', duros.join('\n'))
               : ok('9', 'Sin tablas de etiquetas hardcodeadas en las vistas');

  manual('9', 'Fechas y números con el locale activo (revisar en el navegador)');
}

// ── §8 y §10 ────────────────────────────────────────────────────────────
manual('8', 'Responsive en 375/768/1024/1440/1920 px');
manual('8', 'Navegación por teclado y contraste AA');
manual('10', 'Verificado en el dominio real, en el navegador');

// ── Informe ─────────────────────────────────────────────────────────────
const ancho = Math.max(...resultados.map((r) => r.txt.length));
let fallas = 0;
let seccion = '';
for (const r of resultados) {
  if (r.sec !== seccion) { seccion = r.sec; console.log(`\n§${seccion}`); }
  const icono = r.estado === 'OK' ? '✓' : r.estado === 'FALLA' ? '✗' : '·';
  if (r.estado === 'FALLA') fallas++;
  console.log(`  ${icono} ${r.txt.padEnd(ancho)} ${r.estado === 'MANUAL' ? '(manual)' : ''}`);
  if (r.det && r.estado !== 'OK') console.log(`      ${r.det.split('\n').join('\n      ')}`);
  else if (r.det && process.env.QA_VERBOSE) console.log(`      ${r.det}`);
}
const auto = resultados.filter((r) => r.estado !== 'MANUAL').length;
const manuales = resultados.length - auto;
console.log(`\n${auto - fallas}/${auto} automáticos en verde · ${fallas} falla(s) · ${manuales} requieren ojos`);
process.exit(fallas ? 1 : 0);
