# Plugin Convention

Cada plugin de aplicación debe vivir dentro de:

- `lib/plugins/<plugin-id>/manifest.ts`
- `lib/plugins/<plugin-id>/server/*`
- `lib/plugins/<plugin-id>/ui/*`

## Reglas

1. `manifest.ts` implementa el contrato común `AppPluginManifest` de `lib/plugins/core/types.ts`.
2. Código del backend del plugin debe vivir en `server/`.
3. Componentes y renderers del plugin deben vivir en `ui/`.
4. El plugin debe ser registrado en `lib/plugins/core/registry.ts` para habilitar carga dinámica.
5. Cada `manifest.ts` debe definir `activationMode`:
   - `system`: siempre activo (no desactivable en admin).
   - `global`: depende del estado por team.
   - `user`: depende de asignación por usuario.
   - `hybrid`: combina estado global + override por usuario.

## Regla especial: Marketplace

- `marketplace` está definido como plugin `system`.
- En bootstrap se fuerza activo para todos los teams.
- El panel admin no permite desactivarlo ni a nivel sistema ni team.

## Iconos soportados para `navItems.icon`

El campo `icon` en `pluginNavItemSchema` (`lib/plugins/core/types.ts`) se mantiene como `string` para no acoplar manifests al paquete de UI, pero el sidebar solo renderiza un set seguro de iconos de `lucide-react`.

Valores soportados actualmente:

- `Bot`
- `CalendarDays`
- `NotebookText`
- `Plug`
- `Rocket`

Si un plugin envía un icono no soportado (o no define `icon`), el sidebar usa fallback a `Plug`.
