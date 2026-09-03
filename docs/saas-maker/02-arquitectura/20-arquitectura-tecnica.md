# Arquitectura técnica de SaaS Maker

## Topología recomendada

Comenzar con un monolito modular TypeScript y procesos separados para web/API, workers y scheduler. Usar PostgreSQL como sistema transaccional, Redis o cola equivalente para jobs/locks/rate limiting, object storage compatible con S3 para archivos, CDN para assets publicados, proveedor de email y observabilidad centralizada.

No dividir por microservicios hasta que existan límites de escala o propiedad demostrados. Sí imponer fronteras de dominio desde el primer commit.

## Planos del sistema

### Plano de control

Administra organizaciones Maker, proyectos, miembros, suscripción de plataforma, plantillas, módulos, secretos, dominios, proveedores, ambientes, versiones, releases, despliegues, auditoría y soporte. Solo operadores y creadores autorizados acceden.

### Plano de runtime

Atiende landings y aplicaciones publicadas. Resuelve host, proyecto, release, tenant final, usuario, rol, plan, módulos y políticas; carga la definición inmutable; consulta servicios de datos; ejecuta acciones registradas. No permite editar definiciones ni leer secretos.

### Plano de datos

Guarda registros, relaciones, archivos, índices de búsqueda y proyecciones de cada SaaS. Debe admitir aislamiento compartido inicialmente y una futura implementación dedicada sin cambiar el contrato del runtime.

### Plano de eventos y jobs

Procesa webhooks, outbox/inbox, emails, workflows, aprovisionamiento, migraciones de módulos, publicación, certificados, IA y tareas programadas. Todo job tiene idempotency key, intentos, lease, timeout y DLQ.

## Módulos de dominio

- identity: usuarios, sesiones, MFA, invitaciones y proveedores;
- organizations: organizaciones Maker, membresías y límites;
- projects: proyecto, ambientes, configuración y ownership;
- definitions: schema declarativo, validación, versiones y diff;
- builder: edición, preview, colaboración y autosave;
- runtime: resolución, render, navegación, data binding y acciones;
- tenants: tenants finales, miembros, roles y settings;
- data: entidades dinámicas, registros, relaciones, archivos y búsqueda;
- commerce: catálogo, prices, checkout, suscripciones y ledger;
- entitlements: capacidades, límites, grants y consumo;
- modules: registry, versiones, instalación, configuración y lifecycle;
- templates: paquetes, categorías, compatibilidad y clonación;
- domains: hosts, DNS, certificados, rutas y redirects;
- releases: build, preflight, deployment, rollout y rollback;
- integrations: conexiones, secretos, OAuth y webhooks;
- ai-gateway: agentes, tools, approvals, cuotas y runs;
- automation: triggers, workflows, jobs y resultados;
- audit: eventos de seguridad y actividad;
- observability: logs, métricas, trazas, alertas y status.

## Estructura de repositorio sugerida

```text
apps/
  control-web/          panel SaaS Maker
  runtime-web/          landings y apps publicadas
  worker/               jobs, eventos y webhooks
packages/
  contracts/            schemas versionados y tipos públicos
  db/                   schema, migrations, repositorios tenant-scoped
  auth/                 identidad, sesiones y policy engine
  builder-core/         comandos, diff, validadores y preview
  runtime-core/         intérprete declarativo
  component-registry/   bloques aprobados
  module-sdk/           contrato de módulos
  payment-gateway/      adapters y estados canónicos
  ai-gateway/           registry semántico y providers
  events/               outbox, inbox y catálogo
  observability/        logging, tracing y auditoría
  ui/                   design system del plano de control
infra/
  docker/ terraform/ runbooks/
docs/
```

## Flujo de publicación

1. El builder guarda comandos sobre el draft con versión optimista.
2. Validate produce errores, warnings, diff de schema y costos estimados.
3. Preview crea artefacto/release aislado y ejecuta smoke tests.
4. Publish congela definición, referencias de assets y módulos.
5. El worker aplica migraciones compatibles y genera proyecciones.
6. Se promueve el release con rollout; health checks deciden continuar o revertir.
7. El runtime cambia un puntero atómico de release.
8. Auditoría y evento `release.activated` registran actor, versión y resultado.

## Requisitos no funcionales iniciales

- runtime p95 menor a 500 ms para vistas sin integraciones externas;
- disponibilidad objetivo 99,9 % después de GA;
- cero acceso cross-tenant en tests de propiedades;
- RPO máximo 15 minutos y RTO inicial 4 horas;
- publicación recuperable sin pérdida de datos;
- webhooks y jobs exactamente-una-vez en efecto mediante idempotencia;
- límites y rate limiting distribuidos;
- contratos compatibles N-1 durante despliegues.

## Antipatrones prohibidos

- guardar toda la app en un JSON sin índices ni relaciones operativas;
- usar el dominio como única clave de tenant;
- mezclar definición draft y published;
- hacer fetch HTTP interno entre módulos del monolito;
- permitir plugins con acceso a DB global;
- duplicar lógica de permisos en UI, API e IA;
- borrar datos al cancelar una suscripción;
- ejecutar writes de un batch en paralelo sin orden;
- almacenar credenciales dentro de plantillas o exports.

