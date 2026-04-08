import { db } from './drizzle';
import { users, teams, teamMembers, docsCategories, docsArticles } from './schema';
import { hashPassword } from '@/lib/auth/session';

const DOCS_CONTENT = {
  category: {
    slug: 'guias',
    name: 'Guías de usuario',
    description: 'Aprende a utilizar todas las características de WhatsPro',
    icon: 'Book',
    sortOrder: 1,
  },
  articles: [
    {
      slug: 'inicio-rapido',
      title: 'Inicio rápido',
      excerpt: 'Configura tu cuenta de WhatsPro en minutos y comienza a usar la plataforma.',
      sortOrder: 1,
      audience: 'non_technical' as const,
      isFeatured: true,
      contentMd: `# Inicio rápido en WhatsPro

Bienvenido a WhatsPro. Esta guía te mostrará cómo configurar tu cuenta en minutos.

## Paso 1: Crear una cuenta

1. Visita la página de inicio de WhatsPro
2. Haz clic en "Crear cuenta"
3. Ingresa tu email y contraseña
4. Verifica tu email

## Paso 2: Configurar tu equipo

Una vez que hayas creado tu cuenta, necesitas configurar tu equipo:

1. Ve a **Configuración > Equipo**
2. Ingresa el nombre de tu equipo
3. Establece tu zona horaria
4. Completa la información de tu empresa

## Paso 3: Conectar WhatsApp

1. Accede a **Configuración > Integraciones**
2. Selecciona "Conectar WhatsApp"
3. Escanea el código QR con tu teléfono
4. Autoriza el acceso desde WhatsApp

## Paso 4: Invitar miembros del equipo

1. Ve a **Configuración > Miembros**
2. Haz clic en "Invitar miembro"
3. Ingresa el email del miembro
4. Asigna un rol (Admin, Agente, etc.)
5. El miembro recibirá una invitación

## Paso 5: Primeros pasos en el dashboard

- **Inbox**: Aquí verás todas tus conversaciones
- **Contactos**: Gestiona tu base de datos de clientes
- **Campañas**: Crea campañas masivas
- **Automatizaciones**: Configura flujos automáticos
- **Analítica**: Visualiza el rendimiento

## ¡Estás listo!

Ahora puedes comenzar a usar WhatsPro. Para aprender más, consulta las otras guías en la documentación.`,
    },
    {
      slug: 'gestionar-conversaciones',
      title: 'Gestión de conversaciones',
      excerpt: 'Domina el inbox y responde eficientemente a tus clientes.',
      sortOrder: 2,
      audience: 'non_technical' as const,
      isFeatured: true,
      contentMd: `# Gestión de conversaciones

## Vista del Inbox

El inbox es el corazón de WhatsPro. Aquí verás todas las conversaciones con tus clientes organizadas en un tablero tipo kanban.

### Estados de conversación

- **Nuevas**: Conversaciones sin responder
- **En progreso**: Conversaciones activas
- **Resueltas**: Conversaciones cerradas
- **Etiquetadas**: Conversaciones marcadas para seguimiento

## Responder mensajes

### Mensajes de texto

1. Selecciona una conversación del inbox
2. Escribe tu mensaje en el campo de texto
3. Presiona Enter o haz clic en enviar

### Multimedia

1. Haz clic en el ícono de clip en la barra de mensajes
2. Selecciona el tipo de archivo (imagen, video, documento, audio)
3. Elige el archivo de tu computadora
4. Presiona enviar

## Organización

### Asignación de agente

1. Abre la conversación
2. En el panel derecho, busca "Asignado a"
3. Selecciona un miembro del equipo

### Etiquetas

1. Haz clic en el ícono de etiqueta en la conversación
2. Selecciona o crea etiquetas
3. Las etiquetas aparecerán en la conversación

### Notas internas

1. En el panel derecho, busca "Notas"
2. Escribe información importante para tu equipo
3. Las notas solo son visibles para el equipo

## Acciones rápidas

- **Marcar como resuelta**: Cierra la conversación
- **Silenciar**: No recibir notificaciones
- **Anclar**: Mantener la conversación visible
- **Archivar**: Ocultar la conversación (recuperable)

## Mejor práctica

Asigna conversaciones a miembros del equipo para mejorar la distribución de carga de trabajo y garantizar que todos los clientes reciban respuesta.`,
    },
    {
      slug: 'crm-contactos',
      title: 'CRM y gestión de contactos',
      excerpt: 'Administra tu base de datos de clientes de forma eficiente.',
      sortOrder: 3,
      audience: 'non_technical' as const,
      isFeatured: true,
      contentMd: `# CRM y gestión de contactos

## Vista de contactos

La sección CRM es donde administras todos los datos de tus clientes y prospectos.

## Buscar contactos

1. Ve a **Contactos**
2. Usa la barra de búsqueda para buscar por nombre, teléfono o email
3. Usa los filtros para refinar la búsqueda

## Crear un contacto

### Manualmente

1. Haz clic en "Nuevo contacto"
2. Ingresa nombre y teléfono
3. Completa campos adicionales
4. Haz clic en guardar

### Importar desde archivo

1. Ve a **Contactos > Importar**
2. Descarga la plantilla de Excel
3. Completa la plantilla con tus contactos
4. Sube el archivo
5. Revisa la previa y confirma

## Etapas del embudo

Los contactos se organizan en etapas (funnel stages):

- **Prospecto**: Nuevo contacto, sin interacción
- **Calificado**: Ha mostrado interés
- **Negociación**: En proceso de venta
- **Cerrado ganado**: Venta completada
- **Cerrado perdido**: No se concretó la venta

### Mover un contacto entre etapas

1. Abre el contacto
2. En el panel derecho, busca "Etapa"
3. Selecciona la nueva etapa

## Información del contacto

### Campos básicos

- **Nombre**: Nombre del contacto
- **Teléfono**: Número de WhatsApp
- **Email**: Email del cliente
- **Empresa**: Nombre de la empresa

### Información avanzada

- **Campos personalizados**: Datos específicos de tu negocio
- **Etiquetas**: Categorizar contactos
- **Notas**: Información importante
- **Historial**: Todas las interacciones

## Mejor práctica

Mantén tus contactos actualizados. Usa etiquetas para segmentar por:
- Producto adquirido
- Valor de cliente
- Estatus de pago
- Región o país`,
    },
    {
      slug: 'crear-campanas',
      title: 'Campañas masivas',
      excerpt: 'Envía mensajes a múltiples contactos con un solo clic.',
      sortOrder: 4,
      audience: 'non_technical' as const,
      isFeatured: false,
      contentMd: `# Campañas masivas

## ¿Qué es una campaña?

Una campaña permite enviar el mismo mensaje a múltiples contactos de forma simultánea. Es perfecto para:

- Promociones
- Recordatorios
- Anuncios de nuevos productos
- Encuestas
- Invitaciones a eventos

## Crear una campaña

### Paso 1: Ir a Campañas

1. En el dashboard, haz clic en **Campañas**
2. Haz clic en **Nueva campaña**

### Paso 2: Seleccionar contactos

1. Elige cómo seleccionar destinatarios:
   - Por etiqueta
   - Por etapa del funnel
   - Por lista personalizada
   - Todos los contactos
2. Revisa la cantidad de contactos seleccionados

### Paso 3: Redactar el mensaje

1. Escribe tu mensaje
2. Puedes usar variables como {nombre} para personalizar
3. Si usas plantilla aprobada de WhatsApp, selecciónala
4. Previsualiza el mensaje

### Paso 4: Programar

- **Ahora**: Envía inmediatamente
- **Programado**: Elige fecha y hora
- **Recurrente**: Configura repetición diaria, semanal o mensual

### Paso 5: Revisar y enviar

1. Revisa el resumen
2. Haz clic en "Enviar campaña"

## Estados de campaña

- **Borrador**: Aún no enviada
- **Programada**: Esperando la hora de envío
- **Procesando**: En envío
- **Completada**: Completada
- **Cancelada**: Cancelada manualmente

## Métricas de campaña

Después de enviar, verás:

- **Total de contactos**: Destinatarios
- **Enviados**: Mensajes entregados
- **Fallidos**: No entregados
- **Tasa de lectura**: Porcentaje que abrió
- **Tasa de respuesta**: Porcentaje que respondió

## Mejor práctica

- Evita enviar muchas campañas al mismo contacto en poco tiempo
- Usa horarios apropiados para tu audiencia
- Personaliza mensajes cuando sea posible
- Revisa tus métricas y ajusta tu estrategia`,
    },
    {
      slug: 'automatizaciones',
      title: 'Automatizaciones y flujos',
      excerpt: 'Crea flujos automáticos para responder y gestionar conversaciones.',
      sortOrder: 5,
      audience: 'mixed' as const,
      isFeatured: true,
      contentMd: `# Automatizaciones y flujos

## ¿Qué es una automatización?

Una automatización es un flujo que se activa automáticamente cuando ocurre un evento. Ejemplos:

- Responder automáticamente a mensajes nuevos
- Enviar menú de opciones
- Calificar leads
- Asignar conversaciones

## Constructor de flujos

### Elementos del flujo

**Disparadores (Triggers)**
- Mensaje recibido
- Palabra clave específica
- Horario programado

**Acciones**
- Enviar mensaje
- Asignar a agente
- Crear contacto
- Actualizar etapa

**Condiciones**
- Si el contacto existe
- Si tiene cierta etiqueta
- Según la hora del día

## Crear un flujo simple

### Ejemplo: Respuesta automática

1. Ve a **Automatizaciones**
2. Haz clic en **Nuevo flujo**
3. Nombralo: "Respuesta a buenos días"

### Configurar disparador

1. En la sección "Disparador", selecciona "Mensaje que contiene"
2. Escribe la palabra clave: "buenos días"

### Agregar acción

1. Haz clic en "Agregar acción"
2. Selecciona "Enviar mensaje"
3. Escribe: "¡Hola! Gracias por tu mensaje. ¿En qué te puedo ayudar?"

### Activar flujo

1. Revisa el flujo
2. Haz clic en "Activar"

## Mejores prácticas

- Prueba tus flujos con un contacto de prueba
- Usa condiciones para evitar respuestas inapropiadas
- Mantén respuestas automáticas breves y útiles
- Asegúrate de que los humanos puedan tomar control cuando sea necesario
- Revisa logs para ver cómo funcionan tus flujos`,
    },
    {
      slug: 'plantillas-whatsapp',
      title: 'Plantillas de WhatsApp',
      excerpt: 'Utiliza plantillas aprobadas por WhatsApp para envíos profesionales.',
      sortOrder: 6,
      audience: 'non_technical' as const,
      isFeatured: false,
      contentMd: `# Plantillas de WhatsApp

## ¿Qué son las plantillas?

Las plantillas son mensajes preaprobados por WhatsApp que pueden incluir:

- Texto formateado
- Imágenes
- Botones de acción
- Variables personalizadas

## Sincronizar plantillas

### Conectar cuenta de WhatsApp Business

1. Ve a **Configuración > Integraciones**
2. Selecciona tu instancia de WhatsApp
3. Haz clic en "Sincronizar plantillas"
4. Autoriza acceso a tus plantillas

### Ver plantillas disponibles

1. Ve a **Plantillas**
2. Verás todas tus plantillas aprobadas
3. Filtrar por categoría o estado

## Usar una plantilla

### En campaña

1. Al crear una campaña, selecciona "Usar plantilla"
2. Elige la plantilla
3. Si tiene variables, complétalas
4. Revisa la previsualización
5. Envía la campaña

### En conversación

1. En el chat, haz clic en el ícono de plantilla
2. Selecciona la plantilla deseada
3. Completa variables si es necesario
4. Envía

## Crear nuevas plantillas

1. Ve a **Centro de negocios de WhatsApp** (facebook.com/business)
2. Selecciona tu aplicación de WhatsApp
3. Ve a Plantillas de mensajes
4. Crea nueva plantilla
5. Define categoría (Confirmación, Información, Marketing)
6. Escribe el mensaje
7. Agrega botones si necesario
8. Envía para aprobación

Nota: La aprobación puede tardar minutos u horas.

## Variables en plantillas

Usa {{variable}} para personalizar:

- {{nombre}}: Nombre del contacto
- {{producto}}: Nombre del producto
- {{fecha}}: Fecha de entrega
- {{numero_pedido}}: Número de orden

Ejemplo: "Hola {{nombre}}, tu pedido {{numero_pedido}} será entregado el {{fecha}}."`,
    },
    {
      slug: 'analizar-metricas',
      title: 'Analítica y reportes',
      excerpt: 'Analiza el rendimiento de tu operación con dashboards y reportes.',
      sortOrder: 7,
      audience: 'non_technical' as const,
      isFeatured: false,
      contentMd: `# Analítica y reportes

## Dashboard analítico

El dashboard te muestra las métricas clave de tu operación en tiempo real.

### Métricas principales

**Conversaciones**
- Total de conversaciones
- Conversaciones nuevas
- Tasa de respuesta
- Tiempo promedio de respuesta

**Equipo**
- Conversaciones por agente
- Tiempo de resolución
- Satisfacción del cliente
- Productividad

**Funnel comercial**
- Prospecto → Calificado → Negociación → Cerrado
- Tasa de conversión por etapa
- Valor promedio por etapa

## Filtros y segmentación

### Filtrar por período

1. En la esquina superior derecha, selecciona el rango de fechas
2. Opciones: Hoy, Esta semana, Este mes, Personalizado

### Filtrar por equipo

1. Usa el filtro "Equipo" para ver métricas de:
   - Un agente específico
   - Un departamento
   - Todos

### Filtrar por instancia

1. Si tienes múltiples números de WhatsApp
2. Selecciona cuál analizar

## Métricas por agente

1. Ve a **Analítica > Por agente**
2. Compara el rendimiento de tu equipo
3. Identifica fortalezas y áreas de mejora

## Heatmap de tráfico

1. Ve a **Analítica > Tráfico**
2. Visualiza cuándo tienes más conversaciones
3. Usa esta información para:
   - Planificar horarios
   - Distribuir carga de trabajo
   - Programar campañas

## Exportar reportes

1. En cualquier sección de analítica, haz clic en "Exportar"
2. Selecciona formato (PDF, Excel)
3. El archivo se descargará automáticamente

## Mejor práctica

Revisa tus métricas regularmente (diaria, semanal, mensual) para:
- Identificar tendencias
- Reconocer a top performers
- Ajustar estrategias
- Establecer objetivos realistas`,
    },
  ],
};

async function seedDocs() {
  try {
    // Check if docs already exist
    const existingCategory = await db.query.docsCategories.findFirst({
      where: (cat, { eq }) => eq(cat.slug, DOCS_CONTENT.category.slug),
    });

    if (existingCategory) {
      console.log('ℹ️  Documentación ya existe en la base de datos.');
      return;
    }

    // Create category
    const [category] = await db
      .insert(docsCategories)
      .values({
        slug: DOCS_CONTENT.category.slug,
        name: DOCS_CONTENT.category.name,
        description: DOCS_CONTENT.category.description,
        icon: DOCS_CONTENT.category.icon,
        sortOrder: DOCS_CONTENT.category.sortOrder,
        isPublished: true,
      })
      .returning();

    console.log('✅ Categoría de documentación creada:', category.name);

    // Create articles
    const articles = await db
      .insert(docsArticles)
      .values(
        DOCS_CONTENT.articles.map((article) => ({
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          contentMd: article.contentMd,
          contentJson: null,
          categoryId: category.id,
          audience: article.audience,
          isFeatured: article.isFeatured,
          sortOrder: article.sortOrder,
          isPublished: true,
        })),
      )
      .returning();

    console.log(`✅ ${articles.length} artículos de documentación creados:`);
    articles.forEach((article) => {
      console.log(`   - ${article.title}`);
    });
  } catch (error) {
    console.error('❌ Error en seed de documentación:', error);
    throw error;
  }
}

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values([
      {
        email: email,
        passwordHash: passwordHash,
        role: "admin",
      },
    ])
    .returning();

  console.log('✅ Initial Admin user created.');

  const [team] = await db
    .insert(teams)
    .values({
      name: 'Admin Team',
    })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role: 'owner',
  });

  console.log('✅ Admin team created and linked.');

  // Seed documentation
  console.log('\n📚 Iniciando seeding de documentación...');
  await seedDocs();
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });