'use client';

import { CalendarDays, Flag, Hash, HelpCircle, Repeat, Target } from 'lucide-react';
import { C } from '../data/clases';
import { ES } from '../i18n/es';

export function ComoUsar() {
  const cards = [
    { icon: CalendarDays, title: ES.comoUsar.fechas, ej: ES.comoUsar.fechasEj, bg: 'bg-emerald-100 text-emerald-600' },
    { icon: Flag, title: ES.comoUsar.prioridad, ej: ES.comoUsar.prioridadEj, bg: 'bg-rose-100 text-rose-600' },
    { icon: Hash, title: ES.comoUsar.etiquetas, ej: ES.comoUsar.etiquetasEj, bg: 'bg-pink-100 text-pink-600' },
    { icon: Repeat, title: ES.comoUsar.recurrenciaTitulo, ej: ES.comoUsar.recurrenciaEj, bg: 'bg-amber-100 text-amber-600' },
  ];
  const pasos = [
    { title: ES.comoUsar.paso1, text: ES.comoUsar.paso1Bajada },
    { title: ES.comoUsar.paso2, text: ES.comoUsar.paso2Bajada },
    { title: ES.comoUsar.paso3, text: ES.comoUsar.paso3Bajada },
  ];
  const atajos = [
    { key: '/', action: ES.atajos.buscar },
    { key: 'i', action: ES.atajos.bandeja },
    { key: 't', action: ES.atajos.hoy },
    { key: 'f', action: ES.atajos.enfoque },
    { key: 's', action: ES.atajos.ajustes },
    { key: 'b', action: ES.atajos.menu },
  ];

  return (
    <div className="space-y-10 pb-32">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-[var(--t-text)] flex items-center gap-3">
          <HelpCircle className="w-8 h-8 text-[var(--tareas-accent)]" />
          {ES.comoUsar.titulo}
        </h1>
        <p className="text-[var(--t-text-secondary)] mt-1">{ES.comoUsar.bajada}</p>
      </div>

      <section>
        <h2 className="text-xl font-black tracking-widest text-[var(--tareas-accent)]">{ES.comoUsar.inicioRapido}</h2>
        <div className={`${C.card} p-8 mt-4 space-y-4`}>
          <h3 className="text-lg font-bold text-[var(--t-text)]">{ES.comoUsar.creacionInteligente}</h3>
          <p className="text-[var(--t-text-secondary)]">{ES.comoUsar.creacionBajada}</p>
          <pre className="bg-neutral-900 rounded-2xl px-6 py-4 font-mono text-sm overflow-x-auto">
            <span className="text-white">Terminar informe </span>
            <span className="text-emerald-400">@mañana </span>
            <span className="text-rose-400">!alta </span>
            <span className="text-pink-400">#trabajo </span>
            <span className="text-amber-400">*diario</span>
          </pre>
          <div className="grid sm:grid-cols-2 gap-3">
            {cards.map((card) => (
              <div key={card.title} className="flex items-center gap-3 bg-[var(--t-surface-2)] rounded-2xl p-4">
                <span className={cnSquare(card.bg)}>
                  <card.icon className="w-5 h-5" />
                </span>
                <span>
                  <span className="block font-bold text-[var(--t-text)]">{card.title}</span>
                  <span className="text-sm text-[var(--t-text-secondary)]">{card.ej}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black tracking-widest text-[var(--tareas-accent)] flex items-center gap-2">
          <Target className="w-5 h-5" />
          {ES.comoUsar.modoEnfoque}
        </h2>
        <div className="mt-4 space-y-3">
          {pasos.map((paso, i) => (
            <div key={paso.title} className={`${C.card} p-6 flex gap-4`}>
              <span className="w-8 h-8 rounded-full bg-[var(--tareas-accent)] text-white font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div>
                <div className="font-bold text-[var(--t-text)]">{paso.title}</div>
                <div className="text-sm text-[var(--t-text-secondary)] mt-1">{paso.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black tracking-widest text-[var(--tareas-accent)]">{ES.comoUsar.atajos}</h2>
        <div className={`${C.card} mt-4 overflow-hidden`}>
          <div className="grid grid-cols-2 px-6 py-3 border-b border-[var(--t-border)]">
            <span className={C.rotulo}>{ES.comoUsar.tecla}</span>
            <span className={C.rotulo}>{ES.comoUsar.accion}</span>
          </div>
          {atajos.map((row) => (
            <div key={row.key} className="grid grid-cols-2 px-6 py-3 border-b border-[var(--t-border)] items-center">
              <kbd className="bg-[var(--t-chip)] rounded-lg px-3 py-1.5 font-mono text-xs font-bold w-fit">{row.key}</kbd>
              <span className="text-sm font-medium text-[var(--t-text)]">{row.action}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black tracking-widest text-[var(--tareas-accent)]">{ES.comoUsar.faq}</h2>
        <div className="mt-4 space-y-3">
          <div className={`${C.card} p-6`}>
            <div className="font-bold text-[var(--t-text)]">{ES.comoUsar.faq1}</div>
            <p className="text-[var(--t-text-secondary)] mt-2">{ES.comoUsar.faq1R}</p>
          </div>
          <div className={`${C.card} p-6`}>
            <div className="font-bold text-[var(--t-text)]">{ES.comoUsar.faq2}</div>
            <p className="text-[var(--t-text-secondary)] mt-2">{ES.comoUsar.faq2R}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function cnSquare(bg: string) {
  return `w-11 h-11 rounded-2xl flex items-center justify-center ${bg}`;
}
