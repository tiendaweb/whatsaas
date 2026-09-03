# Dominios, subdominios, ambientes y publicación

## Hosts administrados

Cada proyecto recibe identificadores estables:

- preview: `{project}-{branch}.preview.saasmaker.app`;
- producción: `{slug}.saasmaker.app`;
- dominio propio: uno o más hosts verificados;
- panel de control SaaS Maker: nunca comparte cookies con runtimes.

El dominio base definitivo es configurable. Los ejemplos no deben codificarse en contratos.

## Modelo de dominio

Un dominio tiene organizationId, projectId, environmentId, hostname normalizado, tipo, estado, challenge, timestamps de verificación, certificado, canonical flag, redirect policy y última comprobación. Unique global por hostname. Los wildcards solo se permiten para infraestructura controlada.

Estados: requested, pending_dns, verifying, verified, provisioning_certificate, active, degraded, suspended, releasing, released, failed.

## Verificación

1. El usuario registra host.
2. SaaS Maker genera challenge TXT y target CNAME/A.
3. Worker consulta DNS autoritativo con reintentos y límites.
4. Verifica challenge, target y ausencia de takeover.
5. Emite certificado mediante proveedor ACME/edge.
6. Confirma handshake desde edge.
7. Activa host y programa reverificación.

No activar por una captura o por el Host header recibido. Un dominio liberado entra en cuarentena antes de reasignarse.

## Enrutamiento

El edge resuelve hostname a `DomainBinding`, ambiente y release activo mediante cache con invalidación. El backend revalida binding en acciones sensibles. Definir canonical domain, redirect de www/apex, HTTPS obligatorio, HSTS gradual, paths reservados y protección contra host-header injection.

## Ambientes

- Development: edición y fixtures; integraciones sandbox.
- Preview: release candidato, URL compartible con acceso configurable; datos aislados.
- Production: release activo, pagos live, dominios y SLA.

Secretos, webhooks, proveedores, dominios y datos se configuran por ambiente. Promover definición no copia secretos ni datos.

## Preflight de publicación

- definición y migraciones válidas;
- dependencias de módulos satisfechas;
- secretos requeridos presentes;
- pagos en modo correcto y webhook saludable;
- email autenticado o fallback seguro;
- dominio/certificado disponible;
- fixtures eliminados de producción;
- rutas, SEO y políticas legales completas;
- roles, entitlements y accesibilidad validados;
- pruebas smoke/E2E verdes;
- costo y límites dentro del plan Maker;
- backup/restore compatible antes de migración riesgosa.

## Release y rollout

El release referencia versión de definición, módulos exactos, assets por hash, migración, build/runtime version y checksum. Publicar crea artefacto, ejecuta checks y cambia puntero atómico. Soportar canary por porcentaje/tenant en fases posteriores. Rollback de UI es inmediato; rollback de datos usa migraciones forward o restore controlado, nunca un down automático destructivo.

## SEO y landing

Por ambiente y dominio: title, description, social cards, favicon, robots, sitemap, canonical, redirects y páginas legales. Preview usa `noindex`. Si no hay landing, `/` redirige según política a login, signup, app o página pública elegida.

## Fallos y runbook

- DNS pendiente: mostrar registros exactos, TTL y diagnóstico.
- Certificado fallido: mantener host inactivo, no servir HTTP inseguro.
- release unhealthy: revertir puntero y preservar logs.
- dominio comprometido: suspender binding, revocar certificado y sesiones asociadas si aplica.
- cuota superada: bloquear nuevas publicaciones, no apagar runtimes ya pagados sin política.

