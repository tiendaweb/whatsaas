/**
 * Contenido del "Manual del equipo". Se escribe en markdown y el seed lo convierte a
 * JSON de ProseMirror. Los números salen de la base del equipo 2 (13 de julio de 2026).
 */
export type SeedDocument = {
  slug: string;
  title: string;
  emoji: string;
  markdown: string;
};

const REPORTE = `
Foto del CRM al **13 de julio de 2026**. Los números salen de la base, no de una estimación.

## Resumen en una línea

El embudo tiene **30 etapas** para un equipo de **2 personas**, y **el 66% de los contactos con etapa están todos en la misma bolsa** ("Asesoramiento"). No es un problema de disciplina: es que el embudo no refleja cómo trabajan de a dos.

## Los números

- **425 contactos** en total.
- **163 sin etapa** (38%): no están en el embudo.
- **395 sin departamento** (93%).
- **397 sin responsable asignado** (93%).

## Etapas del embudo (30)

De las 30 etapas, **13 están completamente vacías**. Así se reparten las que sí se usan:

- ⭐ **Asesoramiento — 172 contactos** (66% de los que tienen etapa)
- 😎 Cliente activo — 21
- 📌 Nuevo lead — 12
- ⏰ Esperando Pago / Seña — 8
- 📌 Seguimiento 1 — 7
- 🕦 No contesto — 7
- 💼 En Producción — 7
- 👌 Terminado / entregado — 6
- 📌 Terminado / entregado — 5 (**sí: existe dos veces**)
- 💼 Potencial cliente — 4
- 🚫 Perdido / no califica — 4
- ☑️ Sitios / trabajos por hacer — 3
- 🤑 Cliente Pago — 2
- 🕦 Procesando / 🔥 Esperando Info / ⏰ Esperando Respuesta / 👀 En Revisión — 1 cada una

Problemas concretos:

- **"Terminado / entregado" existe dos veces** (posición 10 con 👌 y posición 29 con 📌). Hay 6 contactos en una y 5 en la otra. Ninguna lista los muestra juntos.
- El emoji 📌 se repite en **16 etapas** y ⏰ en dos. De un vistazo, en el tablero no se distingue una etapa de otra.
- "Asesoramiento" funciona como cajón de sastre: adentro conviven un lead que recién escribió y alguien a punto de pagar.
- Las 13 etapas vacías son casi todas del embudo "ideal" que se creó pero nunca se usó (Calificación, Demo enviada, Presupuesto a preparar, Revisión interna, Ajustes solicitados, Renovación / cobro mensual, Upsell, Pausado…).

## Grupos de etapas (5)

Acá hay algo importante que **el sistema ya permite y ustedes ya usan**: una etapa puede estar en **varios grupos a la vez**.

- **Ventas General** — 6 etapas: ⭐ Asesoramiento, ⏰ Esperando Pago / Seña, 🤑 Cliente Pago, ⏰ Esperando Respuesta, 💼 Potencial cliente, 📌 Terminado / entregado
- **Produccion** — 5 etapas: 💼 En Producción, ☑️ Sitios / trabajos por hacer, 🤑 Cliente Pago, 👀 En Revisión, 👌 Terminado / entregado
- **NUEVO CLIENTE** — 1 etapa: 🤑 Cliente Pago
- **Primer Seguimiento** — 2 etapas: ⏰ Esperando Respuesta, 🕦 No contesto
- **Gesion Sin Asignar** — 4 etapas: 🕦 Procesando, 📌 Seguimiento 1, 📌 Seguimiento 2, 📌 Seguimiento final

🤑 **Cliente Pago está compartida en tres grupos** (Ventas General + NUEVO CLIENTE + Produccion). Ese es exactamente el mecanismo correcto para un traspaso: la misma tarjeta se ve desde los dos lados. El problema no es el mecanismo, es que sólo se usó una vez y de casualidad.

También hay etapas importantes que **no están en ningún grupo**: 😎 Cliente activo (21 contactos), 📌 Nuevo lead (12), 🚫 Perdido (4), 🔥 Esperando Info. Quedan fuera de cualquier vista agrupada.

## Departamentos (6)

Seis departamentos para dos personas:

- AAPP SPACE — 13 contactos, 1 miembro
- Producción y Desarrollo — 8 contactos, **0 miembros**
- Soporte Técnico — 8 contactos, **0 miembros**
- Administración y Cobros — 1 contacto, 1 miembro
- Community Manager — 0 contactos, 1 miembro
- Marketing y Ads — 0 contactos, 1 miembro

Dos nunca se usaron y dos no tienen a nadie adentro. Como el 93% de los contactos no tiene departamento, hoy el dato no sirve para filtrar nada.

## Etiquetas (26)

**Las 26 son grises.** No aportan ninguna señal visual. Y las dos más usadas no son etiquetas de negocio, son marcas de importación:

- **04/26 — 220 contactos** (más de la mitad de la base)
- **29-06 — 41 contactos**

Las que sí dicen algo del negocio: Combo Sitio + Tienda (37), Tienda Online (32), Sitio Web (30), Ads Meta (9), Desarrollo a Medida (9), Sitio Web PRO (7), Tienda Online PRO (6), Compra Automática (3), Carga de Productos (2), Creación de redes (2), Ads Google (1), Chatpro (1), Kit Redes x3 y x6 (1 c/u), Membresía Activa (1), Señado (1).

Sin usar: Kit Redes x9, Membresía Próxima a Vencer, Membresía Vencida, Pago Pendiente. Justo las de cobranza y membresías, que es lo que más falta les hace.

## Campos personalizados (26)

Cuántos contactos tienen cada campo cargado:

- Rubro — 65
- Cliente — 38
- Email, Marca, Plan Contratado — 21 cada uno
- Monto — 19 · Dominio — 17
- Cuotas, Instagram, Sitio Web, Tiene Dominio Propio — 13 cada uno
- Frecuencia — 12 · Seña — 10 · Tienda Online — 9 · Horarios — 7 · Facebook — 5
- Direccion, Dominio Comprado, Dominio Conectado — 3 cada uno
- Link Demo — 2 · Instagram 2, Link Presupuesto, Presupuesto, TikTok — 1 cada uno
- **Instagram 3 y LinkedIn — 0. Nunca se usaron.**

Es la parte más sana del sistema: son campos que describen el negocio de verdad. Lo que falta es decidir **cuáles son obligatorios antes de pasar a producción** (marca, rubro, plan contratado, dominio), porque son los que Martin necesita para arrancar.

## Qué haría distinto

Ver **Comparación: actual vs propuesto**, **Embudo propuesto (2 personas)** y **El embudo dibujado**.
`;

const COMPARACION = `
Todo lo que hay hoy, al lado de lo que propongo. Los números son reales, del 13 de julio de 2026.

## 1. Etapas: 30 → 16

**Hoy:** 30 etapas, 13 vacías, una duplicada, 16 con el mismo emoji 📌, y una ("⭐ Asesoramiento") que se come el 66% de los contactos.

**Propuesto:** 16 etapas, todas con un emoji propio y todas con una acción clara. Ninguna vacía, porque cada una recibe contactos que hoy están amontonados.

Cómo se mapea lo viejo a lo nuevo:

- 🕦 Procesando · ⭐ Asesoramiento · 💼 Potencial cliente → se reparten en **💬 Conversando** y **📄 Presupuesto enviado**
- 📌 Nuevo lead → **🆕 Nuevo lead**
- 📌 Calificación / Diagnóstico · 📌 Demo / ejemplos enviados → **💬 Conversando**
- 📌 Presupuesto a preparar · 📌 Presupuesto enviado → **📄 Presupuesto enviado**
- ⏰ Esperando Respuesta · 🕦 No contesto · 📌 Seguimiento 1, 2 y final → **⏳ Seguimiento** (una sola, con la fecha del último contacto en el campo)
- ⏰ Esperando Pago / Seña → **💰 Esperando seña**
- 🤑 Cliente Pago · 💼 En Producción · ☑️ Sitios / trabajos por hacer → **🎨 En producción**
- 🔥 Esperando Info → **📝 Esperando info del cliente**
- 👀 En Revisión · 📌 Revisión interna · 📌 Ajustes solicitados → **👀 En revisión del cliente**
- 👌 Terminado / entregado · 📌 Terminado / entregado (las dos) · 📌 Aprobado / listo para publicar → **✅ Entregado**
- 😎 Cliente activo → **😎 Cliente activo**
- 📌 Renovación / cobro mensual → **🔁 Renovación** y **💵 Cobro pendiente** (son dos cosas distintas)
- 📌 Soporte / pedido activo → **🗓️ Mes en curso**
- 📌 Upsell / mejora ofrecida → **⬆️ Upsell**
- 📌 Pausado → **⏸️ Pausado / baja**
- 🚫 Perdido / no califica → **🚫 Perdido**

## 2. Grupos de etapas: 5 → 3 (y las etapas compartidas se usan a propósito)

**Hoy:** 5 grupos. "Ventas General" y "Produccion" se ven llenos, pero 😎 Cliente activo, 📌 Nuevo lead y 🚫 Perdido **no están en ningún grupo**. 🤑 Cliente Pago está compartida en 3 grupos, casi de casualidad.

**Propuesto:** 3 grupos que son las 3 vistas que necesitan, con **3 etapas compartidas** que son justo las costuras entre uno y otro:

**🟦 VENTAS (Noelia)** — 6 etapas
🆕 Nuevo lead · 💬 Conversando · 📄 Presupuesto enviado · ⏳ Seguimiento · **💰 Esperando seña** · 🚫 Perdido

**🟨 PRODUCCIÓN (Martin)** — 6 etapas
**💰 Esperando seña** (compartida) · 🎨 En producción · 📝 Esperando info del cliente · 👀 En revisión del cliente · **✅ Entregado** · **🗓️ Mes en curso** (compartida)

**🟩 RECURRENTE / POSVENTA (Noelia)** — 7 etapas
**✅ Entregado** (compartida) · 😎 Cliente activo · **🗓️ Mes en curso** (compartida) · 💵 Cobro pendiente · 🔁 Renovación · ⬆️ Upsell · ⏸️ Pausado / baja

Las tres compartidas y para qué sirven:

- **💰 Esperando seña** — Noelia la ve como "me falta cobrar"; Martin la ve como "esto entra la semana que viene". Nadie tiene que avisarle a nadie.
- **✅ Entregado** — Martin la ve como "terminé"; Noelia la ve como "ya puedo empezar a cobrarle el mes".
- **🗓️ Mes en curso** — el trabajo recurrente (contenido, ads, mantenimiento). Martin lo ve como carga de trabajo del mes; Noelia lo ve como servicio que hay que facturar.

## 3. Departamentos: 6 → 2

**Hoy:** AAPP SPACE (13 contactos, 1 miembro) · Producción y Desarrollo (8, **0 miembros**) · Soporte Técnico (8, **0 miembros**) · Administración y Cobros (1) · Community Manager (0) · Marketing y Ads (0).

**Propuesto:** **Ventas** (Noelia) y **Producción** (Martin). Nada más. Son dos personas; seis departamentos es una estructura de una empresa que no existe. Lo que hoy se intenta decir con "Marketing y Ads" o "Community Manager" ya lo dice la **etiqueta de producto** (qué compró) y la **etapa** (en qué anda).

## 4. Etiquetas: 26 grises → ~18 con color y un solo significado

**Hoy** las etiquetas mezclan cuatro cosas distintas: producto (Sitio Web), estado (Señado, Pago Pendiente), membresía (Membresía Vencida) y basura de importación (**04/26 con 220 contactos**, 29-06 con 41). Y todas son grises.

**La regla propuesta: la etiqueta dice QUÉ COMPRÓ. El estado lo dice la etapa. Nunca las dos cosas.**

**🔵 Azul — Proyecto puntual (se hace una vez y se entrega)**
Sitio Web · Sitio Web PRO · Tienda Online · Tienda Online PRO · Combo Sitio + Tienda · Desarrollo a Medida · Carga de Productos · Creación de logo

**🟢 Verde — Servicio recurrente (se cobra todos los meses o todos los años)**
Membresía Mensual · Membresía Anual · Kit Redes x3 · Kit Redes x6 · Kit Redes x9 · Ads Meta · Ads Google · Chatpro

**🟡 Amarillo — Origen del lead**
Vino por Ads · Recomendado · Orgánico / Instagram · Visita presencial

**Se eliminan:** 04/26 y 29-06 (marcas de importación: eso va en el campo "Origen" o en la fecha de creación, no en una etiqueta que pinta media base). Señado, Pago Pendiente, Membresía Activa, Membresía Vencida, Membresía Próxima a Vencer y Rediseño Gratis a Pro **desaparecen como etiquetas**: son estados, y ahora viven en las etapas 💰, 💵, 😎, 🔁 y ⏸️.

## 5. Campos personalizados: 26 → 20 (y con reglas)

**Se eliminan (0 usos):** Instagram 3, LinkedIn.
**Se fusionan:** Presupuesto + Link Presupuesto → **Link Presupuesto**. Dominio Comprado + Dominio Conectado + Tiene Dominio Propio → **Estado del dominio** (una lista: no tiene / propio / comprado por nosotros / conectado).

**Se agregan, porque el negocio los necesita y hoy no existen:**

- **Tipo de servicio** (lista: Sitio Web / Tienda / Combo / Desarrollo a medida / Membresía / Ads / Contenido)
- **Ciclo de cobro** (lista: Único / Mensual / Anual)
- **Importe mensual** (número) — hoy "Monto" mezcla el precio del proyecto con la cuota
- **Fecha de alta del servicio** (fecha)
- **Fecha de vencimiento / próxima renovación** (fecha) — **es el campo más importante que hoy falta**: sin él, la etapa 🔁 Renovación no se puede automatizar
- **Origen del lead** (lista) — reemplaza las etiquetas 04/26 y 29-06
- **Motivo de pérdida** (texto) — para que 🚫 Perdido sirva de algo

**Obligatorios antes de mover a 🎨 En producción:** Marca, Rubro, Tipo de servicio, Plan Contratado, Estado del dominio. Son los cinco que Martin necesita para arrancar sin preguntar nada.

**Obligatorio antes de mover a 😎 Cliente activo:** Ciclo de cobro y Fecha de vencimiento.

## 6. Resumen de la comparación

- Etapas: **30 → 16** (0 vacías, 0 duplicadas, 1 emoji único cada una)
- Grupos: **5 → 3**, con **3 etapas compartidas** usadas a propósito como traspaso
- Departamentos: **6 → 2**
- Etiquetas: **26 grises → ~18 en 3 familias de color**, y sólo dicen qué compró
- Campos: **26 → 20**, con obligatorios por etapa y la fecha de vencimiento que hoy falta

> Nada de esto está aplicado. Es una propuesta escrita. Los 425 contactos vivos siguen intactos.
`;

const EMBUDO = `
Embudo pensado para **dos personas** y para lo que realmente venden: sitios web, tiendas online, marketing, contenido, membresías (mensuales y anuales) y desarrollos a medida.

La regla que ordena todo: **una etapa = una acción pendiente, y siempre hay un dueño.** Si mirás una tarjeta y no sabés qué hay que hacer ni quién lo hace, la etapa está mal puesta.

## 🟦 VENTAS — dueña: Noelia

1. 🆕 **Nuevo lead** — escribió por primera vez, todavía no hablamos.
2. 💬 **Conversando** — estamos entendiendo qué necesita (rubro, marca, si tiene dominio, qué quiere vender).
3. 📄 **Presupuesto enviado** — ya tiene precio y alcance.
4. ⏳ **Seguimiento** — no contestó; hay que insistir.
5. 💰 **Esperando seña** — dijo que sí, falta que pague. *(compartida con Producción)*
6. 🚫 **Perdido** — no va. Se anota el motivo y se cierra.

## 🟨 PRODUCCIÓN — dueño: Martin

5. 💰 **Esperando seña** — *(la misma tarjeta, vista desde Producción: "esto me entra pronto")*
7. 🎨 **En producción** — señó, Martin está trabajando.
8. 📝 **Esperando info del cliente** — falta material (logo, textos, fotos, accesos).
9. 👀 **En revisión del cliente** — se le mostró, esperamos su OK o sus correcciones.
10. ✅ **Entregado** — publicado y aprobado. *(compartida con Recurrente)*
11. 🗓️ **Mes en curso** — el trabajo del mes de los servicios recurrentes: contenido, ads, mantenimiento. *(compartida con Recurrente)*

## 🟩 RECURRENTE / POSVENTA — dueña: Noelia

10. ✅ **Entregado** — *(la misma tarjeta, vista desde Posventa: "ya puedo empezar a cobrarle")*
12. 😎 **Cliente activo** — el servicio está andando, no hay nada pendiente.
11. 🗓️ **Mes en curso** — hay trabajo del mes en marcha (Kit Redes, Ads, contenido).
13. 💵 **Cobro pendiente** — la cuota venció y no entró.
14. 🔁 **Renovación** — se acerca el vencimiento (mensual o anual). Hay que hablarle **antes**, no después.
15. ⬆️ **Upsell** — hay una oportunidad concreta (pasar a PRO, sumar ads, sumar tienda).
16. ⏸️ **Pausado / baja** — dejó de pagar o pidió pausa. Se anota el motivo.

## Las 3 etapas compartidas (y por qué importan)

El sistema **ya permite** que una etapa esté en varios grupos (hoy 🤑 Cliente Pago está en tres, de casualidad). Usemos eso a propósito, en las tres costuras del proceso:

- **💰 Esperando seña** → Ventas + Producción. Noelia ve "falta que pague"; Martin ve "esto entra la semana que viene" y puede planificar. Nadie tiene que avisarle a nadie.
- **✅ Entregado** → Producción + Recurrente. Martin ve "terminé"; Noelia ve "ya arranca el ciclo de cobro".
- **🗓️ Mes en curso** → Producción + Recurrente. Martin lo ve como su carga de trabajo del mes; Noelia lo ve como el servicio que está facturando.

Una tarjeta, una etapa, dos vistas. Eso es todo el traspaso.

## Los dos únicos cambios de dueño

- **💰 Esperando seña → 🎨 En producción**: entra la plata, la tarjeta pasa a ser de Martin.
- **✅ Entregado → 😎 Cliente activo**: Martin terminó, la tarjeta vuelve a Noelia.

Regla visual: si la tarjeta está en amarillo 🟨, la mueve Martin. Si está en azul 🟦 o verde 🟩, la mueve Noelia.

## Cómo entra cada tipo de cliente

- **Sitio web / Tienda online / Combo** — recorrido completo: 🆕 → 💬 → 📄 → 💰 → 🎨 → 👀 → ✅ → 😎. Si además contrató mantenimiento o membresía, se queda en el ciclo verde.
- **Desarrollo a medida** — igual, pero el ida y vuelta 🎨 ⇄ 📝 ⇄ 👀 se repite varias veces. Es normal: la tarjeta rebota entre esas tres hasta que aprueba.
- **Marketing (Ads Meta / Google)** — venta corta: 🆕 → 💬 → 📄 → 💰 → 🎨 (armado de campaña) → ✅ → y después **vive en 🗓️ Mes en curso**, mes a mes, con 🔁 cuando toca renovar.
- **Contenido (Kit Redes x3/x6/x9)** — igual que marketing: el peso está en 🗓️ Mes en curso. Cada mes que arranca, la tarjeta vuelve ahí.
- **Membresía mensual** — 😎 Cliente activo es su casa. Se mueve a 💵 si no pagó, a 🔁 unos días antes del vencimiento, a ⏸️ si se da de baja.
- **Membresía anual** — igual, pero 🔁 se activa **30 días antes** del vencimiento. Es la venta más fácil del año y la que más se pierde por no avisar a tiempo.

Para que esto funcione hace falta un campo que hoy no existe: **Fecha de vencimiento / próxima renovación**. Sin eso, la etapa 🔁 hay que llenarla a mano y se va a olvidar.

> Nada de esto está aplicado todavía. Es una propuesta escrita; los 425 contactos vivos no se tocaron. Ver **Comparación: actual vs propuesto** y **El embudo dibujado**.
`;

const DIBUJO = `
El mismo embudo, dibujado. Sirve para los seis tipos de cliente que venden: **sitios web, tiendas online, marketing, contenido, membresías (mensuales y anuales) y desarrollos a medida**.

## El recorrido completo

\`\`\`
                 🟦 VENTAS  (Noelia)
                 ─────────────────────
                    🆕 Nuevo lead
                          │
                          ▼
                   💬 Conversando  ◄──────┐
                          │               │ contesta
                          ▼               │
                  📄 Presupuesto ─────────┤
                          │               │
                          ▼               │
                   ⏳ Seguimiento ────────┘
                          │
                 no da señales │  dice que sí
                    ▼          ▼
              🚫 Perdido   💰 Esperando seña   ◄══ COMPARTIDA
              (con motivo)         │               Ventas + Producción
                                   │
                     ══════════════╡ entra la plata
                                   │ (cambia de dueño)
                 🟨 PRODUCCIÓN  (Martin)
                 ─────────────────────────
                                   ▼
              📝 Esperando info ⇄ 🎨 En producción
                                   │
                                   ▼
                        👀 En revisión del cliente
                                   │
                          pide cambios │ aprueba
                            ▲          ▼
                         (vuelve a 🎨)  ✅ Entregado   ◄══ COMPARTIDA
                                             │              Producción + Recurrente
                     ════════════════════════╡ vuelve a Noelia
                                             │
                 🟩 RECURRENTE / POSVENTA  (Noelia)
                 ──────────────────────────────────
                                             ▼
                                     😎 Cliente activo
                                             │
        ┌──────────────┬─────────────────────┼──────────────┐
        ▼              ▼                     ▼              ▼
  🗓️ Mes en curso  💵 Cobro pend.      🔁 Renovación    ⬆️ Upsell
  (contenido/ads)   (no pagó)         (antes de vencer)  (más servicio)
        │              │                     │              │
        │ termina      │ paga        renueva │ no renueva   │ compra
        └──────────────┴──────────┬──────────┘              │
                                  ▼                         ▼
                          😎 Cliente activo         📄 Presupuesto
                                                    (arranca de nuevo)
                                  │ se da de baja
                                  ▼
                          ⏸️ Pausado / baja

  🗓️ Mes en curso también es COMPARTIDA (Producción + Recurrente):
     Martin ve el trabajo del mes, Noelia ve el servicio que factura.
\`\`\`

## Cómo se ve el tablero de cada uno

\`\`\`
  TABLERO DE NOELIA (🟦 Ventas + 🟩 Recurrente)
  ┌────────┬───────────┬────────────┬───────────┬───────────┐
  │   🆕   │    💬     │     📄     │    ⏳     │    💰     │
  │ Nuevo  │Conversando│Presupuesto │Seguimiento│  Seña     │
  └────────┴───────────┴────────────┴───────────┴───────────┘
  ┌────────┬───────────┬────────────┬───────────┬───────────┐
  │   😎   │    💵     │     🔁     │    ⬆️     │    ⏸️     │
  │ Activo │  Cobro    │ Renovación │  Upsell   │ Pausado   │
  └────────┴───────────┴────────────┴───────────┴───────────┘

  TABLERO DE MARTIN (🟨 Producción)
  ┌────────┬───────────┬────────────┬───────────┬───────────┐
  │   💰   │    🎨     │     📝     │    👀     │    ✅     │
  │  Seña  │Produciendo│Falta info  │ Revisión  │ Entregado │
  └────────┴───────────┴────────────┴───────────┴───────────┘
  ┌────────┐
  │   🗓️   │  ← el trabajo recurrente del mes
  │Mes curso│
  └────────┘
\`\`\`

## El recorrido según qué compró

\`\`\`
  SITIO WEB / TIENDA / COMBO   (proyecto puntual)
  🆕 → 💬 → 📄 → 💰 → 🎨 → 👀 → ✅ → 😎
                          └─ 📝 si falta material

  DESARROLLO A MEDIDA          (proyecto largo)
  🆕 → 💬 → 📄 → 💰 → 🎨 ⇄ 📝 ⇄ 👀 (varias vueltas) → ✅ → 😎

  MARKETING (Ads Meta / Google)   (venta corta + mensual)
  🆕 → 💬 → 📄 → 💰 → 🎨 → ✅ → 😎 → 🗓️ cada mes → 🔁

  CONTENIDO (Kit Redes x3/x6/x9)  (mensual)
  🆕 → 💬 → 📄 → 💰 → ✅ → 😎 → 🗓️ cada mes → 🔁

  MEMBRESÍA MENSUAL
  ... → 😎 ──┬─→ 💵 si no paga ──→ 😎  o  ⏸️
             └─→ 🔁 unos días antes de vencer → 😎

  MEMBRESÍA ANUAL
  ... → 😎 ──→ 🔁 TREINTA DÍAS ANTES de vencer → 😎
             (es la venta más fácil del año; se pierde por avisar tarde)
\`\`\`

## Las tres reglas que sostienen todo

1. **No se pasa a 🎨 sin la seña.** Es la única regla dura. Si entra sin pagar, se trabaja gratis.
2. **Nada duerme en 💬.** Si hace más de dos días que no contesta, va a ⏳ Seguimiento. "Conversando" es una charla viva, no un archivo.
3. **🔁 se anticipa, no se reacciona.** La renovación se trabaja **antes** del vencimiento. Si la tarjeta llegó a 💵 Cobro pendiente, ya llegaste tarde.

## Qué mira cada uno a la mañana

**Noelia:** primero 💰 (¿quién tiene que pagar hoy?), después 🔁 (¿a quién se le vence esta semana?), después ⏳ (¿a quién le escribo?), y al final 🆕 (¿quién entró?).

**Martin:** primero 📝 (¿a quién hay que pedirle material?), después 🗓️ (¿qué le debo a los clientes del mes?), después 🎨 (¿qué estoy haciendo hoy?), y por último 👀 (¿quién no me contestó las correcciones?).
`;

const GUIA = `
Cómo mover una tarjeta por el embudo sin pensarlo demasiado. Está escrito sobre el embudo propuesto (ver **Embudo propuesto (2 personas)** y **El embudo dibujado**).

## La regla de oro

**Una etapa = una acción pendiente, y siempre hay un dueño.**

Antes de mover una tarjeta, preguntate: *¿qué es lo próximo que tiene que pasar, y quién lo hace?* La respuesta te dice la etapa.

## El recorrido normal

1. 🆕 **Nuevo lead** — Entra un mensaje nuevo. Apenas le contestás, pasala a 💬.
2. 💬 **Conversando** — Acá se averigua qué necesita: rubro, marca, si tiene dominio, qué quiere vender. Completá los campos **ahora**, no después: son los que Martin va a necesitar. Cuando le pasás precio, mové a 📄.
3. 📄 **Presupuesto enviado** — Ya sabe cuánto sale. La pelota está de su lado.
4. ⏳ **Seguimiento** — Si pasaron 48 h sin respuesta, la tarjeta cae acá. Es tu lista de "a quién le escribo hoy". Si contesta, vuelve a 💬 o 📄. Si después de 2 o 3 intentos no da señales, va a 🚫.
5. 💰 **Esperando seña** — Dijo que sí. Sólo falta la plata. **Mirala todos los días.** Martin también la ve: va sabiendo qué le entra.
6. 🎨 **En producción** — Entró la seña. Acá la tarjeta **cambia de dueño**: pasa a Martin.
7. 📝 **Esperando info del cliente** — Martin arrancó y falta material (logo, textos, fotos, accesos). La etapa es de Martin, pero **pedir el material es trabajo de Noelia**.
8. 👀 **En revisión del cliente** — Se le mostró. Si pide cambios, vuelve a 🎨. Si aprueba, va a ✅.
9. ✅ **Entregado** — Publicado y aprobado. Martin la mueve acá y **vuelve a Noelia**.
10. 😎 **Cliente activo** — Todo andando, nada pendiente. Es la casa de las membresías.
11. 🗓️ **Mes en curso** — Sólo para servicios recurrentes (Kit Redes, Ads, contenido). Cada mes que arranca, la tarjeta viene acá; cuando se entrega el trabajo del mes, vuelve a 😎.
12. 💵 **Cobro pendiente** — Venció la cuota y no entró la plata. Si paga, vuelve a 😎. Si no, después de dos intentos va a ⏸️.
13. 🔁 **Renovación** — Se acerca el vencimiento. **Mensual: 5 días antes. Anual: 30 días antes.** Si renueva, vuelve a 😎. Si no, ⏸️.
14. ⬆️ **Upsell** — Hay algo concreto para ofrecerle (pasar a PRO, sumar ads, sumar tienda). Si le vendés, arranca de nuevo en 📄.
15. ⏸️ **Pausado / baja** — Dejó de pagar o pidió pausa. Escribí el motivo.
16. 🚫 **Perdido** — No va. **Escribí el motivo antes de cerrar**: en tres meses eso es información, no un lamento.

## Qué NO hacer

- **Dejar tarjetas eternas en 💬 Conversando.** Más de dos días sin respuesta → ⏳ Seguimiento.
- **Mover a 🎨 En producción sin la seña.** La única regla dura.
- **Esperar a que venza para hablar de la renovación.** Para eso está 🔁, y se usa **antes** de la fecha.
- **Dejar 🚫 Perdido o ⏸️ Pausado sin motivo.** El motivo es lo único que los hace útiles.
- **Tener la misma tarjeta en dos etapas.** Una tarjeta, una etapa. (Que se vea desde dos grupos no es lo mismo: eso es una etapa compartida, y está bien.)

## Un ejemplo completo

> Entra "Panadería Rivas" por WhatsApp preguntando por una tienda online.
>
> 🆕 → Noelia contesta → 💬 (carga rubro: gastronomía, marca: Rivas, dominio: no tiene) → le pasa precio → 📄 → no contesta en dos días → ⏳ → contesta que sí → 💰 (Martin ya la ve venir) → paga la seña → 🎨 (ahora es de Martin) → falta el logo → 📝 → llega el logo → 🎨 → primera versión → 👀 → pide cambiar colores → 🎨 → aprueba → ✅ (vuelve a Noelia) → 😎.
>
> Como también contrató Kit Redes x3: cada mes la tarjeta pasa a 🗓️ Mes en curso mientras Martin produce los posteos, y vuelve a 😎 cuando se entregan. A los 11 meses, la membresía anual del sitio entra en 🔁 Renovación.
`;

export const DOCUMENTS: SeedDocument[] = [
  {
    slug: 'reporte-del-sistema-actual',
    title: 'Reporte del sistema actual',
    emoji: '📊',
    markdown: REPORTE.trim(),
  },
  {
    slug: 'comparacion-actual-vs-propuesto',
    title: 'Comparación: actual vs propuesto',
    emoji: '⚖️',
    markdown: COMPARACION.trim(),
  },
  {
    slug: 'embudo-propuesto-2-personas',
    title: 'Embudo propuesto (2 personas)',
    emoji: '🎯',
    markdown: EMBUDO.trim(),
  },
  {
    slug: 'el-embudo-dibujado',
    title: 'El embudo dibujado',
    emoji: '🗺️',
    markdown: DIBUJO.trim(),
  },
  {
    slug: 'como-procesar-un-cliente',
    title: 'Cómo procesar un cliente',
    emoji: '📋',
    markdown: GUIA.trim(),
  },
];
