export const VISTAS = ['hoy', 'manana', 'pasado', 'semana', 'mes', 'ano', 'agenda', 'gantt', 'avisos'] as const;
export type VistaCalendario = (typeof VISTAS)[number];

export const VISTA_LABELS: Record<VistaCalendario, string> = {
  hoy: 'Hoy',
  manana: 'Mañana',
  pasado: 'Pasado mañana',
  semana: 'Semana',
  mes: 'Mes',
  ano: 'Año',
  agenda: 'Agenda',
  gantt: 'Línea de tiempo',
  avisos: 'Avisos',
};

export const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
export const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
