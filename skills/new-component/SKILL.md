# Skill: new-component

## Cuándo usar esta skill
Cuando necesites crear un nuevo componente UI que sea reutilizable y respete el sistema de diseño visual.

**Ejemplos:**
- Componente `<MetricCard>` que muestre una métrica con icono + título + valor
- Componente `<EmptyState>` para estados vacíos consistentes
- Componente `<ChatBubble>` para mensajes
- Componente `<FilterPanel>` para filtros

---

## Archivos clave a leer primero

1. `STYLE.md` — Guía visual oficial (tokens, tipografía, componentes)
2. `app/globals.css` — Variables CSS (tokens oklch)
3. `components/ui/` — Componentes base de shadcn/ui disponibles
4. `components/chat/MessageBubble.tsx` — Ejemplo de componente especializado
5. `components/dashboard/ChatListItem.tsx` — Otro ejemplo

---

## Estructura de carpetas

Según el dominio del componente:

```
components/
├── ui/                      # Base components de shadcn
├── interface/               # Componentes de layout general (Sidebar, Logo)
├── chat/                    # Componentes de Chat
├── dashboard/               # Componentes de Dashboard
├── automation/              # Componentes de Automation
├── contacts/                # Componentes de Contacts
├── mi-feature/              # Nueva carpeta si hay múltiples componentes para una feature
│   ├── MetricCard.tsx
│   ├── FilterPanel.tsx
│   └── EmptyState.tsx
```

---

## Template de componente cliente simple

```typescript
// components/mi-feature/MetricCard.tsx
'use client';

import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: 'up' | 'down' | null;
  trendValue?: string;
  className?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('p-6', className)}>
      {/* Header con icono */}
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        {trend && (
          <div className={cn(
            'text-xs font-semibold',
            trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {trend === 'up' ? '↑' : '↓'} {trendValue}
          </div>
        )}
      </div>

      {/* Contenido */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </Card>
  );
}
```

---

## Template de componente servidor

```typescript
// components/mi-feature/DataList.tsx

import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTranslations } from 'next-intl/server';

interface DataListProps {
  items: Array<{ id: number; name: string; status: string }>;
  isLoading?: boolean;
}

export async function DataList({ items, isLoading }: DataListProps) {
  const t = await getTranslations('MyFeature');

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">{t('loading')}</div>;
  }

  if (!items.length) {
    return <div className="p-4 text-center text-muted-foreground">{t('empty')}</div>;
  }

  return (
    <Card>
      <ScrollArea className="h-full">
        <div className="space-y-2 p-4">
          {items.map((item) => (
            <div key={item.id} className="p-3 rounded-lg hover:bg-muted transition-colors">
              <p className="font-medium text-sm">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.status}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
```

---

## Componente con interactividad (formulario)

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface SearchFilterProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchFilter({ onSearch, placeholder }: SearchFilterProps) {
  const t = useTranslations('UI');
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    } else {
      toast.error(t('empty_search_error'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1">
        <Input
          placeholder={placeholder || t('search_placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Button type="submit">
        {t('search_button')}
      </Button>
    </form>
  );
}
```

---

## Componente con loading state

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface AsyncDataProps {
  url: string;
}

export function AsyncData({ url }: AsyncDataProps) {
  const { data, isLoading, error } = useSWR(url, fetcher);

  if (isLoading) {
    return (
      <Card className="p-4 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4 text-destructive">
        Error: {error.message}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      {/* Mostrar data */}
      {JSON.stringify(data)}
    </Card>
  );
}
```

---

## Guía de tokens y estilos

### Colores (nunca hardcodear)

```typescript
// ❌ MAL
<div className="bg-#3b82f6">

// ✅ BIEN: Usar tokens
<div className="bg-primary">             {/* Acción principal (verde) */}
<div className="bg-accent">              {/* Hover/estado activo */}
<div className="bg-muted">               {/* Fondo secundario */}
<div className="bg-destructive">         {/* Acciones destructivas */}
<div className="bg-background">          {/* Fondo principal */}
<div className="bg-card">                {/* Fondo de cards */}
<div className="bg-sidebar">             {/* Color sidebar */}
```

### Tipografía

```typescript
// Título de página
<h1 className="text-3xl font-bold">Título</h1>

// Título de sección/card
<h2 className="text-xl font-semibold">Sección</h2>

// Subtítulo
<p className="text-base font-semibold">Subtítulo</p>

// Cuerpo normal
<p className="text-sm">Contenido normal</p>

// Metadata/ayuda
<p className="text-xs text-muted-foreground">Información de ayuda</p>
```

### Espaciado

```typescript
// Entre elementos dentro de una sección
<div className="space-y-2">...</div>    // Gap pequeño
<div className="space-y-4">...</div>    // Gap normal
<div className="space-y-6">...</div>    // Gap grande

// Entre columnas/items
<div className="gap-3">...</div>        // Columnas
<div className="gap-6">...</div>        // Cards grandes
```

### Bordes y radios

```typescript
<div className="border rounded-lg">     {/* Borde suave */}
<div className="border-border rounded-xl"> {/* Borde estándar, radio mediano */}
<div className="border-primary">        {/* Borde de acción principal */}
```

### Dark mode

Tailwind aplica automáticamente con clase `dark` en el HTML.

```typescript
// ✅ Usa prefijo dark: para estilos custom
<div className="bg-white dark:bg-slate-950">

// O deja que los tokens lo manejen
<div className="bg-background">  {/* Automático light/dark */}
```

---

## Checklist de calidad visual

- [ ] **Tokens:** Solo usa clases de Tailwind (`bg-primary`, `text-foreground`, etc.), no colores hex/rgb.
- [ ] **Tipografía:** Mantiene jerarquía (h1/h2 > cuerpo > ayuda).
- [ ] **Icono:** Usa Lucide React. Props como `className="w-5 h-5"` para tamaño.
- [ ] **Dark mode:** Se ve correcto en light y dark (testear con `dark:` clases si aplica).
- [ ] **Responsive:** Funciona en mobile (< 768px) sin overflow horizontal.
- [ ] **Spacing:** Usa `space-y-`, `gap-` consistentemente.
- [ ] **Estados:** Si tiene interacción, muestra loading/disabled/error.
- [ ] **Accesibilidad:** Etiquetas en inputs, contraste de texto.
- [ ] **Reutilización:** Los props permiten personalizar comportamiento y estilos.
- [ ] **i18n:** Texts via `useTranslations()` o props, no hardcodeados.

---

## Ejemplo completo: Componente de badge de estado

```typescript
// components/ui/status-badge.tsx
'use client';

import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const statusVariants = cva(
  'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium',
  {
    variants: {
      status: {
        active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        inactive: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300',
        pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
        failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      },
    },
    defaultVariants: { status: 'active' },
  }
);

export interface StatusBadgeProps extends VariantProps<typeof statusVariants> {
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={statusVariants({ status })}>{label}</span>;
}
```

---

## Referencias internas

- `components/ui/` — Todos los componentes base disponibles
- `components/chat/MessageBubble.tsx` — Componente con lógica especializada
- `components/dashboard/KanbanBoard.tsx` — Componente con estado complejo
