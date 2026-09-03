# Producto, personas y recorridos

## Personas y necesidades

### Creador

Necesita pasar de idea a producto sin decidir infraestructura básica. Debe poder elegir plantilla, declarar entidades, diseñar zonas, configurar planes, probar roles y publicar. Requiere claridad sobre qué está en borrador, qué está cobrado y qué verá el cliente final.

### Administrador de la organización Maker

Gestiona equipos, proyectos, límites, facturación de SaaS Maker, proveedores IA, dominios, auditoría y seguridad. Puede delegar por proyecto sin entregar acceso a toda la organización.

### Operador del SaaS creado

Administra clientes finales, tenants, suscripciones, módulos, soporte, comunicaciones, métricas y contenido. Su panel pertenece al producto publicado, no al panel de SaaS Maker.

### Administrador del tenant final

Invita usuarios, asigna roles, compra módulos permitidos, revisa facturación, configura datos de su empresa y controla integraciones habilitadas por el creador.

### Usuario final

Usa las funciones contratadas con navegación simple, permisos coherentes, onboarding y soporte. No debe ver conceptos internos como schemas, releases o secretos.

## Recorrido del creador

1. Crear cuenta y organización Maker.
2. Elegir objetivo, industria, moneda, región y modalidad B2B/B2C.
3. Elegir SaaS vacío o plantilla completa.
4. Definir marca, URLs y zonas.
5. Modelar entidades, campos, relaciones y políticas.
6. Crear vistas, formularios, acciones y workflows.
7. Configurar roles y probar con identidades simuladas.
8. Seleccionar landing opcional y editar secciones.
9. Crear productos, planes, trials, cupones y módulos.
10. Conectar pagos, email, storage e IA.
11. Ejecutar preflight: schema, accesibilidad, seguridad, enlaces, billing y dominio.
12. Publicar en preview; realizar compra y onboarding de prueba.
13. Publicar en producción; monitorear release y revertir si falla.

## Recorrido del cliente final

1. Descubrir landing o recibir invitación directa.
2. Comparar planes/módulos y registrarse.
3. Verificar identidad y aceptar términos versionados.
4. Crear o unirse a tenant final.
5. Completar checkout o comenzar trial.
6. Recibir entitlement confirmado por webhook.
7. Completar onboarding condicionado por plan/rol.
8. Usar la zona de usuario y, si corresponde, panel de cliente.
9. Instalar módulos permitidos y confirmar cargo.
10. Gestionar método de pago, upgrade, downgrade, cancelación y exportación.

## Capacidades funcionales por dominio

- Identidad: email/password, magic link, OAuth social opcional, MFA, invitaciones y sesiones.
- Builder: árbol de páginas, canvas, propiedades, responsive, preview y validación.
- Datos: schema declarativo, CRUD, relaciones, archivos, búsqueda, importación/exportación.
- UI: vistas, componentes, formularios, charts, navegación y tokens de diseño.
- Automatización: triggers, condiciones, acciones, demoras, aprobaciones y reintentos.
- Comercial: catálogo, planes, trials, cupones, impuestos configurables y checkout.
- Módulos: catálogo, instalación, configuración, lifecycle, pricing y entitlements.
- Operación: clientes, tenants, usuarios, soporte, auditoría, métricas y salud.
- Publicación: ambientes, dominios, releases, preflight, rollout y rollback.
- IA: copiloto del creador, agente operador y conectores externos autorizados.

## Criterios UX transversales

- siempre mostrar proyecto, ambiente y rol simulado;
- separar Guardar borrador, Generar preview y Publicar;
- mostrar impacto antes de cambios de schema, pricing o permisos;
- nunca activar cobros o dominios implícitamente;
- todos los estados vacíos deben conducir a una acción real;
- mobile-first para el runtime, desktop-first adaptable para el builder;
- accesibilidad WCAG 2.2 AA como gate, no mejora posterior.

