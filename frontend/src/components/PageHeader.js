import { renderBreadcrumb } from './Breadcrumb.js';

/**
 * Component Header tiêu đề trang
 * @param {object} props
 * @param {string} props.title - Tiêu đề chính của trang
 * @param {string} [props.subtitle] - Tiêu đề phụ/mô tả ngắn
 * @param {Array} [props.breadcrumbs] - Danh sách breadcrumb
 * @param {string} [props.actions] - HTML các nút thao tác bên phải
 * @returns {string} HTML string
 */
export function renderPageHeader({ title, subtitle = '', breadcrumbs = [], actions = '' } = {}) {
  const breadcrumbHtml = breadcrumbs.length > 0 ? renderBreadcrumb(breadcrumbs) : '';

  return `
    <div class="page-header-wrapper">
      ${breadcrumbHtml}
      <div class="page-header">
        <div>
          <h1 class="page-header-title">${title}</h1>
          ${subtitle ? `<p class="page-header-subtitle">${subtitle}</p>` : ''}
        </div>
        ${actions ? `<div class="page-header-actions">${actions}</div>` : ''}
      </div>
    </div>
  `;
}

export default renderPageHeader;
