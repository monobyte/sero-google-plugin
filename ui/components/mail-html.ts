const SAFE_EMBEDDED_RESOURCE_PREFIXES = ['data:', 'cid:', 'blob:'] as const;
const CSS_IMPORT_PATTERN = /@import\s+(?:url\()?\s*(['"]?)([^'"\s)]+)\1\s*\)?[^;]*;?/giu;
const CSS_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/giu;

function normalizeUrl(value: string): string {
  return value.trim().toLowerCase();
}

function isSafeEmbeddedResourceUrl(value: string): boolean {
  const normalized = normalizeUrl(value);
  return SAFE_EMBEDDED_RESOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function sanitizeCss(css: string): string {
  return css
    .replace(CSS_IMPORT_PATTERN, (_full, _quote: string, url: string) => {
      return isSafeEmbeddedResourceUrl(url) ? _full : '';
    })
    .replace(CSS_URL_PATTERN, (full, _quote: string, url: string) => {
      return isSafeEmbeddedResourceUrl(url) ? full : 'none';
    });
}

function sanitizeStyleAttributes(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const style = element.getAttribute('style');
    if (!style) return;

    const sanitized = sanitizeCss(style).trim();
    if (sanitized) {
      element.setAttribute('style', sanitized);
      return;
    }

    element.removeAttribute('style');
  });

  doc.querySelectorAll('style').forEach((styleElement) => {
    const sanitized = sanitizeCss(styleElement.textContent ?? '').trim();
    if (sanitized) {
      styleElement.textContent = sanitized;
      return;
    }

    styleElement.remove();
  });
}

function sanitizeSrcSet(value: string): string | null {
  const safeEntries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const [url] = entry.split(/\s+/, 1);
      return url ? isSafeEmbeddedResourceUrl(url) : false;
    });

  return safeEntries.length > 0 ? safeEntries.join(', ') : null;
}

function replaceRemoteImage(image: HTMLImageElement): void {
  const alt = image.getAttribute('alt')?.trim();
  if (alt) {
    image.replaceWith(image.ownerDocument.createTextNode(`[Image removed: ${alt}]`));
    return;
  }

  image.remove();
}

function sanitizeResourceAttributes(doc: Document): void {
  doc.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const src = image.getAttribute('src');
    if (src && !isSafeEmbeddedResourceUrl(src)) {
      replaceRemoteImage(image);
      return;
    }

    const srcSet = image.getAttribute('srcset');
    if (srcSet) {
      const sanitized = sanitizeSrcSet(srcSet);
      if (sanitized) {
        image.setAttribute('srcset', sanitized);
      } else {
        image.removeAttribute('srcset');
      }
    }
  });

  doc.querySelectorAll<HTMLElement>('[background], [poster], source[src]').forEach((element) => {
    ['background', 'poster', 'src'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value && !isSafeEmbeddedResourceUrl(value)) {
        element.removeAttribute(attribute);
      }
    });
  });
}

export function sanitizeEmailHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return html;
  }

  const document = new DOMParser().parseFromString(html, 'text/html');

  document.querySelectorAll(
    'script, link, iframe, object, embed, audio, video, source, meta[http-equiv]'
  ).forEach((element) => {
    element.remove();
  });

  sanitizeStyleAttributes(document);
  sanitizeResourceAttributes(document);

  return document.body.innerHTML;
}
