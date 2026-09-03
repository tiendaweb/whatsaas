# Visión, alcance y métricas de SaaS Maker

## Visión

Permitir que una persona o equipo convierta una idea operativa en una empresa SaaS real: producto, experiencia, usuarios, backoffice, cobros, módulos, dominio, automatización y operación. El constructor debe reducir trabajo repetitivo sin ocultar decisiones críticas de seguridad, propiedad de datos o facturación.

## Usuarios principales

- Creador independiente: valida un nicho y publica su primer SaaS.
- Agencia o estudio: administra varios SaaS de distintos clientes.
- Empresa: crea productos internos o portales B2B con marca propia.
- Equipo de producto: prototipa y luego extiende con código o conectores.
- Operador de SaaS: gestiona clientes, soporte, planes, módulos y métricas.
- Cliente final: compra un plan, usa la aplicación y administra su cuenta.

## Alcance funcional

### Plano de control de SaaS Maker

Incluye cuenta del creador, organizaciones, miembros, proyectos SaaS, ambientes, plantillas, catálogo de módulos, facturación de SaaS Maker, dominios, secretos, conectores IA, auditoría, despliegues, métricas y soporte.

### Producto generado

Cada SaaS tiene una definición versionada con identidad visual, navegación, zonas, páginas, entidades, relaciones, formularios, vistas, acciones, workflows, roles, planes, módulos permitidos, integraciones y políticas. El runtime sirve solo una versión publicada y resuelve tenant, actor, plan y entitlements en cada solicitud.

### Experiencias que puede incluir un SaaS

- landing pública opcional;
- autenticación y onboarding;
- zona del usuario final;
- zona de administración del SaaS;
- panel de cliente o cuenta empresarial;
- portal de facturación;
- centro de ayuda, políticas y estado;
- páginas públicas adicionales;
- módulos instalables y navegación dinámica.

## Fuera de alcance inicial

- ejecutar código arbitrario suministrado por usuarios;
- marketplace abierto sin revisión humana;
- generación de aplicaciones móviles nativas;
- infraestructura dedicada por cliente en el MVP;
- motor contable o fiscal universal;
- actuar como merchant of record global;
- prometer cumplimiento regulatorio por defecto;
- permitir SQL libre desde el builder o conectores IA.

## Diferencias con App Maker

App Maker construye aplicaciones dentro de un tenant existente y reutiliza recursos de WhatsPro. SaaS Maker crea productos autónomos y debe aportar identidad, tenancy de segundo nivel, registro de clientes finales, billing, dominios, publicación, módulos, administración, soporte y operación. El contrato de App Maker es una semilla; no se copia su acoplamiento a permisos, plugins o recursos de WhatsPro.

## Indicadores de éxito

### Activación

- tiempo mediano desde registro hasta preview funcional;
- porcentaje que completa identidad, primera entidad, primera pantalla y primer flujo;
- porcentaje que publica en subdominio;
- porcentaje que conecta pagos y realiza una compra de prueba.

### Producto

- tasa de despliegues exitosos y rollbacks;
- latencia p95 del runtime;
- errores por versión publicada;
- porcentaje de proyectos con dominio verificado;
- adopción de plantillas y módulos.

### Negocio

- MRR/ARR de SaaS Maker;
- ingresos de módulos por modalidad;
- GMV y número de suscripciones procesadas por los SaaS creados;
- conversión trial a pago y churn por cohorte;
- margen después de IA, almacenamiento, email y ejecución.

### Seguridad y operación

- cero lecturas cross-tenant en pruebas y producción;
- cobertura de auditoría en acciones sensibles;
- RPO/RTO verificados;
- tiempo de detección y recuperación;
- tasa de webhooks duplicados procesados sin efecto doble.

## Criterio de MVP

El MVP no termina al dibujar una interfaz. Termina cuando un creador publica un SaaS de prueba, un cliente final se registra, compra un plan, recibe sus entitlements, usa una función basada en datos, instala o compra un módulo y puede cancelar o cambiar su suscripción con estados consistentes.

