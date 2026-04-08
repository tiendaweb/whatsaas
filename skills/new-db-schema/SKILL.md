# Skill: new-db-schema

## Cuándo usar esta skill
Cuando necesites agregar tablas nuevas o columnas a la base de datos PostgreSQL via Drizzle ORM.

**Ejemplos:**
- Crear tabla `reports` para guardar reportes generados
- Agregar columna `metadata` JSON a tabla existente
- Crear tabla intermedia para relación many-to-many

---

## Archivos clave a leer primero

1. `lib/db/schema.ts` — Archivo ÚNICO donde vive el schema completo
2. `drizzle.config.ts` — Config de Drizzle
3. `lib/db/drizzle.ts` — Instancia de la BD
4. `lib/db/queries/` — Ejemplos de queries

---

## Paso 1: Agregar tabla al schema.ts

**Ubicación:** `/root/whatsaas/lib/db/schema.ts`

Este es el archivo ÚNICO donde va todo el schema. Es muy largo pero centralizado.

### Estructura de una tabla simple

```typescript
import { pgTable, serial, varchar, timestamp, integer, text, json, boolean, index } from 'drizzle-orm/pg-core';
import { users, teams } from './schema'; // Importar tablas relacionadas si aplica

export const miTabla = pgTable(
  'mi_tabla',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    metadata: json('metadata').$type<Record<string, any>>().default({}),
    
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Índices para queries frecuentes
    teamIdIdx: index('mi_tabla_team_id_idx').on(table.teamId),
    userIdIdx: index('mi_tabla_user_id_idx').on(table.userId),
    isActiveIdx: index('mi_tabla_is_active_idx').on(table.isActive),
  })
);
```

### Tipos de columnas comunes

```typescript
// Números
serial('id').primaryKey()           // Auto-incremento
integer('count')                    // Entero normal
smallint('status')                  // Pequeño entero (-32k a +32k)
numeric('price', { precision: 10, scale: 2 })  // Decimal exacto (precio)
real('percentage')                  // Float

// Texto
varchar('name', { length: 255 })    // String con límite
text('description')                 // String ilimitado
char('code', { length: 3 })         // Exactamente 3 caracteres

// Booleano
boolean('is_active')                // true/false

// Fechas
timestamp('created_at')             // Con timezone
date('birth_date')                  // Solo fecha
time('time_slot')                   // Solo hora

// JSON
json('metadata')                    // JSON object
json('tags').$type<string[]>()      // JSON array tipado

// Especiales
uuid('id').defaultRandom()          // UUID único
bytea('file_data')                  // Datos binarios
```

### Ejemplo: Tabla con relaciones y enums

```typescript
// Enum
export const reportStatusEnum = pgEnum('report_status', ['draft', 'processing', 'completed', 'failed']);

// Tabla
export const miTablaConRelaciones = pgTable(
  'mi_tabla_con_relaciones',
  {
    id: serial('id').primaryKey(),
    
    // Relación a team
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    
    // Relación a usuario
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    
    // Enum
    status: reportStatusEnum('status').default('draft'),
    
    // Datos
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content'),
    
    // Metadatos
    tags: json('tags').$type<string[]>().default([]),
    config: json('config').$type<{ theme?: string; columns?: number }>(),
    
    // Auditoría
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    teamIdx: index('tabla_team_id_idx').on(table.teamId),
    statusIdx: index('tabla_status_idx').on(table.status),
    createdByIdx: index('tabla_created_by_idx').on(table.createdBy),
  })
);
```

### Ejemplo: Relación Many-to-Many

```typescript
// Tabla intermedia (pivot)
export const miTablaRelaciones = pgTable(
  'mi_tabla_relaciones',
  {
    tablaId: integer('tabla_id')
      .notNull()
      .references(() => miTabla.id, { onDelete: 'cascade' }),
    
    tagId: integer('tag_id')
      .notNull()
      .references(() => miTag.id, { onDelete: 'cascade' }),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tablaId, table.tagId] }),
  })
);
```

---

## Paso 2: Agregar columna a tabla existente

En Drizzle, se modifica directo el schema.ts (sin "migrations" en el código).

```typescript
// ANTES
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  // ... otros campos
});

// DESPUÉS: Agregar campo `phone`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 20 }), // Campo nuevo
  // ... otros campos
});
```

---

## Paso 3: Generar migración

Drizzle genera automáticamente el SQL basado en cambios en schema.ts.

```bash
cd /root/whatsaas

# Generar archivo de migración (no aplica, solo crea el SQL)
npm run db:generate

# Ver archivo generado en:
# lib/db/migrations/

# Aplicar migración a la BD
npm run db:migrate
```

> **Importante:** Commit los archivos de migración generados al repo.

---

## Paso 4: Crear queries (funciones para usar la tabla)

**Ubicación:** `lib/db/queries/mi-tabla.ts`

```typescript
// lib/db/queries/mi-tabla.ts

import { db } from '@/lib/db/drizzle';
import { miTabla } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Get todas para un team
export async function getTablaItemsByTeamId(teamId: number) {
  return db
    .select()
    .from(miTabla)
    .where(eq(miTabla.teamId, teamId));
}

// Get una específica
export async function getTablaItemById(id: number, teamId: number) {
  const [item] = await db
    .select()
    .from(miTabla)
    .where(
      and(
        eq(miTabla.id, id),
        eq(miTabla.teamId, teamId)
      )
    );
  return item || null;
}

// Crear
export async function createTablaItem(data: {
  teamId: number;
  userId: number;
  name: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  const [item] = await db
    .insert(miTabla)
    .values(data)
    .returning();
  return item;
}

// Actualizar
export async function updateTablaItem(
  id: number,
  teamId: number,
  updates: Partial<typeof miTabla.$inferInsert>
) {
  await db
    .update(miTabla)
    .set(updates)
    .where(
      and(
        eq(miTabla.id, id),
        eq(miTabla.teamId, teamId)
      )
    );
}

// Eliminar
export async function deleteTablaItem(id: number, teamId: number) {
  await db
    .delete(miTabla)
    .where(
      and(
        eq(miTabla.id, id),
        eq(miTabla.teamId, teamId)
      )
    );
}
```

---

## Restricciones comunes

| Restricción | Sintaxis | Uso |
|---|---|---|
| Primary Key | `.primaryKey()` | Identificador único |
| Unique | `.unique()` | Email, username, etc. |
| Not Null | `.notNull()` | Campo obligatorio |
| Default | `.default(value)` | Valor por defecto |
| Foreign Key | `.references(() => otra.id)` | Relación a otra tabla |
| Cascade Delete | `{ onDelete: 'cascade' }` | Eliminar registros relacionados |
| Set Null | `{ onDelete: 'set null' }` | Anular referencia si se elimina |

---

## Convenciones en WhatSaaS

- **Nombres de tabla:** snake_case, plural preferentemente (`mi_tablas` no `MiTabla`)
- **Nombres de columna:** snake_case (`created_at` no `createdAt`)
- **IDs:** `serial('id').primaryKey()` o `uuid('id').defaultRandom()`
- **Timestamps:** SIEMPRE incluir `createdAt` y `updatedAt` (para auditoría)
- **Team isolation:** TODA tabla debe tener `teamId` para multi-tenancy
- **Índices:** Agregar para columnas frecuentemente filtradas (teamId, userId, status, etc.)

---

## Checklist antes de merge

- [ ] Tabla agregada al schema.ts (archivo único)
- [ ] Migraciones generadas con `npm run db:generate` y commiteadas
- [ ] Migraciones aplicadas localmente con `npm run db:migrate`
- [ ] Tabla tiene `teamId` para aislamiento de datos
- [ ] Tabla tiene `createdAt` y `updatedAt` para auditoría
- [ ] Índices agregados para columnas clave (teamId, status, etc.)
- [ ] Queries de lectura/escritura creadas en `lib/db/queries/`
- [ ] Type-safety verificado (Drizzle infiere tipos automáticamente)
- [ ] Las referencias (foreign keys) están correctas (no hay ciclos)

---

## Troubleshooting

**P: ¿Cómo verificar la migración antes de aplicar?**
R: Ver archivo SQL en `lib/db/migrations/` antes de ejecutar `npm run db:migrate`.

**P: ¿Qué pasa si cometo error en la migración?**
R: Verifica el archivo SQL, corrígelo, y genera una nueva migración.

**P: ¿Cómo relacionar dos tablas nuevas?**
R: Usa `.references(() => otraTabla.id)` en la tabla que tiene la clave foránea.

**P: ¿Puedo borrar una columna?**
R: Sí, elimínala de schema.ts, genera migración, y aplica.

---

## Referencias internas

- `lib/db/schema.ts` — Schema completo (~2500 líneas)
- `lib/db/queries/` — Ejemplos de queries por feature
- `drizzle.config.ts` — Configuración de Drizzle

