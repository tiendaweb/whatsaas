# IA, conectores y automatización segura

## Casos de uso

### Copiloto del creador

Convierte una intención en propuesta de entidades, vistas, formularios, roles, landing, planes y workflows. Debe trabajar sobre el catálogo real, generar diff validable y nunca publicar por sí solo.

### Agente administrador del SaaS

Consulta métricas, clientes, billing, releases y salud; propone operaciones; ejecuta solo capacidades autorizadas con aprobación verificable para acciones sensibles.

### Agente del tenant final

Opera dentro del tenant y rol actual. Sus datos, tools, memoria y archivos están aislados. El creador decide qué capacidades expone y el tenant puede desactivar el agente.

## Gateway único

Todos los proveedores —OpenAI, Anthropic, Google u otros— consumen un registry común. Cada tool declara nombre, versión, descripción, schema input/output, scopes, permisos, plugin/módulo requerido, riesgo, read/write, dry-run, approval, idempotencia, rate limit, datos sensibles y servicio ejecutor.

MCP, API de tools y copiloto interno son adaptadores del mismo registry. No mantener una implementación por proveedor.

## Flujo de acción

1. Discover: listar capacidades filtradas por actor, proyecto, ambiente y módulos.
2. Inspect: leer estado y versión actual con proyección mínima.
3. Plan: producir acciones, efectos, costo, riesgos y versiones esperadas.
4. Validate/dry-run: ejecutar reglas sin mutar.
5. Approve: emitir receipt firmado ligado al hash del plan, actor y vencimiento.
6. Execute: servicio canónico aplica con idempotency key.
7. Audit: persistir tool run, input/output redacted, resultado y entidades.
8. Emit: guardar domain events si hubo cambios.

`confirm: true` no reemplaza approval para publicar, cambiar pricing, instalar módulos, borrar datos, tocar dominio, secretos o acceso.

## Scopes sugeridos

- project:read/write/publish;
- schema:read/write/migrate;
- design:read/write;
- customer:read/write;
- billing:read/manage/refund;
- module:read/install/manage;
- domain:read/manage;
- secret:metadata/manage;
- media:read/write;
- automation:read/write/activate;
- audit:read;
- ai:use/admin.

El consentimiento explica datos y acciones reales. Tools/list devuelve solo lo permitido y prioriza capacidades relevantes; soporta paginación y búsqueda para catálogos grandes.

## Conectores

Tipos iniciales: payments, email, storage, analytics, CRM, calendar, messaging, webhook, OAuth API e IA. Una conexión tiene owner, ambiente, status, scopes, secret refs, health, rate policy y lastUsed. El conector no obtiene acceso global a todas las apps.

OAuth usa authorization code + PKCE, resource binding, tokens cortos, refresh rotado y revocación por familia. Service accounts usan credenciales de un solo visionado, hash y scopes mínimos. Rotar un secreto no cambia definiciones.

## Automatizaciones

Triggers: record created/updated/deleted, form submitted, user invited, subscription changed, payment failed, module installed, schedule, webhook y manual.

Steps: query, condition, transform declarativo, create/update record, call connector, send email/notification, delay, wait for approval, branch, loop acotado y emit event. Cada run guarda workflowVersion, triggerEvent, inputs redacted, step states, attempts, outputs, cost y correlation.

Prohibir loops ilimitados, fetch arbitrario, URLs no allowlisted y secretos en logs. External calls tienen timeout, retry policy, circuit breaker e idempotencia cuando exista soporte.

## Datos y archivos para IA

Aplicar projection policies por entidad/campo. Archivos privados se entregan mediante streams/bloques temporales, nunca URL pública permanente. Validar MIME, tamaño, malware, extracción y retención. Prompt injection en documentos o páginas se trata como datos no confiables y no puede ampliar permisos.

## Costos y cuotas

Registrar proveedor, modelo, tokens, latencia, costo estimado, cache, proyecto, tenant, agente y caso de uso. Presupuestos por organización/proyecto/tenant; hard stop o fallback configurado. El builder debe estimar costo de automatizaciones antes de activarlas.

## Evaluación

- golden tasks por capability;
- ataques de prompt injection y exfiltración;
- herramientas no autorizadas invisibles;
- approvals no reutilizables;
- concurrencia y expected version;
- redacción de PII/secrets;
- límites de costo y rate;
- modelo caído/fallback;
- auditoría reproducible y human-readable.

