import { qs } from '../utils/dom.js';
import { openDepartmentFormModal, closeDepartmentFormModal } from './DepartmentFormModal.js';

/**
 * Component Modal Quản lý Phòng ban (Thêm, Sửa, Xem chi tiết, Xác nhận xóa)
 */

let activeModalOverlay = null;

/**
 * Đóng modal hiện tại và dọn dẹp khỏi DOM
 */
export function closeModal() {
  closeDepartmentFormModal();

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;
    }, 200);
  }
}

/**
 * Helper tạo và hiển thị modal overlay
 * @param {string} title - Tiêu đề modal
 * @param {string} bodyHtml - Nội dung HTML của modal body
 * @param {string} footerHtml - Nội dung HTML của modal footer
 * @param {number} [maxWidth=540] - Độ rộng tối đa
 * @returns {HTMLElement} Container modal
 */
function createModalFrame(title, bodyHtml, footerHtml, maxWidth = 540) {
  closeModal(); // Đóng modal cũ nếu còn tồn tại

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'dept-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container" style="max-width: ${maxWidth}px;">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button type="button" class="modal-close-btn" id="modal-close-icon" aria-label="Đóng">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body" id="modal-body-content">
        ${bodyHtml}
      </div>
      <div class="modal-footer">
        ${footerHtml}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Lắng nghe sự kiện click nút đóng (X)
  const closeIcon = overlay.querySelector('#modal-close-icon');
  if (closeIcon) {
    closeIcon.addEventListener('click', closeModal);
  }

  // Đóng khi click ngoài backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Đóng khi ấn Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Kích hoạt transition
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  return overlay;
}

/**
 * Mở modal Thêm phòng ban mới (Ủy quyền cho DepartmentFormModal dùng chung)
 * @param {object} [options]
 * @param {Function} [options.onSubmit] - Hàm tùy biến gọi API tạo phòng ban
 * @param {Function} [options.onSuccess] - Callback khi tạo thành công
 */
export function openAddDepartmentModal({ onSubmit, onSuccess } = {}) {
  return openDepartmentFormModal({
    mode: 'create',
    onSubmit,
    onSuccess,
  });
}

/**
 * Mở modal Chỉnh sửa phòng ban (Ủy quyền cho DepartmentFormModal dùng chung)
 * @param {object} department - Dữ liệu phòng ban hiện tại
 * @param {object} [options]
 * @param {Function} [options.onSubmit] - Hàm tùy biến gọi API cập nhật
 * @param {Function} [options.onSuccess] - Callback khi cập nhật thành công
 */
export function openEditDepartmentModal(department, { onSubmit, onSuccess } = {}) {
  return openDepartmentFormModal({
    mode: 'edit',
    department,
    departmentId: department?.id || department?.departmentId,
    onSubmit,
    onSuccess,
  });
}

/**
 * Mở modal Xem chi tiết thông tin phòng ban
 * @param {object} dept - Thông tin phòng ban
 */
export function openViewDepartmentModal(dept) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Chưa cập nhật';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const employeeCount = dept.employeeCount || 0;
  const countBadge = employeeCount > 0
    ? `<span class="badge-count-active">👥 ${employeeCount} nhân viên</span>`
    : `<span class="badge-count-zero">Chưa có nhân sự</span>`;

  const statusBadge = dept.isActive
    ? `<span class="badge badge-success">Đang hoạt động</span>`
    : `<span class="badge badge-danger">Tạm ngưng</span>`;

  const bodyHtml = `
    <div class="modal-dept-overview-banner">
      <div>
        <span class="dept-code-tag">${dept.departmentCode || 'N/A'}</span>
        <h3 class="modal-dept-title">${dept.departmentName || 'Không có tên'}</h3>
      </div>
      <div>${statusBadge}</div>
    </div>

    <div class="detail-grid form-group-spaced">
      <div class="detail-item">
        <span class="detail-label">Số lượng nhân viên</span>
        <div class="detail-value">${countBadge}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Số điện thoại</span>
        <span class="detail-value">${dept.phone || 'Chưa cập nhật'}</span>
      </div>

      <div class="detail-item detail-item-col-2">
        <span class="detail-label">Địa điểm / Tầng làm việc</span>
        <span class="detail-value">${dept.location || 'Chưa cập nhật vị trí'}</span>
      </div>

      <div class="detail-item detail-item-col-2">
        <span class="detail-label">Mô tả chức năng</span>
        <div class="detail-value dept-detail-desc-box">
          ${dept.description || 'Chưa có mô tả chức năng cho phòng ban này.'}
        </div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Ngày khởi tạo</span>
        <span class="detail-value dept-detail-date">${formatDate(dept.createdAt)}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">Cập nhật lần cuối</span>
        <span class="detail-value dept-detail-date">${formatDate(dept.updatedAt)}</span>
      </div>
    </div>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" id="modal-close-action-btn">Đóng</button>
  `;

  const overlay = createModalFrame('Chi tiết phòng ban', bodyHtml, footerHtml);
  const closeBtn = overlay.querySelector('#modal-close-action-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
}

/**
 * Mở hộp thoại xác nhận Xóa phòng ban
 * @param {object} department - Phòng ban cần xóa
 * @param {object} param1
 * @param {Function} param1.onConfirm - Hàm xử lý gọi API xóa
 */
export function openDeleteDepartmentModal(department, { onConfirm }) {
  const hasEmployees = (department.employeeCount || 0) > 0;

  const warningEmployeesHtml = hasEmployees
    ? `
      <div class="alert-warning-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <strong>Cảnh báo nghiệp vụ:</strong> Phòng ban này hiện đang có <strong>${department.employeeCount} nhân sự</strong> trực thuộc.
          <div class="alert-warning-subtext">
            Theo quy định bảo vệ dữ liệu, hệ thống Backend sẽ từ chối xóa (HTTP 409) cho tới khi nhân sự được điều chuyển sang phòng ban khác.
          </div>
        </div>
      </div>
    `
    : '';

  const bodyHtml = `
    <div class="form-banner-error" id="modal-error-banner">
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="modal-error-text"></span>
    </div>

    <p class="modal-delete-text">
      Bạn có chắc chắn muốn xóa phòng ban <strong>${department.departmentName}</strong> (Mã: <code>${department.departmentCode || 'N/A'}</code>) không?
    </p>

    ${warningEmployeesHtml}

    <p class="modal-delete-notice">
      Lưu ý: Hành động này không thể hoàn tác sau khi đã xóa thành công.
    </p>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Hủy bỏ</button>
    <button type="button" class="btn btn-danger btn-delete-confirm" id="modal-confirm-delete-btn">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      <span>Xác nhận xóa</span>
    </button>
  `;

  const overlay = createModalFrame('Xác nhận xóa phòng ban', bodyHtml, footerHtml, 480);

  const cancelBtn = overlay.querySelector('#modal-cancel-btn');
  const confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');
  const errorBanner = overlay.querySelector('#modal-error-banner');
  const errorText = overlay.querySelector('#modal-error-text');

  cancelBtn.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
      <div class="spinner btn-spinner"></div>
      <span>Đang xóa...</span>
    `;

    try {
      await onConfirm(department.departmentId || department.id);
      closeModal();
    } catch (err) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Xác nhận xóa</span>
      `;

      // Bắt lỗi nghiệp vụ 409 Conflict: phòng ban còn nhân viên
      if (err.status === 409 || err.data?.code === 'DEPARTMENT_HAS_EMPLOYEES' || err.data?.errorCode === 'DEPARTMENT_HAS_EMPLOYEES') {
        errorText.textContent =
          'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc. Vui lòng chuyển nhân viên sang phòng ban khác trước khi xóa.';
      } else {
        errorText.textContent = err.data?.message || err.message || 'Không thể xóa phòng ban.';
      }
      errorBanner.classList.add('visible');
    }
  });
}

export default {
  closeModal,
  openAddDepartmentModal,
  openEditDepartmentModal,
  openViewDepartmentModal,
  openDeleteDepartmentModal,
};
