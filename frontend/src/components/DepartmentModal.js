import { qs } from '../utils/dom.js';
import { openDepartmentFormModal, closeDepartmentFormModal } from './DepartmentFormModal.js';
import { showToast } from './Toast.js';

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
 * Phân tích và chuẩn hóa đối tượng lỗi trả về từ API xóa phòng ban
 * @param {any} err - Lỗi bắt được từ try-catch khi gọi API
 * @returns {{ type: string, title: string, message: string, errorCode: string, statusCode: number, isConstraint: boolean }}
 */
export function parseDepartmentDeleteError(err) {
  const status = Number(err?.status || err?.statusCode || 0);
  const errorCode = err?.data?.errorCode || err?.data?.code || err?.errorCode || err?.code || '';
  const serverMessage = err?.data?.message || err?.message || '';

  // 1. Nhận diện lỗi phòng ban còn nhân viên tham chiếu (409 Conflict hoặc 400 có mã/thông báo tương ứng)
  const isEmployeeConstraint =
    errorCode === 'DEPARTMENT_HAS_EMPLOYEES' ||
    ((status === 409 || status === 400) &&
      (serverMessage.toLowerCase().includes('nhân viên') ||
       serverMessage.toLowerCase().includes('trực thuộc') ||
       serverMessage.toLowerCase().includes('employee')));

  if (isEmployeeConstraint) {
    return {
      type: 'DEPARTMENT_HAS_EMPLOYEES',
      title: 'Không thể xóa phòng ban',
      message:
        'Phòng ban này hiện vẫn có nhân viên trực thuộc. Vui lòng chuyển nhân viên sang phòng ban khác hoặc xử lý các hồ sơ nhân sự liên quan trước khi thực hiện xóa.',
      errorCode: errorCode || 'DEPARTMENT_HAS_EMPLOYEES',
      statusCode: status || 409,
      isConstraint: true,
    };
  }

  // 2. HTTP 403: Không có quyền thao tác
  if (status === 403 || errorCode === 'FORBIDDEN') {
    return {
      type: 'FORBIDDEN',
      title: 'Không có quyền thực hiện',
      message: 'Bạn không có quyền xóa phòng ban. Thao tác này chỉ dành cho Quản trị viên cấp cao (ADMIN).',
      errorCode: errorCode || 'FORBIDDEN',
      statusCode: 403,
      isConstraint: false,
    };
  }

  // 3. HTTP 404: Không tìm thấy phòng ban
  if (status === 404 || errorCode === 'DEPARTMENT_NOT_FOUND') {
    return {
      type: 'NOT_FOUND',
      title: 'Phòng ban không tồn tại',
      message: 'Phòng ban này không còn tồn tại trên hệ thống hoặc đã bị xóa trước đó.',
      errorCode: errorCode || 'DEPARTMENT_NOT_FOUND',
      statusCode: 404,
      isConstraint: false,
    };
  }

  // 4. HTTP 401: Hết hạn phiên đăng nhập
  if (status === 401 || errorCode === 'TOKEN_REQUIRED' || errorCode === 'INVALID_TOKEN') {
    return {
      type: 'UNAUTHORIZED',
      title: 'Phiên làm việc hết hạn',
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang hoặc đăng nhập lại.',
      errorCode: errorCode || 'UNAUTHORIZED',
      statusCode: 401,
      isConstraint: false,
    };
  }

  // 5. Lỗi mạng hoặc HTTP 500 (Server Error)
  if (err?.isNetworkError || status >= 500) {
    return {
      type: 'SERVER_OR_NETWORK_ERROR',
      title: 'Lỗi hệ thống hoặc kết nối',
      message: 'Không thể kết nối đến máy chủ hoặc máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau.',
      errorCode: errorCode || 'INTERNAL_SERVER_ERROR',
      statusCode: status || 500,
      isConstraint: false,
    };
  }

  // 6. Lỗi 400 khác (Ví dụ ID sai định dạng, request không hợp lệ)
  return {
    type: 'BAD_REQUEST',
    title: 'Yêu cầu không hợp lệ',
    message: serverMessage || 'Yêu cầu xóa phòng ban không hợp lệ. Vui lòng kiểm tra lại.',
    errorCode: errorCode || 'BAD_REQUEST',
    statusCode: status || 400,
    isConstraint: false,
  };
}

/**
 * Mở hộp thoại xác nhận Xóa phòng ban và xử lý cảnh báo chi tiết
 * @param {object} department - Phòng ban cần xóa
 * @param {object} param1
 * @param {Function} param1.onConfirm - Hàm xử lý gọi API xóa
 */
export function openDeleteDepartmentModal(department, { onConfirm }) {
  const hasEmployees = (department.employeeCount || 0) > 0;

  const warningEmployeesHtml = hasEmployees
    ? `
      <div class="alert-warning-box" id="modal-initial-warning-box">
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

    <div id="modal-delete-prompt-content">
      <p class="modal-delete-text">
        Bạn có chắc chắn muốn xóa phòng ban <strong>${department.departmentName}</strong> (Mã: <code>${department.departmentCode || 'N/A'}</code>) không?
      </p>

      ${warningEmployeesHtml}

      <p class="modal-delete-notice">
        Lưu ý: Hành động này không thể hoàn tác sau khi đã xóa thành công.
      </p>
    </div>

    <!-- Cảnh báo chi tiết khi Backend từ chối do phòng ban còn nhân viên -->
    <div id="modal-has-employees-alert" class="alert-department-has-employees" style="display: none;">
      <div class="alert-warning-header">
        <div class="alert-warning-icon-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-warning-icon">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="alert-warning-title-group">
          <h3 class="alert-warning-title" id="has-employees-alert-title">Không thể xóa phòng ban</h3>
          <span class="error-code-badge" id="has-employees-code-badge" style="display: none;">
            Mã lỗi: <code id="has-employees-code-text">DEPARTMENT_HAS_EMPLOYEES</code>
          </span>
        </div>
      </div>
      <div class="alert-warning-body">
        <p id="has-employees-alert-message">
          Phòng ban này hiện vẫn có nhân viên trực thuộc. Vui lòng chuyển nhân viên sang phòng ban khác hoặc xử lý các hồ sơ nhân sự liên quan trước khi thực hiện xóa.
        </p>
      </div>
    </div>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Hủy bỏ</button>
    <button type="button" class="btn btn-danger btn-delete-confirm" id="modal-confirm-delete-btn">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      <span>Xác nhận xóa</span>
    </button>
    <button type="button" class="btn btn-primary" id="modal-understood-btn" style="display: none;">
      <span>Đã hiểu</span>
    </button>
  `;

  const overlay = createModalFrame('Xác nhận xóa phòng ban', bodyHtml, footerHtml, 520);

  const cancelBtn = overlay.querySelector('#modal-cancel-btn');
  const confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');
  const understoodBtn = overlay.querySelector('#modal-understood-btn');
  const errorBanner = overlay.querySelector('#modal-error-banner');
  const errorText = overlay.querySelector('#modal-error-text');
  const promptContent = overlay.querySelector('#modal-delete-prompt-content');
  const hasEmployeesAlert = overlay.querySelector('#modal-has-employees-alert');
  const hasEmployeesTitle = overlay.querySelector('#has-employees-alert-title');
  const hasEmployeesMessage = overlay.querySelector('#has-employees-alert-message');
  const codeBadge = overlay.querySelector('#has-employees-code-badge');
  const codeText = overlay.querySelector('#has-employees-code-text');
  const modalTitle = overlay.querySelector('.modal-title');

  cancelBtn.addEventListener('click', closeModal);
  understoodBtn.addEventListener('click', closeModal);

  let isSubmitting = false;

  confirmBtn.addEventListener('click', async () => {
    // Ngăn chặn nhấn nhiều lần tạo nhiều request đồng thời
    if (isSubmitting) return;
    isSubmitting = true;

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.innerHTML = `
      <div class="spinner btn-spinner"></div>
      <span>Đang xóa...</span>
    `;
    if (errorBanner) {
      errorBanner.classList.remove('visible');
    }

    try {
      await onConfirm(department.departmentId || department.id);
      closeModal();
    } catch (err) {
      isSubmitting = false;
      cancelBtn.disabled = false;

      const parsedError = parseDepartmentDeleteError(err);

      if (parsedError.type === 'DEPARTMENT_HAS_EMPLOYEES') {
        // 1. Chuyển đổi giao diện sang Cảnh báo chi tiết
        if (modalTitle) {
          modalTitle.textContent = parsedError.title;
        }
        if (promptContent) {
          promptContent.style.display = 'none';
        }
        if (errorBanner) {
          errorBanner.classList.remove('visible');
        }

        if (hasEmployeesAlert) {
          hasEmployeesAlert.style.display = 'flex';
          if (hasEmployeesTitle) hasEmployeesTitle.textContent = parsedError.title;
          if (hasEmployeesMessage) hasEmployeesMessage.textContent = parsedError.message;

          if (parsedError.errorCode && codeBadge && codeText) {
            codeText.textContent = parsedError.errorCode;
            codeBadge.style.display = 'inline-flex';
          }
        }

        // Chuyển đổi footer: Ẩn nút xóa, hiển thị nút "Đã hiểu" và giữ nút "Hủy"
        confirmBtn.style.display = 'none';
        understoodBtn.style.display = 'inline-flex';
        cancelBtn.textContent = 'Hủy';
        understoodBtn.focus();

        showToast(parsedError.message, 'warning', 4000);
      } else {
        // 2. Khôi phục nút xác nhận đối với các nhóm lỗi khác (cho phép thử lại hoặc hủy)
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Xác nhận xóa</span>
        `;

        if (errorText) {
          errorText.textContent = parsedError.message;
        }
        if (errorBanner) {
          errorBanner.classList.add('visible');
        }

        showToast(parsedError.message, 'error', 3500);
      }
    }
  });
}

export default {
  closeModal,
  openAddDepartmentModal,
  openEditDepartmentModal,
  openViewDepartmentModal,
  openDeleteDepartmentModal,
  parseDepartmentDeleteError,
};
