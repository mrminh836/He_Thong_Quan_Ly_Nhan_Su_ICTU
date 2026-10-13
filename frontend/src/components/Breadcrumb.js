/**
 * Component Breadcrumb điều hướng
 * @param {Array<{label: string, path?: string}>} items
 * @returns {string} HTML string
 */
export function renderBreadcrumb(items = []) {
  if (!items || items.length === 0) return '';

  return `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${items
        .map((item, index) => {
          const isLast = index === items.length - 1;
          if (isLast) {
            return `<span class="breadcrumb-item active" aria-current="page">${item.label}</span>`;
          }
          return `
            <span class="breadcrumb-item">
              <a href="${item.path || '#'}" data-link>${item.label}</a>
            </span>
            <span class="breadcrumb-separator">/</span>
          `;
        })
        .join('')}
    </nav>
  `;
}

export default renderBreadcrumb;
