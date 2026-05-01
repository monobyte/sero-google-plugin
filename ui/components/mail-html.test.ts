// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { sanitizeEmailHtml } from './mail-html';

describe('sanitizeEmailHtml', () => {
  it('removes remote fonts, styles, and images while preserving readable email content', () => {
    const html = [
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
      '<style>',
      '@import url("https://fonts.googleapis.com/css2?family=Roboto");',
      '.hero { background-image: url("https://cdn.example.com/banner.png"); color: rgb(10, 20, 30); }',
      '.logo { content: url("cid:embedded-logo"); }',
      '</style>',
      '<div class="hero" style="background-image:url(https://cdn.example.com/bg.png); color: #123456">',
      '<img src="https://cdn.example.com/logo.png" alt="Company logo">',
      '<img src="cid:thread-image" alt="Embedded screenshot">',
      '<p>Hello <strong>team</strong>, the quarterly update is ready.</p>',
      '</div>',
    ].join('');

    const sanitized = sanitizeEmailHtml(html);

    expect(sanitized).toContain('Hello <strong>team</strong>, the quarterly update is ready.');
    expect(sanitized).toContain('color: #123456');
    expect(sanitized).toContain('cid:thread-image');
    expect(sanitized).toContain('class="sero-email-image-placeholder"');
    expect(sanitized).toContain('Image blocked: Company logo');
    expect(sanitized).not.toContain('fonts.googleapis.com');
    expect(sanitized).not.toContain('cdn.example.com');
    expect(sanitized).not.toContain('@import');
    expect(sanitized).toContain('background-image:none');
  });

  it('replaces image-only links with neutral placeholders instead of blue alt-text links', () => {
    const html = '<a href="https://tracking.example.com"><img src="https://cdn.example.com/hero.png" alt="Hero banner"></a>';

    const sanitized = sanitizeEmailHtml(html);

    expect(sanitized).toContain('class="sero-email-image-placeholder"');
    expect(sanitized).toContain('Image blocked: Hero banner');
    expect(sanitized).not.toContain('<a href="https://tracking.example.com"');
    expect(sanitized).not.toContain('cdn.example.com');
  });

  it('removes decorative remote icons instead of rendering noisy placeholders', () => {
    const html = '<a href="https://social.example.com"><img src="https://cdn.example.com/fb.png" alt="fb"></a>';

    const sanitized = sanitizeEmailHtml(html);

    expect(sanitized).not.toContain('sero-email-image-placeholder');
    expect(sanitized).not.toContain('social.example.com');
    expect(sanitized).not.toContain('cdn.example.com');
  });

  it('drops executable and embedded remote elements without touching safe links', () => {
    const html = [
      '<script>alert(1)</script>',
      '<iframe src="https://example.com/embed"></iframe>',
      '<a href="https://calendar.google.com/calendar/u/0/r">Open calendar</a>',
      '<img src="data:image/png;base64,ZmFrZQ==" alt="Inline image">',
      '<p>See attached notes.</p>',
    ].join('');

    const sanitized = sanitizeEmailHtml(html);

    expect(sanitized).toContain('Open calendar');
    expect(sanitized).toContain('data:image/png;base64,ZmFrZQ==');
    expect(sanitized).toContain('See attached notes.');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).not.toContain('example.com/embed');
  });
});
