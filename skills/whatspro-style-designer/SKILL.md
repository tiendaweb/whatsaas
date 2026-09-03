---
name: whatspro-style-designer
description: Diseña, rediseña, implementa o audita landing pages, dashboards, CRM, inboxes, constructores de flujos y piezas visuales inspiradas en el lenguaje SaaS de WhatsPro. Usar cuando se pida una estética similar a whatspro.uno, una interfaz verde de automatización de WhatsApp, un CRM moderno o un sistema visual coherente para ventas, soporte y agentes de IA. No copiar logotipos, textos, marcas ni activos propietarios; crear una versión original basada en patrones y tokens documentados.
---

# WhatsPro Style Designer

Crear interfaces SaaS originales, claras y comerciales con el sistema visual documentado. Mantener la semejanza en el lenguaje de diseño, no en la identidad propietaria.

## Flujo obligatorio

1. Clasificar el entregable: landing, dashboard, inbox, Kanban, flow builder, pricing, campaña o kit de componentes.
2. Leer `references/brand-system.md` para cualquier trabajo visual.
3. Leer `references/implementation.md` si se escribirá código o se elegirán librerías.
4. Definir objetivo, usuario, acción principal, estados y datos reales antes de diseñar.
5. Aplicar los tokens como variables semánticas; evitar hex dispersos en componentes.
6. Crear una composición original. No reutilizar el nombre WhatsPro, su copy, sus logotipos ni sus ilustraciones.
7. Verificar responsive, foco visible, contraste, navegación por teclado, estados vacíos/carga/error y reducción de movimiento.

## Dirección de diseño

- Usar Manrope para interfaz y titulares; fallback `Arial, Helvetica, sans-serif`.
- Construir sobre blanco y zinc casi negro, con verde medio como acción principal.
- Reservar el verde brillante para foco, selección, éxito y momentos de alto valor.
- Usar radios de 10 px como base; tarjetas amplias, bordes zinc suaves y sombras discretas.
- Priorizar jerarquía fuerte: eyebrow breve, titular compacto, explicación corta y CTA visible.
- Representar el producto con UI realista: conversaciones, etiquetas, embudos, nodos, métricas y propiedades.
- Usar iconos lineales consistentes; preferir Lucide.
- Admitir tema oscuro mediante los tokens documentados, no invirtiendo colores de forma automática.

## Patrones por pantalla

- **Landing:** anuncio fino, navegación simple, hero de dos columnas, demo de producto, prueba/beneficios, funciones, pricing y CTA final.
- **Inbox CRM:** lista de conversaciones, chat central y panel de contexto; colapsar paneles de forma deliberada en móvil.
- **Flow builder:** paleta lateral, lienzo, nodos con estado y panel de propiedades; no fingir conexiones funcionales si son sólo decorativas.
- **Dashboard:** una métrica principal, 3–5 métricas secundarias, tendencia, cola operativa y siguiente acción.
- **Piezas publicitarias:** conservar fondo limpio, verde como ancla, captura simplificada y una sola promesa principal.

## Reglas de calidad

- No saturar toda la pantalla de verde.
- No usar gradientes decorativos sin propósito.
- No esconder acciones críticas sólo en hover.
- No inventar datos presentados como reales.
- No afirmar que una librería está instalada sin revisar el proyecto.
- No introducir una dependencia si CSS y componentes existentes resuelven el caso.
- Entregar variables/tokens, estructura, componentes y criterios de aceptación junto con el diseño cuando el usuario pida implementación.

## Cierre

Informar qué se creó, qué tokens se aplicaron, qué partes son originales y cómo se verificó. Si la tarea es una auditoría, separar hallazgos confirmados, inferidos y no verificables.
