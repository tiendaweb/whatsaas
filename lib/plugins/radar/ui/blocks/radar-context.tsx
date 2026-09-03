'use client';

import { createContext, useContext } from 'react';

/**
 * Los informes de Radar son documentos del plugin Documentos, pero se leen
 * DENTRO del panel de Radar — no abriendo otra pestaña. Cualquier superficie
 * que sepa abrir el visor (el tablero, la ficha del cliente, el modo pantalla
 * completa del chat) provee este contexto; los bloques `documents` lo
 * consumen. Si no hay proveedor, caen a un enlace normal.
 */
export type RadarDocumentOpener = (documentId: number) => void;

const RadarDocumentContext = createContext<RadarDocumentOpener | null>(null);

export function RadarDocumentProvider({
  open,
  children,
}: {
  open: RadarDocumentOpener;
  children: React.ReactNode;
}) {
  return <RadarDocumentContext.Provider value={open}>{children}</RadarDocumentContext.Provider>;
}

export function useRadarDocumentOpener(): RadarDocumentOpener | null {
  return useContext(RadarDocumentContext);
}
