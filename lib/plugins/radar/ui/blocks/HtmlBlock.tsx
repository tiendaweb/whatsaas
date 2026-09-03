'use client';

/**
 * `html` — fragmento chico de HTML saneado, dibujado EN LÍNEA.
 *
 * MODELO DE AMENAZA: este HTML lo escribe una IA a partir de conversaciones de
 * clientes, y termina en el mismo documento y el mismo origen que el dashboard.
 * Un `<script>` acá podría disparar server actions con la sesión de la víctima
 * o leer lo que se teclea en la app (la cookie es httpOnly, pero eso sólo
 * impide leerla desde JS, no impide usarla). Por eso el subconjunto permitido
 * es mucho más pobre que el de una landing: sin script, style, iframe, form ni
 * handlers on*.
 *
 * Un informe HTML completo, en cambio, sí puede traer JS y gráficos: va en un
 * iframe con `sandbox="allow-scripts"` SIN `allow-same-origin` (ver
 * `RadarDocumentViewer.tsx`), o sea en un origen opaco desde donde no puede
 * tocar la sesión. Acá no hay iframe, así que no hay ejecución posible.
 */
import { useMemo } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader } from './primitives';

export type HtmlBlockData = Extract<RadarBlock, { type: 'html' }>;

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'kbd', 'mark', 'small', 'sub', 'sup',
  'span', 'div', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'a', 'img', 'figure', 'figcaption',
];

/**
 * `class` NO está permitido a propósito. Las utilidades de Tailwind son globales
 * en la app, y este HTML nace de conversaciones de clientes: un fragmento con
 * `class="fixed inset-0 z-50 bg-white"` se saldría de su contenedor y taparía
 * el dashboard entero con una pantalla falsa (el `overflow-x-auto` del envoltorio
 * no crea bloque contenedor para `position: fixed`). Los estilos del bloque los
 * pone `radar.css` sobre las etiquetas crudas, así que no se pierde nada.
 *
 * `target` y `rel` tampoco: los pone el hook de abajo, para que un enlace no
 * pueda pedir `rel="opener"` y quedarse con `window.opener`.
 */
const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'colspan', 'rowspan'];

/** Redundante con la whitelist de arriba, pero deja el veto explícito por escrito. */
const FORBID_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'select', 'textarea', 'link', 'meta', 'base', 'svg', 'math',
];

const FORBID_ATTR = ['style', 'class', 'srcdoc', 'formaction', 'xlink:href', 'ping', 'srcset', 'target'];

/**
 * Cierra dos huecos que el `ALLOWED_URI_REGEXP` no tapa:
 * 1. DOMPurify permite `data:` en el `src` de `img` por un permiso propio suyo
 *    (`DATA_URI_TAGS`), que sólo se puede ampliar y nunca recortar.
 * 2. `//host` entra por la rama de las rutas internas (`/`) y sin embargo
 *    apunta afuera.
 */
function dropUnsafeUris(_node: Node, data: { attrName: string; attrValue: string; keepAttr: boolean }) {
  if (data.attrName !== 'src' && data.attrName !== 'href') return;
  // Se limpian espacios y caracteres de control, que es como normaliza el
  // navegador la URL antes de resolverla.
  const value = data.attrValue.replace(/[\u0000-\u0020]/g, '');
  if (/^data:/i.test(value) || value.startsWith('//')) data.keepAttr = false;
}

/**
 * Los enlaces externos salen a una pestaña nueva y sin `opener`. Se hace acá y
 * no con una whitelist de atributos porque el `rel` tiene que ser NUESTRO: si
 * lo pudiera escribir el fragmento, alcanzaría con `rel="opener"` para que la
 * página destino manipule la pestaña del dashboard.
 */
function hardenLinks(node: Node) {
  // Nada de `instanceof Element`: en el servidor el DOM lo pone jsdom adentro
  // de dompurify y `Element` NO es un global de Node, así que `instanceof`
  // explota con ReferenceError y se lleva puesto el render de la página.
  const element = node as Partial<Element> & Node;
  if (element.nodeType !== 1 || typeof element.getAttribute !== 'function') return;
  if ((element.tagName ?? '').toUpperCase() !== 'A') return;

  const href = element.getAttribute('href') ?? '';
  if (!/^https?:/i.test(href)) return;
  element.setAttribute?.('target', '_blank');
  element.setAttribute?.('rel', 'noreferrer nofollow');
}

/**
 * Los hooks son globales al singleton de DOMPurify, así que se agregan y se
 * sacan alrededor de la llamada. `sanitize` es síncrono: nada más puede sanear
 * en el medio y quedarse con nuestros hooks puestos. `removeHook` en la 3.4
 * borra por identidad de función, así que no toca los de otros módulos (el
 * saneador de landings usa el mismo singleton).
 */
function sanitizeRadarHtml(html: string): string {
  DOMPurify.addHook('uponSanitizeAttribute', dropUnsafeUris);
  DOMPurify.addHook('afterSanitizeAttributes', hardenLinks);
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_TAGS,
      FORBID_ATTR,
      // OJO: DOMPurify aplica esta expresión a CUALQUIER atributo que no esté
      // en su lista de "seguros por naturaleza", no sólo a href/src. Con un
      // `^(?:https?:|mailto:|tel:|#|/)` se caían `colspan="2"`, `rowspan` y
      // `title="texto"`, porque no parecen URLs. Por eso se conservan las dos
      // ramas de la expresión por defecto —una para valores que empiezan con
      // algo que no es letra, otra para palabras sin `:`— y sólo se recorta la
      // lista de esquemas permitidos.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      // `hardenLinks` corre en afterSanitizeAttributes, después del filtrado,
      // así que necesita que estos dos estén declarados como aceptables.
      ADD_ATTR: ['target', 'rel'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      KEEP_CONTENT: true,
    }).trim();
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes', hardenLinks);
    DOMPurify.removeHook('uponSanitizeAttribute', dropUnsafeUris);
  }
}

export function HtmlBlock({ block }: { block: HtmlBlockData }) {
  const safeHtml = useMemo(() => sanitizeRadarHtml(block.html ?? ''), [block.html]);

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {safeHtml ? (
        <div className="radar-html-block -mx-1 overflow-x-auto px-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
      ) : (
        <BlockEmpty text="El bloque HTML quedó vacío después del saneado." />
      )}
    </div>
  );
}
