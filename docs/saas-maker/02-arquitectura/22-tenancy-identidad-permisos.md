# Multi-tenancy, identidad, roles y permisos

## Jerarquía de aislamiento

Nivel 1: plataforma SaaS Maker.

Nivel 2: organización Maker que posee proyectos.

Nivel 3: proyecto SaaS y ambiente.

Nivel 4: tenant final dentro del SaaS publicado.

Nivel 5: usuario, rol, grupo, registro y campo.

Toda request produce un `RequestContext` inmutable con actor, organizationId, projectId, environmentId, finalTenantId opcional, userId, sessionId, roles, entitlements, activeModules, correlationId y políticas. Ningún repositorio acepta un ID de negocio sin ese contexto.

## Identidades separadas

- `maker_users`: personas que construyen y operan proyectos.
- `end_users`: usuarios de los SaaS creados.
- `service_accounts`: automatizaciones y conectores.
- `support_access_grants`: acceso temporal y consentido de soporte.

No reutilizar una sesión Maker dentro del runtime. El modo “ver como” emite una sesión de preview limitada, marcada, expirable y sin capacidad de pago real.

## Roles base

### Organización Maker

Owner, Billing Admin, Organization Admin, Developer, Designer, Support, Viewer. Los permisos se asignan también por proyecto y ambiente.

### SaaS creado

Platform Operator, Tenant Owner, Tenant Admin, Manager, Member, Guest y roles personalizados. Los roles personalizados componen capacidades registradas; no contienen lógica en texto libre.

## Evaluación efectiva

`allow = scope de conexión ∩ membership activo ∩ permiso ∩ módulo activo ∩ entitlement ∩ policy de entidad ∩ policy de campo ∩ condición de ambiente`.

Denegación explícita prevalece. Otro tenant responde 404 para entidades; falta de capacidad del propio contexto puede responder 403. La UI oculta acciones, pero el backend siempre revalida.

## Policies

Una policy puede considerar rol, usuario, tenant, ownership de registro, estado, plan, módulo, ambiente y campo. Debe compilarse a una representación evaluable y testeable, no a JavaScript. Ejemplos:

- un miembro lee registros de su tenant;
- un manager edita registros de su departamento;
- billing admin ve facturas pero no secretos;
- un campo sensible solo se proyecta a owner;
- un módulo agrega capacidades únicamente mientras su entitlement está activo.

## Sesiones y autenticación

- cookies HttpOnly, Secure, SameSite apropiado y rotación;
- access corto y refresh rotado si se usan tokens;
- invalidación por cambio de contraseña, revocación, membership o riesgo;
- MFA obligatorio para owners, billing y acciones críticas en producción;
- passkeys recomendadas;
- OAuth/OIDC por proyecto como extensión;
- SCIM/SAML en planes empresariales, aislados por tenant;
- protección CSRF, replay y session fixation.

## Invitaciones y onboarding

La invitación declara proyecto/tenant, rol, email normalizado, issuer, expiry y nonce de un uso. Aceptarla no debe crear membresía en otro tenant ni elevar un usuario existente. Transferir ownership requiere MFA, aceptación del nuevo owner, período de seguridad y auditoría.

## Entitlements y límites

Los permisos dicen qué puede hacer una identidad; los entitlements dicen qué compró el tenant; los límites dicen cuánto puede consumir. Son capas distintas. El runtime devuelve razones estables: permission_denied, module_inactive, entitlement_missing, quota_exceeded o environment_restricted.

## Soporte y acceso excepcional

El soporte nunca usa impersonación silenciosa. Un grant indica alcance, motivo, aprobador, ticket, vencimiento y si permite escritura. La sesión muestra banner, bloquea billing/secretos por defecto y registra cada lectura sensible.

## Pruebas obligatorias

- matriz rol/capacidad/zona;
- IDs cruzados entre organizaciones, proyectos y tenants;
- invitación reutilizada o alterada;
- cambio de plan en sesión activa;
- módulo suspendido durante una operación;
- acceso por ownership falso;
- campos sensibles en búsqueda, export y errores;
- sesión de preview contra producción;
- soporte vencido o sin consentimiento;
- service account con scope insuficiente.

