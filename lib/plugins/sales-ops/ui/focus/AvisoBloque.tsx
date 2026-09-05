'use client';

import { Coffee, LogOut, Timer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MINUTOS_BLOQUE, MINUTOS_DESCANSO } from './tipos';

/**
 * El aviso de fin de bloque (doc 08 §8).
 *
 * Tres salidas y ninguna por defecto: seguir 25 minutos más, cortar 5, o irse.
 * La decisión de seguir se toma cada bloque; ese es todo el punto del método.
 */
export function AvisoBloque({
  abierto,
  tipo,
  hechos,
  onOtroBloque,
  onDescanso,
  onSalir,
}: {
  abierto: boolean;
  tipo: 'foco' | 'descanso' | null;
  hechos: number;
  onOtroBloque: () => void;
  onDescanso: () => void;
  onSalir: () => void;
}) {
  const eraDescanso = tipo === 'descanso';
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onOtroBloque()}>
      <DialogContent className="max-w-xs text-center" showCloseButton={false}>
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
          {eraDescanso ? <Coffee className="size-5" aria-hidden /> : <Timer className="size-5" aria-hidden />}
        </div>
        <DialogTitle className="text-base">{eraDescanso ? 'Se terminó el descanso' : `Bloque de ${MINUTOS_BLOQUE} minutos completo`}</DialogTitle>
        <DialogDescription className="text-xs">
          {eraDescanso ? 'Cuando quieras, arrancá otro bloque.' : hechos > 0 ? `Procesaste ${hechos} ${hechos === 1 ? 'cliente' : 'clientes'} en este bloque.` : 'No procesaste ninguno en este bloque.'}
        </DialogDescription>

        <div className="mt-1 space-y-2">
          <Button className="w-full" onClick={onOtroBloque}>
            Otro bloque de {MINUTOS_BLOQUE} min
          </Button>
          {!eraDescanso && (
            <Button variant="outline" className="w-full gap-2" onClick={onDescanso}>
              <Coffee className="size-4" aria-hidden />
              Descanso de {MINUTOS_DESCANSO} min
            </Button>
          )}
          <Button variant="ghost" className="w-full gap-2 text-muted-foreground" onClick={onSalir}>
            <LogOut className="size-4" aria-hidden />
            Salir de Focus
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
