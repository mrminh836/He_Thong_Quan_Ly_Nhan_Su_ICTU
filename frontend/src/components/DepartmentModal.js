import { qs } from '../utils/dom.js';

/**
 * Component Modal Quản lý Phòng ban (Thêm, Sửa, Xem chi tiết, Xác nhận xóa)
 */

let activeModalOverlay = null;

/**
 * Đóng modal hiện tại và dọn dẹp khỏi DOM
 */
export function closeModal() {
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
 * Mở modal Thêm phòng ban mới
 * @param {object} param0
 * @param {Function} param0.onSubmit - Hàm xử lý gọi API tạo phòng ban
 */
export function openAddDepartmentModal({ onSubmit }) {
  const bodyHtml = `
    <div class="form-banner-error" id="modal-error-banner">
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="modal-error-text"></span>
    </div>

    <form id="add-dept-form">
      <div class="form-group">
        <label class="form-label" for="add-dept-name">
          Tên phòng ban <span class="required">*</span>
        </label>
        <input 
          type="text" 
          id="add-dept-name" 
          class="form-input" 
          placeholder="Nhập tên phòng ban (vd: Phòng Kỹ thuật & Công nghệ)" 
          autocomplete="off"
          required 
        />
        <div class="form-error-msg" id="name-error-msg">Vui lòng nhập tên phòng ban.</div>
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label class="form-label" for="add-dept-code">
          Mã phòng ban (Tùy chọn)
        </label>
        <input 
          type="text" 
          id="add-dept-code" 
          class="form-input" 
          placeholder="Tự động sinh nếu để trống (vd: PB-CNTT)" 
          maxlength="20"
          autocomplete="off"
        />
        <span class="form-hint">Nếu để trống, hệ thống sẽ tự động viết tắt từ tên phòng ban.</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
        <div class="form-group">
          <label class="form-label" for="add-dept-location">Địa điểm / Tầng</label>
          <input 
            type="text" 
            id="add-dept-location" 
            class="form-input" 
            placeholder="Tầng 4 - Tòa nhà A" 
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="add-dept-phone">Điện thoại bàn</label>
          <input 
            type="tel" 
            id="add-dept-phone" 
            class="form-input" 
            placeholder="0208-3846-xxx" 
          />
        </div>
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label class="form-label" for="add-dept-desc">Mô tả chức năng & nhiệm vụ</label>
        <textarea 
          id="add-dept-desc" 
          class="form-textarea" 
          placeholder="Mô tả chức năng nhiệm vụ chính của phòng ban..."
        ></textarea>
      </div>

      <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: row; align-items: center; gap: 8px;">
        <input type="checkbox" id="add-dept-active" checked style="width: 16px; height: 16px; cursor: pointer;" />
        <label for="add-dept-active" style="font-size: 13px; font-weight: 500; color: #1e293b; cursor: pointer;">
          Kích hoạt hoạt động ngay sau khi tạo
        </label>
      </div>
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Hủy bỏ</button>
    <button type="button" class="btn btn-primary" id="modal-submit-btn">
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Tạo phòng ban</span>
    </button>
  `;

  const overlay = createModalFrame('Thêm phòng ban mới', bodyHtml, footerHtml);

  const nameInput = overlay.querySelector('#add-dept-name');
  const codeInput = overlay.querySelector('#add-dept-code');
  const locationInput = overlay.querySelector('#add-dept-location');
  const phoneInput = overlay.querySelector('#add-dept-phone');
  const descInput = overlay.querySelector('#add-dept-desc');
  const activeInput = overlay.querySelector('#add-dept-active');

  const cancelBtn = overlay.querySelector('#modal-cancel-btn');
  const submitBtn = overlay.querySelector('#modal-submit-btn');
  const nameError = overlay.querySelector('#name-error-msg');
  const errorBanner = overlay.querySelector('#modal-error-banner');
  const errorText = overlay.querySelector('#modal-error-text');

  cancelBtn.addEventListener('click', closeModal);

  // Focus vào trường tên khi mở
  setTimeout(() => nameInput?.focus(), 150);

  // Xử lý gửi form
  submitBtn.addEventListener('click', async () => {
    const departmentName = nameInput.value.trim();
    if (!departmentName) {
      nameError.classList.add('visible');
      nameInput.focus();
      return;
    }
    nameError.classList.remove('visible');
    errorBanner.classList.remove('visible');

    const payload = {
      departmentName,
      departmentCode: codeInput.value.trim() || undefined,
      location: locationInput.value.trim() || null,
      phone: phoneInput.value.trim() || null,
      description: descInput.value.trim() || null,
      isActive: activeInput.checked,
    };

    // Vô hiệu hóa nút trong khi gửi request
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
      <span>Đang lưu...</span>
    `;

    try {
      await onSubmit(payload);
      closeModal();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Tạo phòng ban</span>
      `;
      errorText.textContent = err.data?.message || err.message || 'Không thể tạo phòng ban. Vui lòng kiểm tra lại.';
      errorBanner.classList.add('visible');
    }
  });
}

/**
 * Mở modal Chỉnh sửa phòng ban
 * @param {object} department - Dữ liệu phòng ban hiện tại
 * @param {object} param1
 * @param {Function} param1.onSubmit - Hàm xử lý gọi API cập nhật
 */
export function openEditDepartmentModal(department, { onSubmit }) {
  const bodyHtml = `
    <div class="form-banner-error" id="modal-error-banner">
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="modal-error-text"></span>
    </div>

    <form id="edit-dept-form">
      <div class="form-group">
        <label class="form-label" for="edit-dept-name">
          Tên phòng ban <span class="required">*</span>
        </label>
        <input 
          type="text" 
          id="edit-dept-name" 
          class="form-input" 
          value="${department.departmentName || ''}" 
          required 
        />
        <div class="form-error-msg" id="name-error-msg">Vui lòng nhập tên phòng ban.</div>
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label class="form-label" for="edit-dept-code">
          Mã phòng ban
        </label>
        <input 
          type="text" 
          id="edit-dept-code" 
          class="form-input" 
          value="${department.departmentCode || ''}" 
          maxlength="20"
        />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
        <div class="form-group">
          <label class="form-label" for="edit-dept-location">Địa điểm / Tầng</label>
          <input 
            type="text" 
            id="edit-dept-location" 
            class="form-input" 
            value="${department.location || ''}" 
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-dept-phone">Điện thoại bàn</label>
          <input 
            type="tel" 
            id="edit-dept-phone" 
            class="form-input" 
            value="${department.phone || ''}" 
          />
        </div>
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label class="form-label" for="edit-dept-desc">Mô tả chức năng & nhiệm vụ</label>
        <textarea 
          id="edit-dept-desc" 
          class="form-textarea"
        >${department.description || ''}</textarea>
      </div>

      <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: row; align-items: center; gap: 8px;">
        <input 
          type="checkbox" 
          id="edit-dept-active" 
          ${department.isActive ? 'checked' : ''} 
          style="width: 16px; height: 16px; cursor: pointer;" 
        />
        <label for="edit-dept-active" style="font-size: 13px; font-weight: 500; color: #1e293b; cursor: pointer;">
          Trạng thái đang hoạt động
        </label>
      </div>
    </form>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Hủy bỏ</button>
    <button type="button" class="btn btn-primary" id="modal-submit-btn">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Lưu thay đổi</span>
    </button>
  `;

  const overlay = createModalFrame(`Chỉnh sửa: ${department.departmentName}`, bodyHtml, footerHtml);

  const nameInput = overlay.querySelector('#edit-dept-name');
  const codeInput = overlay.querySelector('#edit-dept-code');
  const locationInput = overlay.querySelector('#edit-dept-location');
  const phoneInput = overlay.querySelector('#edit-dept-phone');
  const descInput = overlay.querySelector('#edit-dept-desc');
  const activeInput = overlay.querySelector('#edit-dept-active');

  const cancelBtn = overlay.querySelector('#modal-cancel-btn');
  const submitBtn = overlay.querySelector('#modal-submit-btn');
  const nameError = overlay.querySelector('#name-error-msg');
  const errorBanner = overlay.querySelector('#modal-error-banner');
  const errorText = overlay.querySelector('#modal-error-text');

  cancelBtn.addEventListener('click', closeModal);

  submitBtn.addEventListener('click', async () => {
    const departmentName = nameInput.value.trim();
    if (!departmentName) {
      nameError.classList.add('visible');
      nameInput.focus();
      return;
    }
    nameError.classList.remove('visible');
    errorBanner.classList.remove('visible');

    const updates = {
      departmentName,
      departmentCode: codeInput.value.trim(),
      location: locationInput.value.trim() || null,
      phone: phoneInput.value.trim() || null,
      description: descInput.value.trim() || null,
      isActive: activeInput.checked,
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
      <span>Đang lưu...</span>
    `;

    try {
      await onSubmit(department.departmentId || department.id, updates);
      closeModal();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Lưu thay đổi</span>
      `;
      errorText.textContent = err.data?.message || err.message || 'Không thể cập nhật phòng ban.';
      errorBanner.classList.add('visible');
    }
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
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <span class="dept-code-tag">${dept.departmentCode || 'N/A'}</span>
        <h3 style="margin: 4px 0 0 0; font-size: 16px; color: #0f172a; font-weight: 700;">${dept.departmentName || 'Không có tên'}</h3>
      </div>
      <div>${statusBadge}</div>
    </div>

    <div class="detail-grid" style="margin-top: 16px;">
      <div class="detail-item">
        <span class="detail-label">Số lượng nhân viên</span>
        <div class="detail-value">${countBadge}</div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Số điện thoại</span>
        <span class="detail-value">${dept.phone || 'Chưa cập nhật'}</span>
      </div>

      <div class="detail-item" style="grid-column: span 2;">
        <span class="detail-label">Địa điểm / Tầng làm việc</span>
        <span class="detail-value">${dept.location || 'Chưa cập nhật vị trí'}</span>
      </div>

      <div class="detail-item" style="grid-column: span 2;">
        <span class="detail-label">Mô tả chức năng</span>
        <div class="detail-value" style="font-weight: 400; line-height: 1.6; color: #475569; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
          ${dept.description || 'Chưa có mô tả chức năng cho phòng ban này.'}
        </div>
      </div>

      <div class="detail-item">
        <span class="detail-label">Ngày khởi tạo</span>
        <span class="detail-value" style="font-size: 12px; color: #64748b;">${formatDate(dept.createdAt)}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">Cập nhật lần cuối</span>
        <span class="detail-value" style="font-size: 12px; color: #64748b;">${formatDate(dept.updatedAt)}</span>
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
          <div style="margin-top: 4px; font-size: 11px;">
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

    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0;">
      Bạn có chắc chắn muốn xóa phòng ban <strong>${department.departmentName}</strong> (Mã: <code>${department.departmentCode || 'N/A'}</code>) không?
    </p>

    ${warningEmployeesHtml}

    <p style="font-size: 12px; color: #ef4444; margin: 0; font-weight: 500;">
      Lưu ý: Hành động này không thể hoàn tác sau khi đã xóa thành công.
    </p>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Hủy bỏ</button>
    <button type="button" class="btn btn-danger" id="modal-confirm-delete-btn" style="background-color: #ef4444; color: #ffffff; border: 1px solid #dc2626;">
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
      <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
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
