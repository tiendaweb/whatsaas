import { sanitizeLandingCss, sanitizeLandingHtml } from '@/lib/landing/sanitize';

/**
 * Renderiza la landing HTML de un reseller. El saneado ocurre AQUÍ, en el servidor,
 * y no al guardar: así el contenido almacenado sigue siendo el que el reseller
 * escribió, y un endurecimiento futuro de las reglas se aplica a todo lo ya guardado
 * sin tener que migrar datos.
 */
export function HtmlLandingRenderer({
  html,
  customCss,
}: {
  html: string;
  customCss?: string;
}) {
  // Idempotente: la página ya lo sanea antes de pasarlo, para que el HTML crudo no
  // llegue a viajar en el payload RSC. Se repite aquí como segunda barrera, por si
  // alguien monta este componente desde otro sitio.
  const safeHtml = sanitizeLandingHtml(html);
  const safeCss = sanitizeLandingCss(customCss ?? '');

  return (
    <>
      {safeCss ? (
        <style dangerouslySetInnerHTML={{ __html: safeCss }} />
      ) : null}
      <div
        className="landing-html"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </>
  );
}
