# Zonas, landings, navegación y diseño

## Zonas de un proyecto

### Pública

Landing opcional, pricing, features, casos, blog/changelog futuro, ayuda, estado, términos y privacidad. Puede existir sin permitir registro público.

### Autenticación y onboarding

Login, signup, recuperación, verificación, invitaciones, selección/creación de tenant, aceptación de términos y pasos condicionados por rol/plan.

### Zona de usuario

Aplicación principal: dashboards, vistas, formularios, navegación, perfil, notificaciones y módulos habilitados.

### Zona de administrador del SaaS

Operación global del proyecto publicado: tenants, usuarios, suscripciones, módulos, soporte, contenido, integraciones, automatizaciones, auditoría y métricas. No confundir con la administración de SaaS Maker.

### Panel de cliente

Administración del tenant final: datos de empresa, miembros, roles, facturación, módulos comprables, uso, integraciones permitidas, exportación y soporte.

### Panel SaaS Maker

Zona del creador para construir proyectos, manejar ambientes, dominios, releases, suscripción Maker, equipo, proveedores IA y soporte de plataforma.

## Configuración sin landing

El creador elige comportamiento de `/`: redirect a login, signup, app, invitación o página pública. Aun sin landing deben existir páginas legales y rutas de autenticación necesarias. El dominio puede servir solo portal privado.

## Sistema de plantillas visuales

Cuatro capas independientes:

1. Design tokens: color semántico, tipografía, spacing, radius, shadows, motion y charts.
2. Shell template: header, sidebar, topbar, mobile nav, content width y density.
3. Zone template: estructura completa de landing, user, admin o client panel.
4. Component variants: estilos compatibles con tokens.

Una plantilla declara light/dark, contraste, fuentes con fallback, breakpoints, estados de interacción, dirección LTR/RTL futura y licencias de assets. Personalizar tokens no debe requerir duplicar componentes.

## Editor de landing

Árbol de secciones, canvas responsive, biblioteca, panel de propiedades, contenido/SEO, variants, visibility conditions y preview. Secciones iniciales: announcement, header, hero, logos, problem, features, workflow, screenshots, use cases, testimonials, comparison, pricing, FAQ, CTA, contact y footer.

Todo texto debe ser real o marcado como placeholder pendiente. No publicar testimonios, logos, métricas o garantías inventadas por IA.

## Editor de zonas de aplicación

Permite definir shell, navegación y páginas por rol/plan/módulo. Cada página tiene loading, empty, error, forbidden y not-found. Las acciones destructivas se separan visualmente y muestran impacto. La navegación móvil es explícita, no una reducción automática de desktop.

## Diseño recomendado del plano de control

- jerarquía sobria y orientada a estado;
- selector persistente de organización/proyecto/ambiente;
- comandos claros Guardar, Preview, Publicar y Revertir;
- panel de issues antes de release;
- breadcrumbs y búsqueda global;
- tablas densas con filtros persistibles;
- historial/diff junto a propiedades sensibles;
- indicadores de sandbox/live en pagos e integraciones.

## Accesibilidad

WCAG 2.2 AA: navegación por teclado, focus visible, landmarks, labels, errores vinculados, contraste, targets táctiles, reduced motion, lectores de pantalla y tablas comprensibles. El builder advierte y bloquea publicación en errores críticos. Los componentes del registry se testean de forma central.

## Internacionalización

Separar copy de estructura. Cada string usa clave, default locale y estado de traducción. Fechas, números, monedas, pluralización y zona horaria se renderizan por locale. Slugs, SEO y emails pueden variar. Fallback explícito; nunca mostrar claves técnicas al cliente.

## Estados que toda plantilla debe contemplar

- primer uso y onboarding;
- sin datos y sin permisos;
- carga lenta y reintento;
- error parcial;
- plan insuficiente;
- módulo no instalado/suspendido;
- cuota alcanzada;
- billing past due;
- mantenimiento;
- móvil estrecho y contenido largo;
- sesiones expirada y reautenticación.

