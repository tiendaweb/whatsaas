export function BusinessWomanScopedStyles() {
  return (
    <style>{`
.bw-content {
  font-family: var(--font-manrope), 'Manrope', Arial, Helvetica, sans-serif;
}
.bw-content .bw-liquid-panel {
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(255, 255, 255, 0.72);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}
.bw-content input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
.bw-content select,
.bw-content textarea {
  background-color: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(228, 228, 231, 0.95) !important;
  color: rgb(24, 24, 27);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 8px 26px rgba(15, 23, 42, 0.06);
}
.bw-content input::placeholder,
.bw-content textarea::placeholder {
  color: rgba(82, 82, 91, 0.7);
}
.bw-content input:focus,
.bw-content select:focus,
.bw-content textarea:focus {
  outline: none;
  border-color: rgba(244, 114, 182, 0.72) !important;
  box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.86);
}
.bw-content .bw-subtle-card {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.bw-content .bw-widget-grid {
  grid-template-columns: minmax(0, 1fr);
}
.bw-content .bw-widget-shell {
  grid-column: 1 / -1;
  min-height: auto;
}
@media (min-width: 768px) {
  .bw-content .bw-widget-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-auto-rows: minmax(112px, auto);
    grid-auto-flow: dense;
  }
  .bw-content .bw-widget-shell {
    grid-column: span var(--bw-widget-cols) / span var(--bw-widget-cols);
    min-height: var(--bw-widget-min-height);
  }
  .bw-content .bw-widget-shell > section {
    height: 100%;
  }
}
.bw-content .bw-board-shell {
  background: rgba(255, 255, 255, 0.94);
  color: rgb(24, 24, 27);
}
.bw-content .bw-board-shell.bw-project-board-shell {
  background: transparent !important;
}
.bw-content .bw-project-board-shell .bw-board-main-scroll,
.bw-content .bw-project-board-shell .bw-timeline-flow {
  background: transparent !important;
}
.bw-content .bw-project-board-shell .bw-kanban-column,
.bw-content .bw-project-board-shell .bw-timeline-flow section {
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.bw-content .bw-project-board-shell .bw-kanban-column[class*="bg-white/"],
.bw-content .bw-project-board-shell .bw-kanban-column [class*="bg-white/"],
.bw-content .bw-project-board-shell .bw-timeline-flow [class*="bg-white/"],
.bw-content .bw-project-board-shell .bw-kanban-column[class*="bg-white/["],
.bw-content .bw-project-board-shell .bw-kanban-column [class*="bg-white/["],
.bw-content .bw-project-board-shell .bw-timeline-flow [class*="bg-white/["] {
  background: rgba(255, 255, 255, 0.045) !important;
}
.bw-content .bw-project-board-shell .bw-kanban-column [class*="hover:bg-white/"]:hover,
.bw-content .bw-project-board-shell .bw-timeline-flow [class*="hover:bg-white/"]:hover,
.bw-content .bw-project-board-shell .bw-kanban-column [class*="hover:bg-white/["]:hover,
.bw-content .bw-project-board-shell .bw-timeline-flow [class*="hover:bg-white/["]:hover {
  background: rgba(255, 255, 255, 0.1) !important;
}
.bw-content .bw-board-shell [class*="text-white/"] {
  color: rgba(82, 82, 91, 0.78) !important;
}
.bw-content .bw-board-shell [class*="text-white"] {
  color: rgb(24, 24, 27) !important;
}
.bw-content .bw-board-shell .bw-brand-action,
.bw-content .bw-board-shell [class*="bg-rose-"][class*="text-white"],
.bw-content .bw-board-shell [class*="bg-red-"][class*="text-white"],
.bw-content .bw-board-shell [class*="bg-zinc-950"][class*="text-white"],
.bw-content .bw-board-shell [style*="background-color"][class*="text-white"] {
  color: rgb(255, 255, 255) !important;
}
.bw-content .bw-board-shell .bw-project-name-control,
.bw-content .bw-board-shell .bw-inline-title-input {
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.bw-content .bw-board-shell .bw-project-name-control:focus,
.bw-content .bw-board-shell .bw-inline-title-input:focus {
  background-color: transparent !important;
  box-shadow: inset 0 -2px 0 rgba(244, 114, 182, 0.58) !important;
}
.bw-content .bw-board-shell [class*="border-white/"] {
  border-color: rgba(255, 255, 255, 0.34) !important;
}
.bw-content .bw-board-shell [class*="bg-white/10"],
.bw-content .bw-board-shell [class*="bg-white/12"],
.bw-content .bw-board-shell [class*="bg-white/15"],
.bw-content .bw-board-shell [class*="bg-white/18"],
.bw-content .bw-board-shell [class*="bg-black/10"] {
  background: rgba(255, 255, 255, 0.055) !important;
}
.bw-content .bw-board-main-scroll {
  scrollbar-width: auto;
  scrollbar-color: rgba(244, 114, 182, 0.9) rgba(255, 255, 255, 0.58);
}
.bw-content .bw-board-main-scroll::-webkit-scrollbar {
  height: 18px;
}
.bw-content .bw-board-main-scroll::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  border: 5px solid rgba(255, 255, 255, 0.28);
}
.bw-content .bw-board-main-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, #fb7185, #ec4899);
  border-radius: 999px;
  border: 4px solid rgba(255, 255, 255, 0.62);
}
.bw-content .bw-board-main-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(90deg, #f43f5e, #db2777);
}
`}</style>
  );
}
