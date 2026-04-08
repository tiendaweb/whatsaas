# Skill: add-i18n

## Cuándo usar esta skill
Cuando necesites agregar nuevos textos/strings a la aplicación que deben estar disponibles en múltiples idiomas.

**Ejemplo:** Estás creando una nueva sección "Reportes" y necesitas agregar el título, descripción, etiquetas de botones en español, inglés y portugués.

---

## Resumen: Idiomas soportados

- 🇪🇸 **Español** (`es`) — idioma principal del producto
- 🇺🇸 **Inglés** (`en`)
- 🇧🇷 **Portugués** (`pt`)

Los archivos viven en `/root/whatsaas/messages/`:
- `messages/es.json`
- `messages/en.json`
- `messages/pt.json`

---

## Paso 1: Agregar strings a los 3 archivos de mensajes

### Estructura de namespaces

Los archivos JSON están organizados por "namespaces" — áreas funcionales de la app:

```json
{
  "Utils": { ... },
  "Auth": { ... },
  "Sidebar": { ... },
  "Dashboard": { ... },
  "Automation": { ... },
  "Chat": { ... },
  "MiFeatureNueva": { ... }
}
```

**Convención:** El nombre del namespace debe ser PascalCase, descriptivo.

### Ejemplo: Agregar namespace "Reportes"

**En `messages/es.json`:**
```json
{
  "Reportes": {
    "title": "Reportes",
    "description": "Visualiza análisis detallados de tu operación",
    "add_new_button": "Generar reporte",
    "export_button": "Exportar",
    "filters_title": "Filtros",
    "date_range_label": "Rango de fechas",
    "empty_state_title": "Sin reportes",
    "empty_state_description": "Genera tu primer reporte para comenzar.",
    "error_loading": "Error al cargar reportes",
    "loading_message": "Cargando..."
  }
}
```

**En `messages/en.json`:**
```json
{
  "Reportes": {
    "title": "Reports",
    "description": "View detailed analytics of your operation",
    "add_new_button": "Generate report",
    "export_button": "Export",
    "filters_title": "Filters",
    "date_range_label": "Date range",
    "empty_state_title": "No reports",
    "empty_state_description": "Generate your first report to get started.",
    "error_loading": "Error loading reports",
    "loading_message": "Loading..."
  }
}
```

**En `messages/pt.json`:**
```json
{
  "Reportes": {
    "title": "Relatórios",
    "description": "Visualize análises detalhadas de sua operação",
    "add_new_button": "Gerar relatório",
    "export_button": "Exportar",
    "filters_title": "Filtros",
    "date_range_label": "Intervalo de datas",
    "empty_state_title": "Sem relatórios",
    "empty_state_description": "Gere seu primeiro relatório para começar.",
    "error_loading": "Erro ao carregar relatórios",
    "loading_message": "Carregando..."
  }
}
```

---

## Paso 2: Usar traducciones en componentes CLIENT

### En Client Components (con 'use client')

```typescript
'use client';

import { useTranslations } from 'next-intl';

export function ReportesHeader() {
  const t = useTranslations('Reportes'); // Específico del namespace

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
      <button>{t('add_new_button')}</button>
    </div>
  );
}
```

### En Server Components (sin 'use client')

```typescript
import { getTranslations } from 'next-intl/server';

export async function ReportesHeader() {
  const t = await getTranslations('Reportes');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
      <button>{t('add_new_button')}</button>
    </div>
  );
}
```

---

## Paso 3: Convención de claves

**Usa snake_case para las claves:**
- ✅ `title`, `description`, `add_new_button`, `date_range_label`
- ❌ `Title`, `addNewButton`, `dateRangeLabel`

**Nombra claves según su contexto:**
- `*_label` para etiquetas de campos
- `*_placeholder` para placeholders
- `*_button` para botones
- `*_tooltip` para tooltips
- `*_title` para títulos
- `*_description` para descripciones
- `*_message` para mensajes de estado

---

## Paso 4: Valores dinámicos / Interpolación

Si necesitas insertar valores dinámicos:

### En los mensajes (usa `{var}`):

```json
{
  "Reportes": {
    "total_items": "Mostrando {count} reportes",
    "welcome_message": "Bienvenido, {name}"
  }
}
```

### En el componente:

```typescript
const t = useTranslations('Reportes');

// Opción 1: Funciones
const message = t('total_items', { count: 5 });
// Resultado: "Mostrando 5 reportes"

const welcome = t('welcome_message', { name: 'Juan' });
// Resultado: "Bienvenido, Juan"
```

---

## Paso 5: Fallback y valores faltantes

Si una clave no existe en un idioma, next-intl busca:

1. En el idioma actual
2. En el idioma por defecto (`en`)
3. Muestra un error en console (dev) o usa la clave como texto

**Para evitar esto:** Asegúrate de que TODAS las claves existan en los 3 idiomas.

---

## Paso 6: Agregar namespace a la configuración (si es totalmente nuevo)

Normalmente NO necesitas agregar el namespace a ningún archivo de configuración. next-intl lee dinámicamente del JSON.

**Únicamente si:** Necesitas validación de tipos TypeScript (soportar autocompletado).

En ese caso, opcional: crea un archivo `types/translations.ts` con tipos generados, pero no es obligatorio para funcionar.

---

## Checklist: Traducción completa

Antes de hacer merge, verifica:

- [ ] Namespace nuevo está en `es.json`, `en.json` y `pt.json`.
- [ ] Todas las claves existen en los 3 idiomas (sin omisiones).
- [ ] Las claves usan snake_case.
- [ ] Los valores en español, inglés y portugués son naturales (no traducciones literales forzadas).
- [ ] Client components usan `useTranslations()` (hook).
- [ ] Server components usan `getTranslations()` (async).
- [ ] Valores dinámicos usando sintaxis `{var}` funcionan correctamente.
- [ ] No hay hardcodeo de strings en el código (todo via `t()`).

---

## Ejemplo completo: Nueva feature "Notificaciones"

### En los JSON:

**es.json:**
```json
{
  "Notifications": {
    "title": "Notificaciones",
    "description": "Gestiona tus alertas y preferencias",
    "email_notifications": "Notificaciones por email",
    "push_notifications": "Notificaciones push",
    "enable_label": "Habilitar",
    "disable_label": "Deshabilitar",
    "frequency_label": "Frecuencia",
    "frequency_real_time": "En tiempo real",
    "frequency_hourly": "Cada hora",
    "frequency_daily": "Diaria",
    "save_button": "Guardar cambios",
    "saved_toast": "Cambios guardados correctamente",
    "error_toast": "Error al guardar los cambios"
  }
}
```

### En el componente (Client):

```typescript
'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function NotificationsForm() {
  const t = useTranslations('Notifications');

  const handleSave = async () => {
    try {
      // Guardar cambios
      await saveNotificationSettings({...});
      toast.success(t('saved_toast'));
    } catch (error) {
      toast.error(t('error_toast'));
    }
  };

  return (
    <div className="space-y-6">
      <h2>{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label>{t('email_notifications')}</label>
          <Switch />
        </div>

        <div className="flex items-center justify-between">
          <label>{t('push_notifications')}</label>
          <Switch />
        </div>
      </div>

      <Button onClick={handleSave}>{t('save_button')}</Button>
    </div>
  );
}
```

---

## Troubleshooting

**P: ¿Qué pasa si olvido una clave en un idioma?**
R: El usuario verá la clave literal (ej: "Notifications.email_notifications") o el fallback al inglés. Siempre revisa los 3 archivos.

**P: ¿Cómo cambiar el idioma en la app?**
R: El usuario selecciona en el LanguageSwitcher (componente en sidebar). No necesitas hacer nada en el código para soportar nuevos idiomas una vez configurados.

**P: ¿Puedo usar HTML en las traducciones?**
R: No directamente en el JSON. Si necesitas HTML, escribe JSX en el componente.

**P: ¿Cómo traducir mensajes de error de API?**
R: Recibe el error del servidor (ej: `error.code`) y usa `t(error.code)` en el cliente.

```typescript
try {
  await someAPI();
} catch (error) {
  const t = useTranslations('Errors');
  toast.error(t(error.code)); // "Errors.invalid_email", etc.
}
```

---

## Referencias internas

- `messages/es.json` — Plantilla de referencia para nuevas claves.
- `i18n/request.ts` — Configuración de locales soportados.
- `next.config.ts` — Wrapper `withNextIntl()`.

---

## Tip de validación rápida

Para asegurarte que los 3 archivos JSON sean válidos:

```bash
cd /root/whatsaas
npm run validate:i18n  # Si existe este script
# O simplemente ejecuta:
node -e "console.log(require('./messages/es.json'), require('./messages/en.json'), require('./messages/pt.json'))"
```

Si no hay error, están bien formados.
