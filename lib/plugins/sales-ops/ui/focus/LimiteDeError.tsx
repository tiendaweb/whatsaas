'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Un error en una columna no puede llevarse la pantalla entera.
 *
 * Sin esto, cualquier excepción de render adentro del Focus sube hasta el
 * boundary genérico de la app ("No se pudo cargar la página. Actualiza…"), que
 * no dice qué pasó, pierde el bloque en curso y obliga a recargar. Acá el resto
 * de la pantalla sigue viva, se ve el motivo, y "Reintentar" vuelve a montar
 * sólo la columna que falló.
 */
type Props = { children: ReactNode; nombre: string };
type State = { error: Error | null };

export class LimiteDeError extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[focus/${this.props.nombre}]`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
          Falló «{this.props.nombre}»
        </p>
        <p className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">{this.state.error.message}</p>
        <Button variant="outline" size="sm" className="mt-2 h-7 gap-1.5 text-[11px]" onClick={() => this.setState({ error: null })}>
          <RotateCcw className="size-3" aria-hidden />
          Reintentar
        </Button>
      </div>
    );
  }
}
