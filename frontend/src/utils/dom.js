/**
 * Tiện ích thao tác DOM an toàn và tối ưu (DOM Utilities)
 */

export function qs(selector, scope = typeof document !== 'undefined' ? document : null) {
  if (!scope || typeof scope.querySelector !== 'function') return null;
  return scope.querySelector(selector);
}

export function qsa(selector, scope = typeof document !== 'undefined' ? document : null) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  return Array.from(scope.querySelectorAll(selector));
}

export function createElement(tag, className = '', innerHTML = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
}

/**
 * Khử độc chuỗi ký tự HTML chống lỗ hổng Cross-Site Scripting (XSS)
 */
export function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default {
  qs,
  qsa,
  createElement,
  sanitizeHTML,
};
