# Principios, glosario y decisiones fundacionales

## Principios obligatorios

1. Independencia: SaaS Maker no requiere WhatsPro para autenticarse, facturar ni ejecutar productos.
2. Contrato declarativo: no se publica una app si su definición no valida contra un schema versionado.
3. Separación control/runtime: construir y operar no comparten rutas privilegiadas ni secretos.
4. Tenant primero: toda entidad operativa se resuelve por organización y proyecto; los datos finales además por tenant del SaaS.
5. Borrador no es producción: preview y published son snapshots distintos.
6. Publicación inmutable: una versión publicada no se edita; se crea otra y se puede revertir.
7. Capacidades, no ifs dispersos: módulos, planes y permisos producen entitlements evaluables.
8. Servicios canónicos: UI, API, workflows e IA llaman la misma lógica de dominio.
9. Pagos por eventos verificables: nunca se habilita acceso por retorno del navegador.
10. IA bajo políticas: inspeccionar, proponer, validar, aprobar, ejecutar y auditar.
11. Secretos fuera de definiciones: las apps solo guardan referencias a secretos cifrados.
12. Portabilidad: exportación de definición y datos en formatos documentados.

## Glosario

- Organización Maker: cuenta propietaria de uno o varios proyectos SaaS.
- Proyecto SaaS: producto independiente creado dentro de SaaS Maker.
- Ambiente: development, preview o production.
- Definición: documento declarativo validado que describe el SaaS.
- Versión: snapshot inmutable de una definición.
- Release: asignación de una versión a un ambiente y dominio.
- Tenant final: empresa o espacio de trabajo cliente dentro del SaaS publicado.
- Usuario final: identidad que pertenece a uno o más tenants finales.
- Operador: miembro del equipo creador que administra el SaaS.
- Cliente de SaaS Maker: la organización creadora que paga a SaaS Maker.
- Cliente final: quien compra y usa el SaaS creado.
- Plan: oferta comercial del SaaS creado con ciclo, precio y capacidades.
- Módulo: paquete instalable de schema, UI, workflows, permisos y capacidades.
- Entitlement: autorización efectiva originada en plan, compra, suscripción, trial o concesión manual.
- Plantilla: punto de partida versionado para landing, zona o SaaS completo.
- Conector: adaptador autorizado a un servicio externo o IA.

## Decisiones que deben aprobarse antes de código

### D-001: Arquitectura inicial

Monolito modular TypeScript con workers separados y PostgreSQL compartido. Evitar microservicios prematuros; separar por módulos de dominio y contratos. Storage de objetos y cola durable sí son componentes externos explícitos.

### D-002: Estrategia multi-tenant

Base compartida con claves compuestas tenant-first y Row Level Security en datos finales donde sea viable. Proyectos de mayor aislamiento podrán migrar luego a base dedicada mediante una interfaz de storage.

### D-003: Runtime

Runtime interpretado para componentes registrados, sin JavaScript arbitrario. Extensiones de código solo en una fase posterior, sandboxeadas y firmadas.

### D-004: Facturación

Separar tres libros: facturación de SaaS Maker al creador, facturación del SaaS al cliente final y liquidación de módulos al proveedor. Cada evento declara `billingContext` y nunca cruza clientes o credenciales.

### D-005: Dominios

Subdominio administrado disponible desde preview; dominio propio exige verificación DNS, certificado emitido y ownership renovable. Nunca confiar solo en un CNAME observado una vez.

### D-006: IA

Gateway único de capacidades con OAuth/scopes, tool registry, aprobaciones, cuotas y auditoría. Proveedores intercambiables; ningún agente recibe acceso directo a DB o infraestructura.

### D-007: Marketplace

Catálogo privado/curado en primeras fases. Publicación de terceros exige revisión de permisos, pricing, migraciones, uninstall y política de datos.

## Registro de decisiones

Cada ADR debe contener contexto, decisión, alternativas, consecuencias, responsable, fecha, estado y plan de reversión. Estados: proposed, accepted, superseded, rejected. Ninguna decisión de seguridad, tenancy, billing, datos o extensibilidad puede quedar solo en una conversación.

