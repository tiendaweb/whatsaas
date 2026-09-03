# Copy en español

Namespace: **`DesktopOperations`** — ya existe en `messages/{es,en,pt}.json` con ~40 claves
("Preparando tu sala de operaciones…", "Centro de operaciones de {team}", etc.). Las claves
nuevas se **agregan** ahí, sin borrar las actuales: el Escritorio viejo sigue en producción
hasta que se corte.

Regla: se traduce el **sentido**, no la letra. "Sales Overview" no es "Vista general de ventas"
(literal y frío) sino "Resumen comercial", que es como se dice.

## 1. Navegación

| Pulze | es | en | pt |
|---|---|---|---|
| Dashboard | Escritorio | Dashboard | Painel |
| Leads | Prospectos | Leads | Prospectos |
| Deals | Oportunidades | Deals | Oportunidades |
| Accounts | Clientes | Accounts | Clientes |
| Contacts | Contactos | Contacts | Contatos |
| Tasks | Tareas | Tasks | Tarefas |
| Reports | Informes | Reports | Relatórios |
| Calendar | Agenda | Calendar | Agenda |
| Settings | Ajustes | Settings | Ajustes |
| Profile | Mi perfil | Profile | Meu perfil |

> **"Prospectos", no "Leads".** Es el término del negocio en español y ya se usa en el CRM.
> **"Clientes", no "Cuentas".** `team_customers` se llama Clientes en toda la app; llamarlo
> "Cuentas" en una pantalla y "Clientes" en otra es exactamente cómo se rompe un producto.

## 2. Escritorio

```json
"overview": {
  "title": "Resumen comercial",
  "subtitle": "Tu rendimiento de un vistazo",
  "customize": "Personalizar escritorio",
  "period": {
    "30d": "Últimos 30 días", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses",
    "1y": "Último año", "all": "Todo el historial"
  }
}
```

### KPIs

| Pulze | es |
|---|---|
| Total Revenue | Ingresos totales |
| Active Leads | Prospectos activos |
| Deals Closed | Oportunidades ganadas |
| Conversion Rate | Tasa de conversión |
| vs last period | vs. período anterior |

> "Deals Closed" → **"Oportunidades ganadas"**. "Cerradas" es ambiguo en español: una oportunidad
> perdida también está cerrada.

### Widgets

| id | es | descripción |
|---|---|---|
| `kpi-cards` | Métricas principales | Indicadores clave del período |
| `forecast` | Tendencia de ingresos | Ingresos mensuales contra el objetivo |
| `pipeline` | Embudo de oportunidades | Oportunidades por etapa |
| `recent-deals` | Mejores oportunidades | Las de mayor valor abiertas |
| `activity-feed` | Actividad reciente | Lo último que hizo el equipo |
| `quick-actions` | Acciones rápidas | Accesos directos a lo más usado |
| `upcoming` | Próximos compromisos | Reuniones, llamadas y tareas |

Categorías del diálogo: `Métricas` · `Gráficos` · `Listas` · `Actividad`.

### Acciones rápidas

| Pulze | es | descripción |
|---|---|---|
| New Lead | Nuevo prospecto | Cargar un prospecto |
| Send Email | Enviar mensaje | Redactar y enviar |
| Schedule Call | Agendar llamada | Reservar una llamada |
| New Meeting | Nueva reunión | Coordinar una reunión |

> "Send Email" → **"Enviar mensaje"**: en WhatsPro el canal es WhatsApp, no correo. Traducir
> "Email" literal deja un botón que promete algo que el producto no hace.

## 3. Prospectos

```json
"leads": {
  "title": "Prospectos",
  "subtitle": "Gestioná y hacé seguimiento de tus prospectos",
  "add": "Nuevo prospecto",
  "stats": { "total": "Total de prospectos", "hot": "Prospectos calientes", "conversion": "Tasa de conversión" },
  "temperature": { "hot": "Caliente", "warm": "Tibio", "cold": "Frío" },
  "score": "Puntaje",
  "lastContact": "Último contacto",
  "errors": {
    "name": "El nombre es obligatorio",
    "company": "La empresa es obligatoria",
    "email": "El email es obligatorio",
    "emailFormat": "El formato del email no es válido",
    "phone": "El teléfono es obligatorio",
    "score": "El puntaje tiene que estar entre 0 y 100"
  }
}
```

## 4. Oportunidades

```json
"deals": {
  "title": "Embudo de oportunidades",
  "subtitle": "Seguí y gestioná tus oportunidades — arrastrá para mover de etapa",
  "add": "Nueva oportunidad",
  "stats": { "total": "Valor del embudo", "active": "Oportunidades activas", "average": "Ticket promedio" },
  "stages": {
    "qualified": "Calificada", "proposal": "Propuesta", "negotiation": "Negociación",
    "closed_won": "Ganada", "closed_lost": "Perdida"
  },
  "fields": {
    "title": "Título de la oportunidad", "company": "Empresa", "value": "Monto",
    "probability": "Probabilidad (%)", "stage": "Etapa",
    "expectedCloseDate": "Fecha estimada de cierre", "primaryContact": "Contacto principal",
    "owner": "Responsable", "notes": "Notas"
  },
  "progress": "Avance de la oportunidad",
  "information": "Datos de la oportunidad",
  "recentActivity": "Actividad reciente",
  "stale": "Sin movimiento hace {days} días",
  "actions": {
    "win": "Marcar como ganada",
    "lose": "Marcar como perdida",
    "viewSale": "Ver la venta",
    "fromDeal": "Viene de la oportunidad #{id}"
  }
}
```

### Conversiones

```json
"convert": {
  "toCustomer": "Convertir en cliente",
  "toCustomerHint": "Se crea la ficha de cliente con los datos del contacto. Si ya existe una con el mismo email o teléfono, se vincula a esa.",
  "toDeal": "Crear oportunidad",
  "toDealHint": "Si el contacto todavía no es cliente, se crea la ficha de cliente primero.",
  "alreadyCustomer": "Este contacto ya es cliente",
  "linkedTo": "Vinculado a {name}",
  "win": {
    "title": "Marcar la oportunidad como ganada",
    "hint": "Se registra la venta por {amount} y queda enlazada a esta oportunidad.",
    "confirm": "Registrar la venta",
    "noSale": "Marcar como ganada sin registrar venta"
  },
  "lose": {
    "title": "Marcar la oportunidad como perdida",
    "reason": "Motivo (opcional)",
    "confirm": "Marcar como perdida"
  },
  "done": {
    "customer": "{name} ya es cliente",
    "customerLinked": "{name} se vinculó al cliente que ya existía",
    "deal": "Oportunidad creada",
    "won": "Venta {number} registrada",
    "wonNoSale": "Oportunidad ganada"
  }
}
```

> "Se registra la venta por {amount}" **dice lo que va a pasar**. Un botón que factura sin
> avisarlo es cómo se emiten ventas por accidente.

## 5. Clientes

```json
"accounts": {
  "title": "Clientes",
  "subtitle": "Las organizaciones con las que trabajás",
  "add": "Nuevo cliente",
  "stats": { "total": "Total de clientes", "enterprise": "Corporativos", "revenue": "Ingresos totales" },
  "status": { "active": "Activo", "inactive": "Inactivo", "prospect": "Prospecto" },
  "industries": {
    "technology": "Tecnología", "software": "Software", "finance": "Finanzas",
    "healthcare": "Salud", "retail": "Comercio", "manufacturing": "Industria",
    "consulting": "Consultoría", "other": "Otro"
  },
  "fields": {
    "name": "Razón social", "website": "Sitio web", "industry": "Rubro",
    "employees": "Cantidad de empleados", "annualRevenue": "Facturación anual",
    "location": "Ubicación", "customerSince": "Cliente desde"
  },
  "information": "Datos del cliente",
  "relatedOpportunities": "Oportunidades relacionadas"
}
```

## 6. Contactos

```json
"contacts": {
  "title": "Contactos",
  "subtitle": "Las personas con las que trabajás",
  "add": "Nuevo contacto",
  "stats": { "total": "Total de contactos", "companies": "Empresas activas", "vip": "Contactos VIP", "new": "Nuevos este mes" },
  "fields": {
    "firstName": "Nombre", "lastName": "Apellido", "email": "Email", "phone": "Teléfono",
    "company": "Empresa", "role": "Cargo", "department": "Área", "linkedin": "Perfil de LinkedIn"
  },
  "actions": { "sendMessage": "Enviar mensaje", "call": "Llamar" },
  "information": "Datos de contacto",
  "recentInteractions": "Interacciones recientes"
}
```

## 7. Tareas

```json
"tasks": {
  "title": "Tareas",
  "subtitle": "Gestioná las tareas y actividades del equipo",
  "columns": { "todo": "Por hacer", "in_progress": "En curso", "completed": "Completadas" },
  "priority": { "low": "Baja", "medium": "Media", "high": "Alta" },
  "overdue": "Vencida",
  "clearFilter": "Limpiar filtro",
  "relatedType": { "lead": "Prospecto", "deal": "Oportunidad", "contact": "Contacto", "account": "Cliente" },
  "fields": { "title": "Título", "description": "Descripción", "dueDate": "Vence", "assignedTo": "Responsable" },
  "activityLog": "Historial"
}
```

## 8. Informes

```json
"reports": {
  "title": "Informes y analítica",
  "subtitle": "Todo el detalle de tu rendimiento comercial",
  "tabs": {
    "overview": "General", "pipeline": "Embudo",
    "team": "Equipo", "sources": "Origen de ingresos"
  },
  "charts": {
    "revenueTrend": "Tendencia de ingresos",
    "revenueTrendHint": "Ingresos mes a mes",
    "leadsDeals": "Prospectos y oportunidades",
    "leadsDealsHint": "Rendimiento de conversión",
    "dealSize": "Distribución por monto",
    "dealSizeHint": "Oportunidades por rango de valor",
    "funnel": "Embudo de conversión",
    "funnelHint": "Tasa de conversión por etapa",
    "leaderboard": "Ranking del equipo",
    "leaderboardHint": "Rendimiento por integrante",
    "winRate": "Tasa de éxito",
    "bySource": "Ingresos por origen",
    "bySourceHint": "De dónde vienen los ingresos"
  }
}
```

## 9. Agenda

```json
"calendar": {
  "title": "Agenda",
  "subtitle": "Reuniones, llamadas, demos y tareas",
  "kinds": { "meeting": "Reunión", "call": "Llamada", "demo": "Demo", "task": "Tarea" },
  "attendees": "Participantes",
  "noEvents": "No hay nada agendado para este día"
}
```

## 10. Ajustes y perfil

```json
"settings": {
  "appearance": {
    "title": "Apariencia",
    "hint": "Elegí cómo se ve y se ordena tu escritorio",
    "headerPosition": "Posición del menú",
    "positions": { "left": "Izquierda", "right": "Derecha", "top": "Arriba" }
  },
  "notifications": {
    "title": "Notificaciones",
    "hint": "Elegí qué avisos querés recibir",
    "items": {
      "email": "Avisos por email", "emailHint": "Recibí novedades por correo",
      "deals": "Cambios en oportunidades", "dealsHint": "Avisame cuando una oportunidad cambie",
      "leads": "Prospectos nuevos", "leadsHint": "Alertas de actividad de prospectos",
      "tasks": "Recordatorios de tareas", "tasksHint": "Avisos de tareas próximas a vencer",
      "weekly": "Resumen semanal", "weeklyHint": "Un resumen de rendimiento cada semana",
      "mentions": "Menciones", "mentionsHint": "Cuando alguien te menciona"
    }
  },
  "security": {
    "title": "Seguridad",
    "hint": "Administrá el acceso a tu cuenta",
    "currentPassword": "Contraseña actual", "newPassword": "Contraseña nueva",
    "confirmPassword": "Repetí la contraseña nueva",
    "twoFactor": "Verificación en dos pasos",
    "twoFactorHint": "Sumá una capa extra de seguridad"
  }
}
```

## 11. Transversales

```json
"common": {
  "search": "Buscar…",
  "searchHint": "Buscá prospectos, oportunidades, contactos, clientes y tareas.",
  "filter": "Filtrar",
  "advancedFilters": "Filtros avanzados",
  "filterRules": "Reglas de filtrado",
  "addRule": "Agregar regla",
  "noFilters": "Sin filtros aplicados",
  "noFiltersHint": "Agregá una regla para empezar a filtrar",
  "savedViews": "Vistas guardadas",
  "saveView": "Guardar vista",
  "default": "Predeterminada",
  "operators": {
    "equals": "Es igual a", "contains": "Contiene", "startsWith": "Empieza con",
    "endsWith": "Termina con", "greaterThan": "Es mayor que", "lessThan": "Es menor que",
    "between": "Está entre"
  },
  "cancel": "Cancelar", "save": "Guardar", "saveChanges": "Guardar cambios",
  "close": "Cerrar", "edit": "Editar", "delete": "Eliminar",
  "assistant": "Asistente",
  "assistantTooltip": "Asistente (tecla «a»)",
  "assistantGreeting": "Hola. Puedo ayudarte con tus prospectos, recomendarte sobre oportunidades y armar proyecciones. ¿Por dónde empezamos?"
}
```

## 12. Lo que NO se traduce

- **Nombres de marca**: WhatsPro, WhatsApp, Radar, Meta, Hostinger.
- **Nada de PulzeCRM.** No puede quedar ni una mención de "PulzeCRM", "Sales Insights",
  "AI-powered sales insights", "John Doe", `john.doe@pulzecrm.com`, "v1.2.2" ni
  "© 2026 PulzeCRM — React CRM Dashboard Template". El nombre, el logo y el usuario salen del
  branding real del equipo (`branding`, `users`, `teams`).

```bash
grep -rniE 'pulze|john\.doe|sales insights' app components lib   # debe dar 0
```

## 13. Formato de números y fechas

Pulze escribe `$45,000` y "2 hours ago" a mano. En el port:

- Moneda: `Intl.NumberFormat(locale, { style:'currency', currency })` — la moneda sale del dato
  (`team_deals.currency`, `team_sales.currency`), **nunca fija en `USD`**.
- Fechas relativas: la función `relativeDate()` que ya existe en `EscritorioClient.tsx:70`.
- Números grandes: `formatNumber()` de `EscritorioClient.tsx:58`, que ya pasa a notación compacta
  arriba de 9999.
