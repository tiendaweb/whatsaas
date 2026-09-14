# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primario — dueño o responsable comercial de una PYME que ya vende por WhatsApp.**
Equipos de 2 a 50 personas en Latinoamérica (México, Colombia, Brasil, Argentina, Chile). Hoy operan con teléfonos personales: los mensajes se pierden entre chats, nadie sabe cuántos leads se cerraron el mes pasado, no hay registro para entrenar a nadie, y cuando un asesor se va se lleva los contactos. No vienen buscando software: vienen porque algo se les está escapando.

**Secundario — agencias y resellers** que revenden la plataforma con su propia marca, dominio y precios. En la landing de la plataforma van detrás del comprador final, con una entrada propia y honesta más abajo en la página.

La landing raíz la sirve **cualquier tenant** con su marca: la misma plantilla la ve el visitante de la plataforma y el visitante de un reseller.

## Product Purpose

Convertir WhatsApp, que la PYME ya usa, en una operación comercial con registro, orden y seguimiento: bandeja unificada, CRM, automatizaciones, campañas y analítica sobre el canal que el negocio ya tiene.

Éxito de la landing: **el visitante crea una cuenta** (`/sign-up`). Es la única acción primaria.

## Positioning

Lo que un competidor vecino no puede copiar sin mentir:

- **IA que actúa, no que sólo responde.** El agente mueve leads de etapa, asigna asesores, pone etiquetas y manda documentos. No es un chatbot que contesta.
- **Doble conexión de WhatsApp:** web por QR y la API oficial (WABA). La mayoría del mercado ofrece una sola.
- **Precio pensado para LATAM** y cobro en moneda local (Mercado Pago nativo), no sólo Stripe.
- **Multi-tenant de marca blanca real:** un reseller sirve la plataforma entera bajo su dominio, su marca y sus precios.

## Operating Context

El producto se usa dentro de la jornada, no en una sesión de análisis: alguien contesta un chat mientras suena otro. La evaluación arranca casi siempre desde el celular, con el mismo WhatsApp abierto en otra pestaña.

Conexión en minutos escaneando un QR. Interfaz en español, inglés y portugués.

## Capabilities and Constraints

Confirmado en el código:

- Next.js App Router, rutas bajo `app/[locale]/`; landing raíz en `app/[locale]/page.tsx`, que cae a `app/[locale]/(dashboard)/home-content.tsx` cuando el tenant no tiene landing propia en base de datos.
- **La marca se resuelve por el header `Host`.** Nada bajo `/[locale]` puede prerenderizarse (`export const dynamic = 'force-dynamic'`): un build estático hornearía la marca de la plataforma y la serviría también en los dominios de los resellers.
- Tokens de color en `app/globals.css` (`--primary`, `--background`, `--foreground`, `--muted`, `--border`…), sobreescritos por tenant desde `buildThemeCss(branding)`. **Ningún color de marca puede quedar fijo en el código.**
- Tipografía global: Manrope. Sistema de componentes shadcn/ui sobre Tailwind v4.
- i18n con `next-intl`. Locales `es`, `en`, `pt`; el idioma por defecto es `en` (`i18n/request.ts`). Los textos viven en `messages/{es,en,pt}.json`.
- Los planes de la sección de precios salen de `getPublishedPlans()`; las secciones intermedias y el FAQ salen de `getLandingContent()` y son editables por cada reseller. El contrato de datos de ambos es intocable.
- `STYLE.md` gobierna las pantallas internas de la aplicación (patrón workspace, jerarquía tipográfica, sin sombras fuertes). La landing es una superficie de persuasión y no hereda esa retícula, pero sí hereda los tokens y la fuente.

## Brand Commitments

- El nombre visible sale de `brandName(branding)` / `buildBrandIdentity()`, nunca de una constante. En la plataforma es WhatsPro; en un reseller es lo que ese reseller haya cargado.
- Voz del producto: castellano rioplatense en la aplicación (vos, no tú).
- Marca blanca por encima de todo: **cualquier decisión visual tiene que sobrevivir a que el tenant cambie el color primario.**

## Evidence on Hand

- `marketing/01_resumen_ejecutivo.md`, `marketing/02_analisis_dafo.md`, `marketing/03_business_model_canvas.md`: mercado, segmento, tabla comparativa contra Treble.ai, Kommo y Whaticket.
- El producto real corriendo, que es la prueba más fuerte disponible: bandeja, CRM, constructor de flujos, campañas, analítica.

**Lo que NO existe y no se puede inventar:** clientes con nombre, logos de empresas, testimonios, casos de éxito, benchmarks y cifras de resultado. La landing traía una tira de logos falsos ("TechCorp", "SalesFlow", "AutoChat"…) y métricas sin fuente (+38% de cierres, −62% de caos): se retiran por decisión del usuario y no se reemplazan por nada inventado.

Las capturas y datos del mockup de producto son ilustrativos y deben etiquetarse como tales.

## Product Principles

1. **La prueba es el producto, no el adjetivo.** Lo único que esta landing puede demostrar de verdad es cómo se ve y se comporta la herramienta trabajando.
2. **Nada que no se pueda sostener.** Sin clientes inventados, sin porcentajes sin fuente, sin capacidades que el producto no tiene.
3. **El color es del tenant.** Todo lo que se diseñe tiene que verse igual de bien en verde, naranja o azul, porque el reseller elige.
4. **Habla en el idioma del que pierde plata**, no en el de la categoría: mensajes perdidos, leads que se enfrían, el asesor que se fue con los contactos.
5. **Una sola acción primaria:** crear la cuenta.

## Accessibility & Inclusion

Se evalúa mayormente desde el celular y a una mano. Contraste real sobre el color del tenant (que puede ser claro u oscuro), foco visible por teclado y objetivos táctiles cómodos son requisitos, no adornos.
