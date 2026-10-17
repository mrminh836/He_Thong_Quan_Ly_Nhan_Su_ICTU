/**
 * COMPONENT: BIỂU ĐỒ PHÂN BỔ NHÂN SỰ THEO PHÒNG BAN (HRM-212)
 * Hiển thị biểu đồ hình vành khuyên (Doughnut Chart) và danh sách chú giải (Legend)
 * Tỷ trọng (%) = Số nhân viên phòng ban / Tổng nhân sự × 100
 * Hoàn toàn bằng HTML5/SVG và Vanilla JavaScript hiện đại, không phụ thuộc thư viện nặng.
 */

/**
 * Tạo khung HTML ban đầu cho Card Biểu đồ phân bổ nhân sự
 * @returns {string} HTML markup
 */
export function renderDepartmentDistributionChartMarkup() {
  return `
    <div class="department-distribution-card" id="department-distribution-card">
      <div class="card-header">
        <div class="card-header-left">
          <h2 class="card-title">Phân bổ nhân sự theo phòng ban</h2>
          <p class="card-subtitle">Tỷ trọng cơ cấu nhân sự đang làm việc giữa các phòng ban</p>
        </div>
        <div class="card-header-right">
          <span class="badge badge-info" id="dept-chart-total-badge">Đang tải...</span>
        </div>
      </div>
      <div class="card-body" id="dept-chart-body">
        <div class="loading-container" style="padding: 3rem 0;">
          <div class="spinner"></div>
          <span>Đang tải số liệu phân bổ nhân sự...</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Sinh chuỗi SVG cho biểu đồ Doughnut
 * @param {Array<{ id: any, name: string, code: string, count: number, percentage: number, color: string }>} items
 * @param {number} totalCount
 * @returns {string} SVG markup
 */
export function generateDoughnutSvg(items, totalCount) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius; // ~439.82
  const center = 100;

  if (!items || items.length === 0 || totalCount === 0) {
    return `
      <svg class="dept-chart-svg" viewBox="0 0 200 200">
        <circle
          cx="${center}"
          cy="${center}"
          r="${radius}"
          fill="transparent"
          stroke="#e2e8f0"
          stroke-width="18"
        />
      </svg>
      <div class="dept-chart-center">
        <div class="dept-chart-center-val">0</div>
        <div class="dept-chart-center-lbl">Nhân sự</div>
      </div>
    `;
  }

  let cumulativeOffset = 0;
  const segmentsHtml = items
    .filter((item) => item.count > 0)
    .map((item, idx) => {
      const ratio = item.count / totalCount;
      const strokeDash = ratio * circumference;
      const strokeGap = circumference - strokeDash;
      const currentOffset = cumulativeOffset;
      cumulativeOffset += strokeDash;

      return `
        <circle
          class="dept-chart-segment"
          data-segment-idx="${idx}"
          data-dept-id="${item.id}"
          data-name="${escapeHtml(item.name)}"
          data-code="${escapeHtml(item.code || '')}"
          data-count="${item.count}"
          data-pct="${item.percentage}"
          cx="${center}"
          cy="${center}"
          r="${radius}"
          fill="transparent"
          stroke="${item.color}"
          stroke-width="20"
          stroke-dasharray="${strokeDash.toFixed(3)} ${strokeGap.toFixed(3)}"
          stroke-dashoffset="${(-currentOffset).toFixed(3)}"
        />
      `;
    })
    .join('');

  return `
    <svg class="dept-chart-svg" viewBox="0 0 200 200">
      <!-- Nền vòng tròn mờ -->
      <circle
        cx="${center}"
        cy="${center}"
        r="${radius}"
        fill="transparent"
        stroke="#f1f5f9"
        stroke-width="20"
      />
      ${segmentsHtml}
    </svg>
    <div class="dept-chart-center">
      <div class="dept-chart-center-val">${totalCount}</div>
      <div class="dept-chart-center-lbl">Nhân sự</div>
    </div>
    <div class="dept-chart-tooltip" id="dept-chart-tooltip"></div>
  `;
}

/**
 * Sinh HTML cho danh sách chú giải (Legend) và thanh tỷ trọng
 * @param {Array<{ id: any, name: string, code: string, count: number, percentage: number, color: string }>} items
 * @returns {string}
 */
export function generateLegendHtml(items) {
  if (!items || items.length === 0) {
    return `
      <div class="dept-chart-empty-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Chưa có dữ liệu phòng ban nào trong hệ thống.</span>
      </div>
    `;
  }

  return `
    <div class="dept-legend-container" id="dept-legend-container">
      ${items
        .map((item, idx) => {
          const codeText = item.code && item.code !== 'N/A' ? `(${item.code})` : '';
          return `
            <div class="dept-legend-item" data-legend-idx="${idx}" data-dept-id="${item.id}">
              <div class="dept-legend-left">
                <span class="dept-legend-dot" style="background-color: ${item.color};"></span>
                <div class="dept-legend-info">
                  <span class="dept-legend-name" title="${escapeHtml(item.name)} ${codeText}">
                    ${escapeHtml(item.name)} <span class="dept-legend-code">${codeText}</span>
                  </span>
                </div>
              </div>
              <div class="dept-legend-right">
                <div class="dept-legend-bar-wrap" title="${item.percentage}%">
                  <div class="dept-legend-bar" style="width: ${Math.min(100, Math.max(2, item.percentage))}%; background-color: ${item.color};"></div>
                </div>
                <span class="dept-legend-count">${item.count} NV</span>
                <span class="dept-legend-pct">${item.percentage}%</span>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

/**
 * Cập nhật nội dung thẻ biểu đồ phân bổ nhân sự và gắn sự kiện tương tác
 * @param {HTMLElement} bodyEl
 * @param {object} param1
 * @param {Array} param1.items
 * @param {number} param1.totalCount
 * @param {number} param1.departmentCount
 */
export function updateDepartmentDistributionChart(bodyEl, { items = [], totalCount = 0, departmentCount = 0 } = {}) {
  if (!bodyEl) return;

  const totalBadge = document.getElementById('dept-chart-total-badge');
  if (totalBadge) {
    totalBadge.textContent = `${departmentCount} phòng ban • ${totalCount} nhân sự`;
  }

  if (items.length === 0 || totalCount === 0) {
    bodyEl.innerHTML = `
      <div class="dept-chart-empty-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style="font-weight: 600; color: #475569;">Chưa có dữ liệu phân bổ nhân sự</span>
        <span style="font-size: 12px; color: #94a3b8;">Hệ thống hiện tại chưa ghi nhận nhân viên nào đang làm việc.</span>
      </div>
    `;
    return;
  }

  const svgHtml = generateDoughnutSvg(items, totalCount);
  const legendHtml = generateLegendHtml(items);

  bodyEl.innerHTML = `
    <div class="dept-chart-wrapper">
      <div class="dept-chart-visual">
        ${svgHtml}
      </div>
      <div class="dept-chart-details">
        ${legendHtml}
      </div>
    </div>
  `;

  // Gắn sự kiện tương tác Tooltip & Highlight
  setupChartInteractions(bodyEl);
}

/**
 * Hiển thị trạng thái lỗi khi tải dữ liệu biểu đồ
 * @param {HTMLElement} bodyEl
 * @param {string} errorMsg
 * @param {Function} onRetry
 */
export function renderDepartmentDistributionError(bodyEl, errorMsg, onRetry) {
  if (!bodyEl) return;

  const totalBadge = document.getElementById('dept-chart-total-badge');
  if (totalBadge) {
    totalBadge.textContent = 'Lỗi kết nối';
    totalBadge.className = 'badge badge-danger';
  }

  bodyEl.innerHTML = `
    <div class="dept-chart-error-box">
      <div style="font-weight: 600;">Không thể tải dữ liệu phân bổ nhân sự</div>
      <div style="font-size: 12px; color: #64748b;">${escapeHtml(errorMsg || 'Vui lòng kiểm tra kết nối API')}</div>
      <button class="btn btn-sm btn-secondary" id="btn-retry-dept-chart" style="margin-top: 8px;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Thử tải lại</span>
      </button>
    </div>
  `;

  const retryBtn = bodyEl.querySelector('#btn-retry-dept-chart');
  if (retryBtn && typeof onRetry === 'function') {
    retryBtn.addEventListener('click', onRetry);
  }
}

/**
 * Thiết lập các sự kiện tương tác giữa các phần của biểu đồ và chú giải
 * @param {HTMLElement} container
 */
function setupChartInteractions(container) {
  const segments = container.querySelectorAll('.dept-chart-segment');
  const legendItems = container.querySelectorAll('.dept-legend-item');
  const tooltip = container.querySelector('#dept-chart-tooltip');
  const visualContainer = container.querySelector('.dept-chart-visual');

  if (!visualContainer || !tooltip) return;

  function highlightIndex(index) {
    segments.forEach((seg) => {
      const isTarget = seg.getAttribute('data-segment-idx') === String(index);
      seg.classList.toggle('is-active', isTarget);
      seg.style.opacity = isTarget ? '1' : '0.4';
    });

    legendItems.forEach((item) => {
      const isTarget = item.getAttribute('data-legend-idx') === String(index);
      item.classList.toggle('is-active', isTarget);
    });
  }

  function resetHighlight() {
    segments.forEach((seg) => {
      seg.classList.remove('is-active');
      seg.style.opacity = '1';
    });
    legendItems.forEach((item) => {
      item.classList.remove('is-active');
    });
    if (tooltip) {
      tooltip.classList.remove('is-visible');
    }
  }

  // Tương tác trên SVG segments
  segments.forEach((segment) => {
    segment.addEventListener('mouseenter', (e) => {
      const idx = segment.getAttribute('data-segment-idx');
      highlightIndex(idx);

      const name = segment.getAttribute('data-name');
      const count = segment.getAttribute('data-count');
      const pct = segment.getAttribute('data-pct');

      tooltip.innerHTML = `<strong>${name}</strong><br/>${count} nhân sự (${pct}%)`;
      tooltip.classList.add('is-visible');
    });

    segment.addEventListener('mousemove', (e) => {
      const rect = visualContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });

    segment.addEventListener('mouseleave', () => {
      resetHighlight();
    });
  });

  // Tương tác trên Legend items
  legendItems.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      const idx = item.getAttribute('data-legend-idx');
      highlightIndex(idx);
    });

    item.addEventListener('mouseleave', () => {
      resetHighlight();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default {
  renderDepartmentDistributionChartMarkup,
  generateDoughnutSvg,
  generateLegendHtml,
  updateDepartmentDistributionChart,
  renderDepartmentDistributionError,
};
