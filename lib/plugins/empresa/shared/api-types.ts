import type { AppAgrupada } from './vistas';

/**
 * Contrato de `/api/plugins/empresa/*`. El mismo archivo lo importan el
 * servidor y la UI: si cambia un campo, el build lo dice.
 */

/**
 * Un monto SIEMPRE viaja con su moneda y NUNCA se suma con otra.
 *
 * El negocio cobra en USD, ARS y PYG. Sumarlos da un número que no significa
 * nada y que además cambia solo cuando se mueve el dólar. Todos los totales de
 * Empresa son listas por moneda, y la UI las muestra una debajo de la otra.
 */
export type MontoPorMoneda = { currency: string; cents: number };

export type MarcaResumen = {
  id: number;
  name: string;
  logoUrl: string | null;
  status: string;
  /** Planes activos de la marca. */
  planes: number;
  /** Suscripciones en estado `active`. */
  suscripcionesActivas: number;
  /** Suscripciones activas que vencen dentro de los próximos 30 días. */
  porVencer: number;
  /** Suscripciones activas con el pago vencido. */
  impagas: number;
  /** Recurrente mensual de las suscripciones activas, por moneda. */
  recurrente: MontoPorMoneda[];
  /** Clientes distintos con al menos una suscripción de la marca. */
  clientes: number;
};

export type VencimientoProximo = {
  subscriptionId: number;
  numero: string;
  plan: string;
  marca: string | null;
  cliente: string | null;
  endDate: string;
  /** Días que faltan; negativo = ya venció. */
  dias: number;
  price: number;
  currency: string;
  paymentStatus: string;
};

export type ResumenEmpresa = {
  /** Marca por la que está filtrado el resumen; null = todas. */
  marcaId: number | null;
  /**
   * Vistas que se pueden dibujar: las que Empresa agrupa de una app que el
   * equipo tiene activa, más las propias. El rail se arma con esto.
   */
  vistasDisponibles: string[];
  contadores: {
    marcas: number;
    planes: number;
    suscripcionesActivas: number;
    porVencer30: number;
    clientes: number;
    oportunidadesAbiertas: number;
  };
  dinero: {
    /** Recurrente mensual de las suscripciones activas. */
    recurrente: MontoPorMoneda[];
    /** Ventas cobradas en los últimos 30 días. */
    ventasDelMes: MontoPorMoneda[];
    /** Ventas confirmadas sin cobrar. */
    porCobrar: MontoPorMoneda[];
    /** Valor de las oportunidades abiertas, ponderado por probabilidad. */
    embudo: MontoPorMoneda[];
  };
  vencimientos: VencimientoProximo[];
  marcas: MarcaResumen[];
  /** Contadores de las apps agrupadas que el equipo tenga activas. */
  apps: {
    activas: string[];
    contadores: Partial<Record<NonNullable<AppAgrupada['contador']>, number>>;
    /** Contratos que vencen dentro de los próximos 60 días. */
    contratosPorVencer: number;
  };
};

/**
 * El CRM visto desde Empresa. Misma información que Contactos y que el Command
 * Center; lo que cambia es la puerta: acá se entra por marca.
 */
export type CrmContacto = {
  id: number;
  nombre: string;
  /** Chat de WhatsApp, si tiene: sin él no hay ficha comercial que abrir. */
  chatId: number | null;
  gate: string | null;
  temperatura: string | null;
  /** Cliente del sistema al que está vinculado, si hay. */
  cliente: string | null;
  /** Sin persona ni sector asignado: sus mensajes no le suenan a nadie. */
  sinAgente: boolean;
  /** La clasificación dejó una corrección de ficha sin aplicar. */
  tieneCorreccion: boolean;
  etiquetas: Array<{ name: string; color: string | null }>;
  actualizado: string | null;
  /**
   * Lo cotizado, en UNIDADES de su moneda (no centavos).
   *
   * `quoted_price` del análisis comercial se guarda en unidades: dividirlo por
   * 100 le dijo "ARS 600" a alguien cotizado en $60.000.
   */
  cotizado: number | null;
  moneda: string | null;
  /** Cada cuánto se cobra, si el contacto lo tiene cargado. */
  ciclo: string | null;
  /** Días desde el último movimiento de la ficha. */
  diasQuieto: number | null;
  /** Quién lo tiene: persona o sector. */
  responsable: string | null;
  /** De dónde salió el contacto. */
  origen: string | null;
  /**
   * La situación del Command Center (contestó, en cola, cobro, sin tocar…).
   *
   * Sale de `situacionExpr`, la única definición que existe: el ícono de acá y
   * el de la lista del Command Center no pueden discrepar.
   */
  situacion: string | null;
  /** Ya se le dejó al menos un prompt al conector. */
  tienePrompt: boolean;
  /** Foto de perfil de WhatsApp, si la tiene. */
  foto: string | null;
  /** Membresía activa del cliente vinculado: qué plan y cómo viene el pago. */
  membresia: { plan: string; estadoPago: string } | null;
  /** Proyectos vinculados, con su avance real (tareas hechas sobre el total). */
  proyectos: Array<{ id: number; nombre: string; hechas: number; total: number }>;
};

export type CrmEtapa = {
  id: number;
  name: string;
  emoji: string | null;
  /** Total real de la etapa, aunque se muestren menos tarjetas. */
  total: number;
  /** Grupos a los que pertenece la etapa. Más de uno = etapa compartida. */
  grupos: number[];
  /**
   * Lo cotizado en la etapa, por moneda. Nunca se suman entre sí: el equipo
   * cotiza en ARS, USD y PYG.
   */
  valor: MontoPorMoneda[];
  contactos: CrmContacto[];
};

/** Un grupo de etapas del embudo (Ventas, Producción, Clientes…). */
export type CrmGrupo = {
  id: number;
  name: string;
  descripcion: string | null;
  /** Cuántas etapas tiene. */
  etapas: number;
};

export type CrmEmpresa = {
  grupos: CrmGrupo[];
  etapas: CrmEtapa[];
  sinEtapa: { total: number; contactos: CrmContacto[] };
  totales: {
    contactos: number;
    sinEtapa: number;
    sinAgente: number;
    conCorreccion: number;
    /** Lo cotizado en todo lo que se está mirando, por moneda. */
    pipeline: MontoPorMoneda[];
  };
  /** Las etiquetas en uso del equipo, para el selector. No dependen del filtro. */
  etiquetas: Array<{ id: number; name: string; color: string | null }>;
};

/** Estado del cliente dueño del proyecto, para el archivado que lo saca del CRM. */
export type ClienteDeProyecto = {
  id: number | null;
  /** `archived` = ya no figura en el CRM. */
  estado: string | null;
  puedeArchivar: boolean;
  tareasAbiertas: number;
};

/** Un proyecto del equipo (app Tareas OS), visto desde Empresa. */
export type ProyectoEmpresa = {
  id: number;
  workspaceId: number;
  name: string;
  color: string | null;
  /**
   * Las columnas del tablero, en orden. Llevan `id` porque desde Empresa ahora
   * se puede mover una tarea de columna, y `patchTaskItem` mueve por `columnId`.
   */
  columnas: Array<{ id: number; titulo: string }>;
  /** Las etiquetas definidas en el proyecto: son las que se pueden poner. */
  etiquetas: Array<{ id: string; name: string; color: string }>;
  tareas: number;
  hechas: number;
  /** Ítems de checklist de todo el proyecto, para el avance del rail. */
  checklistHechos: number;
  checklistTotal: number;
  /** Primer inicio y última entrega de sus tareas; null si ninguna tiene fecha. */
  inicio: string | null;
  fin: string | null;
  /** `null` cuando el proyecto no está vinculado a ninguna ficha de cliente. */
  cliente: ClienteDeProyecto | null;
};

export type ItemChecklistEmpresa = {
  /** El id del ítem dentro del JSON de la tarea; con él se marca y se borra. */
  id: string;
  texto: string;
  hecho: boolean;
};

export type TareaEmpresa = {
  id: number;
  proyectoId: number;
  /** Título de la columna donde está: es el estado real del tablero. */
  columna: string;
  columnaId: number;
  titulo: string;
  notas: string | null;
  hecha: boolean;
  inicio: string | null;
  fin: string | null;
  responsableId: number | null;
  responsable: string | null;
  etiquetas: Array<{ name: string; color: string }>;
  etiquetaIds: string[];
  checklist: { hechos: number; total: number; items: ItemChecklistEmpresa[] };
};

/** Quién puede quedar como responsable de una tarea. */
export type MiembroEmpresa = { id: number; nombre: string };

export type ProyectosEmpresa = {
  workspaces: Array<{ id: number; name: string; color: string | null }>;
  proyectos: ProyectoEmpresa[];
  tareas: TareaEmpresa[];
  miembros: MiembroEmpresa[];
};

/** Marcas, planes y suscripciones para las vistas de membresías de la cabina. */
export type MarcaFila = {
  id: number;
  name: string;
  status: string;
  logoUrl: string | null;
  website: string | null;
  /** Monedas en las que vende la marca; vacío = las que traigan sus planes. */
  currencies: string[];
  /** Con cuál abre el selector de precios. */
  defaultCurrency: string | null;
  planes: number;
  /** Cuántos de esos planes son públicos; el resto sólo se ve al pedirlo. */
  planesPublicos: number;
  activas: number;
  porVencer: number;
  /** Lo que entra por mes con lo que sigue vivo. Nunca se suma entre monedas. */
  recurrente: MontoPorMoneda[];
};

export type PlanFila = {
  id: number;
  name: string;
  companyId: number | null;
  marca: string | null;
  /** En centavos, como lo guarda Membresías. */
  price: number;
  currency: string;
  /** El mismo plan en varias monedas; `price`/`currency` es el principal. */
  prices: Array<{ currency: string; price: number; setupFee?: number; maintenanceAmount?: number }>;
  billingType: string;
  billingLabel: string | null;
  visibility: string;
  status: string;
  suscripciones: number;
};

export type SuscripcionFila = {
  id: number;
  numero: string;
  cliente: string | null;
  plan: string | null;
  companyId: number | null;
  marca: string | null;
  price: number;
  currency: string;
  billingType: string;
  status: string;
  paymentStatus: string;
  inicio: string;
  vence: string | null;
  porVencer: boolean;
};

export type MembresiasEmpresa = {
  marcas: MarcaFila[];
  planes: PlanFila[];
  suscripciones: SuscripcionFila[];
  totales: {
    marcas: number;
    planes: number;
    activas: number;
    porVencer: number;
    recurrente: MontoPorMoneda[];
  };
};

/** Un mes del gráfico de ingresos contra egresos. Siempre en UNA moneda. */
export type SerieMes = {
  /** `YYYY-MM`. */
  mes: string;
  /** "Jul", para el pie de la barra. */
  etiqueta: string;
  ingresos: number;
  egresos: number;
};

/** Una fila de "próximos cobros" o de "próximos egresos". */
export type MovimientoProximo = {
  id: number;
  titulo: string;
  /** El cliente o el proveedor, si se sabe quién. */
  quien: string | null;
  /** Marca, medio de pago, categoría o ciclo: el renglón chico de abajo. */
  detalle: string | null;
  /** `YYYY-MM-DD`. */
  fecha: string;
  cents: number;
  currency: string;
  vencido: boolean;
};

/**
 * Los números del Inicio de Empresa, con el tablero de la maqueta de ChatPro.
 *
 * Viaja aparte de `ResumenEmpresa` porque lo pide sólo esta pantalla: el
 * resumen lo consulta el shell entero cada dos minutos para armar el rail.
 */
export type PanoramaEmpresa = {
  marcaId: number | null;
  /** El mes que se está mirando, `YYYY-MM`. */
  mes: string;
  /** La moneda de más movimiento; `null` si no hay un solo asiento. */
  moneda: string | null;
  /** Todas las monedas con movimiento, de mayor a menor. */
  monedas: string[];
  /** El gráfico, una serie por moneda: nunca se suman entre sí. */
  series: Record<string, SerieMes[]>;
  saludo: {
    conversacionesPendientes: number;
    cobrosProgramados: number;
  };
  kpis: {
    /** Gasto fijo por mes: los egresos recurrentes, el anual dividido por doce. */
    egresosFijos: MontoPorMoneda[];
    egresosFijosCount: number;
    ingresosMes: MontoPorMoneda[];
    egresosMes: MontoPorMoneda[];
    /** Puede ser negativo, y los ceros se conservan: un mes empatado es un dato. */
    resultadoMes: MontoPorMoneda[];
    /** Porcentaje sobre la moneda principal; `null` cuando no hay con qué calcularlo. */
    margen: number | null;
    pipeline: MontoPorMoneda[];
    oportunidadesAbiertas: number;
    /** Lo cotizado en el CRM a contactos que hoy están en alguna etapa. */
    cotizado: MontoPorMoneda[];
    cotizados: number;
    marcasActivas: number;
  };
  conversion: { ganados: number; perdidos: number; total: number };
  /** Grupos de etapas del CRM con cuántos contactos hay en cada uno. */
  grupos: Array<{ id: number; name: string; etapas: number; contactos: number }>;
  cobros: MovimientoProximo[];
  egresos: MovimientoProximo[];
};

/** Una membresía de la ficha del cliente. */
export type ClienteSuscripcion = {
  id: number;
  numero: string;
  plan: string;
  marca: string | null;
  /** En centavos, como lo guarda Membresías. */
  price: number;
  currency: string;
  billingType: string;
  status: string;
  paymentStatus: string;
  inicio: string;
  vence: string | null;
  porVencer: boolean;
};

/** Un movimiento de plata de la ficha del cliente, tal como lo tiene Finanzas. */
export type ClientePago = {
  id: number;
  titulo: string;
  cents: number;
  currency: string;
  estado: string;
  fecha: string;
  metodo: string | null;
  marca: string | null;
};

/**
 * La ficha de un cliente: lo que la maqueta muestra en el panel de la derecha.
 *
 * Todos los totales son listas por moneda. El equipo cobra en ARS, USD y PYG y
 * un número único sería una suma inventada.
 */
export type ClienteFicha = {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  estado: string;
  rubro: string | null;
  web: string | null;
  lugar: string | null;
  notas: string;
  /** `YYYY-MM-DD`; `null` cuando no se sabe desde cuándo es cliente. */
  desde: string | null;
  /** Las marcas con las que tiene alguna suscripción. */
  marcas: string[];
  suscripciones: ClienteSuscripcion[];
  contactos: Array<{ id: number; nombre: string; telefono: string | null; jid: string | null; foto: string | null }>;
  proyectos: Array<{ id: number; nombre: string }>;
  pagos: ClientePago[];
  /** Lo que entra por mes con las suscripciones activas. */
  recurrente: MontoPorMoneda[];
  /** Ventas cobradas. */
  facturado: MontoPorMoneda[];
  /** Ventas confirmadas sin cobrar. */
  porCobrar: MontoPorMoneda[];
  /** Oportunidades abiertas, sin ponderar. */
  embudo: MontoPorMoneda[];
  activas: number;
  porVencer: number;
  impagas: number;
};

export type ClientesEmpresa = {
  marcaId: number | null;
  clientes: ClienteFicha[];
  totales: {
    clientes: number;
    conSuscripcion: number;
    recurrente: MontoPorMoneda[];
    facturado: MontoPorMoneda[];
    /** La lista llegó al tope y hay más clientes de los que se ven. */
    recortado: boolean;
  };
};
