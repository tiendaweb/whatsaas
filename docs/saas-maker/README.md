# SaaS Maker — Plan maestro

## Propósito

SaaS Maker será una plataforma independiente de WhatsPro para diseñar, publicar, operar y comercializar empresas SaaS completas sin reconstruir cada producto desde cero. Toma como referencia el enfoque declarativo de App Maker —definición versionada, datos, vistas, acciones, permisos, conectores, borrador y publicación— y lo amplía a una fábrica multi-tenant de productos SaaS.

Cada proyecto creado debe poder incluir o excluir una landing pública, usar dominio propio o subdominio administrado, ofrecer planes, cobrar suscripciones, administrar usuarios y clientes, instalar módulos, conectar agentes de IA y operar ambientes de desarrollo, vista previa y producción.

## Regla de separación

SaaS Maker es un producto nuevo. No será un plugin de WhatsPro ni dependerá de sus tablas, rutas, sesión o marca en tiempo de ejecución. Puede reutilizar patrones, contratos y aprendizajes, pero tendrá repositorio, base de datos, autenticación, almacenamiento, dominio, secretos, despliegue y ciclo comercial propios.

## Mapa de documentos

1. `00-direccion`: visión, alcance, principios, vocabulario y decisiones fundacionales.
2. `01-producto`: usuarios, recorridos, capacidades y modelo comercial.
3. `02-arquitectura`: arquitectura técnica, builder, runtime, plantillas, tenancy y permisos.
4. `03-plataforma`: dominios, publicación, pagos, módulos, IA y automatización.
5. `04-experiencia`: landings, zonas, navegación, diseño y experiencia del editor.
6. `05-datos-api`: entidades, estados, eventos, APIs, webhooks e idempotencia.
7. `06-seguridad-operacion`: seguridad, privacidad, observabilidad, backups y continuidad.
8. `07-entrega`: roadmap, backlog, pruebas, gates, riesgos y definición de terminado.

## Resultado esperado

Al completar el plan debe existir un MVP que permita a un creador:

- registrar su organización en SaaS Maker;
- crear un producto desde cero o plantilla;
- modelar entidades, relaciones, formularios, paneles y automatizaciones;
- diseñar landing, zona pública, zona de usuario, administración y panel del cliente;
- configurar subdominio y luego dominio propio;
- crear planes mensuales/anuales y productos de pago único;
- publicar módulos instalables con precio único, mensual o anual;
- conectar un proveedor de pagos y un proveedor de IA;
- invitar a su equipo, probar como cada rol y publicar una versión recuperable;
- recibir altas de clientes finales, cobrar, aprovisionar entitlements y operar el SaaS.

## Principio rector

Definir una vez, validar siempre, publicar de forma inmutable y operar con aislamiento. El modelo declarativo es la fuente de verdad; el runtime interpreta versiones publicadas; el plano de control administra organizaciones, proyectos, facturación y despliegues; el plano de datos guarda la información de los SaaS creados sin mezclar tenants.

## Lectura recomendada

Comenzar por Visión y alcance, continuar con Producto y modelo comercial, luego Arquitectura técnica y Builder/runtime. Antes de implementar pagos o módulos, aprobar el documento de Facturación y entitlements. Antes de producción, superar todos los gates de Seguridad, Testing y Definición de terminado.

