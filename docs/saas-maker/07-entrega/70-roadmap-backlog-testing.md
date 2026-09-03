# Roadmap, backlog y estrategia de pruebas

## Enfoque de entrega

SaaS Maker se construye por cortes verticales publicables. Cada fase debe producir una capacidad verificable de punta a punta y no una colección de pantallas desconectadas. Las fechas se fijan después de confirmar equipo y restricciones; la secuencia y los gates son obligatorios.

## Equipos mínimos sugeridos

- Producto/diseño: product manager, product designer y research parcial.
- Plataforma: tech lead, dos o tres full-stack, backend/plataforma y DevOps/SRE parcial.
- Confianza: QA automation y seguridad/compliance parcial.
- Negocio: growth/contenido y responsable de soporte/operaciones.

En un equipo pequeño una persona puede cubrir varios roles, pero no se elimina la responsabilidad.

## Fase 0 — Descubrimiento y decisiones

Entregables:

- segmentos y tres casos de uso prioritarios;
- mapa de competidores y diferenciación;
- arquitectura, glosario y ADR aprobados;
- proveedores candidatos para identidad, pago, dominios, correo, archivos e IA;
- prototipo navegable del constructor y del SaaS resultante;
- modelo financiero preliminar y límites de costo.

Gate: cinco usuarios objetivo completan el prototipo con comprensión suficiente y no quedan decisiones estructurales críticas sin propietario.

## Fase 1 — Fundaciones de plataforma

Épicas:

- organizaciones de SaaS Maker, miembros, roles y auditoría;
- proyectos, ambientes y configuración segura;
- contrato `saas-maker-v1`, validación y versionado;
- colas, outbox, idempotencia y observabilidad base;
- almacenamiento privado y servicio de secretos.

Gate: pruebas de aislamiento aprobadas y un proyecto vacío puede crearse, versionarse y auditarse.

## Fase 2 — Constructor y runtime vertical

Épicas:

- editor visual con layout, páginas, navegación y responsive;
- entidades, campos, relaciones, formularios y tablas;
- autenticación de cliente final, organizaciones y roles;
- preview con datos de prueba;
- publicación a subdominio administrado y rollback;
- una plantilla de dashboard y una de portal.

Historia de referencia: “Como creador, defino clientes y tickets, creo formularios/listas, asigno permisos, publico y un cliente final puede registrarse y operar sin intervención manual”.

Gate: el recorrido de referencia pasa E2E, incluyendo dos tenants que no pueden leer datos entre sí.

## Fase 3 — Landing, dominio y marca

Épicas:

- editor de landing y modo sin landing;
- plantillas por secciones y tokens de diseño;
- SEO, analítica y consentimiento;
- dominio/subdominio, DNS, TLS y estados de diagnóstico;
- correo transaccional con dominio verificado.

Gate: un usuario no técnico conecta un dominio siguiendo instrucciones y publica una experiencia accesible.

## Fase 4 — Comercio del SaaS creado

Épicas:

- productos, precios único/mensual/anual y pruebas;
- checkout, portal, facturas, cupones e impuestos básicos;
- webhooks firmados, conciliación y reintentos;
- entitlements y límites por plan;
- panel del cliente final y panel comercial del creador.

Gate: alta, renovación, fallo, reintento, upgrade, downgrade, cancelación y devolución producen acceso correcto y conciliable.

## Fase 5 — Catálogo de módulos

Épicas:

- manifiesto, permisos, compatibilidad y versionado de módulos;
- catálogo privado y público;
- ofertas incluidas, únicas, mensuales y anuales;
- instalación, migración, actualización, desactivación y retiro;
- licencias, entitlement, revenue share y liquidación futura.

Gate: un módulo de referencia atraviesa todo el ciclo sin modificar manualmente la base del proyecto.

## Fase 6 — IA, conectores y automatización

Épicas:

- gateway multi-proveedor con cuotas y costos;
- agentes de creación, administración y soporte;
- catálogo de herramientas con scopes y aprobaciones;
- conectores OAuth y credenciales por tenant;
- workflows con reintentos, espera, compensación y dead-letter;
- lectura privada autorizada de chats, imágenes, videos y documentos.

Gate: pruebas adversariales demuestran que el agente no cruza tenants, no revela secretos y no ejecuta cambios sensibles sin aprobación.

## Fase 7 — Beta operada

Entregables:

- onboarding, ayuda contextual y soporte;
- telemetría de producto y costos unitarios;
- backups/restauración, runbooks y guardias;
- migraciones y herramientas de importación/exportación;
- programa de beta con cohortes y criterios de salida.

Gate: al menos tres SaaS piloto cobran o activan planes reales durante cuatro semanas, sin incidentes críticos abiertos y dentro del presupuesto de error.

## Fase 8 — Escala y ecosistema

- marketplace revisado y programa de desarrolladores;
- API pública, CLI y entornos avanzados;
- SSO/SCIM, controles empresariales y regiones;
- analítica avanzada y experimentación;
- localización, impuestos y proveedores adicionales;
- separación de servicios únicamente donde métricas reales la justifiquen.

## Backlog transversal priorizado

### P0 — Sin esto no se vende

- aislamiento multi-tenant;
- identidad y roles de ambas capas;
- constructor mínimo y runtime;
- publicación/rollback;
- subdominio y dominio;
- pagos, entitlement y conciliación;
- auditoría, backups y soporte;
- experiencia de onboarding.

### P1 — Aumenta adopción y retención

- más plantillas y componentes;
- automatizaciones y conectores principales;
- IA asistida con aprobación;
- importación/exportación;
- analítica del SaaS;
- módulos instalables.

### P2 — Escala el ecosistema

- marketplace abierto;
- desarrollo externo de módulos;
- regiones, SSO/SCIM y controles enterprise;
- marca blanca avanzada;
- optimizaciones sectoriales.

## Plantilla de historia

Cada historia contiene:

- problema y resultado esperado;
- actor y ámbito de tenant;
- recorrido feliz y estados vacío/carga/error/sin permiso;
- permisos, entitlement y límites;
- datos creados/cambiados y eventos emitidos;
- impacto de privacidad, seguridad y costos;
- telemetría;
- criterios de aceptación observables;
- estrategia de despliegue y rollback.

## Estrategia de pruebas

### Pirámide

- Unitarias: validadores, transiciones, precios, permisos y transformaciones.
- Integración: base, colas, outbox, almacenamiento, proveedores simulados y servicios de dominio.
- Contrato: API, webhooks, módulos, plantillas y proveedores.
- E2E: recorridos críticos en navegador y workers.
- No funcionales: seguridad, accesibilidad, rendimiento, resiliencia y restauración.

### Matriz E2E obligatoria

1. Creador se registra, crea organización y proyecto.
2. Instala plantilla, modifica entidad/formulario y previsualiza.
3. Publica en subdominio, conecta dominio y revierte release.
4. Cliente final se registra, crea organización e invita miembro.
5. Dos tenants intentan acceder a recursos ajenos y reciben denegación sin fuga de existencia.
6. Cliente elige mensual/anual, paga, recibe entitlement y luego cancela.
7. Pago falla, se reintenta, se recupera o expira sin acceso indebido.
8. Módulo se compra, instala, actualiza, desactiva y reinstala.
9. Conector se autoriza con scopes mínimos, accede a un archivo permitido y pierde acceso al revocarse.
10. Agente propone cambio sensible, requiere aprobación, ejecuta y audita.
11. Webhook duplicado y fuera de orden no duplica cobro ni entitlement.
12. Backup se restaura y se valida un proyecto recuperado.

### Pruebas generativas

- combinaciones de roles, permisos, entitlements y estados;
- transiciones de suscripción y órdenes de eventos;
- esquemas creados por usuarios, nombres límite y relaciones circulares;
- layouts responsive y componentes faltantes;
- archivos malformados y payloads de conectores.

### Rendimiento

Presupuestos iniciales:

- panel interactivo en red estándar sin bloquearse por integraciones;
- p95 de lectura API menor a 400 ms y escritura simple menor a 700 ms, excluyendo proveedores;
- trabajo externo siempre desacoplado mediante cola;
- listas paginadas y consultas sin patrón N+1;
- carga y publicación probadas con tamaño máximo de definición soportado.

Los números se ajustan con telemetría de beta, pero un cambio no puede degradarlos silenciosamente.

## Ambientes y datos de prueba

- Local reproducible con proveedores falsos.
- CI efímero por cambio relevante.
- Staging equivalente a producción sin datos reales.
- Producción con flags y promoción de artefactos, no reconstrucción manual.
- Cuentas sintéticas estables para monitores; nunca copiar datos sensibles a desarrollo.

## Estrategia de release

- Feature flags por organización/proyecto.
- Migraciones expandir-migrar-contraer.
- Canary para runtime y workers.
- Plantillas/módulos con compatibilidad declarada.
- Rollback de código y release de proyecto ensayados.
- Kill switches para IA, pagos, conectores y automatizaciones.

## Métricas de avance

- tiempo desde registro hasta primera publicación;
- porcentaje que conecta dominio y configura cobro;
- tasa de publicación exitosa y rollback;
- activación/retención por plantilla;
- conciliación de pagos y entitlements;
- instalaciones/renovaciones de módulos;
- incidentes, tickets y tiempo de resolución;
- margen después de infraestructura, IA y proveedores.

