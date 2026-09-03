/**
 * Siembra la sección de Ayuda: las categorías y el artículo del Centro de Comandos.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-docs-command-center.mts
 *
 * Es idempotente: se puede correr las veces que haga falta. Actualiza por slug.
 *
 * Por qué siembra también las seis categorías "de siempre": `/docs` muestra las
 * categorías de la base **o**, si no hay ninguna, una lista fija escrita en el
 * componente. No es una mezcla. Insertar una sola categoría dejaría la portada
 * de Ayuda con una tarjeta en vez de siete. Los nombres son idénticos a los de
 * la lista fija para que el ícono y la descripción de respaldo sigan calzando.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { docsArticles, docsCategories } from '@/lib/db/schema';

type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
};

const CATEGORIES: CategorySeed[] = [
  {
    slug: 'centro-de-comandos',
    name: 'Centro de Comandos e IA',
    description: 'Cómo operar el día desde una sola bandeja, y cómo pedírselo a la IA por los conectores.',
    icon: 'Bot',
    sortOrder: 0,
  },
  { slug: 'primeros-pasos', name: 'Primeros pasos', description: 'Todo lo necesario para dejar tu cuenta lista y funcionando.', icon: 'Zap', sortOrder: 1 },
  { slug: 'automatizacion-y-flujos', name: 'Automatización y flujos', description: 'Aprende a crear automatizaciones potentes para tu operación.', icon: 'Code', sortOrder: 2 },
  { slug: 'crm-y-contactos', name: 'CRM y contactos', description: 'Gestiona leads y clientes de forma ordenada y eficiente.', icon: 'Users', sortOrder: 3 },
  { slug: 'api-y-desarrollo', name: 'API y desarrollo', description: 'Documentación técnica de endpoints e integraciones.', icon: 'Book', sortOrder: 4 },
  { slug: 'resolucion-de-problemas', name: 'Resolución de problemas', description: 'Errores comunes y cómo solucionarlos rápidamente.', icon: 'Shield', sortOrder: 5 },
  { slug: 'buenas-practicas', name: 'Buenas prácticas', description: 'Recomendaciones para mejorar resultados y evitar bloqueos.', icon: 'MessageSquare', sortOrder: 6 },
];

const ARTICLE_SLUG = 'centro-de-comandos';
const ARTICLE_TITLE = 'Centro de comandos: cómo funciona y qué le podés pedir a la IA';
const ARTICLE_EXCERPT =
  'Una sola bandeja con todo lo que hay que atender hoy. Cómo se usa la pantalla, qué se actualizó y los pedidos que ya podés hacerle a la IA en tus palabras.';

const CONTENT = `El Centro de comandos es **una sola pantalla con todo lo que hay que atender hoy**, ya ordenado por urgencia. En vez de entrar a cinco apps para saber qué falta, entrás a una y la lista ya está armada.

Está en el menú, dentro del Escritorio, y junta seis cosas: **Conversaciones** sin responder, **Tareas** vencidas, **Membresías** por vencer, **Oportunidades** paradas, **Agenda** de lo que se viene y **Cobros y pagos** que están sin saldar.

La regla de oro de la pantalla es la que dice su propio subtítulo: *nada sale hasta que lo revisás.*

## Cómo funciona la pantalla

**1. Filtrás.** Arriba hay una fila de botones con el conteo real de cada tipo. Tocás "Conversaciones" y ves sólo eso.

**2. Elegís.** Cada fila tiene las acciones que se pueden hacer sobre ese pendiente: Responder, Marcar leído, Completar, Posponer o Avanzar etapa. Podés ir de a uno o usar "Seleccionar lo visible" para armar un lote.

**3. La respuesta ya viene redactada.** En las conversaciones aparecen borradores sugeridos. Si la IA del equipo está configurada, los escribe ella; si no, salen de tus respuestas rápidas y plantillas. También podés escribir el tuyo con "Escribir respuesta", y pulirlo con "Mejorar con IA".

**4. Revisás antes de ejecutar.** El botón "Revisar y ejecutar" abre una ventana que chequea permisos, resuelve a quién le va a llegar cada mensaje y te muestra el teléfono. Ahí tildás que lo leíste y recién entonces sale. Si algo va mal, hay un botón "Detener" que corta el lote a la mitad.

**5. Ves el resultado uno por uno.** Al final te dice qué salió, qué falló y por qué.

## Qué se actualizó

La novedad grande: **ahora la IA también ve esta bandeja**.

Antes, el Centro de comandos existía solamente como pantalla. Si le preguntabas a la IA por el conector "¿qué tengo pendiente hoy?", no tenía forma de saberlo: la bandeja no existía para ella. Podía leer contactos y mensajes sueltos, pero no la lista priorizada que arma el sistema.

Hoy la IA ve **la misma bandeja que ves vos**, con el mismo orden y los mismos permisos, y puede ejecutar lo que vos apruebes.

Lo que se sumó, en concreto:

- **Ver la bandeja del día** desde el conector, con el conteo real por tipo.
- **Pedir borradores** de respuesta para los pendientes que vos elijas.
- **Ejecutar lo aprobado**: responder, marcar leído, completar o posponer tareas, avanzar oportunidades de etapa.
- **Ver el Escritorio completo**: facturación, oportunidades ganadas y perdidas, contactos nuevos, cada uno comparado contra el período anterior.
- **Simular un mensaje programado** antes de crearlo, para ver a cuántos números llegaría, con qué texto y desde qué número saldría.
- **Guardar la ficha comercial** de un contacto (empresa, cargo, área, LinkedIn, puntaje, temperatura, VIP) y la de un cliente (rubro, sitio, empleados, facturación, ubicación, desde cuándo es cliente).
- **Ver las oportunidades paradas** al lado de los chats callados: son la misma pregunta, quién necesita un empujón.
- **Adjuntar imágenes a un documento**, para armar un informe entero sin salir del chat con la IA.

### Una sola cola para toda la IA

Antes había tres listas de "lo que falta hacer" y cada una se pedía distinto: la cola comercial, los prompts anotados en Tareas y esta bandeja. Una IA que abría sesión no sabía cuál pedir.

Ahora hay **una sola**: la IA pregunta una vez y recibe todo junto, ordenado por prioridad. Cada pendiente viene marcado con quién decide:

- **Listo** — ya lo aprobó una persona, o no le escribe a nadie de afuera. La IA lo resuelve sola.
- **Necesita tu OK** — hace falta criterio. La IA lo prepara y te lo muestra.

Las tres listas siguen existiendo por separado si querés trabajar sólo una.

### Más cosas que se pueden hacer de un clic

A las seis acciones de siempre (responder, marcar leído, completar, posponer, guardar detalle de IA y avanzar oportunidad) se sumaron siete:

- **Mover de etapa** en el CRM.
- **Etiquetar** — suma o quita etiquetas sin pisar las que ya tenía.
- **Asignar** el contacto a una persona o a un sector.
- **Nota interna** — queda en la conversación y **nunca** se le manda al cliente.
- **Crear tarea** ligada al contacto.
- **Renovar una membresía** — corre la fecha un período y, si se lo pedís, deja el ingreso asentado en el mismo movimiento.
- **Registrar un cobro o un pago** sobre un movimiento pendiente, entero o parcial.

Están tanto en la pantalla como por la IA, con los mismos permisos y el mismo paso de revisión.

### La plata, con sus propios recaudos

Las dos acciones que mueven dinero tienen protecciones que no dependen de que nadie se acuerde:

- **Repetir no cobra dos veces.** Si el lote se corta por la mitad y lo reintentás, el cobro que ya entró no se duplica.
- **Renovar no puede acortar.** Una fecha que no sea posterior a la vigente se rechaza: eso no es renovar.
- **Renovar y facturar son dos permisos distintos.** Correr la fecha necesita permiso de Membresías; dejar además el asiento de ingreso necesita también el de Finanzas.
- **Un cobro parcial es lo normal.** La acción propone el saldo pendiente completo, pero el importe se edita antes de aplicar. Cuando los pagos cubren el total, el movimiento pasa solo a "pagado".
- **Las monedas nunca se suman entre sí.** Cada importe viaja con la suya.

Y un cambio que no se ve pero conviene saber: **las lecturas ahora respetan los permisos**. Antes, el conector leía cualquier dato del equipo con sólo estar conectado. Ahora cada persona ve a través de la IA exactamente lo mismo que vería entrando a la app: ni más, ni menos.

## Los frenos que no se aflojan

Esto va acá adelante y no en la letra chica, porque es lo que hace que se pueda usar tranquilo.

- **La IA no manda nada sin tu OK.** El modo por defecto es simulación: te muestra a quién le llegaría y con qué texto, y ahí se detiene.
- **Un mensaje por vez.** No puede disparar veinte envíos de una. Si algo sale mal, se corta ahí.
- **El destinatario lo decide el servidor.** La IA nunca elige un número de teléfono: pide "respondele a este chat" y el sistema resuelve a quién corresponde, dentro de lo que esa persona tiene permitido ver.
- **Repetir no duplica.** Si el pedido se corta por el medio y lo repetís, el mensaje no sale dos veces.
- **Un envío masivo pide confirmación aparte.** Más de diez destinatarios exige que confirmes explícitamente después de ver la lista.

## Qué le podés pedir a la IA

Escribilo tal cual, como le hablarías a una persona. No hay comandos que aprender ni nombres técnicos que memorizar.

### Para arrancar el día

- "Mostrame la bandeja del Centro de comandos y decime qué es lo más urgente."
- "¿Cuántas conversaciones están esperando una respuesta mía?"
- "Dame sólo las tareas vencidas y las membresías que vencen esta semana."
- "¿Qué tengo en la agenda de acá al viernes?"
- "Resumime el escritorio de los últimos tres meses: facturación, oportunidades y contactos nuevos."

### Para preparar respuestas sin mandarlas

- "Para los cinco chats que llevan más días esperando, preparame un borrador de respuesta y mostrámelos antes de enviar nada."
- "Escribile a este cliente avisándole que su membresía vence el viernes, pero no lo mandes: quiero leerlo primero."
- "Simulá qué pasaría si mando esto: ¿a quién le llega y qué dice exactamente?"
- "Ese borrador me quedó largo, hacelo más corto y más amable."

### Para ver todo el trabajo pendiente de una

- "¿Qué trabajo hay pendiente en todo el sistema? Ordenámelo por prioridad."
- "Mostrame sólo lo que podés resolver sin preguntarme."
- "¿Qué cosas necesitan mi aprobación antes de que sigas?"

### Para ejecutar lo que ya aprobaste

- "Dale, mandá esa respuesta."
- "Marcá como leídos los chats que ya contesté."
- "Completá la tarea de seguimiento de Hernán y posponé la de la propuesta una semana."
- "Avanzá la oportunidad de Acme a Negociación."
- "Mové este contacto a la etapa Propuesta y etiquetalo como Urgente."
- "Asignale este cliente a Martín."
- "Dejale una nota interna diciendo que pidió factura A. Que no le llegue a él."
- "Creame una tarea para volver a llamarlo el jueves."
- "Renovale la membresía un mes más y dejá el cobro registrado."
- "Registrá el cobro de la factura de Martín, entró completa hoy por transferencia."
- "De ese cobro entró la mitad: registrá sólo esa parte."

### Para la plata

- "¿Qué cobros tengo pendientes y hace cuánto?"
- "¿Qué membresías vencen este mes y cuáles ya están vencidas?"
- "Renovale la membresía a estos tres clientes y mostrame primero a quiénes y hasta cuándo."
- "Registrá el pago del proveedor de hosting, salió hoy de la cuenta principal."

### Para el CRM y las ventas

- "Actualizá la ficha de este contacto: empresa Acme, cargo Gerente de Compras, marcalo como VIP y ponele temperatura caliente."
- "¿Qué oportunidades están paradas hace más de quince días y de quién son?"
- "Mostrame el embudo completo: cuántos contactos hay por etapa y cuánto suman las oportunidades abiertas."
- "Cargá los datos de la empresa de este cliente: rubro tecnología, sitio acme.com, cincuenta empleados."
- "¿A quién le estamos dejando enfriar? Dame los que no tocamos hace una semana."

### Para mensajes programados

- "Preparame un mensaje programado para el lunes a las 9 para esta lista de clientes, pero simulalo primero: quiero ver a cuántos les llega."
- "¿Desde qué número saldría ese programado?"

### Para informes y documentos

- "Armá un documento con el resumen del mes y adjuntale esta captura."
- "Buscá en los documentos qué dice el procedimiento de renovación y resumímelo."

## Ojo, que no es lo mismo

En el sistema hay tres cosas parecidas y conviene no mezclarlas:

- **El Centro de comandos** (esto) es tu bandeja del día, con los cinco tipos de pendiente mezclados y priorizados.
- **La Cola del Command Center Comercial** es otra cosa: vive en la app de ventas y sirve para clasificar conversaciones y aprobar mensajes comerciales en tanda.
- **Tareas** es el tablero completo, con sus espacios, proyectos y columnas. Acá sólo aparecen las tareas **vencidas**, como uno de los cinco tipos.

## Preguntas frecuentes

**¿Puede mandarle un mensaje a un cliente sin que yo me entere?**
No. El modo por defecto simula y se detiene. Para que salga un mensaje hace falta una confirmación explícita, y sale de a uno.

**¿Ve las conversaciones de todo el equipo?**
Ve lo que ves vos. Si tenés la visibilidad limitada a tus chats asignados o a tu sector, la IA hereda esa misma limitación.

**Me dice que no puede leer algo. ¿Por qué?**
Casi siempre porque la app correspondiente está desactivada para el equipo, o porque tu usuario no tiene ese permiso. El mensaje aclara cuál de las dos cosas es.

**¿Y si le pido lo mismo dos veces por las dudas?**
No pasa nada. Los envíos están protegidos: el mismo pedido repetido no sale duplicado.

**La bandeja me aparece vacía.**
Es buena noticia: quiere decir que no hay nada pendiente con los criterios de la lista. Cuando entre algo, aparece solo.

**¿Necesito aprender comandos?**
No. Se le habla normal. Los ejemplos de arriba son literalmente lo que podés escribir.`;

async function main() {
  for (const category of CATEGORIES) {
    const [existing] = await db
      .select({ id: docsCategories.id })
      .from(docsCategories)
      .where(eq(docsCategories.slug, category.slug))
      .limit(1);

    if (existing) {
      await db
        .update(docsCategories)
        .set({ ...category, isPublished: true, updatedAt: new Date() })
        .where(eq(docsCategories.id, existing.id));
      console.log(`= categoría ${category.slug}`);
    } else {
      await db.insert(docsCategories).values({ ...category, isPublished: true });
      console.log(`+ categoría ${category.slug}`);
    }
  }

  const [target] = await db
    .select({ id: docsCategories.id })
    .from(docsCategories)
    .where(eq(docsCategories.slug, 'centro-de-comandos'))
    .limit(1);
  if (!target) throw new Error('No se creó la categoría del Centro de Comandos.');

  const values = {
    slug: ARTICLE_SLUG,
    title: ARTICLE_TITLE,
    excerpt: ARTICLE_EXCERPT,
    contentMd: CONTENT,
    categoryId: target.id,
    audience: 'mixed' as const,
    isPublished: true,
    isFeatured: true,
    sortOrder: 0,
  };

  const [existingArticle] = await db
    .select({ id: docsArticles.id })
    .from(docsArticles)
    .where(eq(docsArticles.slug, ARTICLE_SLUG))
    .limit(1);

  if (existingArticle) {
    await db.update(docsArticles).set({ ...values, updatedAt: new Date() }).where(eq(docsArticles.id, existingArticle.id));
    console.log(`= artículo ${ARTICLE_SLUG}`);
  } else {
    await db.insert(docsArticles).values(values);
    console.log(`+ artículo ${ARTICLE_SLUG}`);
  }

  console.log('\nListo: /es/docs/centro-de-comandos');
}

await main();
process.exit(0);
