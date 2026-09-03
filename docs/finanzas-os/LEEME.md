# Finanzas OS — aplicación financiera a pantalla completa

> 2026-09-01. Pedido: "una aplicación financiera con los datos reales, estilo Tareas OS, con cobros en pesos y guaraníes, ventas de todas las empresas (membresías), gestión de clientes y su ficha".

## Qué es

`/plugins/finance` ahora sirve **Finanzas OS**: una aplicación aparte con takeover a pantalla completa (mismo patrón que Tareas OS y el Command Center: predicado en `app/[locale]/(dashboard)/layout.tsx` + `fixed inset-0`). El tablero anterior con la tesorería completa (cuentas, centros de costo, presupuestos, recibos) sigue vivo en `/plugins/finance?ui=clasico`, con barra propia para volver.

Cinco vistas (`?vista=`):

| Vista | Qué muestra | Acciones |
|---|---|---|
| **Resumen** | Ingresos/egresos/resultado del mes, por cobrar y por pagar, membresías activas y con pago pendiente, flujo mensual de 12 meses con selector de moneda, gastos por categoría, últimos movimientos | — |
| **Movimientos** | Los asientos de `team_financial_entries` con filtros (tipo, estado, moneda, categoría, mes, texto) y totales de lo filtrado | Nuevo ingreso/egreso (POST `finance/entries`), marcar pagado (PATCH `finance/entries/[id]`) |
| **Cobros** | Por cobrar y por pagar ordenado por vencimiento, renovaciones de membresías (pendientes de pago o que vencen en 30 días), últimos pagos de pasarela (`team_customer_transactions`) | — |
| **Membresías** | **Ventas de todas las empresas**: tarjeta por empresa (activas, recaudación por moneda, pago pendiente, por vencer) con sus planes, y la lista de suscripciones filtrable | Marcar suscripción pagada (PATCH `memberships/subscriptions/[id]`) |
| **Clientes** | Los 310 clientes con deuda por moneda, membresías activas y próxima renovación; filtros "con deuda" / "con membresía" | Ficha lateral: saldos, membresías, movimientos, ventas, pagos de pasarela; link a la ficha completa del plugin Clientes |

## Reglas de dinero (no se aflojan)

- **Las monedas nunca se suman entre sí.** Todo es `Record<moneda, centavos>` y se muestra un renglón por moneda (ARS, PYG, USD…). La app es agnóstica: mostrará guaraníes en cuanto existan movimientos en PYG.
- **`Intl` con datos sucios revienta el render** (incidente documentado): `fmtMoney` valida el código y cae a un prefijo plano. `team_customer_transactions` trae monedas basura (`activate_plan_during_registeration`…) → `sanitizeCurrency` las agrupa como `OTR`.
- **Centavos vs unidades:** los asientos y membresías están en centavos; los importes de pasarela vienen en unidades y como texto → `fmtUnits` aparte, jamás se mezclan.

## Archivos

```
lib/plugins/finance/server/os.ts        capa de datos (teamId, …): resumen, movimientos, membresías,
                                        suscripciones, clientes, ficha, cobros. Agrega en JS (evita la
                                        trampa de date_trunc con parámetro en GROUP BY de drizzle).
app/api/plugins/finance/os/*            7 rutas GET, todas con getFinanceRequestContext('read')
lib/plugins/finance/ui-os/
  FinancePluginSurface.tsx              selector nueva/clásica (?ui=clasico)
  FinanzasApp.tsx                       shell: riel, topbar, ?vista= como fuente de verdad
  estilo.ts                             vocabulario visual copiado de Tareas OS (formas, no variables --t-*)
  format.ts                             fmtMoney/fmtUnits/fmtMoneyMap defensivos
  api.ts                                fetcher SWR que tira en !ok (patrón Tareas OS) + mapa de endpoints
  componentes.tsx                       Metrica, DineroPorMoneda, EstadoBadge, BarrasMensuales (SVG propio), Paginador
  views/{Resumen,Movimientos,Membresias,Clientes,Cobros}View.tsx
lib/plugins/core/page-registry.tsx      finance → FinancePluginSurface
app/[locale]/(dashboard)/layout.tsx     /plugins/finance sumado al takeover
```

Las escrituras reutilizan las API que ya existían (`finance/entries`, `memberships/subscriptions/[id]`): Finanzas OS no duplica lógica de escritura.

## Estado de datos del equipo de Noelia (al 2026-09-01)

92 movimientos (ARS casi todos), 264 suscripciones en AAPP SPACE / Impulsodigital / Tienda Web / sueltas, 310 clientes (244 con membresía), 0 cuentas de tesorería. **Ojo:** las suscripciones de AAPP SPACE figuran con moneda `USD` (ej. "Tienda WhatsApp Básica" 15.000): parecen guaraníes/pesos mal etiquetados en el origen; la app las muestra tal cual por moneda. Corregir la moneda es una decisión de datos aparte.

También quedó hecho en esta tanda: **Ventas y Artículos desactivados** para el equipo 2 (team_plugins + team_member_plugins en false).

## Pendientes

- Cuentas de tesorería y transferencias entre cuentas dentro de Finanzas OS (hoy viven en el tablero clásico; el equipo aún no cargó cuentas).
- Conversión opcional a una moneda de referencia con `team_exchange_rates` (siempre explícita, nunca automática).
- Export CSV de movimientos y de deudores.
- Accento configurable (hoy esmeralda fija).
