export type Segmento = 'todos' | 'leads' | 'clientes';
export type Orden = 'ultimo' | 'nombre' | 'sinContestar' | 'temperatura';
export type OrdenSinFicha = 'ultimo' | 'nombre' | 'noLeidos';
export type Densidad = 'tarjetas' | 'lista';
export type Temperatura = 'hot' | 'warm' | 'cold';

export type Etiqueta = { id: number; name: string; color: string | null };

export type Etapa = {
  id: number;
  name: string;
  emoji: string;
  order: number;
  groupId: number | null;
};

export type GrupoEtapas = {
  id: number;
  name: string;
  description: string | null;
  order: number;
};

/** Una tarjeta de la agenda. `contactId` null = chat sin ficha en `contacts`. */
export type ContactoCard = {
  contactId: number | null;
  chatId: number;
  remoteJid: string;
  instanceId: number | null;
  numero: string;
  nombre: string;
  avatarUrl: string | null;
  etapaId: number | null;
  etiquetas: Etiqueta[];
  unread: number;
  ultimoTexto: string | null;
  ultimoTs: number | null;
  ultimoEsMio: boolean;
  temperatura: Temperatura;
  esVip: boolean;
  esCliente: boolean;
};

export type TipoSeccion = 'etapa' | 'sinEtapa' | 'sinFicha';

export type Seccion = {
  key: string;
  tipo: TipoSeccion;
  etapa: Etapa | null;
  contactos: ContactoCard[];
};

export const GRUPO_TODAS = 'all';
export const GRUPO_SIN = 'ungrouped';

export const LS_GRUPO = 'seguimiento.grupo';
export const LS_DENSIDAD = 'seguimiento.densidad';
export const LS_PLEGADAS = 'seguimiento.plegadas';
