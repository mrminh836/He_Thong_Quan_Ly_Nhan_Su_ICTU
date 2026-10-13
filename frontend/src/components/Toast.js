import { createElement, qs } from '../utils/dom.js';

/**
 * Hiển thị thông báo Toast nổi
 * @param {string} message - Nội dung thông báo
 * @param {'info'|'success'|'warning'|'error'} type - Loại thông báo
 * @param {number} duration - Thời gian hiển thị (ms)
 */
export function showToast(message, type = 'info', duration = 3000) {
  let container = qs('#toast-container');
  if (!container) {
    container = createElement('div', 'toast-container');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = createElement('div', `toast toast-${type}`);
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, duration);
}

export default showToast;
