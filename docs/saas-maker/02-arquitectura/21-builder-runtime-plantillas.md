# Builder, runtime declarativo y sistema de plantillas

## Contrato de definición

Crear `saas-maker-v1` como schema público, versionado y validado. Debe describir metadata, marca, zonas, navegación, páginas, componentes, entidades, relaciones, fuentes, formularios, acciones, workflows, roles, policies, productos, módulos, conectores, dominios, SEO y settings. Los IDs son slugs estables; cambiar una etiqueta no cambia identidad.

La definición nunca contiene secretos, tokens, IDs de cobro no portables sin alias, contenido binario ni código arbitrario.

## Ciclo de vida

Estados: draft, validating, preview, ready, publishing, published, failed, archived. Cada guardado incrementa versión de draft; cada publicación crea snapshot inmutable. Preview puede usar datos de fixture, clon enmascarado o sandbox, nunca datos de producción por defecto.

Operaciones fundamentales:

- create from blank/template;
- validate y lint;
- diff semántico;
- save con `expectedVersion`;
- preview con actor/rol/plan simulado;
- publish con plan de migración;
- rollback creando un release nuevo basado en versión anterior;
- export/import con manifest y checksum;
- fork de plantilla conservando attribution cuando corresponda.

## Superficies del builder

- Project Home: checklist, salud, releases, uso y alertas.
- Structure: zonas, páginas y navegación.
- Canvas: layout responsive y componentes.
- Data: entidades, campos, relaciones, fixtures y migraciones.
- Forms: campos, validación, pasos, estados y submissions.
- Actions: comandos, confirmaciones, permisos y efectos.
- Workflows: triggers, condiciones, pasos, demoras y reintentos.
- Design: tokens, tipografía, temas y plantillas.
- Commerce: productos, planes, prices, módulos y entitlements.
- Access: roles, policies, simulador y matriz efectiva.
- Integrations: pagos, email, IA, OAuth, webhooks y secretos.
- Domains: hosts, DNS, certificados y redirects.
- Releases: diff, preflight, preview, publish y rollback.

## Component registry inicial

Reutilizar el aprendizaje de App Maker y ampliar:

- datos: table, list, detail, kanban, calendar, timeline, gallery, tree;
- indicadores: metric, progress, score, stat group;
- gráficos: bar, line, area, pie, donut, radar, scatter, funnel, heatmap;
- contenido: heading, text, rich text, callout, image, video, FAQ, testimonials;
- estructura: section, grid, columns, tabs, accordion, divider, spacer;
- acciones: button, action group, command palette;
- formularios: standard, compact, inline, wizard, conditional form;
- identidad/comercio: login, signup, pricing, checkout link, account switcher;
- aplicación: sidebar, topbar, breadcrumbs, notifications, search, empty state;
- landing: hero, logos, features, comparison, use cases, CTA, footer;
- soporte: help widget, contact form, status and changelog.

Cada componente declara schema de props, data bindings, slots, responsive, accesibilidad, permisos, eventos, version de runtime y migrator.

## Entidades y campos

Tipos base: text, long/rich text, number, currency, percent, boolean, date/time, duration, email, phone, URL, status, select, multi-select, user, tenant, relation, image, file, audio, video, JSON controlado, formula, lookup y rollup. Campos sensibles exigen policy explícita y nunca aparecen en listados/exportaciones genéricas.

Relaciones: belongs-to, has-many, many-to-many, one-to-one, parent-child y polimórfica registrada. Cada relación define cardinalidad, required, inverse label, onDelete y validación tenant.

## Plantillas

### Tipos

- SaaS completo;
- landing;
- zona de usuario;
- administración;
- panel de cliente;
- página, sección o formulario;
- modelo de datos;
- workflow;
- módulo.

### Paquete de plantilla

Incluye manifest, versión, runtime range, definición parcial, assets, fixtures ficticios, variables solicitadas, pasos de onboarding, dependencias, licencias, changelog, checksums y pruebas. Nunca incluye datos reales, credenciales ni dominios.

### Aplicación y actualización

Clonar una plantilla crea propiedad independiente. Los updates no pisan personalizaciones: se calcula three-way diff entre base, versión nueva y proyecto. Cambios de schema o permisos requieren plan y aprobación. Una plantilla completa debe traer recorrido demostrable, datos ficticios y checklist para reemplazarlos.

## Plantillas iniciales sugeridas

- SaaS B2B con organizaciones y miembros;
- portal de clientes;
- membresías y contenido restringido;
- reservas y agenda;
- CRM vertical;
- soporte/tickets;
- gestión de proyectos;
- directorio/marketplace curado;
- analytics portal;
- backoffice interno.

## Diseño y responsive

Adaptar las cinco direcciones existentes como punto de partida —neutral SaaS, retícula suiza, control industrial, workspace orgánico y aurora visual—, pero convertirlas en tokens portables. El layout usa grilla de 12 columnas, breakpoints registrados, prioridades móviles y slots. El preview cubre desktop, tablet, móvil, dark mode, reducción de movimiento, loading, empty, error, forbidden y offline.

## Validadores previos a publicación

- referencias y slugs únicos;
- rutas sin colisiones;
- permisos y campos sensibles;
- relaciones y cascadas;
- componentes/bindings compatibles;
- formularios accesibles y acciones existentes;
- planes y módulos sin entitlements huérfanos;
- secretos requeridos configurados por ambiente;
- dominio y URLs canónicas;
- presupuesto de performance;
- contraste, teclado, labels y responsive;
- migración reversible o clasificada como riesgosa.

