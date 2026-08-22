import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import './radar.css';

export function RadarIntro() {
  return (
    <div className="radar-ui flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center dark:bg-neutral-900">
      <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-indigo-500 text-white shadow-xl shadow-indigo-500/20 dark:shadow-none">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-black tracking-tight text-neutral-900 dark:text-white">Radar vive dentro de cada chat</h1>
        <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          No es una pantalla aparte: abrí cualquier chat con un contacto y tocá el botón
          <span className="mx-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Radar</span>
          en el panel derecho para ver su ficha de inteligencia comercial y las sugerencias de respuesta.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:bg-indigo-600 dark:shadow-none"
      >
        Ir a los chats
      </Link>
    </div>
  );
}
