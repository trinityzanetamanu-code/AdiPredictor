/* Read the already-open result DOM. No network request or credential access.
 * This is a diagnostic observation, never a finality/canonical assertion.
 */
(function () {
  'use strict';
  const source = new URL(location.href);
  if (source.protocol !== 'https:' || source.hostname !== 'www.hongkongpools.com' ||
      !['/live', '/live.html'].includes(source.pathname)) {
    alert('CAPTURE_FAILED_WRONG_PAGE: buka halaman HK /live.html yang benar.');
    return;
  }
  const title = document.title || '';
  const visible = document.body?.innerText || '';
  if (/just a moment|tunggu sebentar|security verification|melakukan verifikasi keamanan|verify you are human|checking your browser|enable javascript and cookies/i.test(title + '\n' + visible)) {
    alert('CAPTURE_BLOCKED: yang terbuka masih challenge, bukan hasil undian.');
    return;
  }
  if (!visible.trim() || !document.body.querySelector('table')) {
    alert('CAPTURE_FAILED_NO_TABLE: tabel hasil belum ada pada dokumen ini. Jangan kirim screenshot sebagai pengganti DOM.');
    return;
  }
  const phase = prompt('Label observasi: partial (masih berjalan), completed (terlihat selesai), atau unknown. Label ini bukan bukti final.', 'unknown');
  if (!['partial', 'completed', 'unknown'].includes(phase)) {
    alert('CAPTURE_CANCELLED: label harus partial/completed/unknown.');
    return;
  }
  const ownerDate = prompt('Tanggal undian yang TERTERA pada halaman, YYYY-MM-DD. Jangan gunakan tanggal HP. Kosongkan jika belum terlihat.', '');
  if (ownerDate === null) return;
  if (ownerDate && !/^\d{4}-\d{2}-\d{2}$/.test(ownerDate)) {
    alert('CAPTURE_FAILED_DATE_FORMAT: gunakan YYYY-MM-DD.');
    return;
  }
  // Only static display structure is exported. Never serialize raw outerHTML.
  const allowed = new Set('DIV SPAN P TABLE THEAD TBODY TFOOT TR TD TH CAPTION IMG H1 H2 H3 H4 H5 H6 BR HR B STRONG I EM SMALL TIME UL OL LI SECTION ARTICLE MAIN HEADER FOOTER A'.split(' '));
  const textParts = [];
  const privateName = /token|nonce|auth|cookie|session|challenge|csrf|clearance|captcha|password|cf-/i;
  const safeText = (value) => String(value || '').replace(/https?:\/\/[^\s<>"']+/g, (url) => safeURL(url) || '[URL_REMOVED]');
  function safeURL(value) {
    try {
      const url = new URL(value, source.origin);
      if (url.protocol !== 'https:' || privateName.test(url.pathname) ||
          url.pathname.split('/').some((part) => part.length > 100)) return '';
      // No username, query or fragment.
      return url.origin + url.pathname;
    } catch { return ''; }
  }
  function clean(node) {
    if (node.nodeType === 3) {
      const text = safeText(node.textContent);
      textParts.push(text);
      return document.createTextNode(text);
    }
    if (node.nodeType !== 1) return null;
    const tag = node.tagName;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OBJECT', 'EMBED', 'SVG', 'CANVAS'].includes(tag)) return null;
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.isContentEditable) return null;
    const css = getComputedStyle(node);
    if (css.display === 'none' || css.visibility === 'hidden') return null;
    const output = document.createElement(allowed.has(tag) ? tag.toLowerCase() : 'div');
    for (const name of ['id', 'class']) {
      const value = (node.getAttribute(name) || '').split(/\s+/).filter((part) =>
        /^[a-zA-Z0-9_-]{1,64}$/.test(part) && !privateName.test(part)).join(' ');
      if (value) output.setAttribute(name, value);
    }
    for (const name of ['alt', 'title']) {
      const value = node.getAttribute(name);
      if (value && !privateName.test(value)) output.setAttribute(name, safeText(value).slice(0, 300));
    }
    for (const name of ['colspan', 'rowspan', 'data-digit']) {
      const value = node.getAttribute(name);
      if (value && /^\d{1,2}$/.test(value)) output.setAttribute(name, value);
    }
    if (tag === 'IMG') {
      const src = safeURL(node.currentSrc || node.getAttribute('src'));
      if (src) output.setAttribute('src', src);
    }
    if (tag === 'A') {
      const href = safeURL(node.getAttribute('href'));
      if (href) output.setAttribute('href', href);
    }
    const background = css.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    if (background) {
      const url = safeURL(background[1]);
      if (url) output.setAttribute('data-static-background', url);
    }
    for (const child of node.childNodes) {
      const copy = clean(child);
      if (copy) output.appendChild(copy);
    }
    return output;
  }
  const root = clean(document.body);
  const tables = Array.from(root.querySelectorAll('table'));
  const resultTables = tables.filter((table) => /(?:1st|first)\s*prize/i.test(table.textContent));
  if (!resultTables.length) {
    alert('CAPTURE_FAILED_NO_PRIZE_LABEL: belum menemukan tabel dengan label first/1st prize. Struktur ini perlu diperiksa, jangan menganggap capture sukses.');
    return;
  }
  const capturedAt = new Date().toISOString();
  const refresh = document.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content') || '';
  const text = textParts.join(' ');
  const payload = {
    schema_version: 1,
    type: 'OWNER_BROWSER_DOM_DIAGNOSTIC_NOT_CANONICAL',
    capture_status: 'DOM_CAPTURED_REVIEW_REQUIRED',
    source_url: source.origin + source.pathname,
    captured_at: capturedAt,
    owner_phase: phase,
    owner_draw_date: ownerDate || null,
    owner_draw_date_verified: false,
    finality_verified: false,
    title: safeText(title),
    html: '<!doctype html><html><head><meta charset="utf-8"><title>HK sanitized result DOM</title></head><body>' + root.outerHTML + '</body></html>',
    structure: {
      table_count: tables.length,
      prize_table_count: resultTables.length,
      image_count: root.querySelectorAll('img').length,
      date_candidates: Array.from(new Set(text.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b|\b[A-Za-z]+\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/g) || [])),
      six_digit_text_candidates: Array.from(new Set(text.match(/\b\d{6}\b/g) || [])),
      meta_refresh_seconds: /^\d+(?:\s*;|$)/.test(refresh) ? Number(refresh.match(/^\d+/)[0]) : null,
      static_script_paths: Array.from(document.querySelectorAll('script[src]')).map((script) => safeURL(script.getAttribute('src'))).filter(Boolean),
      iframe_origins: Array.from(document.querySelectorAll('iframe[src]')).map((frame) => {
        try { return new URL(frame.getAttribute('src'), source.origin).origin; } catch { return null; }
      }).filter(Boolean)
    },
    redaction: 'No scripts, cookies, tokens, request headers, storage, browser profile, hidden/form content or URL query/fragment exported. Static DOM structure only. Inline update logic and iframe DOM are not captured.'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const objectURL = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectURL;
  link.download = 'HK_CAPTURE_' + capturedAt.replace(/[:.]/g, '-') + '_' + phase + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 30000);
  alert('DOM_CAPTURED_REVIEW_REQUIRED: permintaan download dikirim. Pastikan HK_CAPTURE_*.json benar-benar ada di Download; jalankan pack di Termux. Ini bukan bukti final atau collector cloud PASS.');
})();
