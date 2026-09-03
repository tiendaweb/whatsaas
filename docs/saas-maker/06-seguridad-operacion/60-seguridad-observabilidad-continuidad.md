# Seguridad, observabilidad y continuidad

## Objetivo

Operar SaaS Maker como una plataforma multi-tenant que aloja aplicaciones de terceros. Un fallo puede afectar simultáneamente a creadores y clientes finales, por lo que seguridad, trazabilidad y recuperación forman parte del producto y no de una fase posterior.

## Modelo de amenazas

Amenazas prioritarias:

- escape entre tenants o proyectos;
- elevación de privilegios mediante roles, dominios o APIs generadas;
- robo de sesiones, tokens OAuth, claves de pago o secretos de conectores;
- ejecución de acciones destructivas inducidas a un agente de IA;
- contenido malicioso en archivos, plantillas, HTML o integraciones;
- webhooks falsificados, repetidos o fuera de orden;
- abuso de recursos que afecte disponibilidad o costos;
- dependencia comprometida, plantilla manipulada o módulo con permisos excesivos;
- acceso interno no autorizado durante soporte.

Se mantiene un registro por amenaza con activo, atacante, vector, impacto, controles preventivos, detección, respuesta, propietario y prueba asociada. Se revisa antes de cada gran superficie nueva.

## Identidad y sesión

- Contraseñas con algoritmo resistente y parámetros actualizables.
- MFA obligatorio para administradores de plataforma y recomendado para creadores.
- Soporte de passkeys y SSO empresarial como evolución.
- Sesiones rotables, revocables por dispositivo y con expiración absoluta.
- Reautenticación para pagos, secretos, dominios, roles y eliminación.
- Invitaciones de un solo uso, con expiración y ligadas al correo esperado.
- Protección contra enumeración, credential stuffing y fuerza bruta.
- Recuperación de cuenta auditable sin exponer si un correo existe.

Las identidades de SaaS Maker y las de cada SaaS creado permanecen separadas aunque puedan compartir proveedor de identidad.

## Autorización

La decisión final combina:

`identidad válida ∩ pertenencia al ámbito ∩ permiso del rol ∩ política del recurso ∩ entitlement ∩ límite operativo`

Los controles de interfaz son informativos; la verificación autoritativa vive en servidor y workers. Se agregan pruebas negativas para acceso cruzado, IDs manipulados, dominios alternativos y credenciales revocadas.

## Secretos y cifrado

- TLS en tránsito y cifrado administrado en reposo.
- Secretos de proveedores y conectores cifrados por envoltura con claves rotables.
- Separación de claves por ambiente y privilegio mínimo del proceso que descifra.
- Nunca registrar tokens, cuerpos de pago completos ni contenido privado de chat.
- Enmascarado en paneles y respuestas; solo se permite reemplazar, no recuperar el valor.
- Rotación con período de solapamiento para webhooks y credenciales.
- Inventario de secretos con propietario, uso, fecha de rotación y último acceso.

## Seguridad de aplicaciones y contenido

- Validación de esquema en todos los bordes.
- Consultas parametrizadas y codificación contextual de salida.
- Política de seguridad de contenido estricta para landings y apps generadas.
- Sanitización de HTML; scripts personalizados deshabilitados por defecto y aislados cuando se habiliten.
- Protección CSRF, cookies seguras y CORS explícito.
- SSRF mitigado mediante allowlists, resolución segura y bloqueo de redes privadas.
- Archivos con límite, detección real de tipo, análisis de malware y cuarentena.
- Imágenes y documentos privados se sirven mediante URLs cortas firmadas.
- Rate limits, cuotas de trabajo y límites de tamaño por plan.

Los módulos y plantillas pasan validación estática, revisión de permisos y firma de artefacto antes de entrar al catálogo público.

## IA segura

- Los modelos no reciben secretos ni más datos de los necesarios.
- Cada herramienta declara scopes, impacto y esquema de argumentos.
- Operaciones sensibles usan plan visible, simulación y aprobación humana.
- Se considera el contenido de usuarios y documentos como datos no confiables, también frente a prompt injection.
- La IA no puede aumentar sus propios permisos, instalar módulos pagos ni cambiar facturación sin confirmación.
- Entradas, decisiones, herramienta invocada, aprobación y resultado quedan auditados con redacción de datos sensibles.
- Se realizan evaluaciones de autorización, fuga entre tenants, inyección, alucinación y costo.

## Privacidad y gobierno de datos

- Inventario de datos y clasificación: público, interno, confidencial, restringido.
- Minimización por defecto y propósitos declarados.
- Consentimientos versionados cuando correspondan.
- Acuerdos con subencargados y registro de ubicación de datos.
- Herramientas de acceso, rectificación, exportación y eliminación.
- Retención configurable con mínimos legales para comprobantes financieros.
- Los datos de un cliente no se usan para entrenar modelos sin consentimiento explícito.
- El acceso de soporte requiere motivo, tiempo limitado y registro visible.

La implementación debe adaptarse a las jurisdicciones objetivo mediante asesoramiento legal; la arquitectura aporta controles, no sustituye cumplimiento jurídico.

## Auditoría

Todo evento sensible registra:

- actor humano, servicio o agente;
- ámbito, recurso y acción;
- estado anterior y posterior resumidos;
- origen, sesión, correlación y fecha;
- resultado y motivo de rechazo;
- aprobación relacionada, si existió.

Los eventos de auditoría son append-only, con acceso restringido y retención definida. Se evitan cuerpos completos cuando contienen datos personales o secretos.

## Observabilidad

### Señales

- Métricas RED por API: tasa, errores y duración.
- Métricas USE para infraestructura: uso, saturación y errores.
- Trazas distribuidas con `requestId`, `correlationId`, proyecto y tenant seudonimizados.
- Logs estructurados con niveles, códigos estables y redacción automática.
- Métricas de negocio: publicaciones, dominios activos, conversión, cobros, churn, instalaciones y ejecuciones.
- Métricas de IA: tokens, costo, latencia, aprobaciones, rechazos y fallos de herramienta.

### SLO iniciales

- Panel y runtime: 99,9 % mensual, excluyendo mantenimiento comunicado.
- API crítica de autenticación y entitlement: 99,95 %.
- Webhooks: 99 % de entregas iniciales procesadas en menos de 60 segundos; reintentos medidos aparte.
- Publicación estándar: 95 % completada en menos de 5 minutos.
- RPO de datos transaccionales: 15 minutos; RTO: 4 horas para MVP.

Cada SLO tiene indicador, fuente, ventana, presupuesto de error y política de congelamiento de releases.

## Alertas

Alertar por síntomas accionables, no por cada error aislado:

- tasa de errores o latencia sostenida sobre SLO;
- fallos de autenticación anómalos o intentos entre tenants;
- discrepancia entre pagos y entitlements;
- cola de webhooks, automatizaciones o publicaciones estancada;
- certificados próximos a vencer;
- crecimiento inesperado de costos de IA o almacenamiento;
- fallo de backups o de restauración verificada.

Cada alerta referencia un runbook, severidad, propietario y canal de escalamiento.

## Incidentes

Severidades:

- `SEV-1`: fuga de datos, pagos generalizados incorrectos o caída amplia.
- `SEV-2`: función crítica degradada o varios clientes afectados.
- `SEV-3`: impacto limitado con alternativa disponible.

Flujo: detectar, declarar, asignar comandante, contener, comunicar, recuperar, validar, cerrar y realizar postmortem sin culpables. Para incidentes de seguridad se preserva evidencia y se sigue el proceso legal de notificación aplicable.

Runbooks mínimos:

- acceso cruzado entre tenants;
- proveedor de pago caído o webhooks atrasados;
- dominio/certificado fallido;
- release defectuosa y rollback;
- secreto comprometido;
- cola de automatización bloqueada;
- proveedor de IA degradado o gasto fuera de control;
- pérdida o corrupción de datos.

## Respaldo y recuperación

- Backups automáticos cifrados, con copia en región/cuenta separada.
- Recuperación punto en el tiempo para base transaccional.
- Versionado y política de ciclo de vida para objetos.
- Exportación separada de definiciones y releases.
- Restauración ensayada, no solo backup reportado como exitoso.
- Prueba trimestral de recuperación para MVP y aumento de frecuencia al escalar.
- Registro de RPO/RTO alcanzados y acciones correctivas.

La restauración debe demostrar aislamiento: puede recuperarse un proyecto o tenant sin sobrescribir datos ajenos cuando el incidente lo permita.

## Continuidad y dependencia de proveedores

- Abstracciones para pagos, correo, almacenamiento e IA donde el costo lo justifique.
- Timeout, circuit breaker, reintento y cola de compensación por proveedor.
- Modo degradado: lectura disponible aunque falle una integración no esencial.
- Exportación de datos y definiciones para reducir dependencia de plataforma.
- Inventario de proveedores con criticidad, SLA, región y plan de salida.

## Seguridad del ciclo de entrega

- Revisión obligatoria de cambios sensibles.
- Análisis de dependencias, secretos y código en CI.
- Artefactos reproducibles, firmados y promovidos entre ambientes.
- Migraciones backward-compatible y rollback documentado.
- Ambientes separados y datos de prueba sintéticos.
- Acceso de producción de mínimo privilegio, temporal y auditado.

## Criterios de salida a producción

- Threat model y matriz de permisos revisados.
- Pruebas de aislamiento y autorización negativas aprobadas.
- Webhooks, cobros y entitlements reconciliables.
- Backups y restauración verificados.
- Dashboards, alertas y runbooks operativos.
- Escaneo de módulos, archivos y HTML activo.
- Proceso de incidentes, privacidad y soporte documentado.

