#!/usr/bin/env node
/**
 * Instalador de WhatsPro en un servidor/dominio nuevo.
 *
 * Aplica TODAS las migraciones `.sql` en orden y, si se pide, deja creado el
 * primer usuario administrador con su equipo.
 *
 * Por qué no `drizzle-kit migrate`: el `meta/_journal.json` viene desincronizado
 * desde hace tiempo (hay 16 migraciones que existen como archivo y nunca se
 * registraron). drizzle-kit las saltearía y la instalación quedaría con tablas
 * y columnas faltantes que recién fallan en runtime, con un 500 sin pista.
 * Acá el orden de los archivos es la única fuente de verdad.
 *
 * Es idempotente: casi todas las migraciones usan IF NOT EXISTS y las que se
 * aplicaron quedan anotadas en `whatspro_migraciones`, así que volver a correrlo
 * no repite trabajo ni rompe una base que ya está viva.
 *
 * Uso:
 *   node scripts/instalar.mjs                          # migraciones
 *   node scripts/instalar.mjs --admin=mail@dominio.com --password=Secreta123
 *   node scripts/instalar.mjs --equipo="Mi Empresa"    # nombre del primer equipo
 *   node scripts/instalar.mjs --dry-run                # sólo dice qué haría
 */

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const RAIZ = path.resolve(import.meta.dirname, '..');
const CARPETA_MIGRACIONES = path.join(RAIZ, 'lib/db/migrations');

function arg(nombre, porDefecto = undefined) {
  const encontrado = process.argv.find((item) => item.startsWith(`--${nombre}=`));
  if (encontrado) return encontrado.slice(nombre.length + 3);
  return process.argv.includes(`--${nombre}`) ? true : porDefecto;
}

const DRY_RUN = Boolean(arg('dry-run', false));
const ADMIN = arg('admin');
const PASSWORD = arg('password');
const EQUIPO = arg('equipo', 'Mi equipo');

function log(mensaje) { console.log(mensaje); }
function error(mensaje) { console.error(`\n✖ ${mensaje}\n`); }

async function cargarEnv() {
  // Sin dependencias: el .env se lee a mano para no obligar a instalar nada
  // antes de la primera migración.
  try {
    const crudo = await readFile(path.join(RAIZ, '.env'), 'utf8');
    for (const linea of crudo.split('\n')) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte === -1) continue;
      const clave = limpia.slice(0, corte).trim();
      let valor = limpia.slice(corte + 1).trim();
      if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
        valor = valor.slice(1, -1);
      }
      if (!(clave in process.env)) process.env[clave] = valor;
    }
  } catch {
    // Sin .env se sigue: las variables pueden venir del entorno.
  }
}

async function main() {
  await cargarEnv();

  const url = process.env.POSTGRES_URL;
  if (!url) {
    error('Falta POSTGRES_URL. Copiá .env.example a .env y completalo antes de instalar.');
    process.exit(1);
  }

  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    const archivos = (await readdir(CARPETA_MIGRACIONES))
      .filter((nombre) => nombre.endsWith('.sql'))
      .sort();

    log(`\n▸ ${archivos.length} migraciones encontradas en lib/db/migrations`);

    await sql`
      CREATE TABLE IF NOT EXISTS whatspro_migraciones (
        archivo text PRIMARY KEY,
        hash text NOT NULL,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )
    `;

    const yaAplicadas = new Set(
      (await sql`SELECT archivo FROM whatspro_migraciones`).map((fila) => fila.archivo),
    );

    let aplicadas = 0;
    let salteadas = 0;

    for (const archivo of archivos) {
      if (yaAplicadas.has(archivo)) { salteadas++; continue; }

      const contenido = await readFile(path.join(CARPETA_MIGRACIONES, archivo), 'utf8');
      const hash = createHash('sha256').update(contenido).digest('hex');

      if (DRY_RUN) { log(`  · aplicaría ${archivo}`); aplicadas++; continue; }

      try {
        // Cada migración va en su propia transacción: si una falla, la anterior
        // queda aplicada y el reintento arranca donde se cortó.
        await sql.begin(async (tx) => {
          await tx.unsafe(contenido);
          await tx`INSERT INTO whatspro_migraciones (archivo, hash) VALUES (${archivo}, ${hash})`;
        });
        aplicadas++;
        log(`  ✓ ${archivo}`);
      } catch (fallo) {
        error(`La migración ${archivo} falló: ${fallo.message}`);
        log('Las anteriores quedaron aplicadas. Arreglá el problema y volvé a correr el instalador.');
        process.exit(1);
      }
    }

    log(`\n▸ Migraciones: ${aplicadas} aplicadas, ${salteadas} ya estaban.`);

    if (ADMIN) {
      if (!PASSWORD || String(PASSWORD).length < 8) {
        error('Para crear el administrador hace falta --password= con 8 caracteres o más.');
        process.exit(1);
      }

      const [existente] = await sql`SELECT id FROM users WHERE email = ${ADMIN} LIMIT 1`;
      if (existente) {
        log(`\n▸ El usuario ${ADMIN} ya existe (id ${existente.id}): no se toca.`);
      } else if (DRY_RUN) {
        log(`\n▸ Crearía el administrador ${ADMIN} y el equipo "${EQUIPO}".`);
      } else {
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(String(PASSWORD), 10);

        const [usuario] = await sql`
          INSERT INTO users (email, password_hash, role)
          VALUES (${ADMIN}, ${passwordHash}, 'admin')
          RETURNING id
        `;
        const [equipo] = await sql`INSERT INTO teams (name) VALUES (${EQUIPO}) RETURNING id`;
        await sql`
          INSERT INTO team_members (team_id, user_id, role)
          VALUES (${equipo.id}, ${usuario.id}, 'owner')
        `;
        log(`\n▸ Administrador ${ADMIN} creado (equipo "${EQUIPO}", id ${equipo.id}).`);
      }
    }

    const [{ count: tablas }] = await sql`
      SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'
    `;
    log(`\n✔ Base lista: ${tablas} tablas.\n`);

    if (!ADMIN) {
      log('Para crear el primer usuario:');
      log('  node scripts/instalar.mjs --admin=vos@tudominio.com --password=UnaClaveLarga --equipo="Tu Empresa"\n');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((fallo) => {
  error(fallo.stack || fallo.message);
  process.exit(1);
});
