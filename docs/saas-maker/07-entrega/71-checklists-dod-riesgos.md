# Checklists, definición de terminado y riesgos

## Definición de terminado general

Una capacidad está terminada cuando:

- resuelve un resultado de usuario validado;
- funciona en interfaz, API y procesos asíncronos relacionados;
- contempla vacío, carga, error, reintento, sin permiso y límites de plan;
- aplica aislamiento, autorización y entitlement en servidor;
- emite eventos y auditoría pertinentes;
- tiene pruebas unitarias, integración y E2E proporcionales al riesgo;
- incluye métricas, logs, alertas y runbook si es operativa;
- es accesible, responsive e internacionalizable;
- documenta configuración, migración, rollback y soporte;
- no expone secretos ni datos personales;
- pasó revisión de producto, ingeniería y confianza;
- está detrás de flag cuando su despliegue gradual lo requiere.

## Checklist de una aplicación creada

- [ ] Nombre, propietario, propósito y sector definidos.
- [ ] Ambientes de preview y producción separados.
- [ ] Entidades, campos, relaciones, índices y retención validados.
- [ ] Roles y matriz de permisos revisados con pruebas negativas.
- [ ] Navegación y recorridos críticos completos.
- [ ] Estados vacío, carga, error, éxito y acceso denegado diseñados.
- [ ] Formularios con validación, mensajes y prevención de duplicados.
- [ ] Automatizaciones idempotentes y con manejo de fallos.
- [ ] Plantilla y tokens de marca aplicados sin romper accesibilidad.
- [ ] Analítica y auditoría configuradas.
- [ ] Importación/exportación probadas.
- [ ] Release de producción y rollback verificados.

## Checklist de landing

- [ ] Propuesta, audiencia y llamada a la acción coherentes.
- [ ] Navegación, pie, legales y contacto reales.
- [ ] SEO técnico, metadata, sitemap y datos sociales.
- [ ] Rendimiento de imágenes, fuentes y scripts dentro de presupuesto.
- [ ] Consentimiento y analítica según jurisdicción.
- [ ] Formularios protegidos contra abuso y conectados a destino válido.
- [ ] Diseño responsive, teclado, contraste y lectores de pantalla.
- [ ] Modo sin landing redirige correctamente a login o aplicación.

## Checklist de dominio y publicación

- [ ] Propiedad DNS verificada sin permitir apropiación cruzada.
- [ ] Registros requeridos y conflictos explicados.
- [ ] TLS emitido, renovable y monitorizado.
- [ ] Dominio primario, redirects y canonical definidos.
- [ ] Preflight de definición, secretos, migraciones y cuotas aprobado.
- [ ] Snapshot inmutable y trazabilidad de autor/release.
- [ ] Canary/health checks aprobados.
- [ ] Rollback probado y release anterior conservada.
- [ ] Logs y métricas identifican dominio, proyecto y release.

## Checklist de plan, cobro y entitlement

- [ ] Se identifica si el cobro pertenece a SaaS Maker, al SaaS creado o al marketplace.
- [ ] Producto/precio tiene moneda, impuestos, intervalo y versión inmutable.
- [ ] Checkout usa idempotencia y referencias internas verificables.
- [ ] Webhook valida firma, timestamp, orden y duplicados.
- [ ] Estados de suscripción y períodos de gracia están documentados.
- [ ] Entitlement se materializa y reconcilia con el proveedor.
- [ ] Upgrade, downgrade, prorrateo, cancelación y devolución probados.
- [ ] Factura/recibo y portal son accesibles al cliente correcto.
- [ ] No se activa acceso basándose solo en una redirección del navegador.
- [ ] Alertas detectan discrepancias entre dinero y acceso.

## Checklist de módulo

- [ ] Manifiesto, propietario, versión y compatibilidad declarados.
- [ ] Permisos y datos requeridos son mínimos y visibles antes de instalar.
- [ ] Oferta es única, mensual, anual, incluida o privada sin ambigüedad.
- [ ] Instalación es transaccional o compensable.
- [ ] Migraciones son versionadas y reversibles cuando sea posible.
- [ ] Desactivación conserva/exporta datos según contrato.
- [ ] Actualización explica cambios de permisos y breaking changes.
- [ ] Código/artefacto está firmado y escaneado.
- [ ] Consumo, errores y costo son observables.
- [ ] Retiro del catálogo tiene plan para instalaciones existentes.

## Checklist de plantilla

- [ ] Tipo, versión y contrato compatibles.
- [ ] Incluye preview con datos sintéticos.
- [ ] Usa tokens y componentes soportados, sin secretos ni datos reales.
- [ ] Define páginas, permisos, entidades y automatizaciones requeridas.
- [ ] Se puede personalizar sin editar el paquete base.
- [ ] Una actualización muestra diff y no pisa cambios del usuario.
- [ ] Es responsive, accesible y localizable.
- [ ] Instalación y desinstalación están probadas.

## Checklist de conector y contenido privado

- [ ] OAuth o credencial almacenada cifrada y rotatable.
- [ ] Scopes separados para descubrir, leer, descargar, crear, modificar y eliminar.
- [ ] Acceso a chats, imágenes, videos y documentos es privado al tenant y explícito.
- [ ] URLs de descarga son temporales y no se registran.
- [ ] Tamaño, tipo, malware y retención se validan.
- [ ] Revocación corta nuevas lecturas y descargas inmediatamente.
- [ ] Rate limits, paginación y reintentos respetan al proveedor.
- [ ] Acciones de escritura ofrecen simulación/aprobación si son sensibles.
- [ ] Cada acceso queda auditado sin copiar el contenido completo.
- [ ] Exportación/eliminación alcanza las copias derivadas autorizadas.

## Checklist de agente de IA

- [ ] Propósito, datos permitidos y herramientas están delimitados.
- [ ] El prompt no contiene secretos ni permisos implícitos.
- [ ] Toda herramienta verifica identidad, tenant, permiso y entitlement.
- [ ] Datos externos se tratan como no confiables frente a inyección.
- [ ] Cambios de dinero, permisos, publicación o borrado requieren aprobación.
- [ ] Hay límites de tokens, costo, frecuencia y concurrencia.
- [ ] Proveedor/modelo puede deshabilitarse sin detener el núcleo.
- [ ] Evals cubren precisión, autorización, fuga, rechazo y costo.
- [ ] La auditoría relaciona propuesta, aprobación, ejecución y resultado.

## Checklist de lanzamiento

### Producto

- [ ] Segmento, promesa y alcance del MVP están publicados internamente.
- [ ] Onboarding conduce a una primera publicación medible.
- [ ] Precios, límites, prueba, cancelación y soporte son claros.
- [ ] Ayuda, ejemplos y plantilla inicial están disponibles.

### Ingeniería y confianza

- [ ] Arquitectura y ADR actualizados.
- [ ] Matriz de tenant/roles probada.
- [ ] Threat model sin riesgos críticos sin aceptar.
- [ ] Restauración reciente cumple RPO/RTO.
- [ ] SLO, dashboards, alertas y runbooks activos.
- [ ] Dependencias, secretos, archivos y módulos escaneados.
- [ ] Privacidad, términos y acuerdos con proveedores revisados.

### Operación

- [ ] Responsables y escalamiento definidos.
- [ ] Soporte puede diagnosticar sin acceso permanente a datos.
- [ ] Estado público y comunicaciones de incidente preparados.
- [ ] Conciliaciones de pagos y costos programadas.
- [ ] Capacidad y límites fueron probados con margen.

## Go / no-go

Se lanza solo si:

- no hay vulnerabilidad crítica ni fuga entre tenants conocida;
- el camino registro → publicación → alta de cliente → cobro funciona;
- dinero y acceso se reconcilian;
- rollback y restauración fueron demostrados;
- existe guardia/responsable para el período de lanzamiento;
- riesgos residuales tienen aceptación explícita, propietario y fecha.

## Registro inicial de riesgos

| Riesgo | Impacto | Probabilidad | Mitigación | Indicador temprano |
|---|---|---|---|---|
| Alcance excesivo del constructor | Alto | Alto | Casos de uso y componentes curados; gates verticales | Historias abiertas sin recorrido E2E |
| Fuga entre tenants | Crítico | Medio | Contexto obligatorio, RLS y pruebas negativas | Consultas sin filtro de ámbito |
| Divergencia entre definición y runtime | Alto | Medio | Snapshot canónico, compilación determinista y validación | Publicaciones no reproducibles |
| Pagos no coinciden con acceso | Crítico | Medio | Webhooks idempotentes, entitlement materializado y conciliación | Diferencias en reportes diarios |
| Costos de IA impredecibles | Alto | Alto | Cuotas, presupuestos, caché, modelo por tarea y kill switch | Costo por tenant fuera de rango |
| Módulo rompe proyectos | Alto | Medio | Compatibilidad, sandbox, firma, canary y rollback | Errores posteriores a actualización |
| Dependencia de proveedor | Alto | Medio | Contratos internos, exportación y plan de salida | Uso de SDK directo fuera del adaptador |
| Dominios/certificados fallan | Medio | Medio | Estados explícitos, reintento, monitoreo y soporte DNS | Certificados próximos a vencer |
| Plantillas generan productos iguales | Medio | Alto | Tokens, bloques composables y personalización semántica | Baja variación/retención por plantilla |
| Soporte accede a datos sensibles | Alto | Bajo/Medio | Acceso temporal, propósito y auditoría visible | Sesiones de soporte prolongadas |
| Marketplace con contenido malicioso | Crítico | Medio | Curación inicial, permisos, escaneo y firma | Solicitudes de scopes inusuales |
| Unit economics negativos | Alto | Medio | Medición por tenant, límites y precios versionados | Margen cae al crecer el uso |

Cada riesgo se revisa quincenalmente durante construcción y semanalmente durante beta.

## Decisiones pendientes con propietario

- Segmentos verticales iniciales — Producto.
- Proveedor(es) de identidad — Arquitectura/Seguridad.
- Estrategia de base compartida o dedicada por plan — Plataforma.
- Proveedores de pago por país — Negocio/Finanzas.
- Modelo fiscal y merchant of record — Legal/Finanzas.
- Política de revenue share — Negocio.
- Dominios administrados y límites de certificados — Plataforma.
- Lenguajes/SDK del marketplace — Arquitectura.
- Regiones y retención — Seguridad/Legal.
- Límites gratuitos y presupuesto de IA — Finanzas/Producto.

## Cierre de proyecto

Antes de declarar la primera versión lista, el equipo ejecuta una revisión conjunta usando este documento, enlaza evidencias para cada ítem y registra excepciones. Una casilla no se marca por intención: requiere una prueba, métrica, captura, evento, consulta o runbook verificable.

