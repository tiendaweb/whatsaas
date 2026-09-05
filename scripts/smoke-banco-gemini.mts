/**
 * ¿El banco de keys responde? CONTRA GOOGLE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-banco-gemini.mts
 *
 * Gasta unas pocas llamadas. Prueba lo que estaba roto: que haya keys elegibles,
 * que una llamada pase, y que el clasificador de 429 distinga "por minuto" de
 * "por día" — que era el bug que apagaba las trece keys de una.
 */
import { analizarTextoConBanco, capacidadDelBanco, keysConCuota } from '@/lib/gemini/key-bank';
import { runJsonWithApi } from '@/lib/plugins/sales-ops/server/skill-runner';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
let ok = 0, fail = 0;
const check = (l: string, c: boolean, e = '') => { c ? ok++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${l}${e ? ' · ' + String(e).slice(0, 160) : ''}`); };

console.log('\n── Capacidad del banco ──');
const cap = await capacidadDelBanco(TEAM);
console.log(`  ${cap.activas}/${cap.keys} activas · ${cap.restanteHoy} pedidos disponibles hoy de ${cap.totalDiario} · ${cap.porMinuto}/min`);
check('hay keys con cuota', (await keysConCuota(TEAM)) > 0, `${await keysConCuota(TEAM)} keys`);
check('queda capacidad hoy', cap.restanteHoy > 0, `${cap.restanteHoy}`);

console.log('\n── Una llamada real por el banco ──');
const r = await analizarTextoConBanco({ teamId: TEAM, prompt: 'Respondé exactamente: OK' });
check('el banco contesta', r.ok, r.ok ? `${r.keyLabel} (${r.modelo}) → ${r.texto.slice(0, 40)}` : r.error);

console.log('\n── El camino que usa el Command Center (proveedor → banco) ──');
const j = await runJsonWithApi(TEAM, 'Respondé sólo JSON.', 'Devolvé {"ok":true}');
check('runJsonWithApi resuelve', j.ok, j.ok ? `${j.provider}/${j.model}: ${j.raw.slice(0, 60)}` : j.error);

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
