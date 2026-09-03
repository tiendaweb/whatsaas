'use client';

import React from 'react';

export function WhiteboardView(props: any) {
  return (
    <div className="p-6 bw-liquid-panel rounded-3xl">
      <h2 className="text-2xl font-bold text-rose-600">Pizarra (Whiteboard)</h2>
      <p className="mt-2 text-sm text-zinc-500">Esta vista compleja (ReactFlow + nodos de proyectos/clientes/tareas) ha sido extraída como componente/página individual para escalabilidad.</p>
      <p className="mt-4 text-xs">Props recibidas para mantener compatibilidad. Implementación completa puede moverse aquí.</p>
    </div>
  );
}
