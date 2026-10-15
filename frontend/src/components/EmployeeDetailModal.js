import { qs, sanitizeHTML } from '../utils/dom.js';
import { employeeService } from '../services/employeeService.js';
import { showToast } from './Toast.js';

let activeEmployeeModalOverlay = null;

/**
 * Đóng modal chi tiết nhân viên
 */
export function closeEmployeeDetailModal() {
  if (activeEmployeeModalOverlay) {
    activeEmployeeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeEmployeeModalOverlay && activeEmployeeModalOverlay.parentNode) {
        activeEmployeeModalOverlay.parentNode.removeChild(activeEmployeeModalOverlay);
      }
      activeEmployeeModalOverlay = null;
    }, 200);
  }
}

/**
 * Định dạng ngày sang chuẩn dd/MM/yyyy
 * @param {string|Date} dateVal
 * @returns {string}
 */
function formatDateVN(dateVal) {
  if (!dateVal) return '--';
  const str = String(dateVal).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

/**
 * Mở modal xem chi tiết nhân viên (gọi API GET /api/employees/:id)
 * @param {number|string} employeeId - ID nhân viên
 */
export async function openEmployeeDetailModal(employeeId) {
  closeEmployeeDetailModal();

  // Khung modal ban đầu hiển thị spinner tải dữ liệu
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'employee-detail-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 620px;">
      <div class="modal-header">
        <h2 class="modal-title">Hồ sơ chi tiết nhân sự</h2>
        <button type="button" class="modal-close-btn" id="btn-close-emp-modal" aria-label="Đóng">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body" id="emp-modal-body">
        <div class="loading-container">
          <div class="spinner"></div>
          <span>Đang tải thông tin nhân viên...</span>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-footer-close-emp">Đóng</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeEmployeeModalOverlay = overlay;

  const handleClose = () => closeEmployeeDetailModal();
  overlay.querySelector('#btn-close-emp-modal')?.addEventListener('click', handleClose);
  overlay.querySelector('#btn-footer-close-emp')?.addEventListener('click', handleClose);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  try {
    const employee = await employeeService.getEmployeeById(employeeId);
    const bodyEl = overlay.querySelector('#emp-modal-body');
    if (!bodyEl) return;

    const initials = (employee.fullName || 'NV')
      .split(' ')
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    const genderText =
      employee.gender === 'MALE'
        ? 'Nam'
        : employee.gender === 'FEMALE'
        ? 'Nữ'
        : employee.gender === 'OTHER'
        ? 'Khác'
        : '--';

    const statusBadge =
      employee.status === 'ACTIVE'
        ? `<span class="badge-status-active"><span class="status-indicator-dot dot-active"></span> Đang làm việc</span>`
        : employee.status === 'ONLEAVE'
        ? `<span class="badge-status-onleave"><span class="status-indicator-dot dot-onleave"></span> Nghỉ phép</span>`
        : employee.status === 'RESIGNED'
        ? `<span class="badge-status-resigned"><span class="status-indicator-dot dot-resigned"></span> Đã thôi việc</span>`
        : `<span class="badge-status-inactive"><span class="status-indicator-dot dot-inactive"></span> Tạm dừng</span>`;

    const salaryFormatted = employee.baseSalary
      ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(employee.baseSalary)
      : '--';

    // CCCD đã giải mã (nếu backend cấp phép cho vai trò hiện tại)
    const cccdDisplay = employee.cccd
      ? `<span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #1e293b; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; border: 1px solid #bae6fd;">${sanitizeHTML(
          employee.cccd
        )}</span>`
      : employee.ssnMasked
      ? `<span style="font-family: monospace; font-size: 12px; color: #64748b;">${sanitizeHTML(employee.ssnMasked)}</span>`
      : `<span style="color: #94a3b8; font-style: italic;">Chỉ Quản trị viên/HR được xem</span>`;

    bodyEl.innerHTML = `
      <div class="emp-detail-header-card">
        <div class="emp-detail-avatar">${sanitizeHTML(initials)}</div>
        <div class="emp-detail-primary-info">
          <div class="emp-detail-name">${sanitizeHTML(employee.fullName || '--')}</div>
          <div class="emp-detail-sub">
            <span class="emp-code-badge">${sanitizeHTML(employee.employeeCode || '--')}</span>
            <span>•</span>
            <span>${sanitizeHTML(employee.departmentName || 'Chưa phân bổ')}</span>
            ${employee.position ? `<span>•</span> <span>${sanitizeHTML(employee.position)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Mã nhân viên</span>
          <span class="detail-value"><strong>${sanitizeHTML(employee.employeeCode || '--')}</strong></span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Phòng ban</span>
          <span class="detail-value">${sanitizeHTML(employee.departmentName || '--')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Vị trí / Chức danh</span>
          <span class="detail-value">${sanitizeHTML(employee.position || 'Nhân viên')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Trạng thái làm việc</span>
          <span class="detail-value">${statusBadge}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Số điện thoại</span>
          <span class="detail-value">${sanitizeHTML(employee.phone || '--')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Email công việc</span>
          <span class="detail-value">${sanitizeHTML(employee.email || '--')}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Ngày sinh</span>
          <span class="detail-value">${formatDateVN(employee.dateOfBirth)}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Giới tính</span>
          <span class="detail-value">${genderText}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Ngày vào làm</span>
          <span class="detail-value">${formatDateVN(employee.hireDate)}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Lương cơ bản</span>
          <span class="detail-value">${salaryFormatted}</span>
        </div>

        <div class="detail-item" style="grid-column: span 2; background-color: #f8fafc; padding: 10px; border-radius: 8px; border: 1px dashed #cbd5e1;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span class="detail-label" style="margin-bottom: 0;">Số định danh cá nhân (CCCD/CMND)</span>
            <span class="emp-security-badge">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Giải mã AES-256
            </span>
          </div>
          <div>${cccdDisplay}</div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('[EmployeeDetailModal] Lỗi tải chi tiết:', error);
    const bodyEl = overlay.querySelector('#emp-modal-body');
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="empty-state empty-state-error">
          <div class="empty-state-title">Không thể tải thông tin nhân viên</div>
          <div class="empty-state-desc">${sanitizeHTML(error.message || 'Đã có lỗi xảy ra.')}</div>
        </div>
      `;
    }
    showToast(error.message || 'Không thể tải chi tiết nhân viên', 'error');
  }
}

export default {
  openEmployeeDetailModal,
  closeEmployeeDetailModal,
};
