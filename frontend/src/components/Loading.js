/**
 * Component hiển thị trạng thái đang tải (Loading Spinner)
 * @param {string} text - Thông điệp tải
 * @returns {string} HTML string
 */
export function renderLoading(text = 'Đang tải dữ liệu...') {
  return `
    <div class="loading-container">
      <div class="spinner"></div>
      <span>${text}</span>
    </div>
  `;
}

export default renderLoading;
