'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = { nombre: string; children: ReactNode };
type State = { error: Error | null };

/**
 * Aísla el reventón de una vista al recuadro de esa vista.
 *
 * Tiene que ser una clase: los hooks no pueden atrapar errores de render, y
 * este es justamente el caso que importa —una pantalla prestada de otra app que
 * recibe un dato que no esperaba.
 */
export class LimiteDeError extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center" role="alert">
        <AlertCircle className="size-6 text-destructive" aria-hidden />
        <p className="text-sm font-medium text-foreground">{this.props.nombre} no se pudo dibujar</p>
        <p className="max-w-md text-xs text-muted-foreground">{String(this.state.error.message ?? this.state.error)}</p>
        <Button variant="outline" size="sm" className="mt-1" onClick={() => this.setState({ error: null })}>
          Reintentar
        </Button>
      </div>
    );
  }
}
