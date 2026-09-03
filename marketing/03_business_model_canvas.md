# Business Model Canvas — WhatsPro

**Documento:** Business Model Canvas  
**Versión:** 1.0  
**Fecha:** Abril 2026  
**Propósito:** Visión sistémica del modelo de negocio completo para inversores, socios y equipo

---

## Visualización del Canvas

```
┌─────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│  ALIANZAS CLAVE     │  ACTIVIDADES CLAVE   │  PROPUESTA DE VALOR  │  RELACIÓN CLIENTES   │
│                     │                      │                      │                      │
│ • Evolution API     │ • Desarrollo Product │ • Inbox unificado    │ • Self-service       │
│ • OpenAI / Gemini   │ • Content Marketing  │ • CRM + Chatbots     │ • Comunidad Discord  │
│ • Mercado Pago      │ • Atención Cliente   │ • IA con Actions     │ • Soporte WhatsApp   │
│ • Agencias partner  │ • DevOps infra       │ • Analítica          │ • Webinars mes.      │
│                     │ • Partnerships       │ • Multi-idioma       │ • Onboarding vídeo   │
│                     │                      │ • Mercado Pago       │                      │
└─────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
                              │                          │                          │
                              ├──────────────────────────┼──────────────────────────┤
┌─────────────────────┐       │                          │                          │      ┌─────────────────────┐
│   RECURSOS CLAVE    │       │                          │                          │      │   CANALES           │
│                     │       │                          │                          │      │                     │
│ • Código base Next. │       │    SEGMENTOS CLIENTES    │                          │      │ • SEO / Blog        │
│ • Infrast. cloud    │       │                          │                          │      │ • YouTube           │
│ • Datos históricos  │       │ • Equipo ventas B2C (2-10)                        │      │ • LinkedIn          │
│ • Equipo técnico    │       │ • Soporte e-commerce (10-30)                      │      │ • Redes sociales    │
│ • API keys (IA)     │       │ • Agencia reseller (5-50)                         │      │ • Partnerships      │
│ • Dominio / brand   │       │ • PYME servicios (15-50)                          │      │ • Afiliados         │
│                     │       │                          │                          │      │ • Demos en vivo     │
└─────────────────────┘       │                          │                          │      └─────────────────────┘
                              │                          │                          │
                              ├──────────────────────────┼──────────────────────────┤
                              │                          │                          │
┌─────────────────────┬───────┘                          │                          └──────────┬──────────────────────┐
│  ESTRUCTURA COSTOS  │                                  │                                     │  FUENTES DE INGRESO  │
│                     │                                  │                                     │                      │
│ • Infraest. cloud   │                                  │                                     │ • Suscripción mens.  │
│  (compute, DB)      │                                  │                                     │ • Suscripción anual  │
│ • APIs (OpenAI,     │                                  │                                     │ • Marketplace apps   │
│  Gemini)            │                                  │                                     │ • White-label        │
│ • Soporte al client │                                  │                                     │ • Serv. profesion.   │
│ • Equipo (3-5)      │                                  │                                     │                      │
│ • Servidor WhatsApp │                                  │                                     │                      │
│  (Evolution API)    │                                  │                                     │                      │
│ • Marketing         │                                  │                                     │                      │
│                     │                                  │                                     │                      │
└─────────────────────┘                                  │                                     └──────────────────────┘
```

---

## Desarrollo Narrativo de Cada Bloque

### SEGMENTOS DE CLIENTES (4 Segmentos Primarios)

#### 1. Equipo de Ventas B2C (2-10 Personas)
**Descripción:** Pequeñas empresas o startups que venden directamente al consumidor por WhatsApp. Ejemplos: tienda de ropa online, agencia de servicios, freelancer, pequeño retailer.

**Características:**
- Venden ~30-200 unidades/servicios por mes
- Usan WhatsApp porque es gratis y donde están los clientes
- Operan "en caos": mensajes en teléfonos personales, sin registro centralizado
- Budget muy limitado (<$150/mes para herramientas)

**Necesidad primaria:** Visibilidad. "¿Cuántos leads me llegaron hoy? ¿Cuántos cerré? ¿Por qué no cierro si atiendo bien?"

**Disposición a pagar:** $49-99 USD/mes. Necesitan ROI muy claro.

---

#### 2. Equipo de Soporte E-commerce (10-30 Personas)
**Descripción:** Equipos de atención al cliente de tiendas online medianas. Ejemplos: soporte de e-commerce de moda, electrónica, marketplaces.

**Características:**
- Reciben 200-1000 consultas/mes por WhatsApp
- Necesitan responder rápido (SLA de 2-4 horas)
- Múltiples agentes coordinando = caos sin herramientas
- Presionados por costo (buscan soluciones <$200/mes)

**Necesidad primaria:** Eficiencia. "Reducir tiempo de respuesta, evitar duplicar respuestas, medir performance del equipo".

**Disposición a pagar:** $99-199 USD/mes. ROI es "horas ahorradas".

---

#### 3. Agencia de Marketing Digital (5-50 Personas)
**Descripción:** Agencias pequeñas-medianas que gestiona WhatsApp para múltiples clientes. Pueden necesitar multi-workspace.

**Características:**
- Gestiona WhatsApp de 5-20 clientes
- Necesita separación de datos (cada cliente en workspace diferente)
- Interesada en white-label o reseller
- Budget mayor (~$300-500/mes) pero muy sensible a margen

**Necesidad primaria:** Escalabilidad y eficiencia operativa. "Servir a más clientes con menos personas".

**Disposición a pagar:** $299-499 USD/mes. Pero espera descuento por volumen o model de revenue share.

---

#### 4. PYME de Servicios (15-50 Personas)
**Descripción:** Pequeña o mediana empresa en salud, educación, fintech, retail, que tiene equipo formal de ventas/soporte.

**Características:**
- Operan WhatsApp + CRM tradicional por separado
- Estructura formal: gerente, vendedores, reportes
- Budget de tecnología existe (~$200-400/mes)
- Necesitan integración real, no "herramientas sueltas"

**Necesidad primaria:** Integración. "Un CRM que integre WhatsApp, no una herramienta de WhatsApp que pretende ser CRM".

**Disposición a pagar:** $149-399 USD/mes. Valoran ROI en reporte y estructura.

---

### PROPUESTA DE VALOR (Adaptada por Segmento)

#### Para Equipo de Ventas B2C
**Value Prop:** "Visualiza tus ventas por WhatsApp en tiempo real sin pierde un cliente. Inbox unificado, CRM simple, analítica en 5 minutos."

**Resultado esperado:** +30% en respuesta rápida, -50% en clientes perdidos, visibilidad clara.

---

#### Para Equipo de Soporte E-commerce
**Value Prop:** "Reduce tiempo de respuesta de 2 días a 4 horas. Autom atiza preguntas repetidas. Mide performance del equipo."

**Resultado esperado:** NPS mejorado, SLA cumplido, <2 horas promedio de respuesta.

---

#### Para Agencia Digital
**Value Prop:** "Escala a 20 clientes sin contratar más personas. White-label o reseller, datos separados por cliente, analítica por cliente."

**Resultado esperado:** 3x ingresos con mismo equipo. Margen por cliente.

---

#### Para PYME de Servicios
**Value Prop:** "Tu CRM verdadero. WhatsApp no es un chat, es tu fuente de leads. Integración nativa: inbox, contactos, etapas, reportes. Un solo sistema."

**Resultado esperado:** 50% menos tiempo en data entry, visibilidad de funnel real, mejor cierre.

---

### CANALES DE DISTRIBUCIÓN (Acquisition Channels)

#### Canal 1: SEO + Blog (Organic)
**Descripción:** Posicionamiento en búsquedas: "software CRM WhatsApp", "chatbot sin código", "alternativa Kommo/Treble".

**Timeline:** 6-12 meses para visibilidad real. Year 1 es inversión.  
**CAC esperado:** $30-50 por lead (más bajo que otros canales)  
**Conversión:** 2-5% lead → pago

---

#### Canal 2: YouTube (Organic + Educativo)
**Descripción:** Tutoriales, demos, casos de éxito. 2 videos/mes. Focus en "cómo automatizar WhatsApp" y "demostración de features".

**Timeline:** Crecimiento lento primeros 3 meses. Aceleración después.  
**CAC esperado:** $40-80 por lead  
**Conversión:** 3-8% lead → pago

---

#### Canal 3: Partnerships con Agencias
**Descripción:** Acuerdos con agencias digitales. Ellas venden nuestro producto a sus clientes. Revenue share 20-30%.

**Timeline:** Negocios pueden cerrar en 2-4 semanas.  
**CAC esperado:** $0 (generamos ingresos via partner)  
**Conversión:** 10-30% lead → pago (partner cualificado)

---

#### Canal 4: Afiliados / Influencers LATAM
**Descripción:** Programa de afiliados para YouTubers, bloggers, coaches de emprendimiento LATAM. Comisión 30% primer pago.

**Timeline:** Recruitment de afiliados mes 2-3.  
**CAC esperado:** $20-40 por lead  
**Conversión:** 5-15% lead → pago

---

#### Canal 5: Demos y Webinars en Vivo
**Descripción:** Webinars semanales (jueves 19h CDMX, una hora). "Cómo armar tu equipo de ventas en WhatsApp" + demo en vivo.

**Timeline:** Primeros webinars desde mes 1.  
**CAC esperado:** $50-120 por lead  
**Conversión:** 8-15% lead → pago

---

#### Canal 6: LinkedIn (B2B para Agencias)
**Descripción:** Posts, artículos, anuncios enfocados en agencias y decisores B2B. 3 posts/semana.

**Timeline:** Engagement tarda 2-3 meses.  
**CAC esperado:** $80-150 por lead  
**Conversión:** 3-5% lead → pago

---

### RELACIÓN CON CLIENTES (Customer Relationships)

#### 1. Self-Service Onboarding
**Descripción:** Sin fricción de sales call requerido. Usuario crea cuenta en 2 minutos, conecta WhatsApp en 5 minutos, ve inbox en 3 minutos. La herramienta "se vende a sí misma".

**Beneficio:** CAC bajo. Velocidad de adopción alta.

---

#### 2. Comunidad en Discord
**Descripción:** Comunidad privada de 500-2000 usuarios donde comparten tips, flujos, casos. Cultura de "usuarios ayudan a usuarios".

**Beneficio:** Retención aumenta 30%. Churn baja. Referidos aumentan.

---

#### 3. Soporte por WhatsApp
**Descripción:** Nuestra propia plataforma es donde reciben soporte. Paradoja: vendemos WhatsApp Y lo usamos para servir. Genera confianza.

**Beneficio:** Brand consistency. Cliente ve que creemos en el producto.

---

#### 4. Webinars Mensuales
**Descripción:** Capacitación gratuita cada mes en temas como "Cómo armar flujos que cierren", "Automatización avanzada", "Casos de éxito LATAM".

**Beneficio:** Adopción de producto mejora. Clientes usan más features = menor churn.

---

#### 5. Documentación y Videotutoriales
**Descripción:** Base de conocimiento con artículos + 50+ videos cortos (<3 min cada) en YouTube, integrables en UI.

**Beneficio:** Self-service soporte. Support tickets disminuyen 50%.

---

### FUENTES DE INGRESOS (Revenue Streams)

#### 1. Suscripción Mensual
**Modelo:** Pago mensual recurrente por workspace.

**Precios estimados:**
- Starter: $49/mes (2 usuarios, 500 contactos, 1 instancia WhatsApp)
- Pro: $149/mes (10 usuarios, 5k contactos, 5 instancias, IA, Chatbots, Campañas)
- Business: $399/mes (50 usuarios, 50k contactos, 20+ instancias, todo)

**Proyección año 1:**
- Q1: 5 clientes → $500/mes
- Q2: 15 clientes → $1,800/mes
- Q3: 35 clientes → $5,000/mes
- Q4: 100 clientes → $15,000/mes MRR

---

#### 2. Suscripción Anual (Con Descuento)
**Modelo:** Pago anual con 20-25% descuento. Mejora LTV y reduce churn de "disfrutar de la falta de renovación".

**Proyección:** 30-40% de clientes elige anual en year 1. Agrega ~$3-4k MRR en year 1 fin.

---

#### 3. Marketplace de Apps Premium
**Descripción:** Apps adicionales que se venden separadas: "AI Analytics Premium" ($20/mes), "Advanced Reporting" ($15/mes), "Zapier Integration" ($25/mes).

**Proyección año 1:** 10% de clientes compra 1 app premium = +$1,500/mes MRR fin de año.

---

#### 4. Professional Services (Onboarding, Training)
**Descripción:** Onboarding payment: empresas medianas pagan $500-2,000 por setup + training de 5h.

**Proyección año 1:** 5-10 deals = +$3,000 revenue anual.

---

#### 5. White-Label / Reseller (Year 2+)
**Descripción:** Agencias pagan licencia reducida ($50/mes por cliente que gestionan) y lo venden bajo su marca.

**Proyección año 2:** 3-5 partnerships generan +$5,000-10,000 MRR incremental.

---

### RECURSOS CLAVE (Key Resources)

#### Tecnológicos
- Codebase Next.js + React + TypeScript (ya existe, 80% feature-complete)
- Infraestructura cloud (AWS/GCP/Vercel)
- APIs: OpenAI, Google Gemini, Mercado Pago, Evolution API, Stripe
- Base de datos PostgreSQL + Drizzle ORM
- Real-time: Pusher para notificaciones

#### Humanos
- 1 Founder/CEO
- 2-3 Engineers (product, fullstack)
- 1 Product Manager (también Founder año 1)
- 0.5 Marketing person (crecer a 1.5 en Q3, 2 en Q4)
- 0 Sales (full self-service, founder support año 1)
- 0 Support (self-service documentation + Discord, founder support triage)

#### Marca / Intelectual
- Dominio whatspro.com
- Identidad visual (logo, colores, design system)
- Reputación en LATAM (comienza en 0)
- 15 artículos de blog publicados
- 10 videos de YouTube

#### Datos
- 100 clientes con historial de uso
- NPS de 40+
- Tasa de churn <5%

---

### ACTIVIDADES CLAVE (Key Activities)

#### Desarrollo de Producto
**Descripción:** 40% tiempo eng. Roadmap: estabilidad, features nuevas basadas en customer feedback, integraciones.

---

#### Content Marketing
**Descripción:** 30% tiempo founder/marketing. 52 artículos/año, 24 videos YouTube, 100+ posts redes, 2 webinars/mes.

---

#### Atención al Cliente (Support + Success)
**Descripción:** 20% tiempo founder. Objetivos: NPS >40, churn <5%, time-to-resolution <24h.

---

#### Partnership Development
**Descripción:** 15% tiempo founder. Buscar agencias partner, afiliados, integraciones potenciales.

---

#### DevOps y Infraestructura
**Descripción:** 10% tiempo engineer. Uptime 99.9%, seguridad, compliance, escalabilidad.

---

### ALIANZAS CLAVE (Key Partnerships)

#### Evolution API
**Relación:** Proveedor de infraestructura de WhatsApp Web. Crítico para funcionar.

**Dependencia:** Alta. Si Evolution falla, nuestro servicio falla.

---

#### OpenAI + Google Gemini
**Relación:** Proveedores de IA. Integramos ambos, cliente elige.

**Dependencia:** Media. Podemos cambiar de IA si modelo de pricing cambia.

---

#### Mercado Pago
**Relación:** Procesador de pagos. Crítico para LATAM.

**Dependencia:** Media-Alta. Stripe es backup pero MP es diferenciador.

---

#### Agencias de Marketing Digital (Resellers)
**Relación:** Distribución. Agencias venden WhatsPro a sus clientes.

**Dependencia:** Baja-media. Vía de crecimiento, no dependencia única.

---

#### Influencers / Bloggers LATAM
**Relación:** Programa de afiliados. Promocionan a cambio de comisión.

**Dependencia:** Baja. Activo estratégico de growth.

---

### ESTRUCTURA DE COSTOS (Cost Structure)

#### COGS (Cost of Goods Sold) — Variable
- Infraestructura cloud: ~$2-3 por cliente/mes
- APIs (OpenAI, Gemini): ~$1-2 por cliente activo/mes
- Evolution API: $0 (incluido en nuestro precio)
- Stripe/Mercado Pago: 2.9% + $0.30 por transacción

**Promedio:** ~$5-7 por cliente/mes en COGS

---

#### Operating Expenses — Fijos
- **Salarios:**
  - Founder: $5,000/mes (low market)
  - 2 Engineers: $3,000 c/u = $6,000
  - Marketing: $1,500/mes (part-time, crecen)
  - **Total:** ~$12,500/mes (puede crecer a $20k en Q4)

- **Infraestructura y herramientas:**
  - AWS/cloud: $1,500/mes
  - Herramientas: Stripe fees, Hotjar, Google Workspace, etc.: $500/mes

- **Marketing:**
  - Content: $1,000/mes (outsource algunos videos/artículos)
  - Ads (year 2): $2,000-3,000/mes (año 1 es 0)
  - Tools: $500/mes

**Total Operating Expenses Mes 1-6:** ~$16,500/mes  
**Total Operating Expenses Mes 7-12:** ~$22,000/mes (contratan support)

---

## Supuestos del Modelo

### Supuesto 1: Demanda Existe
**Supuesto:** Hay demanda latente de 500+ PYMEs en LATAM que pagarán por profesionalizar WhatsApp.

**Validación:** Encuestas, entrevistas. Si esto es falso, modelo colapsa.

---

### Supuesto 2: Diferencial es Defensible
**Supuesto:** IA + Function Calling + multi-idioma es diferencial que mantiene durante 18+ meses.

**Validación:** Competidores copian features en 6-12 meses. Necesitamos 18+ meses de liderazgo antes que commoditizen.

---

### Supuesto 3: Churn Sera <5% Mensual
**Supuesto:** Con buen product y customer success, retendremos 95%+ clientes cada mes.

**Validación:** Si churn es >8% mensual, LTV colapsa y modelo no funciona.

---

### Supuesto 4: Meta No Mata Negocio
**Supuesto:** Meta permite que herramientas de terceros vendan sobre WhatsApp sin cambios dramáticos de política.

**Validación:** Si Meta cierra acceso a Web o crea propia solución, modelo quiebra. Riesgo real, mitigable pero no controlable.

---

### Supuesto 5: CAC Será <$200
**Supuesto:** Costo de adquisición estará debajo de $200 por cliente en year 1.

**Validación:** Si CAC es >$300, payback tarda >3 años. Modelo se pone frágil.

---

## Métricas de Validación

| Supuesto | Métrica | Target Año 1 | Frecuencia Review |
|----------|---------|--------------|-------------------|
| Demanda existe | Clientes convertidos de trial | 100 | Mensual |
| Diferencial defensible | Feature adoption rate | >60% de clientes | Mensual |
| Churn <5% | Churn mensual | <5% | Semanal |
| Meta no mata negocio | API availability | 99%+ | Diario |
| CAC <$200 | Costo medio por adquisición | <$200 | Mensual |

---

## Evolución del BMC (Año 2 y 3)

### Año 2 (2027): Expansión Geográfica + Canales Pagos
- **Nuevos segmentos:** Empresas medianas (50-150 personas), gobierno, ONG
- **Nuevos canales:** Meta Ads, Google Ads, partner channel con agencias de 100+
- **Nuevas alianzas:** Integración con HubSpot, Zapier, Salesforce
- **Nuevas fuentes:** Marketplace revenue crece, white-label generador, professional services
- **Cambio clave:** Sales hires su primer BDR. Marketing budget sube a $30k/mes

### Año 3 (2028): Consolidación y Extensión
- **Nuevos segmentos:** Mercado hispanohablante global (España, US Latino)
- **Nuevas feature:** Mobile app nativa, Telegram integration, advanced BI
- **Cambio clave:** Consideración de Series A para financiar expansión global

---

## Conclusión

El modelo de negocio de WhatsPro es **SaaS puro**: ingresos recurrentes, customer-lifetime-value enfocado, márgenes brutos altos (80%+), CAC bajo gracias a inbound.

Viabilidad depende de tres cosas:
1. **Demanda real** de PYMEs LATAM (creemos que existe)
2. **Churn bajo** via customer success obsesivo
3. **Diferencial defensible** que mantiene contra copia de competencia

Si logra estos tres en año 1-2, el modelo escala a $250k+ MRR en año 3, con rentabilidad en mes 24-30.

---

**Canvas validado por:** [Founder]  
**Fecha:** Abril 2026
