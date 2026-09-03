# 09 — Conectores: Tareas, relaciones y clientes

La interfaz nueva de Tareas (`/plugins/tasks`) lee y escribe las mismas tablas `task-*` y `team_task_relations`. Los conectores (Grok, Claude, ChatGPT y el MCP WhatsPro) deben usar estas herramientas; no inventar endpoints ni duplicar tareas para “compartirlas”.

## Dónde vive cada cosa

| Concepto | Tabla / recurso | Herramienta |
| Tarea | `tasks` | `whatspro_manage_task` |
| Proyecto | `task-projects` | `whatspro_create_task_project` / `whatspro_manage_task_project` |
| Espacio | `task-workspaces` | `whatspro_manage_task_workspace` |
| Columna | `task-columns` | `whatspro_manage_task_column` |
| Relación polimórfica | `task-relations` | `whatspro_manage_task_relation` |
| Tarea compartida en otro tablero | `task-locations` + relación `shared_in` | `whatspro_share_task` |
| Cliente del CRM | `team_customers` | `whatspro_link_customer_task` |
| Tarea de un contacto (chat) | `tasks` + relación `contact` | `whatspro_create_contact_task` |

## Tipos de relación (`relation_type`)

| Valor | Significado | Uso correcto |
| `related` | Vínculo genérico | Tarea↔tarea, tarea↔proyecto, tarea↔espacio, tarea↔cliente, tarea↔contacto |
| `shared_in` | La misma tarea aparece en otro proyecto | **No lo crees a mano.** Usá `whatspro_share_task` |
| `generated_from` | Se originó en otra entidad (nota de reunión, etc.) | Lo escribe el backend al generar tareas |
| `converted_to` | Conversión tarea↔proyecto | Lo escribe el backend al convertir |

Entidades (`source_type` / `target_type`): `task` · `project` · `workspace` · `contact` · `customer` · `note` · `event`.

Una tarea compartida **no se duplica**: se agrega una fila en `task-locations` (ubicación secundaria) y una relación `shared_in` hacia el proyecto destino. `isPrimary` marca el tablero de origen.

## Ejemplos

Vincular una tarea a un cliente del CRM:

```json
{
  "action": "link",
  "customer_id": 42,
  "task_id": 1088
}
```

Equivale a `whatspro_manage_task_relation` con `source_type=customer`, `target_type=task`, `relation_type=related`. Preferí `whatspro_link_customer_task`: es idempotente y se ve en la ficha del cliente y en el modal de la tarea.

Compartir la misma tarea en otro proyecto:

```json
{
  "task_id": 1088,
  "project_id": 55
}
```

`column_id` es opcional; si falta, entra en la primera columna del destino.

Relacionar dos tareas:

```json
{
  "action": "create",
  "source_type": "task",
  "source_id": 1088,
  "target_type": "task",
  "target_id": 1090,
  "relation_type": "related"
}
```

## Reglas para no romper producción

- Filtrá siempre por el `teamId` de la sesión. Las herramientas ya lo hacen; no pases un team ajeno.
- No crees proyectos ni workspaces en un `useEffect` ni al listar. Alta solo con acción explícita.
- No borres con `whatspro_delete_record` salvo pedido explícito del usuario y `confirm=true`.
- Para un cliente, no clones la tarea: vincularla. La ficha de Tareas (`FichaCliente`) lee `/api/plugins/customers/:id` y muestra contactos, membresías, tiendas, pagos, tareas y adjuntos.
- La UI nueva abre en `/plugins/tasks`. El ícono de Tareas del menú móvil apunta ahí.

## Lectura

El catálogo readonly publica `task-relations` con filtros `sourceType`, `sourceId`, `targetType`, `targetId`. Para el detalle de una tarea (relaciones + locations + dependencias): `GET /api/plugins/tasks/items/:id/details`.
