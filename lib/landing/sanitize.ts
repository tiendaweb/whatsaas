import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanea el HTML de una landing de reseller.
 *
 * POR QUÉ ESTO IMPORTA TANTO: la landing se sirve en el MISMO ORIGEN que /sign-in y
 * /dashboard. Un <script> aquí podría leer lo que los clientes del reseller teclean en
 * el formulario de login, o lanzar peticiones autenticadas contra las server actions
 * con la sesión de la víctima. La cookie es httpOnly, pero eso no protege de nada de
 * lo anterior: httpOnly solo impide leerla desde JS, no impide usarla.
 *
 * Por eso no hay una opción de "permitir scripts" en el editor. Para analítica hay
 * campos tipados (branding.analytics), que cubren el caso real sin dar ejecución
 * arbitraria de JS sobre el origen del login.
 */
export function sanitizeLandingHtml(html: string): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    // Se permite estructura, texto, tablas, media e iframes (para vídeos embebidos).
    ADD_TAGS: ['iframe', 'style'],
    ADD_ATTR: ['target', 'loading', 'allow', 'allowfullscreen', 'frameborder'],

    // Nada de scripts, ni de handlers on*, ni de <base> (reescribiría las URLs
    // relativas de toda la página, incluidas las del formulario de login).
    FORBID_TAGS: ['script', 'object', 'embed', 'base', 'meta', 'link'],
    FORBID_ATTR: ['srcdoc', 'formaction', 'xlink:href', 'ping'],

    // Bloquea javascript:, data:text/html y similares en href/src.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,

    KEEP_CONTENT: true,
  });
}

/**
 * CSS propio de la landing. Se saca del HTML y se inyecta aparte, pero igualmente
 * hay que impedir que cierre la etiqueta <style> y siga con markup.
 */
export function sanitizeLandingCss(css: string): string {
  if (!css) return '';

  return css
    .replace(/<\/?\s*style/gi, '')
    .replace(/<\s*\/?\s*script/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/expression\s*\(/gi, '');
}
