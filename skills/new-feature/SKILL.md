# Skill: new-feature

## Cuándo usar esta skill
Cuando necesites crear una nueva pantalla, página o sección dentro del dashboard o admin de WhatSaaS.

**Ejemplos:** Agregar una sección de "Análisis de sentimiento", un nuevo módulo de "Configuración avanzada", una subsección dentro de Settings.

---

## Archivos clave a leer primero
1. `STYLE.md` — Guía visual oficial
2. `AGENTS.md` — Patrones de arquitectura
3. `app/[locale]/(dashboard)/layout.tsx` — Estructura del layout autenticado
4. `components/interface/Sidebar.tsx` — Cómo se agregan items al menú
5. `lib/permissions.ts` — Roles y permisos del team

---

## Checklist de pre-implementación

- [ ] ¿Es una pantalla nueva o una subsección dentro de una sección existente?
- [ ] ¿Requiere permisos/roles específicos? (revisar `MemberPermissions` en `lib/permissions.ts`)
- [ ] ¿Es feature-flagged? (revisar feature flags del plan activo en `/api/features/all`)
- [ ] ¿Necesita ítems en el sidebar? (revisar cómo se agregan en `Sidebar.tsx`)
- [ ] ¿Qué traducciones se necesitan? (es, en, pt)
- [ ] ¿Tendrá una vista vacía (sin datos)? Implementar estado `empty`.
- [ ] ¿Necesita API routes nuevas?
- [ ] ¿Necesita tablas DB nuevas?

---

## Estructura de carpetas recomendada

### Pantalla principal en dashboard

```
app/[locale]/(dashboard)/mi-seccion/
├── page.tsx                           # Pantalla principal (Server Component)
├── layout.tsx                         # Layout local si es necesario
├── actions.ts                         # Server Actions para mutaciones
└── components/
    ├── Header.tsx                     # Encabezado con título + CTA
    ├── Sidebar.tsx                    # Sidebar izquierdo (búsqueda + listado)
    ├── DetailPanel.tsx                # Panel derecho con contenido
    ├── EmptyState.tsx                 # Cuando no hay datos
    └── ...otros componentes
```

### En admin

```
app/[locale]/(admin)/admin/mi-seccion/
└── (misma estructura que arriba)
```

---

## Pasos concretos

### Paso 1: Crear la estructura base

1. Crear carpeta `app/[locale]/(dashboard)/mi-seccion/` (o `(admin)/admin/mi-seccion/`)
2. Crear `page.tsx` como Server Component:

```typescript
import { getSession } from '@/lib/auth/session';
import { MiSeccionHeader } from './components/Header';
import { MiSeccionSidebar } from './components/Sidebar';
import { MiSeccionDetailPanel } from './components/DetailPanel';
import { hasPermission } from '@/lib/permissions';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Mi Sección',
  description: 'Descripción breve.',
};

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; id?: string }>;
}

export default async function MiSeccionPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tab = 'overview', id } = await searchParams;
  
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  
  // Verificar permisos (si aplica)
  if (!hasPermission(session.permissions, 'miSeccion')) {
    return <div>No tienes acceso a esta sección.</div>;
  }

  // Cargar datos (Server Component)
  const data = await fetch(...); // o usar DB queries directo

  return (
    <div className="h-screen flex flex-col bg-background">
      <MiSeccionHeader onAddNew={() => {}} />
      <div className="flex flex-1 min-h-0 overflow-hidden gap-6 p-6">
        <MiSeccionSidebar activeId={id} />
        <MiSeccionDetailPanel id={id} tab={tab} data={data} />
      </div>
    </div>
  );
}
```

### Paso 2: Crear Header con CTA principal

```typescript
// components/Header.tsx
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface HeaderProps {
  onAddNew?: () => void;
}

export function MiSeccionHeader({ onAddNew }: HeaderProps) {
  const t = useTranslations('MiSeccion'); // Namespace de traducciones
  
  return (
    <div className="sticky top-0 z-10 border-b bg-background px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
      </div>
      <Button onClick={onAddNew} className="gap-2">
        <Plus className="w-4 h-4" />
        {t('add_new_button')}
      </Button>
    </div>
  );
}
```

### Paso 3: Crear componentes (Sidebar + Detail Panel)

**Sidebar izquierdo:**
```typescript
// components/Sidebar.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { useState } from 'react';

interface SidebarProps {
  items: any[];
  activeId?: string;
  onSelect: (id: string) => void;
}

export function MiSeccionSidebar({ items, activeId, onSelect }: SidebarProps) {
  const [search, setSearch] = useState('');
  const filtered = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="w-full md:w-80 h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Sin resultados
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  activeId === item.id 
                    ? 'bg-accent text-accent-foreground' 
                    : 'hover:bg-muted'
                }`}
              >
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {item.description}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
```

**Detail Panel:**
```typescript
// components/DetailPanel.tsx
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from './EmptyState';

interface DetailPanelProps {
  item?: any;
  isLoading?: boolean;
}

export function MiSeccionDetailPanel({ item, isLoading }: DetailPanelProps) {
  if (!item) return <EmptyState />;
  if (isLoading) return <div className="text-center py-8">Cargando...</div>;

  return (
    <div className="flex-1 space-y-6 overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle>{item.name}</CardTitle>
          <CardDescription>{item.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contenido aquí */}
        </CardContent>
      </Card>
    </div>
  );
}
```

### Paso 4: Agregar traducciones

**En `messages/es.json`:**
```json
{
  "MiSeccion": {
    "title": "Mi Sección",
    "description": "Gestiona...",
    "add_new_button": "Agregar nuevo",
    "empty_state_title": "Sin elementos",
    "empty_state_description": "Comienza creando uno nuevo."
  }
}
```

Repetir en `messages/en.json` y `messages/pt.json`.

### Paso 5: Actualizar Sidebar de navegación (si es una sección principal)

En `components/interface/Sidebar.tsx`, agregar item a `navigationItems`:

```typescript
{
  name: 'Mi Sección',
  href: '/dashboard/mi-seccion',
  icon: MyIcon,
  badge: 'new', // opcional
  permissions: ['miSeccion'], // Opcional: protegido por permiso
}
```

### Paso 6: Permisos (si es necesario)

En `lib/permissions.ts`, actualizar `MemberPermissions`:

```typescript
export interface MemberPermissions {
  // ...
  miSeccion?: boolean;
}
```

### Paso 7: Feature flag (si es opcional por plan)

En la acción que carga datos, verificar:

```typescript
const features = await getFeatures(teamId);
if (!features.includes('miSeccion')) {
  return { error: 'Feature not available for your plan' };
}
```

---

## Checklist de calidad visual (basado en STYLE.md)

Antes de hacer push:

- [ ] **Colores:** Usa tokens (`bg-background`, `text-foreground`, etc.) sin hardcodear colores.
- [ ] **Tipografía:** Mantén jerarquía (página h1/h2, secciones h3, cuerpo text-sm).
- [ ] **Layout:** Sidebar izquierda (w-full md:w-80) + panel derecho (flex-1). Mobile: stack.
- [ ] **Componentes:** Usa solo shadcn/ui + Lucide icons. Sin librerías externas.
- [ ] **Estados:** Implementa vacío, carga y error visibles.
- [ ] **Toasts:** Usa `import { toast } from 'sonner'` (no shadcn toast).
- [ ] **Dark mode:** Testea en light/dark. Usa `dark:` classes si necesario.
- [ ] **Responsive:** Funciona en mobile (< 768px) y desktop.
- [ ] **Accesibilidad:** Etiquetas en inputs, contraste de texto adecuado.
- [ ] **i18n:** Todas las strings nuevas en los 3 idiomas.

---

## Ejemplo completo: Nueva sección "Reportes"

Ver estructura en `app/[locale]/(dashboard)/campaigns/` como referencia — tiene sidebar + detail panel + empty state.

---

## Troubleshooting

**¿Cómo agregar permisos granulares?**
Ver `lib/permissions.ts` → `hasPermission(session.permissions, 'featureName')`.

**¿Cómo usar datos de BD?**
Crear queries en `lib/db/queries/mi-seccion.ts` y llamarlas en el Server Component.

**¿Cómo agregar API endpoints?**
Ver skill `new-api-route`.

**¿Cómo agregar modales?**
Ver skill `new-modal`.
