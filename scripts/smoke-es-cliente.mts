/**
 * Smoke de la definición única de "es cliente" (`lib/customers/es-cliente`),
 * CONTRA LA BASE.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/smoke-es-cliente.mts
 *
 * Resuelve TODOS los contactos del equipo con `resolverClientes`, cuenta por
 * fuente y lista los que son clientes SIN vínculo —los que coinciden por
 * teléfono, o que tienen membresía o venta a nombre de esa ficha—: ésos son los
 * que la UI mostraba como clientes mientras el motor los trataba como leads.
 *
 * ESCRIBE, a propósito: sobre esos mismos contactos corre `vincularSiCoincide`,
 * que es la misma deduplicación por teléfono que ya aplica
 * `convertContactToCustomer` cuando alguien aprieta "Registrar como cliente".
 * No crea ninguna ficha nueva: sólo escribe la fila de `team_customer_contacts`
 * que faltaba y su registro de auditoría. Va en modo `silencioso` para NO
 * disparar la reclasificación del motor — en producción el vínculo hecho desde
 * la UI sí le avisa, acá se quiere medir, no mover la cola.
 *
 * `SMOKE_SOLO_LECTURA=1` corre la parte de conteo y no vincula nada.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCustomers, teamMembers } from '@/lib/db/schema';
import { resolverCliente, resolverClientes, vincularSiCoincide, type FuenteCliente } from '@/lib/customers/es-cliente';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const SOLO_LECTURA = process.env.SMOKE_SOLO_LECTURA === '1';
let ok = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' · ' + String(extra).slice(0, 150) : ''}`);
};

/*
 * El actor del registro de auditoría tiene que EXISTIR: `activity_logs.user_id`
 * tiene clave foránea contra `users`, y un id inventado hace fallar el vínculo
 * después de haberlo escrito. Se toma un miembro real del equipo.
 */
const [miembro] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, TEAM)).limit(1);
const USER = Number(process.env.SMOKE_USER_ID ?? miembro?.userId ?? 0) || null;

const todos = await db
  .select({ id: contacts.id, name: contacts.name })
  .from(contacts)
  .where(eq(contacts.teamId, TEAM));

console.log(`\n── equipo ${TEAM}: ${todos.length} contactos ──`);
check('el equipo tiene contactos', todos.length > 0);

const estados = await resolverClientes(TEAM, todos.map((c) => c.id));
check('resolverClientes contesta por cada contacto del equipo', estados.size === todos.length, `${estados.size} de ${todos.length}`);

const porFuente = new Map<FuenteCliente | 'ninguna', number>();
let conEvidenciaDebilSola = 0;
for (const [, estado] of estados) {
  const clave = estado.fuente ?? 'ninguna';
  porFuente.set(clave, (porFuente.get(clave) ?? 0) + 1);
  if (!estado.esCliente && estado.evidenciaDebil.length > 0) conEvidenciaDebilSola += 1;
}

console.log('\n── clientes por fuente ──');
for (const clave of ['vinculo', 'suscripcion_activa', 'venta_pagada', 'telefono', 'ninguna'] as const) {
  console.log(`  ${clave.padEnd(20)} ${porFuente.get(clave) ?? 0}`);
}
const totalClientes = [...estados.values()].filter((e) => e.esCliente).length;
console.log(`  ${'TOTAL esCliente'.padEnd(20)} ${totalClientes}`);
console.log(`  ${'sólo evidencia débil'.padEnd(20)} ${conEvidenciaDebilSola} (NO cuentan como clientes, a propósito)`);

check('nadie es cliente sin fuente', [...estados.values()].every((e) => e.esCliente === (e.fuente !== null)));
check('todo cliente tiene ficha', [...estados.values()].every((e) => !e.esCliente || e.customerId != null));

/*
 * Clientes SIN vínculo: el caso que rompía la UI. Se listan todos, no sólo los
 * de fuente `telefono`, porque la precedencia de `resolverClientes` tapa el
 * teléfono cuando además hay membresía o venta — y esos tampoco están
 * vinculados, así que arrastran el mismo problema y se arreglan igual.
 */
const sinVinculo = todos.filter((c) => {
  const e = estados.get(c.id);
  return e?.esCliente === true && e.fuente !== 'vinculo';
});
console.log(`\n── ${sinVinculo.length} clientes SIN vínculo (ficha resuelta por otra vía) ──`);
for (const c of sinVinculo) {
  const estado = estados.get(c.id)!;
  const ficha = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, estado.customerId!), eq(teamCustomers.teamId, TEAM)),
    columns: { id: true, name: true, phone: true },
  });
  console.log(`  contacto ${c.id} "${c.name ?? '—'}" [${estado.fuente}] → ficha ${ficha?.id} "${ficha?.name ?? '—'}" (${ficha?.phone ?? 'sin teléfono'})`);
}

if (SOLO_LECTURA) {
  console.log('\nSMOKE_SOLO_LECTURA=1: no se vincula nada.');
} else if (!sinVinculo.length) {
  console.log('\nNo quedó ninguno por vincular.');
} else {
  console.log('\n── vincularSiCoincide (ESCRIBE: sólo la fila del vínculo) ──');
  for (const c of sinVinculo) {
    const r = await vincularSiCoincide(TEAM, c.id, USER, { silencioso: true });
    console.log(`  contacto ${c.id} → ${r.linked ? `vinculado a la ficha ${r.customerId}` : `sin cambios (ficha ${r.customerId ?? '—'})`}`);
    const despues = await resolverCliente(TEAM, { contactId: c.id });
    check(`el contacto ${c.id} queda como vínculo`, despues.fuente === 'vinculo' && despues.customerId === r.customerId, `fuente ahora: ${despues.fuente}`);
  }

  // Segunda pasada: el vínculo tiene que ser idempotente.
  const revisados = await resolverClientes(TEAM, sinVinculo.map((c) => c.id));
  check('no queda ningún cliente sin vínculo', [...revisados.values()].every((e) => e.fuente === 'vinculo'));
  const repetir = await vincularSiCoincide(TEAM, sinVinculo[0]!.id, USER, { silencioso: true });
  check('volver a vincular no hace nada', repetir.linked === false, `customerId ${repetir.customerId}`);
}

console.log(`\n${fail === 0 ? '✓ TODO OK' : `✗ ${fail} fallas`} · ${ok} chequeos pasados\n`);
process.exit(fail === 0 ? 0 : 1);
