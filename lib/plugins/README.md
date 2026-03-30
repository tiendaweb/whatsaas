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
