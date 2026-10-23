/**
 * COMPONENT: BIỂU ĐỒ CỘT TỶ LỆ CHẤM CÔNG ĐÚNG GIỜ THEO PHÒNG BAN
 * Hiển thị tỷ lệ nhân viên chấm công đúng giờ của từng phòng ban trong khoảng thời gian xác định
 * Công thức: Tỷ lệ (%) = (Số lượt check-in đúng giờ / Tổng số lượt check-in hợp lệ) * 100
 * Hoàn toàn bằng HTML5/SVG và Vanilla JavaScript hiện đại, không phụ thuộc thư viện nặng.
 */

/**
 * Tạo khung HTML ban đầu cho Card Biểu đồ cột chấm công đúng giờ
 * @returns {string} HTML markup
 */
export function renderDepartmentOnTimeBarChartMarkup() {
  return `
    <div class="department-ontime-card" id="department-ontime-card">
      <div class="card-header">
        <div class="card-header-left">
          <h2 class="card-title">Tỷ lệ chấm công đúng giờ theo phòng ban</h2>
          <p class="card-subtitle">So sánh tỷ lệ nhân viên check-in đúng giờ giữa các phòng ban</p>
        </div>
        <div class="card-header-right">
          <div class="chart-filter-group" id="ontime-time-filter" role="tablist" aria-label="Bộ lọc thời gian">
            <button class="chart-filter-chip is-active" data-range="today" role="tab" aria-selected="true">Hôm nay</button>
            <button class="chart-filter-chip" data-range="7days" role="tab" aria-selected="false">7 ngày qua</button>
            <button class="chart-filter-chip" data-range="month" role="tab" aria-selected="false">Tháng này</button>
          </div>
        </div>
      </div>
      <div class="card-body" id="dept-ontime-chart-body">
        <div class="loading-container" style="padding: 3rem 0;">
          <div class="spinner"></div>
          <span>Đang tải số liệu chấm công đúng giờ...</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Sinh chuỗi SVG cho biểu đồ cột Bar Chart
 * @param {Array<{ departmentId: any, departmentName: string, departmentCode: string, onTimeRate: number|null, onTimeCount: number, totalCheckIns: number, hasData: boolean }>} items
 * @returns {string} SVG markup
 */
export function generateBarChartSvg(items = []) {
  if (!items || items.length === 0) {
    return `
      <div class="dept-chart-empty-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style="font-weight: 600; color: #475569;">Chưa có dữ liệu phòng ban</span>
        <span style="font-size: 12px; color: #94a3b8;">Hệ thống chưa ghi nhận phòng ban nào trong danh sách.</span>
      </div>
    `;
  }

  const svgWidth = 620;
  const svgHeight = 310;
  const marginLeft = 50;
  const marginRight = 20;
  const marginTop = 30;
  const marginBottom = 85;

  const plotWidth = svgWidth - marginLeft - marginRight; // 550
  const plotHeight = svgHeight - marginTop - marginBottom; // 195
  const baselineY = marginTop + plotHeight; // 225

  // 1. Sinh các đường lưới ngang và nhãn trục Y (0%, 25%, 50%, 75%, 100%)
  const ySteps = [
    { pct: 100, y: marginTop },
    { pct: 75, y: marginTop + plotHeight * 0.25 },
    { pct: 50, y: marginTop + plotHeight * 0.5 },
    { pct: 25, y: marginTop + plotHeight * 0.75 },
    { pct: 0, y: baselineY },
  ];

  const gridHtml = ySteps
    .map(
      (step) => `
        <line
          x1="${marginLeft}"
          y1="${step.y.toFixed(1)}"
          x2="${(svgWidth - marginRight).toFixed(1)}"
          y2="${step.y.toFixed(1)}"
          stroke="#e2e8f0"
          stroke-dasharray="${step.pct === 0 ? 'none' : '3 3'}"
          stroke-width="${step.pct === 0 ? '1.5' : '1'}"
        />
        <text
          x="${marginLeft - 8}"
          y="${(step.y + 4).toFixed(1)}"
          text-anchor="end"
          font-size="11"
          font-weight="500"
          fill="#94a3b8"
        >${step.pct}%</text>
      `
    )
    .join('');

  // 2. Tính toán vị trí cột cho từng phòng ban
  const colStep = plotWidth / items.length;
  const barWidth = Math.min(42, Math.max(16, colStep * 0.55));

  const barsHtml = items
    .map((item, idx) => {
      const centerX = marginLeft + idx * colStep + colStep / 2;
      const barX = centerX - barWidth / 2;
      const rawDeptName = item.departmentName || 'Phòng ban';
      const cleanName = rawDeptName.replace(/^Phòng\s+/i, '').trim();
      const maxChars = 17;
      const displayLabel = cleanName.length > maxChars
        ? `${cleanName.slice(0, maxChars - 2)}…`
        : cleanName;
      const labelY = baselineY + 16;

      if (item.hasData && typeof item.onTimeRate === 'number') {
        const rate = Math.min(100, Math.max(0, item.onTimeRate));
        const barHeight = Math.max(4, (rate / 100) * plotHeight);
        const barY = baselineY - barHeight;

        // Mã màu theo tỷ lệ đúng giờ: Xanh lá (>=80%), Xanh dương (>=60%), Hổ phách (<60%)
        let barColor = '#10b981'; // Emerald
        if (rate < 60) {
          barColor = '#f59e0b'; // Amber
        } else if (rate < 80) {
          barColor = '#2563eb'; // Blue
        }

        return `
          <g class="dept-barchart-col" data-col-idx="${idx}">
            <!-- Cột dữ liệu -->
            <rect
              class="dept-bar-rect"
              data-col-idx="${idx}"
              data-dept-name="${escapeHtml(rawDeptName)}"
              data-dept-code="${escapeHtml(item.departmentCode || '')}"
              data-rate="${rate}"
              data-ontime="${item.onTimeCount}"
              data-total="${item.totalCheckIns}"
              x="${barX.toFixed(1)}"
              y="${barY.toFixed(1)}"
              width="${barWidth.toFixed(1)}"
              height="${barHeight.toFixed(1)}"
              rx="4"
              fill="${barColor}"
            />
            <!-- Nhãn giá trị trên đầu cột -->
            <text
              class="dept-bar-val-lbl"
              x="${centerX.toFixed(1)}"
              y="${(barY - 6).toFixed(1)}"
              text-anchor="middle"
              font-size="11"
              font-weight="700"
              fill="${barColor}"
            >${rate}%</text>
            <!-- Nhãn tên phòng ban trục X -->
            <text
              class="dept-bar-axis-lbl"
              x="${centerX.toFixed(1)}"
              y="${labelY.toFixed(1)}"
              text-anchor="end"
              transform="rotate(-30, ${centerX.toFixed(1)}, ${labelY.toFixed(1)})"
              font-size="11"
              font-weight="600"
              fill="#475569"
            >
              <title>${escapeHtml(rawDeptName)}</title>
              ${escapeHtml(displayLabel)}
            </text>
          </g>
        `;
      }

      // Trường hợp phòng ban chưa có lượt check-in nào trong ngày
      return `
        <g class="dept-barchart-col" data-col-idx="${idx}">
          <!-- Vạch chỉ báo chưa có dữ liệu -->
          <rect
            class="dept-bar-rect dept-bar-empty-rect"
            data-col-idx="${idx}"
            data-dept-name="${escapeHtml(rawDeptName)}"
            data-dept-code="${escapeHtml(item.departmentCode || '')}"
            data-rate="null"
            data-ontime="0"
            data-total="0"
            x="${barX.toFixed(1)}"
            y="${(baselineY - 3).toFixed(1)}"
            width="${barWidth.toFixed(1)}"
            height="3"
            rx="1.5"
            fill="#cbd5e1"
          />
          <!-- Nhãn Chưa có DL trên đầu vạch -->
          <text
            class="dept-bar-empty-lbl"
            x="${centerX.toFixed(1)}"
            y="${(baselineY - 8).toFixed(1)}"
            text-anchor="middle"
            font-size="10"
            font-weight="600"
            fill="#94a3b8"
          >Chưa có DL</text>
          <!-- Nhãn tên phòng ban trục X -->
          <text
            class="dept-bar-axis-lbl"
            x="${centerX.toFixed(1)}"
            y="${labelY.toFixed(1)}"
            text-anchor="end"
            transform="rotate(-30, ${centerX.toFixed(1)}, ${labelY.toFixed(1)})"
            font-size="11"
            font-weight="500"
            fill="#64748b"
          >
            <title>${escapeHtml(rawDeptName)}</title>
            ${escapeHtml(displayLabel)}
          </text>
        </g>
      `;
    })
    .join('');

  return `
    <div class="dept-barchart-container">
      <svg class="dept-barchart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <!-- Hệ thống lưới tọa độ -->
        <g class="dept-barchart-grid">
          ${gridHtml}
        </g>
        <!-- Tập hợp các cột dữ liệu -->
        <g class="dept-barchart-bars">
          ${barsHtml}
        </g>
      </svg>
      <!-- Tooltip tương tác nổi -->
      <div class="dept-barchart-tooltip" id="dept-barchart-tooltip"></div>
    </div>
  `;
}

/**
 * Cập nhật nội dung thẻ Biểu đồ cột chấm công đúng giờ
 * @param {HTMLElement} bodyEl
 * @param {object} param1
 * @param {Array} param1.items
 * @param {number} param1.totalCheckIns
 * @param {number} param1.averageRate
 */
export function updateDepartmentOnTimeBarChart(bodyEl, { items = [], totalCheckIns = 0, averageRate = 0 } = {}) {
  if (!bodyEl) return;

  if (items.length === 0) {
    bodyEl.innerHTML = `
      <div class="dept-chart-empty-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style="font-weight: 600; color: #475569;">Chưa có dữ liệu phòng ban</span>
        <span style="font-size: 12px; color: #94a3b8;">Không tìm thấy thông tin phòng ban nào để thống kê.</span>
      </div>
    `;
    return;
  }

  // Toàn bộ các phòng ban đều chưa có lượt check-in nào trong khoảng thời gian đã chọn
  if (totalCheckIns === 0) {
    bodyEl.innerHTML = `
      <div class="dept-chart-empty-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <span style="font-weight: 600; color: #475569;">Chưa có lượt chấm công nào được ghi nhận</span>
        <span style="font-size: 12px; color: #94a3b8;">Không có dữ liệu chấm công hợp lệ trong khoảng thời gian này. Biểu đồ sẽ tự động hiển thị khi có dữ liệu check-in.</span>
      </div>
    `;
    return;
  }

  const svgHtml = generateBarChartSvg(items);
  bodyEl.innerHTML = svgHtml;

  // Gắn sự kiện tương tác Tooltip
  setupBarChartInteractions(bodyEl);
}

/**
 * Hiển thị thông báo giới hạn API khi người dùng chọn bộ lọc thời gian chưa được Backend hỗ trợ
 * @param {HTMLElement} bodyEl
 * @param {string} message
 * @param {Function} onBackToToday
 */
export function renderDepartmentOnTimeBarChartApiNotice(bodyEl, message, onBackToToday) {
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <div class="dept-chart-empty-box" style="padding: 2.5rem 1.5rem;">
      <svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" style="width: 36px; height: 36px; margin-bottom: 8px;">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <span style="font-weight: 600; color: #0f172a; font-size: 14px;">Giới hạn dữ liệu thời gian</span>
      <p style="font-size: 12px; color: #64748b; max-width: 420px; margin: 4px auto 14px auto; line-height: 1.5;">
        ${escapeHtml(message || 'Backend hiện tại chỉ cung cấp dữ liệu chấm công theo phòng ban cho ngày hôm nay qua API GET /api/attendance/today.')}
      </p>
      <button class="btn btn-sm btn-primary" id="btn-back-to-today">
        <span>Quay lại dữ liệu Hôm nay</span>
      </button>
    </div>
  `;

  const btn = bodyEl.querySelector('#btn-back-to-today');
  if (btn && typeof onBackToToday === 'function') {
    btn.addEventListener('click', onBackToToday);
  }
}

/**
 * Hiển thị trạng thái lỗi khi tải dữ liệu biểu đồ cột
 * @param {HTMLElement} bodyEl
 * @param {string} errorMsg
 * @param {Function} onRetry
 */
export function renderDepartmentOnTimeBarChartError(bodyEl, errorMsg, onRetry) {
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <div class="dept-chart-error-box">
      <div style="font-weight: 600;">Không thể tải biểu đồ chấm công đúng giờ</div>
      <div style="font-size: 12px; color: #64748b;">${escapeHtml(errorMsg || 'Vui lòng kiểm tra kết nối API')}</div>
      <button class="btn btn-sm btn-secondary" id="btn-retry-ontime-chart" style="margin-top: 8px;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Thử tải lại</span>
      </button>
    </div>
  `;

  const retryBtn = bodyEl.querySelector('#btn-retry-ontime-chart');
  if (retryBtn && typeof onRetry === 'function') {
    retryBtn.addEventListener('click', onRetry);
  }
}

/**
 * Thiết lập các sự kiện tương tác Tooltip cho biểu đồ cột
 * @param {HTMLElement} container
 */
function setupBarChartInteractions(container) {
  const rects = container.querySelectorAll('.dept-bar-rect');
  const tooltip = container.querySelector('#dept-barchart-tooltip');
  const barchartContainer = container.querySelector('.dept-barchart-container');

  if (!barchartContainer || !tooltip) return;

  rects.forEach((rect) => {
    rect.addEventListener('mouseenter', () => {
      const name = rect.getAttribute('data-dept-name') || 'Phòng ban';
      const code = rect.getAttribute('data-dept-code');
      const rate = rect.getAttribute('data-rate');
      const ontime = rect.getAttribute('data-ontime');
      const total = rect.getAttribute('data-total');

      const codeSuffix = code ? ` (${code})` : '';

      if (rate === 'null' || !rate) {
        tooltip.innerHTML = `
          <strong>${escapeHtml(name)}${escapeHtml(codeSuffix)}</strong><br/>
          <span style="color: #cbd5e1;">Chưa có lượt check-in nào hôm nay</span>
        `;
      } else {
        tooltip.innerHTML = `
          <strong>${escapeHtml(name)}${escapeHtml(codeSuffix)}</strong><br/>
          Tỷ lệ đúng giờ: <strong>${rate}%</strong><br/>
          Số lượt: <strong>${ontime}/${total}</strong> check-in hợp lệ
        `;
      }

      rect.classList.add('is-active');
      tooltip.classList.add('is-visible');
    });

    rect.addEventListener('mousemove', (e) => {
      const bbox = barchartContainer.getBoundingClientRect();
      const x = e.clientX - bbox.left;
      const y = e.clientY - bbox.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });

    rect.addEventListener('mouseleave', () => {
      rect.classList.remove('is-active');
      tooltip.classList.remove('is-visible');
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
  renderDepartmentOnTimeBarChartMarkup,
  generateBarChartSvg,
  updateDepartmentOnTimeBarChart,
  renderDepartmentOnTimeBarChartApiNotice,
  renderDepartmentOnTimeBarChartError,
};
