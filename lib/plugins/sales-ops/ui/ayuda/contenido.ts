import type { Vista } from '../components/vistas';

/**
 * Contenido de la Ayuda, separado del render: es texto que cambia cuando
 * cambia una pantalla, y conviene que se edite sin tocar JSX.
 */

export type Tema = {
  titulo: string;
  /** En una frase, para alguien que entra por primera vez. */
  enUnaFrase: string;
  queEs: string;
  cuando: string;
  /** Un primer uso, paso a paso, para probar la vista en cinco minutos. */
  primerUso: string[];
  comoSeUsa: string[];
  /** Situaciones reales y qué hacer en cada una. */
  ejemplos: Array<{ situacion: string; queHacer: string }>;
  reglas: string[];
  conectores: string[];
  verTambien: Vista[];
};

export const TEMAS: Partial<Record<Vista, Tema>> = {
  hoy: {
    enUnaFrase: 'Lo primero que se mira cada mañana.',
    titulo: 'Hoy',
    queEs: 'El tablero del día: la plata que falta cobrar, cómo va la auditoría de la base, la siguiente mejor acción y el Muro con lo que hicieron los conectores.',
    cuando: 'Al empezar el día y cada vez que se vuelve del celular: en un minuto dice qué hay que hacer primero.',
    comoSeUsa: [
      'Panel: los números del día (plata pendiente, auditados, distribución por etapa). Un anillo muestra cuánto de la base ya fue auditado.',
      'Acciones: la siguiente mejor acción calculada por prioridad (probabilidad de recuperar × valor × velocidad). Se abre la ficha desde ahí.',
      'Muro: publicaciones de lo que hizo cada conector, con el modelo como titular y la persona que lo pidió abajo.',
    ],
    primerUso: [
      'Abrí Hoy y mirá el anillo de auditoría: dice qué parte de la base ya está clasificada.',
      'Pasá a la pestaña Acciones y abrí la primera: es la ficha del contacto con más chances de recuperarse hoy.',
      'Volvé al Muro al final del día para ver qué hicieron los conectores mientras no mirabas.',
    ],
    ejemplos: [
      { situacion: 'Hay 6 pagos pendientes y una demo por entregar.', queHacer: 'Primero Dinero (los pagos), después Producción (la demo). Hoy sólo te dice por dónde empezar.' },
      { situacion: 'El Muro muestra 40 publicaciones de un conector.', queHacer: 'Es normal después de una tanda de clasificación; cada publicación tiene quién la pidió. Si no reconocés el pedido, mirá Cola › En revisión.' },
    ],
    reglas: ['Nada se ejecuta desde Hoy: es lectura. Lo que se decide se hace en la Cola o en la ficha.'],
    conectores: ['El Muro se llena con whatspro_sales_prompt_result y whatspro_sales_queue_result: si un conector no cierra su corrida, no aparece.'],
    verTambien: ['cola', 'dinero', 'respuestas'],
  },
  focus: {
    enUnaFrase: 'Trabajar de a un cliente, contra reloj.',
    titulo: 'Focus',
    queEs: 'Una pantalla completa donde se procesa un cliente por vez en bloques de 25 minutos. Todo lo que hace falta para decidir está a la vista: el resumen con el radar y las señales a la izquierda, los mensajes programados y el hilo con la IA en el centro, y el chat a la derecha.',
    cuando: 'Cuando hay una tanda que hacer y no querés estar saltando entre la lista, la ficha, Programados y la Cola. Las listas son para elegir a quién; Focus es para hacerlo.',
    comoSeUsa: [
      'Se entra con el botón Focus de la barra. Arranca solo un bloque de 25 minutos; al terminar ofrece otro, un descanso de 5, o salir.',
      'Abajo se escribe qué hacer con este cliente y se elige uno de los dos botones. Ejecutar ahora lo resuelve la IA del equipo y se queda en la pantalla con el borrador arriba; Listo para conector lo encola y pasa al siguiente.',
      'Los filtros (arriba a la derecha) eligen qué tipos entran a la ronda y en qué orden: prioridad, más viejo, más nuevo o grado.',
      'Cuando se vacía una etapa hay confeti y se pasa a la siguiente. La barra de arriba dice cuántos van y cuántos faltan.',
    ],
    primerUso: [
      'Entrá con el botón Focus estando en Dinero.',
      'Leé la acción recomendada arriba a la izquierda y escribí abajo, por ejemplo, "recordale el pago en dos renglones, tono amable".',
      'Apretá Ejecutar ahora: el texto aparece arriba en el editor del programado. Corregilo, poné la fecha y guardá.',
      'Apretá Listo para conector para lo que la IA no puede hacer sola. La pantalla pasa al siguiente cliente.',
    ],
    ejemplos: [
      { situacion: 'El pedido es "mandale esto ahora".', queHacer: 'Ejecutar ahora avisa que necesita un conector: el servidor redacta, no envía. Se aprieta Listo para conector.' },
      { situacion: 'La IA del equipo se quedó sin cuota.', queHacer: 'Aparece el motivo arriba del prompt y queda resaltado Listo para conector. El trabajo no se pierde: queda encolado.' },
      { situacion: 'Un pedido anterior volvió bloqueado.', queHacer: 'Aparece primero en el Chat IA, con el formulario que armó el conector. Se contesta ahí y la corrida vuelve a la cola.' },
      { situacion: 'La clasificación detectó que la etapa del embudo está mal.', queHacer: 'En la ficha, el bloque «CRM a corregir» dice qué cambiaría y lo aplica de un botón. Focus no toca el CRM: eso se hace desde la ficha.' },
    ],
    reglas: [
      'Ejecutar ahora NUNCA envía un WhatsApp: redacta y deja programado. Un envío sigue pasando por proponer, aprobar y ejecutar.',
      'Focus no toca el CRM: ni etapas, ni etiquetas, ni campos.',
      'Todo lo que devuelve la IA es un borrador hasta que una persona lo guarda.',
      'Los contadores de la sesión son de la sesión: las métricas del equipo viven en Métricas.',
    ],
    conectores: ['Lo que se deja acá sale por whatspro_sales_work_queue como un run_prompt, igual que lo que se encola desde el Prompt Studio.'],
    verTambien: ['dinero', 'cola', 'programados'],
  },
  dinero: {
    enUnaFrase: 'Quién está a un paso de pagar.',
    titulo: 'Dinero',
    queEs: 'Los chats donde hay plata en juego: pidieron precio, dijeron que pagaban, quedaron en pagar o tienen un pago pendiente.',
    cuando: 'Todos los días, antes que cualquier campaña: es lo más cerca de caja que hay.',
    comoSeUsa: [
      'Filtrá por etapa (G8 a G10) y por seguimiento: "sin tocar" son los que nadie contactó después de la auditoría.',
      'Desde cada fila se abre la ficha; ahí se propone un envío, se registra el cobro o se marca como cliente.',
      'Seleccionando varias filas se arma un lote con un texto común que resuelve {{nombre}}, {{plan}} y {{precio}} por contacto.',
    ],
    primerUso: [
      'Filtrá por G9 (dijo que pagaba) y G10 (cierre bloqueado).',
      'Abrí la ficha del primero y leé el bloque comercial: precio cotizado, moneda, último mensaje.',
      'Proponé un mensaje corto que pida el comprobante o destrabe el pago. Aprobalo en la Cola.',
    ],
    ejemplos: [
      { situacion: 'Dijo «te transfiero mañana» hace 5 días.', queHacer: 'Está en G9. Un mensaje amable pidiendo el comprobante; si responde con el pago, registralo desde la ficha (queda pendiente hasta confirmar).' },
      { situacion: 'Ya pagó pero no figura como cliente.', queHacer: 'Ficha › Registrar como cliente. A partir de ahí no entra en lotes de venta.' },
    ],
    reglas: ['Un cobro se registra desde la ficha y nace pendiente hasta que una persona lo confirma.', 'Los clientes ya existentes no entran en lotes de envío.'],
    conectores: ['whatspro_customers_pending_payment y whatspro_sales_pending listan lo mismo que esta vista.'],
    verTambien: ['oportunidades', 'cola', 'clientes'],
  },
  oportunidades: {
    enUnaFrase: 'Los que están decidiendo.',
    titulo: 'Oportunidades',
    queEs: 'Los que están por decidir: pidieron info, dudaron, pusieron una objeción o quedaron en avisar.',
    cuando: 'Después de Dinero. Acá la acción suele ser un mensaje que destrabe la objeción, no un cobro.',
    comoSeUsa: [
      'Mirá la objeción y la necesidad detectadas en la fila antes de escribir.',
      'Proponé un mensaje desde la ficha o armá un lote por etapa; los textos con A/B se miden en Experimentos.',
      'Si respondió después del análisis, aparece como "con seguimiento": no le escribas encima.',
    ],
    primerUso: [
      'Ordená por prioridad y filtrá «sin tocar».',
      'Leé la objeción de la fila (precio, tiempo, confianza) antes de abrir la ficha.',
      'Proponé un mensaje que responda esa objeción, no un saludo genérico.',
    ],
    ejemplos: [
      { situacion: 'Objeción: precio, necesidad: tienda online.', queHacer: 'Ofrecé el plan base con el precio en su moneda y una demo; el conector puede preparar la demo desde la ficha.' },
      { situacion: 'Pidió info y no volvió a escribir hace 3 días.', queHacer: 'Un solo mensaje de seguimiento con una pregunta concreta. Si no responde, pasa a Barrido solo.' },
    ],
    reglas: ['Un chat con automatización viva no entra en lotes: el bot ya lo está trabajando.'],
    conectores: ['whatspro_sales_dossier da el expediente completo del chat antes de redactar.'],
    verTambien: ['dinero', 'barrido', 'prompts'],
  },
  barrido: {
    enUnaFrase: 'Reabrir conversaciones frías sin molestar.',
    titulo: 'Barrido',
    queEs: 'Los que se enfriaron: entraron, preguntaron o mostraron interés y se cortó.',
    cuando: 'Una vez por semana, con un texto de reapertura, o cuando hay una promoción.',
    comoSeUsa: [
      'Filtrá por días de silencio y por cantidad de impactos previos: a quien ya le escribimos tres veces sin respuesta no se le insiste.',
      'Armá el lote con "Nuevo lote", simulá primero (dry run) y mirá quiénes quedan afuera y por qué.',
    ],
    primerUso: [
      'Nuevo lote › tipo Mensaje › gates G1 a G3 › mínimo 14 días de silencio › máximo 2 impactos.',
      'Escribí el texto con {{nombre}} y simulá: mirá los excluidos y por qué.',
      'Creá el lote y aprobalo en la Cola. Ejecutá de a tandas.',
    ],
    ejemplos: [
      { situacion: 'Quiero mandar una promo a todos los que preguntaron en agosto.', queHacer: 'Lote por antigüedad 7 a 30 días con el texto de la promo, A/B si tenés dos versiones. Los que ya son clientes no entran.' },
      { situacion: 'Un contacto respondió después de que aprobé el lote.', queHacer: 'El sistema lo saltea solo y lo manda a Respuestas: el texto aprobado ya no aplica.' },
    ],
    reglas: ['Enfriamiento de envíos: si recibió algo nuestro hace menos del tiempo configurado, no entra.'],
    conectores: ['whatspro_sales_queue_propose con gates y filtros hace exactamente lo mismo que "Nuevo lote".'],
    verTambien: ['limpieza', 'cola', 'experimentos'],
  },
  limpieza: {
    enUnaFrase: 'Lo que sale del circuito y lo que ya se hizo.',
    titulo: 'Limpieza',
    queEs: 'Lo que sale del circuito comercial: descartes (GX y pre-descarte), chats que no son ventas (personal, equipo, otros) y los contactos ejecutados.',
    cuando: 'Cada tanto, para que las listas de trabajo no arrastren ruido; y para ver a quién ya le salió algo.',
    comoSeUsa: [
      'Descartes: se revisan y se pueden devolver al circuito desde la ficha.',
      'Personal / Equipo / Otros: chats que el sistema ignora por completo; desmarcarlos los devuelve a su lista.',
      'Ejecutados: a quién ya le salió una acción. Al ejecutarse, su análisis queda viejo y el clasificador los vuelve a auditar; si vuelven a merecer una acción, entran solos.',
    ],
    primerUso: [
      'Abrí Ejecutados: son los que ya recibieron una acción.',
      'Marcá como Personal o Equipo los chats que no son ventas: desaparecen de todas las listas.',
      'Revisá Descartes una vez por mes: alguno puede volver.',
    ],
    ejemplos: [
      { situacion: 'Mi hermana está en la lista de Barrido.', queHacer: 'Marcala como Personal desde Limpieza. No vuelve a aparecer en ninguna lista ni la clasifica un conector.' },
      { situacion: 'Un ejecutado respondió con interés.', queHacer: 'El clasificador lo vuelve a auditar; si merece acción, aparece en Oportunidades o Dinero solo.' },
    ],
    reglas: ['Descarte definitivo lo aprueba una persona.'],
    conectores: ['La exclusión de chats se hace con la misma API que usa la vista.'],
    verTambien: ['barrido', 'todos'],
  },
  respuestas: {
    enUnaFrase: 'Alguien contestó: atenderlo ahora.',
    titulo: 'Respuestas',
    queEs: 'La bandeja del radar: cada contacto que contestó, con la señal detectada (quiere pagar, pregunta precio, pide que no le escriban, respondió un audio).',
    cuando: 'Varias veces por día. Cada tarjeta es alguien esperando.',
    comoSeUsa: [
      'Chat: contestar en un chat flotante sin salir de la bandeja.',
      'Prompt: dejar un pedido en la cola para que un conector redacte, resuma o prepare algo sobre ese chat. Se pueden apilar varios.',
      'Flujo: disparar una automatización sobre el chat. Le llega al cliente ahora mismo.',
      'Atendido: cierra todas las señales del contacto de una vez.',
    ],
    primerUso: [
      'Mirá la señal de la tarjeta (urgente arriba).',
      'Chat: contestá ahí mismo. Prompt: pedile al conector que redacte o resuma. Flujo: disparale una automatización.',
      'Cuando terminaste, Atendido: la tarjeta se va.',
    ],
    ejemplos: [
      { situacion: 'Señal «quiere pagar».', queHacer: 'Abrí el chat flotante y mandá el link o los datos de pago. Después registrá el cobro en la ficha.' },
      { situacion: 'Señal «pide que no le escriban».', queHacer: 'Atendido y marcá GX (perdido) desde la ficha: no vuelve a entrar en lotes.' },
      { situacion: 'Contestó con un audio largo.', queHacer: 'Vista Audios: transcribilo ahora o pedile contexto a un conector; después contestá.' },
    ],
    reglas: ['Quien respondió sale automáticamente de cualquier lote aprobado: el texto aprobado contestaba a otra cosa.'],
    conectores: ['whatspro_sales_signals_list y whatspro_sales_signal_write son la bandeja por MCP.'],
    verTambien: ['audios', 'cola', 'hoy'],
  },
  cola: {
    enUnaFrase: 'Nada sale sin pasar por acá.',
    titulo: 'Cola',
    queEs: 'Todo lo que se puso a hacer, por momento: En revisión, En cola, Hechos y Descartados. Lotes, indicaciones, prompts y programados juntos, con filtro por tipo.',
    cuando: 'Después de proponer algo y antes de que salga: acá se decide.',
    comoSeUsa: [
      'En revisión: se lee el texto completo, se corrige ahí mismo y se aprueba o se descarta. Un lote se revisa fila por fila y se pueden quitar contactos.',
      'En cola: lo aprobado. "Ejecutar" lo manda desde el servidor; si no, lo toma un conector.',
      'Hechos: lo que salió o lo que un conector cerró. Lo de más de dos días se archiva.',
      'Descartados: rechazado o cancelado; desde ahí se elimina por completo o se vacía todo.',
    ],
    primerUso: [
      'Abrí En revisión: leé el primer ítem entero.',
      'Corregí lo que haga falta con Editar; después Aprobar (o Descartar).',
      'Pasá a En cola y Ejecutar, o dejá que lo tome un conector. Al final, Hechos.',
    ],
    ejemplos: [
      { situacion: 'Un lote de 20 mensajes tiene 2 con el precio mal.', queHacer: 'Abrí el lote, corregí esas 2 filas con el lápiz o quitalas con la X, y aprobá el resto.' },
      { situacion: 'Un conector propuso un prompt que no entiendo.', queHacer: 'Está en En revisión: leelo completo; si no sirve, Descartar. No sale nada sin tu aprobación.' },
      { situacion: 'Hechos está lleno de cosas viejas.', queHacer: 'Lo de más de dos días se archiva solo; con el chip Archivados se ve todo.' },
    ],
    reglas: [
      'Proponer no envía. Aprobar no envía. Sólo Ejecutar le llega al cliente.',
      'Un envío aprobado por contacto a la vez.',
      'Lo que propone un conector espera aprobación.',
      'Un conector SÍ puede corregir el CRM del contacto que está trabajando (etapa, etiquetas, campos), de a uno y sólo lo que contradice ese chat. En lote, no: eso lo pide una persona.',
      'Automatizaciones y registro de clientes siguen siendo de las personas.',
    ],
    conectores: [
      'whatspro_sales_work_queue entrega sólo lo aprobado. Para editar, quitar o rechazar: whatspro_sales_queue_edit / _remove / _reject, y whatspro_sales_run_manage para las corridas.',
      'Para corregir el CRM: whatspro_change_crm_stage, whatspro_set_contact_tags y whatspro_set_custom_fields. Todo queda auditado con el nombre del conector.',
    ],
    verTambien: ['programados', 'audios', 'prompts'],
  },
  audios: {
    enUnaFrase: 'Escuchar antes de escribir.',
    titulo: 'Audios',
    queEs: 'Las notas de voz de los chats con su transcripción y análisis, y las acciones a mano cuando el banco de IA no llega.',
    cuando: 'Antes de aprobar un lote a chats en cola: un audio sin transcribir puede cambiar el texto.',
    comoSeUsa: [
      'Escuchá el audio en la tarjeta; "Sólo chats en cola" muestra primero los que tienen algo por salir.',
      'Transcribir ahora / Analizar usan el banco de keys del equipo. Encolar con prioridad lo deja primero para el worker.',
      'Pedir contexto a un conector deja un pedido aprobado en la cola: el conector escucha, lee el chat y guarda la ficha.',
      'La ficha se corrige a mano y se guarda: es lo que ven el radar y el expediente.',
    ],
    primerUso: [
      'Filtrá «Sin transcribir» y elegí un contacto en el selector.',
      'Escuchá el audio; si importa, Transcribir ahora y Analizar.',
      'Corregí la ficha si la IA entendió mal y Guardar.',
    ],
    ejemplos: [
      { situacion: 'El banco de IA está sin cuota y hay 5 audios de un cliente caliente.', queHacer: 'Pedir contexto a un conector: lo escucha, lee el chat y guarda la ficha; queda en la cola como pedido aprobado.' },
      { situacion: 'Un contacto manda audios personales todos los días.', queHacer: 'Nunca transcribir: sale de la lista y de la cola; lo ya transcripto queda.' },
      { situacion: 'Hay 30 audios en cola de un chat que ya se cerró.', queHacer: 'Quitar de la cola (ícono de papelera) audio por audio, o Nunca transcribir para el contacto.' },
    ],
    reglas: ['Ningún modelo de Claude escucha audio por el conector: el servidor transcribe una vez y manda texto.'],
    conectores: ['whatspro_audio_queue_takeover, whatspro_transcribe_media, whatspro_audio_analyze y whatspro_audio_insight_write.'],
    verTambien: ['respuestas', 'cola'],
  },
  programados: {
    enUnaFrase: 'Lo que sale solo, a la vista.',
    titulo: 'Programados',
    queEs: 'Lo que va a salir solo a una hora: mensajes únicos y recurrentes, vistos por lista, día, semana, mapa de horarios y calendario.',
    cuando: 'Para mirar la carga de la semana y correr algo de día antes de que salga.',
    comoSeUsa: [
      'Semana: cada programado es una línea con la hora; se abre en un modal para editar y se arrastra a otro día (misma hora). En el celular, "Mover a".',
      'Un programado con prompt deja de ser programado: pasa a la cola como pedido y el conector decide si el resultado es un mensaje, una demo o un proyecto.',
    ],
    primerUso: [
      'Semana: mirá qué sale cada día y a qué hora.',
      'Tocá uno para editarlo en el modal; arrastralo a otro día si hace falta.',
      'Si querés que lo escriba la IA, ponele un prompt: pasa a la cola como pedido.',
    ],
    ejemplos: [
      { situacion: 'Mañana salen 12 mensajes a las 9.', queHacer: 'Arrastrá la mitad al jueves: misma hora, otro día.' },
      { situacion: 'Un programado dice «ofrecerle la demo».', queHacer: 'Eso no es un mensaje: al guardar el prompt pasa a la cola y el conector decide si prepara la demo o escribe.' },
    ],
    reglas: ['El horario de un recurrente se cambia en la app de Programados, no acá: es fácil romper una recurrencia sin querer.'],
    conectores: ['whatspro_manage_scheduled_message crea, edita y pausa programados.'],
    verTambien: ['cola', 'produccion'],
  },
  produccion: {
    enUnaFrase: 'Lo vendido, en marcha.',
    titulo: 'Producción',
    queEs: 'Lo vendido convertido en trabajo: demos y proyectos de cliente en Tareas OS con su avance, y la bitácora del Command Center.',
    cuando: 'Para quien produce, todos los días; para quien supervisa, para ver qué está en ejecución y qué corre con IA.',
    comoSeUsa: [
      'Demos: una tarea por pedido de demo, con la investigación del chat en las notas y el prompt para AAPP SPACE. Se marca el checklist a medida que avanza.',
      'Clientes: un proyecto por cliente (Por hacer › En curso › Hecho), vinculado al contacto.',
      'Command Center: la bitácora. "Documentar un paso" deja registro de decisiones y entregas.',
      'Todo se edita ahí mismo; "Abrir en Tareas OS" para lo que la vista no cubre.',
    ],
    primerUso: [
      'Demos: abrí la primera tarea y leé la investigación y el prompt.',
      'Marcá el checklist a medida que avanzás; el proyecto sube de porcentaje.',
      'Documentá un paso en Command Center cuando entregues.',
    ],
    ejemplos: [
      { situacion: 'Vendimos una tienda y hay que armarla.', queHacer: 'Ficha › Pedir demo web o proyecto; aparece acá con las tareas. Abrir en Tareas OS para el detalle.' },
      { situacion: 'Quiero saber qué demos están trabadas.', queHacer: 'Estado «En ejecución» con IA pendiente: el prompt está escrito pero nadie lo corrió.' },
    ],
    reglas: ['El avance sale del checklist y de la columna Hecho: si no se marca, no avanza.'],
    conectores: ['whatspro_sales_tareas_from_chat crea la demo o el proyecto con la misma lógica; whatspro_task_ai_prompt_status marca el estado de un prompt de tarea.'],
    verTambien: ['cola', 'clientes'],
  },
  todos: {
    enUnaFrase: 'La base entera, para buscar.',
    titulo: 'Todos',
    queEs: 'La base entera auditada, sin cortar por etapa, con todos los filtros.',
    cuando: 'Para buscar a alguien puntual o armar un corte que las otras listas no tienen.',
    comoSeUsa: ['Buscá por nombre, teléfono o texto; filtrá por etapa, responsable, objeción, antigüedad, seguimiento y cola.', 'El botón "Contactos y Clientes por grupos" abre el corte por sin procesar / auditados / con seguimiento y la lista de clientes y empresas.'],
    primerUso: [
      'Buscá por nombre o teléfono.',
      'Combiná filtros: etapa + antigüedad + seguimiento.',
      'Seleccioná varios y armá un lote.',
    ],
    ejemplos: [
      { situacion: '¿Le escribimos alguna vez a Juan?', queHacer: 'Buscá Juan: el ícono de la fila dice si tiene seguimiento o si ya le salió algo.' },
      { situacion: 'Necesito los G5 sin tocar de más de 30 días.', queHacer: 'Filtros: etapa G5, seguimiento «sin», antigüedad 30 a 90 días.' },
    ],
    reglas: [],
    conectores: ['whatspro_crm_search_contacts y whatspro_sales_pending son las búsquedas equivalentes.'],
    verTambien: ['clientes', 'limpieza'],
  },
  clientes: {
    enUnaFrase: 'Quiénes ya son clientes y qué tienen.',
    titulo: 'Contactos y Clientes',
    queEs: 'Los contactos por grupo de trabajo (sin procesar, auditados sin tocar, con seguimiento, todos) y los clientes y empresas con sus membresías, sitios, tiendas y dominios.',
    cuando: 'Para saber qué falta auditar y para administrar lo que ya es cliente.',
    comoSeUsa: ['Sin procesar: dejalos en cola y un conector los clasifica.', 'Clientes: visibilidad privada u oculta, links a sitios, tiendas y dominios de AAPP SPACE.'],
    primerUso: [
      'Pestaña Clientes: abrí uno y mirá membresías, sitios, tiendas y dominios.',
      'Pestaña Contactos: Sin procesar es lo que falta auditar.',
    ],
    ejemplos: [
      { situacion: 'Un cliente venció la membresía.', queHacer: 'Aparece en Dinero como pago pendiente; desde la ficha se registra la renovación.' },
      { situacion: 'No quiero que un cliente se vea en la lista general.', queHacer: 'Visibilidad privada u oculta desde la ficha del cliente.' },
    ],
    reglas: ['"Cliente" es una sola definición: el registro de Clientes. Etiquetas y campos viejos no cuentan.'],
    conectores: ['whatspro_customer_360, whatspro_register_customer, whatspro_manage_customer.'],
    verTambien: ['todos', 'dinero'],
  },
  prompts: {
    enUnaFrase: 'Las instrucciones que el equipo repite.',
    titulo: 'Prompt Studio',
    queEs: 'Las skills del equipo: prompts guardados con cómo se usan (rutina o puntual, con formulario, por API o por cola) y la actividad de cada corrida.',
    cuando: 'Cuando algo se pide más de dos veces igual: se convierte en skill para que todos usen el mismo discurso.',
    comoSeUsa: ['Crear, versionar, fijar y retirar skills. Lanzarlas sobre un chat o el equipo.', 'Actividad: en cola, sin cuota, otros fallos y hechas; cada falla dice qué pasó en castellano y ofrece reintentar o dejar en la cola.'],
    primerUso: [
      'Abrí una skill y mirá el texto y el formulario.',
      'Lanzala sobre un chat: elegí IA del equipo (rápido, sin tools) o cola (conector, con tools).',
      'Mirá la Actividad: si falló, reintentá o dejala en la cola.',
    ],
    ejemplos: [
      { situacion: 'Siempre pido lo mismo: «resumime el chat en 5 líneas».', queHacer: 'Creala como skill puntual; queda en la ficha con un clic.' },
      { situacion: 'Todos los lunes quiero el informe de la semana.', queHacer: 'Skill rutina sobre el equipo; un conector la corre y el resultado queda en Hechos.' },
    ],
    reglas: ['La IA del equipo (modo API) no tiene tools: redacta, resume, analiza. Lo que ejecuta va por la cola de conectores.'],
    conectores: ['whatspro_sales_prompts_list / _get / _render / _manage / _launch / _result y whatspro_sales_run_manage.'],
    verTambien: ['cola', 'experimentos'],
  },
  metricas: {
    enUnaFrase: 'Qué está funcionando.',
    titulo: 'Métricas',
    queEs: 'Recuperación por etapa, respuesta por texto, tiempo de cada paso y cuota de IA.',
    cuando: 'Semanalmente, para decidir qué texto y qué segmento siguen.',
    comoSeUsa: ['Comparar lotes y experimentos; mirar el embudo de auditoría.'],
    primerUso: [
      'Mirá recuperación por etapa y respuesta por texto.',
      'Compará dos lotes con el mismo segmento.',
    ],
    ejemplos: [
      { situacion: '¿Vale la pena seguir con el barrido de G1?', queHacer: 'Si la recuperación de G1 es menor al 2 % y la de G3 mayor al 8 %, el esfuerzo va a G3.' },
    ],
    reglas: [],
    conectores: ['whatspro_crm_funnel_snapshot y whatspro_metaads_report complementan.'],
    verTambien: ['experimentos', 'hoy'],
  },
  experimentos: {
    enUnaFrase: 'Dos textos, un veredicto.',
    titulo: 'Experimentos',
    queEs: 'Pruebas A/B de textos sobre un lote: quién recibió cada variante, quién respondió y quién se recuperó.',
    cuando: 'Cuando no está claro qué texto funciona. No para el día a día.',
    comoSeUsa: ['Se crea desde "Nuevo lote" con A/B activado, o desde el Prompt Studio.'],
    primerUso: [
      'Nuevo lote con A/B activado y dos textos.',
      'Esperá una semana y mirá respuesta y recuperación por variante.',
    ],
    ejemplos: [
      { situacion: 'No sé si conviene mencionar el precio.', queHacer: 'Variante A con precio, B sin precio, mismo segmento. Métricas dice cuál ganó.' },
    ],
    reglas: ['Un contacto recibe una sola variante.'],
    conectores: ['whatspro_sales_queue_propose con variant_split.'],
    verTambien: ['metricas', 'prompts'],
  },
};

export type Leccion = { titulo: string; parrafos: string[]; puntos?: string[]; ejemplo?: string; prompts?: string[] };

export const CURSO: Leccion[] = [
  {
    titulo: '1. Qué es un conector y qué cambia',
    parrafos: [
      'Un conector es un chat de IA (Claude, ChatGPT o Grok) enchufado a WhatsPro por MCP: además de conversar, puede usar las herramientas del equipo —leer chats, clasificar, proponer lotes, dejar programados, preparar demos— con tu usuario y tus permisos, sin sesión ni cookies.',
      'Los tres conectores hablan con el mismo servidor y ven las mismas herramientas. Lo que cambia entre ellos es el modelo y la interfaz, no lo que pueden hacer en WhatsPro.',
    ],
    prompts: [
      '"Mostrame qué herramientas de WhatsPro tenés disponibles y para qué sirve cada grupo."',
      '"Antes de hacer nada, decime con qué usuario y equipo estás conectado."',
    ],
  },
  {
    titulo: '2. Qué puede hacer cada interfaz',
    parrafos: ['Conviene pensarlo por capacidad, no por marca.'],
    puntos: [
      'Chat con conector (Claude.ai con el conector WhatsPro, ChatGPT con el conector, Grok): ejecuta herramientas. Sirve para trabajar la cola, clasificar, redactar y guardar. Es el modo normal de trabajo.',
      'Chat sin conector (ChatGPT común, Claude sin conector): sólo redacta. Útil para pulir un texto o pensar un discurso; lo que escriba hay que pegarlo a mano.',
      'Trabajo en equipo (Claude Cowork, ChatGPT Work): mismo conector, compartido entre varias personas; conviene que cada uno se conecte con su usuario para que la auditoría diga quién pidió qué.',
      'Agente con terminal (Claude Code, Codex): además del conector, toca el repositorio. Es para desarrollo de la plataforma, no para operar ventas.',
    ],
    prompts: [
      'Chat con conector: "Leé el chat 77060 y proponé un mensaje de seguimiento; no lo envíes, dejalo en la cola."',
      'Chat sin conector: "Mejorá este texto para WhatsApp, tono cercano, máximo 4 líneas: …"',
      'Agente con terminal: "Agregá una skill al Prompt Studio que resuma el chat en 5 líneas y desplegá."',
    ],
  },
  {
    titulo: '3. La rutina de un conector',
    parrafos: ['Todo conector empieza igual, y por eso se lo puede supervisar igual.'],
    puntos: [
      'Pedirle "qué hay para hacer": llama a whatspro_sales_work_queue y recibe lo que espera, con la cadena exacta de herramientas para cada cosa.',
      'Clasificar: lee el expediente (whatspro_sales_dossier), decide etapa y siguiente acción, y la guarda (whatspro_sales_classification_write).',
      'Ejecutar lo aprobado: una fila por vez, con dry_run primero, y reporta el resultado (whatspro_sales_queue_result).',
      'Correr prompts aprobados: hace lo que dice el texto y cierra con whatspro_sales_prompt_result contando qué hizo.',
      'Cerrar: si no cierra la corrida, para la interfaz no pasó nada.',
    ],
    ejemplo: 'Mirá whatspro_sales_work_queue y hacé el primer ítem. Antes de escribir en la base, contame qué vas a hacer.',
    prompts: [
      '"Mirá whatspro_sales_work_queue y contame qué hay para hacer, agrupado por tipo."',
      '"Tomá los 5 primeros ítems de clasificación y hacelos; al final, tabla con chat, etapa y siguiente acción."',
      '"Ejecutá la fila aprobada 133 con dry run, mostrame qué saldría y esperá mi ok."',
    ],
  },
  {
    titulo: '4. Las tres reglas transversales',
    parrafos: ['Son las mismas para personas y conectores; el servidor las hace cumplir.'],
    puntos: [
      'Leer antes de escribir: dossier, ficha o lista antes de proponer o guardar.',
      'Lo irreversible pide dry_run y después confirm: enviar, disparar, borrar.',
      'Una clave de idempotencia por operación irreversible: doble clic, reintento y F5 producen un solo mensaje.',
    ],
    prompts: [
      '"Antes de proponer el lote, leé el dossier de cada chat y decime cuáles descartarías y por qué."',
      '"Simulá primero (dry_run: true). Recién cuando te diga «confirmo», ejecutá."',
    ],
  },
  {
    titulo: '5. Qué no puede hacer',
    parrafos: [],
    puntos: [
      'No envía sin una fila aprobada. Lo que propone (lotes, prompts, pedidos que nacen de un programado) espera en revisión.',
      'No toca el CRM desde el flujo comercial: etapas, etiquetas y campos se cambian a mano o por acción aprobada.',
      'No cobra: ventas, membresías y pagos nacen pendientes hasta que una persona confirma.',
      'No escucha audio (ningún modelo de Claude por el conector): el servidor transcribe y le manda texto. Por eso existe la vista Audios.',
    ],
    prompts: [
      '"Dejá el mensaje propuesto en la cola; no lo envíes aunque parezca urgente."',
      '"Registrá la venta como pendiente; yo la confirmo cuando vea el pago."',
    ],
  },
  {
    titulo: '6. Cómo supervisar lo que corre con IA',
    parrafos: [],
    puntos: [
      'Cola › En revisión: todo lo que propuso un conector está ahí hasta que alguien lo aprueba o lo descarta. Se edita el texto antes de aprobar.',
      'Hoy › Muro: qué hizo cada conector, con el modelo y quién lo pidió.',
      'Prompt Studio › Actividad: corridas en cola, sin cuota, fallidas y hechas, con el motivo en castellano.',
      'Producción: tareas con IA pendiente, hecha o no aplica; el prompt se lee dentro de la tarea.',
      'Ficha › Historial: la línea de tiempo de cada chat, incluidas las acciones de conectores.',
    ],
    prompts: [
      '"Listame las corridas fallidas de hoy con el motivo en una línea cada una."',
      '"¿Qué tareas de Producción tienen prompt de IA pendiente? Mostrame título y proyecto."',
    ],
  },
  {
    titulo: '7. Pedidos que funcionan bien',
    parrafos: ['Cuanto más concreto el pedido, menos vueltas. Ejemplos para pegar en el chat del conector:'],
    puntos: [
      '"Clasificá los 10 chats sin análisis más recientes y contame en una tabla etapa, objeción y siguiente acción."',
      '"Armá un lote de reapertura para G3 con más de 14 días de silencio y menos de 3 impactos, dry run primero, y mostrame quién queda afuera y por qué."',
      '"Leé el chat 77060, escuchá el último audio y guardá la ficha con lo que pidió."',
      '"Prepará la demo web de este chat: investigación y prompt para AAPP SPACE, en el workspace Demos."',
      '"Armale el proyecto de cliente a Fe Em Deus con las tareas de alta: catálogo, dominio, capacitación."',
      '"Revisá la cola: quitá del lote a quien respondió hoy y corregí los textos que digan precio en pesos."',
    ],
  },
];

/** Curso práctico de WhatsPro: cada función de la plataforma, para cualquiera del equipo. */
export const WHATSPRO: Leccion[] = [
  {
    titulo: '1. Bandeja de chats',
    parrafos: ['Es el WhatsApp del equipo: todas las conversaciones de todas las líneas, en una sola pantalla, con quién la atiende, etiquetas y etapa del embudo. Desde el celular funciona como WhatsApp, con la lista a la izquierda y el chat a la derecha.'],
    puntos: ['Cada chat tiene contacto, etapa, etiquetas, agente asignado y notas internas (que el cliente no ve).', 'Se pueden enviar textos, audios, imágenes, documentos y plantillas; los mensajes marcados como internos quedan sólo para el equipo.', 'El contador de no leídos baja cuando alguien contesta, incluso desde el celular.'],
    ejemplo: 'Buscá un contacto por nombre o teléfono, abrí el chat, dejá una nota interna con lo que acordaste y asignalo a quien lo va a seguir.',
  },
  {
    titulo: '2. Contactos y embudo (CRM)',
    parrafos: ['Cada persona que escribe es un contacto con datos (nombre, email, empresa, campos propios) y una etapa en el embudo: de «Nuevo» a «Cliente» o «Perdido». El tablero Kanban muestra a todos por etapa y se arrastran de una a otra.'],
    puntos: ['Etiquetas para agrupar (promo agosto, reclamo, mayorista). Campos personalizados para lo que el negocio necesite (rubro, ciudad, plan).', 'Grupos de etapas para ver el embudo por bloques.', 'El Command Center audita estos chats y les asigna un gate G0 a GX: es otra lectura del mismo contacto.'],
    ejemplo: 'Creá la etiqueta «demo pedida» y aplicásela a los que pidieron ver el producto; después armá un lote sólo para ellos.',
  },
  {
    titulo: '3. Automatizaciones (flujos)',
    parrafos: ['Un flujo es una secuencia de pasos que se dispara sola: cuando llega un mensaje, cuando cambia la etapa, a una hora, o a mano. Puede enviar textos, esperar respuestas, preguntar y ramificar, etiquetar, asignar, crear tareas.'],
    puntos: ['Se dibujan con nodos y flechas; cada chat que entra tiene su sesión, y se ve en qué paso está.', 'Un chat con automatización viva no entra en lotes del Command Center: el bot ya lo está trabajando.', 'Desde Respuestas se puede disparar un flujo sobre un contacto con el botón Flujo.'],
    ejemplo: 'Flujo de bienvenida: saluda, pregunta qué necesita, etiqueta según la respuesta y crea una tarea si pidió hablar con una persona.',
  },
  {
    titulo: '4. Mensajes programados',
    parrafos: ['Mensajes que salen solos a una fecha y hora, una vez o repetidos (todos los días, ciertos días). Sirven para recordatorios, seguimientos y campañas chicas.'],
    puntos: ['Se crean desde la app Programados o desde la ficha del contacto.', 'En el Command Center se ven por semana y se arrastran de día; un programado con prompt pasa a la cola para que lo escriba un conector.'],
    ejemplo: 'Recordatorio de pago el día 5 a las 10 a los que tienen membresía vencida.',
  },
  {
    titulo: '5. Agente de IA de WhatsApp',
    parrafos: ['Un asistente que contesta en el chat con el conocimiento del negocio y puede hacer cosas: consultar turnos, planes y saldos, agendar, registrar pedidos y avisos de pago, crear tareas, derivar a una persona. Se configura en Ajustes › IA.'],
    puntos: ['Funciones integradas por app: se encienden solas cuando la app está activa (Calendario, Clientes, Membresías, Ventas, Financiero, Tareas, Programados, Soporte, Sitios).', 'Herramientas del equipo: acciones armadas a mano (enviar archivo, mover de etapa, etiquetar, crear tarea, agendar turno, registrar venta…).', 'Nada queda cobrado por el bot: ventas, membresías y pagos nacen pendientes.'],
    ejemplo: 'Herramienta «Catálogo»: cuando el cliente pide precios, el bot manda el PDF, etiqueta «interesado» y mueve a «Cotizado».',
  },
  {
    titulo: '6. Tareas OS',
    parrafos: ['El gestor de tareas del equipo: espacios de trabajo, proyectos con columnas (Por hacer › En curso › Hecho), tareas con checklist, fechas, responsables, comentarios y prompt de IA. Cada tarea puede estar vinculada a un contacto, cliente, venta o documento.'],
    puntos: ['Las demos y los proyectos de cliente que crea el Command Center viven acá (workspaces Demos y Clientes).', 'La bitácora del Command Center es un proyecto más.', 'Un conector puede crear proyectos completos y marcar el estado de los prompts de IA.'],
    ejemplo: 'Proyecto «Alta de cliente»: columnas por etapa, una tarea por paso (dominio, catálogo, capacitación), cada una con checklist.',
  },
  {
    titulo: '7. Clientes y membresías',
    parrafos: ['Clientes es el registro de quién ya compró: datos, empresa, ventas, pagos, sitios y dominios. Membresías administra planes (mensual, anual), suscripciones y recordatorios de renovación.'],
    puntos: ['Un contacto se convierte en cliente desde la ficha o cuando el bot registra una compra.', 'Las suscripciones vencidas aparecen como pago pendiente en Dinero.', 'Visibilidad privada u oculta para clientes que no deben verse en la lista general.'],
    ejemplo: 'Plan «Tienda mensual»: al vencer, un recordatorio automático y la suscripción en Dinero hasta que se registre el pago.',
  },
  {
    titulo: '8. Finanzas',
    parrafos: ['Ingresos, gastos, cuentas y proyección de caja. Las ventas y los pagos informados por el bot o por el Command Center entran como movimientos pendientes hasta que una persona los confirma. Las monedas nunca se suman entre sí.'],
    puntos: ['Cuentas por cobrar y por pagar, con vencimiento.', 'Tipos de cambio por equipo para ver todo en una moneda de referencia.'],
    ejemplo: 'Un cliente dice que transfirió: el bot registra el ingreso pendiente; cuando aparece en el banco, se confirma y pasa a cobrado.',
  },
  {
    titulo: '9. Documentos',
    parrafos: ['Un editor tipo Notion con carpetas, para procedimientos, guiones, planes y base de conocimiento. El agente de IA puede buscar en estos documentos para responder.'],
    puntos: ['Cinco niveles de carpetas; portal público opcional para compartir con clientes.', 'Los documentos del Command Center (planificación, prompts) están acá.'],
    ejemplo: 'Documento «Preguntas frecuentes» en la carpeta Conocimiento: el bot lo usa para contestar precios y horarios.',
  },
  {
    titulo: '10. Sitios, tiendas y AAPP SPACE',
    parrafos: ['Cada cliente puede tener un sitio de una página (vcard), un sitio profesional, una tienda o un HTML propio, publicados en AAPP SPACE, con dominio propio si quiere. Desde WhatsPro se ven sus sitios, tiendas y dominios en la ficha del cliente.'],
    puntos: ['Las demos se generan con un prompt sobre la investigación del chat y se publican en AAPP SPACE.', 'Dominios (Hostinger) se importan y se vinculan al cliente automáticamente.'],
    ejemplo: 'Demo para una farmacia: sitio de una página con catálogo, botón de WhatsApp y horarios; después se le pasa el link al cliente.',
  },
  {
    titulo: '11. Command Center Comercial',
    parrafos: ['La capa que ordena todo lo anterior para vender: audita cada chat, arma listas por lo que importa hoy, hace pasar cada acción por una aprobación, escucha respuestas y sigue la producción. Es lo que explica el resto de esta Ayuda.'],
    puntos: ['Hoy, Dinero, Oportunidades, Barrido, Limpieza, Respuestas, Cola, Audios, Programados, Producción, Todos, Prompt Studio, Métricas.', 'Trabaja con conectores de IA por MCP (Claude, ChatGPT, Grok) con las mismas reglas que las personas.'],
    ejemplo: 'Rutina diaria: Hoy → Respuestas → Dinero → Cola (revisar y aprobar) → Producción.',
  },
  {
    titulo: '12. Apps, usuarios y permisos',
    parrafos: ['WhatsPro es un lanzador de apps: cada equipo activa las que usa (algunas por equipo, otras por usuario) y cada usuario tiene permisos por app. El menú se arma solo con lo activo.'],
    puntos: ['Apps por usuario (Soporte, Financiero, Documentos, Sitios) se encienden desde el lanzador; el agente de IA las considera activas si algún miembro las tiene.', 'Los conectores usan el usuario que los conectó: la auditoría dice quién pidió qué.'],
    ejemplo: 'Martín activa Sitios y Documentos; Noelia, Financiero. Cada uno ve su menú; el bot usa las tres.',
  },
];
