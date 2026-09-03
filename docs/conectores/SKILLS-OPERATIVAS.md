# 56 skills operativas del Conector IA

Catálogo de procedimientos repetibles para operar el negocio desde una IA conectada por MCP. Cada skill es una **cadena de tools con un criterio**, no una tool suelta: lo que falla en la práctica no es que falte una herramienta, es que nadie definió el orden ni cuándo parar.

**Leyenda de estado**

- ✅ **Lista** — todas las tools existen hoy.
- ⚠️ **Parcial** — se puede hacer, con un rodeo o una limitación anotada.
- ⛔ **Bloqueada** — falta una tool; queda documentada para cuando exista.

**Tres reglas que valen para las 56**

1. **Leer antes de escribir.** Todo id se saca de un listado, nunca se adivina.
2. **Lo irreversible pide `dry_run` primero y `confirm` después.** Mensajes que salen, plata que se registra, borrados.
3. **Una clave de idempotencia por operación irreversible**, derivada del hecho (`focuson-seña-2026-08-25`), no del reloj.

---

## A · Bandeja y respuesta

**1. Barrer la deuda de respuesta** ✅
`whatspro_crm_followup_queue(mode:"awaiting_reply")` → por cada uno, `whatspro_chat_media_summary` para contexto → redactar → `whatspro_chat_send_message(dry_run:true)` → mostrar al humano → enviar.
*Cuándo:* primera acción de cada mañana. Es el cuello de botella nº1 del equipo.

**2. Contestar un chat puntual** ✅
`whatspro_get_record(chats)` → leer últimos mensajes → `whatspro_chat_send_message` con `idempotency_key` derivada del asunto.
*Regla:* si el texto no lo dictó el humano palabra por palabra, `dry_run` primero.

**3. Escuchar lo que quedó sin escuchar** ✅
`whatspro_pending_audios` → `whatspro_transcribe_media` por cada uno → si aparece un pedido, abrir tarea con `whatspro_create_contact_task`.
*Cuándo:* semanal. Un audio sin abrir es un reclamo sin responder.

**4. Enviar un archivo al cliente** ✅
`whatspro_chat_send_media` con `media_url` o `media_base64`, `idempotency_key` obligatoria.

**5. Reactivar a los que se enfrían** ✅
`whatspro_crm_followup_queue(mode:"going_cold", min_days_silent:7)` → agrupar por etapa → un mensaje por etapa, revisado por el humano, enviado uno por uno.
*Regla:* nunca en lote sin aprobación explícita.

**6. Disparar una secuencia** ✅
`whatspro_inspect_automation` para ver qué manda → avisar al humano cuántos mensajes salen → `whatspro_chat_trigger_automation(confirm:true)`.

**7. Programar un envío futuro** ✅
`whatspro_manage_scheduled_message`. **No la uses para "mandar ya"** — para eso está la skill 2. Los programados son para fechas reales.

---

## B · CRM y seguimiento

**8. Alta de contacto desde una conversación** ✅
`whatspro_save_contact` → `whatspro_change_crm_stage` → `whatspro_set_contact_tags`.

**9. Mover el embudo con evidencia** ✅
Antes de cambiar de etapa, dejar el porqué con `whatspro_add_internal_note` (idempotente). Una etapa que se movió sin nota no se puede auditar después.

**10. Foto del embudo** ✅
`whatspro_crm_funnel_snapshot` → contrastar con `whatspro_crm_followup_queue` para separar "muchos en la etapa" de "muchos abandonados en la etapa".

**11. Asignar responsable y departamento** ✅
`whatspro_save_contact` con `assigned_user_id` → `whatspro_manage_department_member` si corresponde.

**12. Campos personalizados del CRM** ✅
`whatspro_manage_custom_field` para la definición → `whatspro_set_custom_fields` para los valores. Nunca al revés.

**13. Etiquetado y movimiento masivo** ✅
`whatspro_crm_bulk_tags(mode:"add"|"remove", dry_run:true)` y `whatspro_crm_bulk_stage(dry_run:true)` → revisar → aplicar.
*No existe `replace` a propósito:* borrar todas las etiquetas de decenas de contactos es irreversible y silencioso.

**14. Deduplicar contactos** ⚠️
`whatspro_list_records(contacts)` + comparación por teléfono normalizado. La fusión hay que hacerla a mano: no existe una tool de merge.

---

## C · Tareas y ejecución

**15. Tablero de un vistazo** ✅
`whatspro_tasks_board` en vez de cruzar cuatro recursos a mano.

**16. Qué se hace hoy** ✅
`whatspro_tasks_today` → vencidas primero, después hoy, después la semana.

**17. Marcar un paso del checklist** ✅
`whatspro_task_checklist_item(action:"check", item_id)`. **No uses `whatspro_manage_task`** para esto: reenviar el checklist entero es caro y pierde ítems si lo reconstruís mal.

**18. Cerrar varias tarjetas** ✅
`whatspro_tasks_bulk_status(dry_run:true)` → revisar → aplicar.

**19. Reorganizar un tablero entero** ✅
`whatspro_tasks_cascade_export` → editar el DSL → `whatspro_tasks_cascade_apply(mode:"preview")` → leer el diff → `mode:"apply"`.
*Es la mejor herramienta del sistema.* Preview nativo, aplicación transaccional.

**20. Dejar devolución en una tarea** ✅
`whatspro_tasks_comment`. Comentar es mejor que editar las notas: no pisa lo que escribió otro.

**21. Vincular una tarea a lo que la originó** ✅
`whatspro_manage_task_relation` con `sale`, `transaction`, `subscription`, `company`, `customer`, `contact`, `document`, `project` o `workspace`.

---

## D · Dinero

**22. Registrar una venta con detalle** ✅
`whatspro_register_sale(dry_run:true)` → verificar subtotal y total → `confirm:true` con `create_entry:true`.
*Regla:* montos en entero, en la unidad mínima. $200.000 son `200000`.

**23. Cargar un ingreso o un gasto suelto** ✅
`whatspro_finance_record_entry`. Si ya se cobró: `status:"paid"` + `paid_on`. Si se cobra en partes: `pending` y después la skill 24.

**24. Registrar un cobro en partes** ✅
`whatspro_finance_accounts` para el `account_id` → `whatspro_finance_settle_entry` una vez por pago. Cuando la suma cubre el total, el movimiento pasa solo a pagado.

**25. Conciliar un movimiento** ✅
`whatspro_finance_entry_payments` → compara total, pagado y pendiente.

**26. Estado de la caja** ✅
`whatspro_finance_summary` (arreglado: estuvo invisible por un schema mal armado) + `whatspro_finance_accounts` para el saldo por cuenta.

**27. Quién debe y qué debemos** ✅
`whatspro_finance_receivables_payables(direction)` con `only_overdue` para lo urgente.

**28. Proyectar la caja** ✅
`whatspro_finance_cashflow_projection(days:90)`.

**29. Cobranza del mes** ✅
`whatspro_customers_pending_payment` → cruzar con la skill 1 para saber a quién ya se le reclamó.
*Ojo:* este reporte lee de lo cargado. Si las ventas no se registran (skill 22), miente por defecto.

---

## E · Clientes, membresías y renovaciones

**30. Ficha 360 de un cliente** ✅
`whatspro_customer_360` — una llamada: contactos, suscripciones, ventas, transacciones, documentos y tareas, separando lo **directo** de lo **heredado**.

**31. Qué vence esta semana** ✅
`whatspro_memberships_expiring(within_days:7)`. Mirá `without_contact`: una suscripción sin contacto de WhatsApp no se puede avisar.

**32. Cola de avisos de renovación** ✅
`whatspro_memberships_renewal_queue` para ver, aprobar o rechazar. Requiere `confirm`.

**33. Renovar una suscripción** ✅
`whatspro_memberships_renew(dry_run:true)` → revisar → `confirm:true` con `record_payment:true`.
Corre la fecha **y** registra el cobro en la misma operación, y limpia los avisos ya enviados (correspondían al vencimiento viejo). Rechaza una fecha que no sea posterior a la actual: eso acorta, no renueva.

**34. Alta de cliente y membresía** ✅
`whatspro_register_customer` → `whatspro_register_membership` (exige `idempotency_key`) → `whatspro_link_customer_contact`.

---

## F · Conocimiento: documentos, notas y Radar

**35. Buscar en la base documental** ✅
`whatspro_documents_search` antes de escribir cualquier informe: casi siempre ya hay algo.

**36. Guardar un informe** ✅
`whatspro_manage_document` con `format:"markdown"`, o `"html"` para informes con diseño propio. Mandá `version` para no pisar cambios de otro.
*Limitación:* no se pueden adjuntar imágenes ni PDFs al documento.

**37. Archivar comprobantes del chat** ✅
`whatspro_chat_media_list(type:"document")` → `whatspro_files_link_chat_media` al cliente o a la tarea. No mueve bytes, sólo referencia.

**38. Convertir una reunión en trabajo** ✅
`whatspro_create_note` → `whatspro_generate_tasks_from_note` → revisar y ajustar con `whatspro_manage_task`.

**39. Analizar un contacto en Radar** ⚠️
`whatspro_set_custom_fields` (campos `radar_*`) + `whatspro_add_internal_note` con la nota `🎯 RADAR` + `whatspro_radar_note_to_widget`. **Son 10+ llamadas por contacto**: es el techo real del feature.

**40. Publicar un informe de Radar** ✅
`whatspro_radar_upsert_widget` → `whatspro_radar_validate` → `whatspro_radar_publish_report`.

---

## G · Producción en AAPP SPACE

> **Distinción que importa:** el plugin `aapp-space` de WhatsPro **sólo lee** (importa clientes, planes y suscripciones). La producción real —crear sitios, tiendas, productos, publicar— va por el conector MCP de AAPP SPACE, que sí escribe. No los confundas: `whatspro_*` es el CRM, `gobiz_*` es la fábrica.

**41. Traer lo último de AAPP antes de un informe** ✅
`whatspro_integrations_status` → `whatspro_integrations_sync(integration:"aapp_space")`. Sin esto trabajás con la foto vieja.

**42. Relevar antes de tocar** ✅
`gobiz_sites_list` / `gobiz_stores_list` / `gobiz_customers_list` → trabajar con ids reales. Para editar un sitio usá el `card_id`, no la URL: las URLs se repiten.

**43. Crear un sitio de cero** ✅
`gobiz_prosites_create` → `gobiz_prosites_pages_create` → `gobiz_prosites_fields_set` → `gobiz_prosites_checkup` → `gobiz_prosites_publish`.
*Regla:* `dry_run:true` está disponible en toda escritura de gobiz. Usalo.

**44. Crear una tienda** ✅
`gobiz_stores_create` → `gobiz_store_categories_create` → `gobiz_store_products_create` → `gobiz_stores_checkup` → publicar.

**45. Cargar catálogo en lote** ✅
`gobiz_store_products_create` por producto, o `gobiz_elements_bulk_create`. Después `gobiz_store_products_bulk_price` / `_bulk_stock` para ajustes masivos.

**46. Aplicar diseño y tema** ✅
`gobiz_stores_design_preview` → revisar → `gobiz_stores_design_apply`. Exportá antes con `gobiz_stores_design_export` para poder volver.

**47. Conectar un dominio propio** ✅
`gobiz_prosites_domain_request` → `gobiz_domains_dns_check` → `gobiz_domains_ssl_status` hasta que dé verde.
*Cruce:* `whatspro_list_domains` y el plugin Hostinger tienen el portfolio del lado nuestro.

**48. Entregar al cliente** ⚠️
`gobiz_sites_qa` → `gobiz_prosites_checkup` → registrar la venta (skill 22) → avisar por WhatsApp (skill 2) → adjuntar credenciales.
**Trampa conocida:** en dos entregas se mandaron credenciales con la contraseña igual al mail. Revisalo siempre antes de enviar; **no hay tool que audite esto** (ver skill 50).

---

## H · Gobierno del propio conector

**49. Validar el catálogo de tools** ✅
`node scripts/verify-connector-tools.mts` con `NODE_OPTIONS="--conditions=react-server"`.
Detecta schemas mal armados **antes** de que la API los rechace en silencio. Es el guardián que faltaba cuando `whatspro_finance_summary` estuvo invisible sin que nadie lo notara.

**50. Auditar el uso del conector** ⚠️
`whatspro_list_records(activity-logs)` filtrando `GROK_*`.
**Limitaciones reales:** no se registra ninguna LECTURA, ni qué tool se llamó, ni qué token actuó. `activity_logs` no tiene columna `metadata`, así que todo el repo usa `ipAddress` como campo de payload. Reconstruir "qué le pedí el martes" hoy es imposible.

---

## I · Vinculación libre y herencia

> **La idea:** en vez de vincular tarea por tarea y documento por documento, se vincula el CONTENEDOR una sola vez y lo de adentro lo hereda. El vínculo directo siempre gana sobre el heredado, y toda lectura dice de dónde salió cada uno.

**51. Vincular cualquier cosa con cualquier cosa** ✅
`whatspro_link_entities(source_type, source_id, target_type, target_id)`.
Soporta tarea, proyecto, espacio, documento, carpeta de documentos, contacto, cliente, venta, comprobante, suscripción y empresa — sin combinaciones predefinidas. Repetir la llamada no duplica: la unicidad se chequea en las dos orientaciones.

**52. Adoptar un cliente entero de una** ✅
Vinculá el **proyecto** o la **carpeta de documentos** al cliente: todas sus tareas y documentos lo heredan sin tocarlos uno por uno.
*Cuándo:* al abrir un cliente nuevo. Es la diferencia entre una vinculación y cincuenta.

**53. Saber de quién es algo** ✅
`whatspro_entity_links(entity_type, entity_id)` → devuelve los vínculos en ambas orientaciones **y** el cliente resuelto, con su `origen`:
- `directo` — alguien lo vinculó
- `heredado` — sale del proyecto o la carpeta que lo contiene
- `derivado` — votado entre las tareas del proyecto (el más débil)

*Regla:* no trates un `derivado` como un hecho. Si importa, convertilo en directo con la skill 51.

**54. Corregir un vínculo mal puesto** ✅
`whatspro_entity_links` para encontrar el `relation_id` → `whatspro_unlink_entities(confirm:true)`. No borra ninguna de las dos partes.

**55. Buscar trabajo encargado a la IA** ✅
`whatspro_tasks_search(has_ai_prompt:true)` → ejecutar → `whatspro_task_ai_prompt_status(status:"done", note)`.
Sin el estado, el campo es texto libre y no se distingue lo pendiente de lo hecho: la única forma era escribir "EJECUTADO" dentro del propio prompt.

**56. Leer un período de conversación** ✅
`whatspro_list_records(resource:"messages", from:"2026-08-01", to:"2026-08-31")`.
`from`/`to` funcionan en **todos** los recursos, sobre la fecha por la que cada uno ordena. `to` con fecha suelta llega hasta el final del día.

---

## Lo que sigue faltando

Ordenado por lo que más duele:

| Falta | Impacto |
| --- | --- |
| `whatspro_files_upload` | Sólo se pueden vincular archivos que ya están en un chat, no subir nuevos |
| Adjuntos en Documentos | Un informe con capturas no se arma entero desde el conector |
| `whatspro_credentials_audit` | La trampa de la skill 48 (contraseña = mail) no se puede detectar sola |
| Sincronía entre tarjetas espejo | Las copias hechas a mano se desincronizan |
| `visibleChatScope` en el conector | Por MCP se ven todos los chats del equipo, ignorando `chatVisibility` |
| Permisos en `listReadOnlyResource` | Los 95 recursos de lectura no chequean ningún permiso |
| Trazabilidad en `activity_logs` | No se registra ninguna lectura, ni qué tool se llamó, ni qué token actuó |

**Resueltas desde la primera versión de este documento:** ficha 360 en una llamada, `tasks_search`, rango de fechas en todos los recursos, lotes de CRM, `memberships_renew`, estado del `ai_prompt`, y la vinculación libre con herencia.
