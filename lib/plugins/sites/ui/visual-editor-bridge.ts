export const SITES_VISUAL_EDITOR_CHANNEL = 'whatsaas-sites-visual';

export type VisualLink = {
  id: string;
  text: string;
  href: string;
  target: string;
};

export type VisualImage = {
  id: string;
  src: string;
  alt: string;
};

export type VisualEditorMessage =
  | { channel: typeof SITES_VISUAL_EDITOR_CHANNEL; type: 'ready' }
  | { channel: typeof SITES_VISUAL_EDITOR_CHANNEL; type: 'dirty' }
  | { channel: typeof SITES_VISUAL_EDITOR_CHANNEL; type: 'link'; link: VisualLink }
  | {
      channel: typeof SITES_VISUAL_EDITOR_CHANNEL;
      type: 'gallery';
      images: VisualImage[];
      selectedId: string | null;
    }
  | { channel: typeof SITES_VISUAL_EDITOR_CHANNEL; type: 'html'; html: string };

function escapeInlineScript(value: string) {
  return value.replace(/<\/script/gi, '<\\/script');
}

export function buildVisualEditorDocument(
  html: string,
  baseHref: string,
  labels: { editLink: string },
) {
  const config = escapeInlineScript(
    JSON.stringify({
      channel: SITES_VISUAL_EDITOR_CHANNEL,
      editLink: labels.editLink,
    }),
  );

  const bridge = `
<style id="whatsaas-visual-style">
  [data-whatsaas-visual-editable]:hover {
    outline: 2px dashed #002FA7 !important;
    outline-offset: 3px !important;
    cursor: text !important;
  }
  a[data-whatsaas-visual-editable]:hover,
  img[data-whatsaas-visual-editable]:hover {
    cursor: pointer !important;
  }
  [data-whatsaas-visual-selected] {
    outline: 3px solid #002FA7 !important;
    outline-offset: 3px !important;
  }
  #whatsaas-visual-tooltip {
    position: absolute;
    z-index: 2147483647;
    display: none;
    padding: 0;
    border: 1px solid #002FA7;
    background: #fff;
    box-shadow: 4px 4px 0 rgba(0, 47, 167, .25);
  }
  #whatsaas-visual-tooltip button {
    appearance: none;
    border: 0;
    background: #002FA7;
    color: #fff;
    cursor: pointer;
    font: 600 12px/1.2 system-ui, sans-serif;
    padding: 9px 11px;
  }
</style>
<script id="whatsaas-visual-bridge">
(() => {
  const config = ${config};
  let sequence = 0;
  let selected = null;

  const send = (type, payload = {}) => {
    parent.postMessage({ channel: config.channel, type, ...payload }, '*');
  };

  const getId = (element) => {
    if (!element.dataset.whatsaasVisualId) {
      sequence += 1;
      element.dataset.whatsaasVisualId = 'visual-' + sequence;
    }
    return element.dataset.whatsaasVisualId;
  };

  const editableTextSelector = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'span', 'strong', 'em', 'small', 'label',
    'button', 'li', 'blockquote', 'figcaption', 'td', 'th'
  ].join(',');

  const markEditable = () => {
    document.querySelectorAll(editableTextSelector + ',a,img').forEach((element) => {
      if (element.closest('#whatsaas-visual-tooltip')) return;
      element.dataset.whatsaasVisualEditable = 'true';
      getId(element);
    });
  };

  const clearSelected = () => {
    document.querySelectorAll('[data-whatsaas-visual-selected]').forEach((element) => {
      element.removeAttribute('data-whatsaas-visual-selected');
    });
  };

  const tooltip = document.createElement('div');
  tooltip.id = 'whatsaas-visual-tooltip';
  const tooltipButton = document.createElement('button');
  tooltipButton.type = 'button';
  tooltipButton.textContent = config.editLink;
  tooltip.appendChild(tooltipButton);
  document.body.appendChild(tooltip);

  const showLinkTooltip = (link) => {
    selected = link;
    clearSelected();
    link.dataset.whatsaasVisualSelected = 'true';
    const rect = link.getBoundingClientRect();
    tooltip.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
    tooltip.style.top = Math.max(8, rect.bottom + window.scrollY + 8) + 'px';
    tooltip.style.display = 'block';
  };

  const gallery = (selectedId = null) => {
    const images = Array.from(document.images).map((image) => ({
      id: getId(image),
      src: image.getAttribute('src') || '',
      alt: image.getAttribute('alt') || '',
    }));
    send('gallery', { images, selectedId });
  };

  tooltipButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selected) return;
    send('link', {
      link: {
        id: getId(selected),
        text: selected.textContent || '',
        href: selected.getAttribute('href') || '',
        target: selected.getAttribute('target') || '',
      },
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('#whatsaas-visual-tooltip')) return;

    const link = target.closest('a');
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      showLinkTooltip(link);
      return;
    }

    const image = target.closest('img');
    if (image) {
      event.preventDefault();
      event.stopPropagation();
      clearSelected();
      image.dataset.whatsaasVisualSelected = 'true';
      tooltip.style.display = 'none';
      gallery(getId(image));
      return;
    }

    const textElement = target.closest(editableTextSelector);
    if (!textElement) return;
    clearSelected();
    tooltip.style.display = 'none';
    textElement.dataset.whatsaasVisualSelected = 'true';
    textElement.setAttribute('contenteditable', 'true');
    textElement.focus();
  }, true);

  document.addEventListener('input', () => send('dirty'), true);

  const cleanHtml = () => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector('#whatsaas-visual-style')?.remove();
    clone.querySelector('#whatsaas-visual-bridge')?.remove();
    clone.querySelector('#whatsaas-visual-tooltip')?.remove();
    clone.querySelector('base[data-whatsaas-visual-base]')?.remove();
    clone.querySelectorAll('[data-whatsaas-visual-id]').forEach((element) => {
      element.removeAttribute('data-whatsaas-visual-id');
      element.removeAttribute('data-whatsaas-visual-editable');
      element.removeAttribute('data-whatsaas-visual-selected');
      element.removeAttribute('contenteditable');
    });
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  };

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.channel !== config.channel) return;

    if (message.action === 'request-save') {
      send('html', { html: cleanHtml() });
      return;
    }

    if (message.action === 'request-gallery') {
      gallery(message.selectedId || null);
      return;
    }

    if (message.action === 'update-link') {
      const link = document.querySelector('[data-whatsaas-visual-id="' + CSS.escape(message.link.id) + '"]');
      if (!(link instanceof HTMLAnchorElement)) return;
      link.textContent = message.link.text;
      link.setAttribute('href', message.link.href);
      if (message.link.target) link.setAttribute('target', message.link.target);
      else link.removeAttribute('target');
      send('dirty');
      showLinkTooltip(link);
      return;
    }

    if (message.action === 'update-image') {
      const image = document.querySelector('[data-whatsaas-visual-id="' + CSS.escape(message.image.id) + '"]');
      if (!(image instanceof HTMLImageElement)) return;
      image.setAttribute('src', message.image.src);
      image.setAttribute('alt', message.image.alt);
      send('dirty');
      gallery(message.image.id);
      return;
    }

    if (message.action === 'delete-image') {
      const image = document.querySelector('[data-whatsaas-visual-id="' + CSS.escape(message.id) + '"]');
      if (!(image instanceof HTMLImageElement)) return;
      image.remove();
      send('dirty');
      gallery(null);
    }
  });

  markEditable();
  send('ready');
})();
</script>`;

  const base = `<base data-whatsaas-visual-base href="${baseHref.replace(/"/g, '&quot;')}">`;
  const withBase = /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}${base}`)
    : `<head>${base}</head>${html}`;

  return /<\/body>/i.test(withBase)
    ? withBase.replace(/<\/body>/i, `${bridge}</body>`)
    : `${withBase}${bridge}`;
}
