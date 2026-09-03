# Sistema visual de referencia

## Fuente y alcance

Este sistema se deriva de recursos públicos servidos por whatspro.uno el 13 de agosto de 2026. Los valores técnicos confirmados son una referencia de estilo. No reutilizar identidad, textos o activos propietarios.

## Tokens confirmados

```css
:root {
  --radius: 0.65rem;
  --background: #ffffff;
  --foreground: #09090b;
  --card: #ffffff;
  --card-foreground: #09090b;
  --primary: #49b653;
  --primary-foreground: #f7fee7;
  --secondary: #f4f4f5;
  --secondary-foreground: #18181b;
  --muted: #f4f4f5;
  --muted-foreground: #71717b;
  --border: #e4e4e7;
  --ring: #9de500;
  --destructive: #e40014;
  --chart-1: #7bf1a8;
  --chart-2: #00c758;
  --chart-3: #00a544;
  --chart-4: #008138;
  --chart-5: #016630;
}

.dark {
  --background: #09090b;
  --foreground: #fafafa;
  --card: #18181b;
  --card-foreground: #fafafa;
  --primary: #49b653;
  --primary-foreground: #f7fee7;
  --secondary: #27272a;
  --muted: #27272a;
  --muted-foreground: #9f9fa9;
  --border: #ffffff1a;
  --ring: #35530e;
  --destructive: #ff6568;
}
```

## Tipografía

- Familia confirmada: `Manrope, Arial, Helvetica, sans-serif`.
- Titular hero: 48–72 px desktop, 38–48 px móvil, peso 700–800, interlineado 0.95–1.05.
- Título de sección: 32–48 px, peso 700.
- Título de tarjeta: 16–20 px, peso 600–700.
- Cuerpo: 15–18 px, peso 400–500, interlineado 1.5–1.65.
- Etiqueta/UI: 12–14 px, peso 500–700.

## Espaciado y forma

- Escala recomendada: 4, 8, 12, 16, 24, 32, 48, 64, 96 px.
- Contenedor de marketing: 1120–1240 px.
- Radio base confirmado: 10.4 px; usar 10 px en controles, 16–24 px en tarjetas protagonistas.
- Bordes: 1 px `--border`.
- Sombras: bajas, amplias y neutrales; elevar sólo popovers, modales y demos protagonistas.

## Composición

- Mucho espacio blanco y bloques de producto densos sólo donde demuestran valor.
- Titulares cortos con una palabra o línea en verde cuando ayude a escanear.
- CTA primario verde sólido; secundario neutro o enlace.
- Tarjetas de funcionalidad en grilla de 2–3 columnas, icono lineal, título y texto breve.
- Mockups de producto con zonas claramente separadas: navegación, lista, espacio de trabajo y contexto.

## Iconografía, movimiento y voz

- Librería confirmada en bundles: Lucide; trazo 1.75–2 px y tamaños 16, 20 y 24 px.
- Movimiento: 150–250 ms para UI y 300–500 ms para secciones. Respetar `prefers-reduced-motion`.
- Hablar de resultado antes que de tecnología, con verbo + resultado + contexto.
- Evitar superlativos vacíos y apoyar promesas con una función, flujo o métrica identificada como ejemplo.

## Checklist visual

- El CTA principal domina sin competir con varios verdes.
- El texto secundario mantiene contraste AA.
- Los bordes separan zonas sin convertir cada elemento en una caja.
- La demo sigue siendo comprensible a 360 px.
- El producto parece operativo: datos, estados, acciones y feedback coherentes.
