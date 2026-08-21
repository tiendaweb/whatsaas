/**
 * Literales de la interfaz nueva de Tareas (documento 03-COPY-ES.md).
 * Ningún componente escribe strings sueltos: todos salen de acá.
 */

export const ES = {
  marca: 'Tareas',
  volver: 'Volver a WhatsPro',

  rotulos: {
    sistema: 'SISTEMA',
    espacios: 'ESPACIOS',
    etiquetas: 'ETIQUETAS',
    seleccionadas: 'SELECCIONADAS',
    subtareas: 'SUBTAREAS',
    fecha: 'FECHA',
    recurrencia: 'RECURRENCIA',
    prioridad: 'PRIORIDAD',
    proyecto: 'PROYECTO',
    editarTarea: 'EDITAR TAREA',
    trabajoProfundo: 'TRABAJO PROFUNDO',
    tareaPrincipal: 'TAREA PRINCIPAL',
  },

  nav: {
    bandeja: 'Bandeja',
    hoy: 'Hoy',
    proximas: 'Próximas',
    vencidas: 'Vencidas',
    completadas: 'Completadas',
    enfoque: 'Modo Enfoque',
    metricas: 'Métricas',
    ajustes: 'Ajustes',
    comoUsar: 'Cómo usar',
    nuevaEtiqueta: 'Nueva etiqueta',
  },

  cabecera: {
    misTareas: 'Mis Tareas',
    buscar: 'Buscar tareas, etiquetas o áreas de enfoque... (Presioná / para buscar)',
    vistaLista: 'Lista',
    vistaCalendario: 'Calendario',
    vistaTablero: 'Tablero',
    seleccionMultiple: 'Selección múltiple',
    tableroSinProyecto: 'Elegí un proyecto para ver su tablero',
    arrastreDeshabilitado: 'Filtrá por un proyecto para reordenar',
  },

  vacio: {
    titulo: 'Sin resultados',
    detalle: 'Probá limpiar los filtros o cambiar la búsqueda.',
    tituloBandeja: 'No hay nada pendiente',
    detalleBandeja: 'Cuando haya tareas activas en tus tableros, aparecen acá.',
  },

  seleccion: {
    completar: 'COMPLETAR',
    eliminar: 'ELIMINAR',
    salir: 'Salir de la selección',
  },

  captura: {
    placeholder: "Escribí una tarea... (ej. 'Pagar cuentas @mañana !alta #personal *diario')",
    sinDestino: 'Elegí un proyecto destino en Ajustes',
    enProyecto: (destino: string) => `Nueva tarea en ${destino}`,
    agregar: 'Agregar tarea',
  },

  recurrencia: {
    unica: 'Única',
    diaria: 'Diaria',
    semanal: 'Semanal',
    mensual: 'Mensual',
  },

  prioridad: {
    baja: 'Baja',
    media: 'Media',
    alta: 'Alta',
  },

  modal: {
    desglosarIA: 'DESGLOSAR CON IA',
    agregarPaso: '+ AGREGAR PASO',
    guardar: 'Guardar cambios',
    titulo: 'Título de la tarea',
    descripcion: 'Descripción',
    cerrar: 'Cerrar',
    prioridadBloqueada:
      'Este proyecto no tiene etiquetas de prioridad. Cambiá el modo de escritura en Ajustes para agregarlas.',
  },

  enfoque: {
    finalizar: 'Finalizar',
    salir: 'Salir del modo enfoque',
    sinTarea: 'No hay ninguna tarea activa para enfocar.',
  },

  metricas: {
    titulo: 'Métricas de productividad',
    bajada: 'Análisis de tus patrones de enfoque y velocidad.',
    racha: 'RACHA ACTIVA',
    completadas: 'COMPLETADAS',
    eficiencia: 'EFICIENCIA',
    vencidas: 'VENCIDAS',
    velocidad: 'Velocidad de productividad',
    promedioDiario: 'PROMEDIO DIARIO',
    mezcla: 'Mezcla de prioridades',
    total: 'TOTAL',
    pico: 'PICO DE ENFOQUE',
    picoBajada: 'Tu día más activo de la semana.',
    sinDatos: 'N/D',
    todosLosEspacios: 'Todos los espacios',
  },

  ajustes: {
    titulo: 'Ajustes',
    bajada: 'Configurá tu motor de productividad.',
    interfaz: 'INTERFAZ Y TEMA',
    apariencia: 'Modo de apariencia',
    aparienciaBajada: 'Alterná entre claro y oscuro.',
    acento: 'Acento del sistema',
    destinoYEscritura: 'DESTINO Y ESCRITURA',
    proyectoDestino: 'Proyecto destino',
    proyectoDestinoBajada: 'Donde caen las tareas creadas desde la barra de captura.',
    escrituraEtiquetas: 'Escritura de etiquetas',
    conservadora: 'Conservadora',
    conservadoraBajada: 'Solo escribe prioridad y recurrencia en proyectos que ya las tienen',
    completa: 'Completa',
    completaBajada: 'Agrega las etiquetas reservadas a cualquier proyecto, pidiendo confirmación',
    meta: 'META DIARIA',
    objetivo: 'Objetivo diario',
    objetivoBadge: (n: number) => `${n} ${n === 1 ? 'TAREA' : 'TAREAS'}`,
    gestionEtiquetas: 'GESTIÓN DE ETIQUETAS',
    agregarEtiqueta: '+ AGREGAR ETIQUETA',
    enProyectos: (n: number) => `en ${n} ${n === 1 ? 'proyecto' : 'proyectos'}`,
    ayuda: 'AYUDA',
    ayudaTitulo: 'Ayuda y documentación',
    ayudaBajada: 'Aprendé a usar las funciones y los atajos.',
    datos: 'DATOS',
    exportar: 'EXPORTAR DATOS',
    importar: 'IMPORTAR DATOS',
    interfazClasica: 'INTERFAZ',
    volverClasico: 'Volver al tablero clásico',
    volverClasicoBajada: 'Cambia esta sesión a la interfaz anterior. No requiere despliegue.',
  },

  comoUsar: {
    titulo: 'Cómo usar Tareas',
    bajada: 'Dominá tu flujo de trabajo paso a paso.',
    inicioRapido: 'INICIO RÁPIDO',
    creacionInteligente: 'Creación inteligente de tareas',
    creacionBajada:
      'La barra de captura está pensada para la velocidad. Usá símbolos para definir propiedades al instante.',
    ejemplo: 'Terminar informe @mañana !alta #trabajo *diario',
    fechas: 'Fechas (@)',
    fechasEj: '@hoy, @mañana, @próxima semana',
    prioridad: 'Prioridad (!)',
    prioridadEj: '!alta, !media, !baja',
    etiquetas: 'Etiquetas (#)',
    etiquetasEj: '#personal, #trabajo, #fitness',
    recurrenciaTitulo: 'Recurrencia (*)',
    recurrenciaEj: '*diario, *semanal, *mensual',
    modoEnfoque: 'MODO ENFOQUE',
    paso1: 'Entrar en enfoque',
    paso1Bajada: 'Hacé clic en el ícono de diana del menú lateral o presioná f.',
    paso2: 'Iniciar el temporizador',
    paso2Bajada: 'Sesiones de 25 minutos por defecto. Hacé clic en el tiempo para editar la duración.',
    paso3: 'Trabajar',
    paso3Bajada: 'Tu tarea activa principal se fija automáticamente. Enfocate en una sola cosa.',
    atajos: 'ATAJOS',
    tecla: 'TECLA',
    accion: 'ACCIÓN',
    faq: 'PREGUNTAS FRECUENTES',
    faq1: '¿Cómo elimino una etiqueta?',
    faq1R:
      'Andá a Ajustes > Gestión de etiquetas, pasá el cursor sobre la etiqueta y hacé clic en el ícono de papelera. Se quita de todas las tareas.',
    faq2: '¿Dónde se guardan mis datos?',
    faq2R:
      'En tus tableros de Tareas de WhatsPro. Esta es otra forma de verlos: lo que editás acá se edita allá. Podés exportar un respaldo en JSON desde Ajustes.',
  },

  atajos: {
    buscar: 'Enfocar la búsqueda',
    bandeja: 'Ir a Bandeja',
    hoy: 'Ir a Hoy',
    enfoque: 'Abrir Modo Enfoque',
    ajustes: 'Abrir Ajustes',
    menu: 'Plegar el menú lateral',
  },

  grupos: {
    vencidas: 'VENCIDAS',
    hoy: 'HOY',
    manana: 'MAÑANA',
    estaSemana: 'ESTA SEMANA',
    masAdelante: 'MÁS ADELANTE',
    sinFecha: 'SIN FECHA',
  },

  confirmar: {
    etiquetaEnProyecto: (etiqueta: string, proyecto: string) =>
      `Se va a agregar la etiqueta "${etiqueta}" al proyecto ${proyecto}. Va a aparecer también en su tablero.`,
    borrarTareas: (n: number, m: number) =>
      `Vas a eliminar ${n} ${n === 1 ? 'tarea' : 'tareas'} de ${m} ${m === 1 ? 'proyecto' : 'proyectos'}. Esta acción no se puede deshacer.`,
    borrarTarea: (titulo: string, proyecto: string) =>
      `Vas a eliminar "${titulo}" del proyecto ${proyecto}. Esta acción no se puede deshacer.`,
    renombrarEtiqueta: (etiqueta: string, proyectos: string[]) =>
      `Renombrar "${etiqueta}" afecta a ${proyectos.length} ${proyectos.length === 1 ? 'proyecto' : 'proyectos'}: ${proyectos.join(', ')}.`,
    borrarEtiqueta: (etiqueta: string, proyectos: string[]) =>
      `Borrar "${etiqueta}" la quita de ${proyectos.length} ${proyectos.length === 1 ? 'proyecto' : 'proyectos'}: ${proyectos.join(', ')}.`,
    aceptar: 'Confirmar',
    cancelar: 'Cancelar',
  },

  errores: {
    guardar: 'No se pudo guardar el cambio. Se revirtió.',
    crear: 'No se pudo crear la tarea.',
    borrar: 'No se pudo eliminar.',
    recurrencia: 'No se pudo crear la tarea siguiente. La original quedó sin completar.',
  },

  contadores: {
    tareasActivas: (n: number) => `${n} ${n === 1 ? 'tarea activa' : 'tareas activas'}.`,
    tareas: (n: number) => `${n} ${n === 1 ? 'tarea' : 'tareas'}`,
  },
} as const;
