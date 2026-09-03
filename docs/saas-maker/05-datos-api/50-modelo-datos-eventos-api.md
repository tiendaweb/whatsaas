# Modelo de datos, eventos y API

## Objetivo

Definir el contrato de información de SaaS Maker para que el constructor, el runtime de cada SaaS, la facturación, los módulos y las integraciones evolucionen sin acoplarse entre sí. El modelo debe soportar aislamiento por organización, publicación versionada, auditoría e idempotencia desde el primer día.

## Dominios de datos

### Control de SaaS Maker

- `maker_accounts`: identidad del cliente que usa SaaS Maker.
- `maker_organizations`: empresa creadora y límite principal de facturación.
- `maker_memberships`: usuario, organización, rol y estado.
- `maker_plans`, `maker_subscriptions`, `maker_usage_counters`: plan y consumo del creador.
- `projects`: un producto SaaS creado por una organización.
- `project_environments`: desarrollo, vista previa y producción.
- `project_releases`: snapshot publicado, estado y estrategia de despliegue.
- `project_domains`: dominio, verificación, certificado y destino.
- `project_secrets`: referencias cifradas; nunca valores legibles en consultas generales.

### Definición de aplicaciones

- `app_definitions`: cabecera de la aplicación y versión del contrato.
- `app_definition_versions`: borrador inmutable o snapshot publicado.
- `entities`, `fields`, `relations`, `indexes`: modelo de negocio declarado.
- `pages`, `layouts`, `components`, `navigation_items`: experiencia declarativa.
- `forms`, `form_fields`, `validations`: captura y validación.
- `actions`, `workflows`, `workflow_steps`, `triggers`: comportamiento.
- `roles`, `permissions`, `policies`: autorización declarada.
- `connector_bindings`: vínculo entre una capacidad abstracta y una credencial.
- `template_installations`: plantilla origen, versión y personalizaciones.

La definición canónica se almacena además como un documento JSON `saas-maker-v1`. Las tablas derivadas sirven para indexar, validar y consultar; no deben convertirse en una segunda fuente de verdad divergente.

### Runtime de cada SaaS creado

- `tenant_organizations`: empresa cliente final del SaaS.
- `tenant_users`, `tenant_memberships`, `tenant_invitations`: identidades y acceso.
- `tenant_records`: registros genéricos cuando la entidad todavía no justifica una tabla física.
- `tenant_files`: metadatos de archivos privados; el binario vive en almacenamiento de objetos.
- `tenant_comments`, `tenant_activities`: colaboración y cronología.
- `tenant_settings`: configuración versionada por ámbito.
- `tenant_audit_events`: quién hizo qué, sobre qué recurso y con qué resultado.

La evolución recomendada es híbrida: registros genéricos para acelerar el MVP y tablas/materializaciones dedicadas cuando volumen, relaciones o analítica lo requieran.

### Catálogo, comercio y acceso

- `module_catalog`: definición comercial y técnica del módulo.
- `module_versions`: versión instalable, compatibilidad y migraciones.
- `module_offers`: pago único, mensual, anual, incluido o privado.
- `module_installations`: módulo activado en un proyecto o tenant.
- `products`, `prices`, `coupons`, `tax_profiles`: catálogo vendible por cada SaaS.
- `customers`, `subscriptions`, `orders`, `invoices`, `payments`, `refunds`.
- `entitlement_definitions`, `entitlement_grants`, `entitlement_usage`.

`entitlement_grants` es la respuesta materializada a “¿puede usar esta función ahora?”. No se debe inferir acceso leyendo directamente el último pago.

### Integraciones, automatización e IA

- `connector_catalog`, `connector_connections`, `connector_scopes`.
- `webhook_endpoints`, `webhook_deliveries`, `webhook_attempts`.
- `automation_runs`, `automation_step_runs`, `dead_letters`.
- `ai_providers`, `ai_agents`, `ai_tools`, `ai_runs`, `ai_usage`.
- `approval_requests`: operaciones sensibles propuestas por IA o automatización.

## Reglas transversales

Todas las filas de negocio incluyen, según corresponda:

- `id` opaco y no secuencial hacia APIs públicas.
- `maker_organization_id`, `project_id` y/o `tenant_organization_id` explícitos.
- `created_at`, `updated_at`, `created_by`, `updated_by`.
- `status` como enumeración controlada.
- `version` para control optimista de concurrencia.
- `metadata` solo para extensión no crítica; no para campos consultados frecuentemente.
- `deleted_at` para eliminación recuperable cuando la normativa lo permita.

Cada clave única incorpora el ámbito correcto. Por ejemplo, un correo puede ser único dentro de un proyecto y no globalmente. Toda relación debe impedir que una fila de un tenant apunte a otra organización.

## Aislamiento y consistencia

1. El tenant se resuelve en el borde mediante sesión, dominio y proyecto; nunca se acepta ciegamente desde el cuerpo de una petición.
2. Los repositorios reciben un `ExecutionContext` inmutable con actor, organización, proyecto, tenant y permisos.
3. Las consultas aplican filtros obligatorios y, donde el motor lo permita, políticas de seguridad por fila.
4. Las operaciones que cambian dinero, permisos o publicación usan transacciones.
5. Los contadores de uso son append-only o reconciliables; no se confía en un contador sin historial.
6. Los secretos se referencian por ID y se descifran únicamente en el worker que ejecuta la integración.

## Estados canónicos

- Proyecto: `draft`, `ready`, `publishing`, `live`, `suspended`, `archived`.
- Release: `queued`, `validating`, `building`, `deploying`, `active`, `failed`, `rolled_back`.
- Dominio: `pending_dns`, `verifying`, `issuing_tls`, `active`, `error`, `disabled`.
- Suscripción: `trialing`, `active`, `past_due`, `paused`, `canceled`, `expired`.
- Instalación de módulo: `pending`, `active`, `blocked`, `upgrading`, `disabled`, `removed`.
- Ejecución: `queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `canceled`.

Las transiciones se validan en servicios de dominio. Una API no puede asignar cualquier estado arbitrario.

## Eventos de dominio

Formato mínimo:

```json
{
  "id": "evt_...",
  "type": "subscription.activated.v1",
  "occurredAt": "2026-08-24T12:00:00Z",
  "actor": { "type": "user", "id": "usr_..." },
  "scope": {
    "makerOrganizationId": "org_...",
    "projectId": "prj_...",
    "tenantOrganizationId": "ten_..."
  },
  "subject": { "type": "subscription", "id": "sub_..." },
  "correlationId": "cor_...",
  "causationId": "evt_...",
  "data": {},
  "schemaVersion": 1
}
```

Familias iniciales:

- `project.created`, `project.validated`, `project.published`, `project.rolled_back`.
- `domain.verified`, `domain.activated`, `domain.failed`.
- `tenant.created`, `membership.invited`, `membership.role_changed`.
- `subscription.started`, `subscription.renewed`, `subscription.past_due`, `subscription.canceled`.
- `payment.succeeded`, `payment.failed`, `refund.completed`.
- `module.purchased`, `module.installed`, `module.upgraded`, `module.disabled`.
- `connector.connected`, `connector.scope_changed`, `connector.revoked`.
- `automation.completed`, `automation.failed`, `ai.action_approved`, `ai.action_executed`.

La escritura de datos y la publicación del evento usan patrón outbox. Los consumidores guardan el ID procesado para garantizar idempotencia.

## API de plataforma

### Convenciones

- REST JSON para administración y recursos; eventos/webhooks para integración asíncrona.
- Prefijo `/api/v1`; los cambios incompatibles crean una versión nueva.
- IDs opacos, fechas ISO 8601 UTC e importes en unidad mínima más moneda.
- Paginación por cursor, filtros explícitos y orden estable.
- `Idempotency-Key` obligatorio para cobros, publicación, invitaciones e instalaciones.
- Control optimista mediante `If-Match` o campo `version`.
- Errores con `code`, `message`, `fieldErrors`, `requestId` y documentación enlazable.
- Límite de tasa por actor, proyecto, tenant y credencial pública.

### Superficies

- Control: proyectos, definiciones, releases, dominios, plantillas y secretos.
- Runtime: usuarios, organizaciones, registros, archivos y configuración.
- Comercio: productos, precios, checkout, suscripciones, facturas y portal.
- Módulos: catálogo, ofertas, instalaciones, licencias y actualizaciones.
- Automatización: flujos, ejecuciones, aprobaciones y reintentos.
- Administración: auditoría, soporte autorizado, salud y conciliación.

Cada endpoint declara permiso, ámbito, límites, eventos emitidos y si admite reintentos.

## API pública de cada SaaS

El creador puede habilitar recursos concretos, nunca toda la base. La publicación genera:

- esquema OpenAPI por versión;
- claves o clientes OAuth por entorno;
- permisos granulares por recurso y acción;
- cuotas y registros de uso;
- política CORS y dominios permitidos;
- documentación y ejemplos sin secretos.

Los campos marcados como privados, secretos o internos no aparecen en respuestas públicas aunque el registro sea accesible.

## Webhooks salientes

- Firma HMAC con timestamp y secreto rotatable.
- ID estable por entrega y protección contra repetición.
- Reintentos exponenciales con jitter.
- desactivación controlada tras fallos persistentes;
- historial visible, respuesta truncada y botón de reintento.
- selección de eventos por endpoint.

Los receptores internos deben poder procesar el mismo evento más de una vez sin duplicar efectos.

## Archivos e importación

- Carga mediante URL firmada, validación de tamaño/MIME y análisis de malware.
- Metadatos privados por defecto y descarga con autorización puntual.
- Importación CSV/XLSX en dos pasos: previsualizar/mapeo y ejecutar.
- Exportaciones grandes en background con caducidad y auditoría.
- Imágenes, videos y documentos de chats conservan origen, propietario, clasificación y política de retención.
- Un conector solo puede descargar contenido si posee el scope específico y el tenant lo autorizó.

## Retención, portabilidad y eliminación

Cada tipo de dato declara retención, base legal, ubicación, cifrado, exportabilidad y proceso de borrado. Al cerrar un tenant:

1. se bloquean escrituras y nuevas ejecuciones;
2. se ofrece exportación durante la ventana configurada;
3. se revocan credenciales y URLs firmadas;
4. se programa borrado lógico y luego físico;
5. se conserva únicamente lo exigido por obligaciones financieras o legales;
6. se genera un comprobante auditable de cierre.

## Criterios de aceptación

- No existe consulta de negocio sin un ámbito verificable.
- Cobros, webhooks y eventos soportan reintentos sin duplicación.
- Una release puede reconstruirse a partir de su snapshot.
- El acceso a una función se resuelve desde permisos, entitlement y límites.
- El modelo distingue claramente facturación de SaaS Maker y facturación del SaaS creado.
- Hay exportación y eliminación verificables por tenant.

