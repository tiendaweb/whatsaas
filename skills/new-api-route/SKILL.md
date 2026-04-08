# Skill: new-api-route

## Cuándo usar esta skill
Cuando necesites crear una nueva API route en `/app/api/` para:
- Operaciones que requieren autenticación privada
- Webhooks (Stripe, Evolution, Mercado Pago)
- Endpoints consumidos por cliente (SWR) o Server Components
- APIs públicas (version 1) autenticadas por API Key

---

## Archivos clave a leer primero

1. `lib/auth/api.ts` — Función `getAuthenticatedTeam()` para obtener el team actual
2. `app/api/messages/[id]/route.ts` — Ejemplo de endpoint simple
3. `app/api/contacts/route.ts` — Ejemplo con POST + validación
4. `lib/permissions.ts` — Roles y permisos

---

## Estructura básica

```
app/api/
├── mi-recurso/
│   ├── route.ts           # GET, POST
│   └── [id]/
│       └── route.ts       # GET, PUT, DELETE para un recurso específico
```

---

## Template de API Route simple

```typescript
// app/api/mi-recurso/route.ts

import { getAuthenticatedTeam } from '@/lib/auth/api';
import { db } from '@/lib/db/drizzle';
import { miRecursos } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 1. Autenticar (soporta cookie + Bearer API Key)
    const { team, user, error } = await getAuthenticatedTeam(request);
    
    if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }

    // 2. Lógica
    const recursos = await db
      .select()
      .from(miRecursos)
      .where(eq(miRecursos.teamId, team.id));

    // 3. Response
    return NextResponse.json({ success: true, data: recursos });
  } catch (error) {
    console.error('[mi-recurso GET]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { team, error } = await getAuthenticatedTeam(request);
    
    if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }

    // Parsear body
    const body = await request.json();
    const { name, description } = body;

    // Validar
    if (!name) {
      return NextResponse.json(
        { error: 'name es requerido' },
        { status: 400 }
      );
    }

    // Crear
    const [newRecurso] = await db
      .insert(miRecursos)
      .values({
        teamId: team.id,
        name,
        description,
      })
      .returning();

    return NextResponse.json(
      { success: true, data: newRecurso },
      { status: 201 }
    );
  } catch (error) {
    console.error('[mi-recurso POST]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Template para recurso por ID

```typescript
// app/api/mi-recurso/[id]/route.ts

import { getAuthenticatedTeam } from '@/lib/auth/api';
import { db } from '@/lib/db/drizzle';
import { miRecursos } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { team, error } = await getAuthenticatedTeam(request);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const { id } = await params;
    const recursoId = parseInt(id);

    if (isNaN(recursoId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const [recurso] = await db
      .select()
      .from(miRecursos)
      .where(
        and(
          eq(miRecursos.id, recursoId),
          eq(miRecursos.teamId, team.id)
        )
      );

    if (!recurso) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: recurso });
  } catch (error) {
    console.error('[mi-recurso GET id]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { team, error } = await getAuthenticatedTeam(request);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const { id } = await params;
    const recursoId = parseInt(id);

    const body = await request.json();
    const { name, description } = body;

    // Actualizar
    await db
      .update(miRecursos)
      .set({ name, description })
      .where(
        and(
          eq(miRecursos.id, recursoId),
          eq(miRecursos.teamId, team.id)
        )
      );

    return NextResponse.json({ success: true, message: 'Updated' });
  } catch (error) {
    console.error('[mi-recurso PUT]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { team, error } = await getAuthenticatedTeam(request);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const { id } = await params;
    const recursoId = parseInt(id);

    await db
      .delete(miRecursos)
      .where(
        and(
          eq(miRecursos.id, recursoId),
          eq(miRecursos.teamId, team.id)
        )
      );

    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) {
    console.error('[mi-recurso DELETE]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Template con validación (Zod)

```typescript
import { z } from 'zod';

const createRecursoSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { team, error } = await getAuthenticatedTeam(request);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const body = await request.json();
    
    // Validar con Zod
    const validation = createRecursoSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { name, description } = validation.data;

    // Crear...
    const [newRecurso] = await db
      .insert(miRecursos)
      .values({ teamId: team.id, name, description })
      .returning();

    return NextResponse.json({ success: true, data: newRecurso }, { status: 201 });
  } catch (error) {
    console.error('[POST]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

---

## Template para webhooks (firmado, sin auth de sesión)

```typescript
// app/api/webhook/mi-servicio/route.ts

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Verificar firma del webhook
function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.MI_SERVICIO_WEBHOOK_SECRET!;
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-signature');
    const payload = await request.text();

    // Validar firma
    if (!signature || !verifySignature(payload, signature)) {
      console.warn('[webhook] Invalid signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = JSON.parse(payload);

    // Procesar evento
    if (data.event === 'payment.completed') {
      // ... lógica
    }

    // Importante: Always respond 200 to webhook to prevent retries
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[webhook POST]', error);
    // Aún así devolver 200 para evitar que el webhook reintente
    return NextResponse.json({ success: true });
  }
}
```

---

## Permisos (si es necesario)

```typescript
// Dentro del endpoint
import { hasPermission } from '@/lib/permissions';

const { team, user, error } = await getAuthenticatedTeam(request);

if (!hasPermission(user.memberPermissions, 'automation')) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

## Códigos HTTP estándar

| Código | Uso |
|--------|-----|
| 200 | Éxito general (GET, PUT, DELETE) |
| 201 | Creado exitosamente (POST) |
| 400 | Validación fallida, parámetros inválidos |
| 401 | No autenticado (no hay token/sesión válida) |
| 403 | Autenticado pero sin permisos (Forbidden) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ej: recurso duplicado) |
| 500 | Error del servidor |

---

## Checklist antes de merge

- [ ] Autenticación: Usa `getAuthenticatedTeam()`.
- [ ] Validación: Input validado con Zod (si aplica).
- [ ] Errores: Respuestas JSON consistentes con código HTTP.
- [ ] Logging: Errores loguean a console.error con contexto `[ruta]`.
- [ ] Permisos: Si es necesario, verifica `hasPermission()`.
- [ ] Scope: Los datos retornan solo para el team autenticado (no cross-team).
- [ ] Idempotencia: Webhooks pueden ejecutarse 2+ veces sin problemas.
- [ ] Rate limiting: Considerado (no implementado manualmente, pero documentado si es crítico).

---

## Referencias internas

- `lib/auth/api.ts` — `getAuthenticatedTeam(request)`
- `app/api/stripe/webhook/route.ts` — Ejemplo de webhook
- `app/api/contacts/route.ts` — Ejemplo de CRUD
