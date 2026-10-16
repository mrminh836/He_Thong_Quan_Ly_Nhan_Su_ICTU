import { departmentService } from '../services/departmentService.js';
import { showToast } from './Toast.js';

/**
 * ==============================================================================
 * COMPONENT: DepartmentFormModal (Modal Form Thêm / Sửa Phòng Ban Dùng Chung)
 * ==============================================================================
 * Đáp ứng đầy đủ các yêu cầu nghiệp vụ:
 * 1. Dùng chung 1 modal và 1 form duy nhất, chuyển đổi linh hoạt qua mode ('create' | 'edit').
 * 2. Validate chặt chẽ phía Frontend trước khi gọi API (tên bắt buộc, trim, giới hạn độ dài).
 * 3. Tự động xóa lỗi validation realtime khi người dùng nhập dữ liệu hợp lệ.
 * 4. Chống gửi trùng request (Double Submission Prevention) với trạng thái loading spinner.
 * 5. Bắt và phân loại mã lỗi API (409 Conflict trùng tên/mã, 400, 401, 403, 404, lỗi mạng).
 * 6. Giữ nguyên dữ liệu người dùng đã nhập khi gặp lỗi để người dùng sửa lại thuận tiện.
 * 7. Accessibility: Autofocus, Escape key, đóng khi click ngoài overlay (an toàn).
 */

let activeModalOverlay = null;
let isSubmitting = false;
let triggerElement = null;
let escKeyHandler = null;

/**
 * Thoát và dọn dẹp modal khỏi DOM
 */
export function closeDepartmentFormModal() {
  if (isSubmitting) return; // Không đóng khi đang gửi API

  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      // Trả lại focus cho nút đã mở modal (Accessibility)
      if (triggerElement && typeof triggerElement.focus === 'function') {
        try {
          triggerElement.focus();
        } catch {
          // Bỏ qua nếu phần tử không còn trong DOM
        }
        triggerElement = null;
      }
    }, 200);
  }
}

/**
 * Escape chuỗi HTML an toàn chống tấn công XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Xác thực dữ liệu form phía Frontend trước khi gửi API
 * @param {object} fields
 * @param {string} fields.departmentName
 * @param {string} [fields.description]
 * @param {string} [fields.departmentCode]
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateDepartmentForm({ departmentName, description, departmentCode }) {
  const errors = {};
  let isValid = true;

  // 1. Kiểm tra Tên phòng ban (Bắt buộc)
  if (departmentName === undefined || departmentName === null) {
    errors.departmentName = 'Vui lòng nhập tên phòng ban.';
    isValid = false;
  } else {
    const trimmedName = String(departmentName).trim();
    if (!trimmedName) {
      errors.departmentName = 'Vui lòng nhập tên phòng ban.';
      isValid = false;
    } else if (trimmedName.length > 100) {
      errors.departmentName = 'Tên phòng ban không được vượt quá 100 ký tự.';
      isValid = false;
    }
  }

  // 2. Kiểm tra Mô tả (Không bắt buộc, tối đa 5000 ký tự)
  if (description && description.length > 5000) {
    errors.description = 'Mô tả không được vượt quá 5000 ký tự.';
    isValid = false;
  }

  // 3. Kiểm tra Mã phòng ban (Tùy chọn, nếu nhập thì từ 2 đến 20 ký tự hợp lệ)
  if (departmentCode && String(departmentCode).trim()) {
    const trimmedCode = String(departmentCode).trim().toUpperCase();
    if (trimmedCode.length < 2 || trimmedCode.length > 20) {
      errors.departmentCode = 'Mã phòng ban phải có độ dài từ 2 đến 20 ký tự.';
      isValid = false;
    } else if (!/^[A-Z0-9_-]+$/.test(trimmedCode)) {
      errors.departmentCode = 'Mã phòng ban chỉ được chứa chữ cái, chữ số, dấu gạch nối (-) hoặc gạch dưới (_).';
      isValid = false;
    }
  }

  return { isValid, errors };
}

/**
 * Mở Modal Form Thêm hoặc Chỉnh sửa phòng ban
 * @param {object} options
 * @param {'create'|'edit'} [options.mode='create'] - Chế độ modal
 * @param {number|string} [options.departmentId] - ID phòng ban (dùng khi edit)
 * @param {object} [options.department] - Dữ liệu phòng ban hiện tại (nếu có sẵn)
 * @param {Function} [options.onSuccess] - Callback khi tạo/sửa thành công
 * @param {Function} [options.onSubmit] - Callback tùy chỉnh khi submit (nếu cần override)
 */
export async function openDepartmentFormModal({
  mode = 'create',
  departmentId = null,
  department = null,
  onSuccess = null,
  onSubmit = null,
} = {}) {
  // Lưu lại nút đã kích hoạt mở modal để trả focus khi đóng
  triggerElement = document.activeElement;

  // Đóng modal cũ nếu còn tồn tại
  closeDepartmentFormModal();

  const isEdit = mode === 'edit';
  let initialData = department || {};
  const targetId = departmentId || initialData.id || initialData.departmentId;

  // Nếu là chế độ Edit mà chưa có thông tin phòng ban, gọi API GET /api/departments/:id để lấy dữ liệu mới nhất
  if (isEdit && targetId && !initialData.departmentName && !initialData.department_name) {
    try {
      initialData = await departmentService.getDepartmentById(targetId);
    } catch (err) {
      showToast(err.data?.message || err.message || 'Không thể tải thông tin phòng ban để chỉnh sửa.', 'error');
      return;
    }
  }

  // Chuẩn hóa dữ liệu prefill (hỗ trợ cả camelCase và snake_case)
  const initialName = initialData.departmentName || initialData.department_name || '';
  const initialCode = initialData.departmentCode || initialData.department_code || '';
  const initialDesc = initialData.description || '';
  const initialLoc = initialData.location || '';
  const initialPhone = initialData.phone || '';
  const initialActive = initialData.isActive !== undefined
    ? Boolean(initialData.isActive)
    : (initialData.is_active !== undefined ? Boolean(initialData.is_active) : true);

  // Cấu hình nội dung theo chế độ Add/Edit chuẩn đặc tả
  const modalTitle = isEdit ? 'Chỉnh sửa phòng ban' : 'Thêm phòng ban';
  const modalSubtitle = isEdit
    ? 'Cập nhật thông tin phòng ban.'
    : 'Nhập thông tin để tạo phòng ban mới trong hệ thống.';
  const submitBtnText = isEdit ? 'Lưu thay đổi' : 'Lưu phòng ban';
  const submitBtnIcon = isEdit
    ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

  // Tạo phần tử DOM Overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'department-form-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container" role="dialog" aria-modal="true" aria-labelledby="dept-modal-title">
      <!-- 1. MODAL HEADER -->
      <div class="modal-header">
        <div class="modal-title-group">
          <h2 class="modal-title" id="dept-modal-title">${escapeHtml(modalTitle)}</h2>
          <p class="modal-subtitle" id="dept-modal-subtitle">${escapeHtml(modalSubtitle)}</p>
        </div>
        <button type="button" class="modal-close-btn" id="dept-modal-close-icon" aria-label="Đóng modal">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- 2. MODAL BODY (FORM NHẬP LIỆU) -->
      <div class="modal-body">
        <!-- Banner thông báo lỗi tổng quát từ Server/Network -->
        <div class="form-banner-error" id="dept-form-banner-error" role="alert">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span id="dept-form-banner-error-text"></span>
        </div>

        <form id="department-form" autocomplete="off" novalidate>
          <!-- Trường 1: Tên phòng ban (Bắt buộc) -->
          <div class="form-group">
            <label class="form-label" for="dept-form-name">
              Tên phòng ban <span class="required">*</span>
            </label>
            <input 
              type="text" 
              id="dept-form-name" 
              name="departmentName" 
              class="form-input" 
              placeholder="Ví dụ: Phòng Công nghệ thông tin" 
              maxlength="100" 
              value="${escapeHtml(initialName)}" 
              required 
            />
            <div class="form-error-msg" id="dept-name-error"></div>
          </div>

          <!-- Trường 2: Mô tả chức năng & nhiệm vụ (Textarea) -->
          <div class="form-group form-group-spaced">
            <label class="form-label" for="dept-form-desc">
              Mô tả
            </label>
            <textarea 
              id="dept-form-desc" 
              name="description" 
              class="form-textarea" 
              placeholder="Nhập mô tả về chức năng, nhiệm vụ của phòng ban..."
            >${escapeHtml(initialDesc)}</textarea>
            <div class="form-error-msg" id="dept-desc-error"></div>
          </div>

          <!-- Trường 3: Mã phòng ban (Tùy chọn) -->
          <div class="form-group form-group-spaced">
            <label class="form-label" for="dept-form-code">
              Mã phòng ban <span class="form-hint-inline">(Tùy chọn)</span>
            </label>
            <input 
              type="text" 
              id="dept-form-code" 
              name="departmentCode" 
              class="form-input" 
              placeholder="Ví dụ: PB-CNTT (Tự động tạo nếu để trống)" 
              maxlength="20" 
              value="${escapeHtml(initialCode)}" 
            />
            <div class="form-error-msg" id="dept-code-error"></div>
            <span class="form-hint">Mã viết tắt duy nhất của phòng ban (từ 2 đến 20 ký tự chữ và số).</span>
          </div>

          <!-- Trường 4 & 5: Địa điểm & Điện thoại bàn -->
          <div class="form-row-2col">
            <div class="form-group">
              <label class="form-label" for="dept-form-location">Địa điểm / Tầng</label>
              <input 
                type="text" 
                id="dept-form-location" 
                name="location" 
                class="form-input" 
                placeholder="Tầng 4 - Tòa nhà A" 
                maxlength="255" 
                value="${escapeHtml(initialLoc)}" 
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="dept-form-phone">Điện thoại bàn</label>
              <input 
                type="tel" 
                id="dept-form-phone" 
                name="phone" 
                class="form-input" 
                placeholder="0208-3846-xxx" 
                maxlength="20" 
                value="${escapeHtml(initialPhone)}" 
              />
            </div>
          </div>

          <!-- Trường 6: Trạng thái hoạt động -->
          <div class="form-group form-checkbox-group">
            <input 
              type="checkbox" 
              id="dept-form-active" 
              name="isActive" 
              class="form-checkbox" 
              ${initialActive ? 'checked' : ''} 
            />
            <label for="dept-form-active" class="form-checkbox-label">
              Kích hoạt hoạt động
            </label>
          </div>
        </form>
      </div>

      <!-- 3. MODAL FOOTER (NÚT THAO TÁC) -->
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="dept-form-cancel-btn">Hủy</button>
        <button type="submit" form="department-form" class="btn btn-primary" id="dept-form-submit-btn">
          ${submitBtnIcon}
          <span id="dept-form-submit-text">${escapeHtml(submitBtnText)}</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;
  isSubmitting = false;

  // Lấy các phần tử DOM trong modal
  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  const descInput = overlay.querySelector('#dept-form-desc');
  const codeInput = overlay.querySelector('#dept-form-code');
  const locationInput = overlay.querySelector('#dept-form-location');
  const phoneInput = overlay.querySelector('#dept-form-phone');
  const activeInput = overlay.querySelector('#dept-form-active');

  const nameError = overlay.querySelector('#dept-name-error');
  const descError = overlay.querySelector('#dept-desc-error');
  const codeError = overlay.querySelector('#dept-code-error');
  const bannerError = overlay.querySelector('#dept-form-banner-error');
  const bannerErrorText = overlay.querySelector('#dept-form-banner-error-text');

  const closeIcon = overlay.querySelector('#dept-modal-close-icon');
  const cancelBtn = overlay.querySelector('#dept-form-cancel-btn');
  const submitBtn = overlay.querySelector('#dept-form-submit-btn');

  // 1. Tự động xóa lỗi realtime khi người dùng nhập dữ liệu hợp lệ vào Tên phòng ban
  nameInput.addEventListener('input', () => {
    const val = nameInput.value.trim();
    if (val.length > 0 && val.length <= 100) {
      nameInput.classList.remove('is-invalid');
      nameError.textContent = '';
      nameError.classList.remove('visible');
      bannerError.classList.remove('visible');
    }
  });

  // 2. Tự động xóa lỗi realtime khi người dùng sửa Mô tả
  descInput.addEventListener('input', () => {
    const val = descInput.value;
    if (!val || val.length <= 5000) {
      descInput.classList.remove('is-invalid');
      descError.textContent = '';
      descError.classList.remove('visible');
    }
  });

  // 3. Tự động xóa lỗi realtime khi người dùng sửa Mã phòng ban
  codeInput.addEventListener('input', () => {
    const val = codeInput.value.trim();
    if (!val || (val.length >= 2 && val.length <= 20 && /^[A-Za-z0-9_-]+$/.test(val))) {
      codeInput.classList.remove('is-invalid');
      codeError.textContent = '';
      codeError.classList.remove('visible');
    }
  });

  // 4. Xử lý sự kiện Submit Form (Add hoặc Edit)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmitting) return; // Chống gửi nhiều lần

    const departmentName = nameInput.value.trim();
    const description = descInput.value.trim();
    const departmentCode = codeInput.value.trim();

    // Validate phía Frontend trước khi gọi API
    const validation = validateDepartmentForm({ departmentName, description, departmentCode });
    if (!validation.isValid) {
      if (validation.errors.departmentName) {
        nameInput.classList.add('is-invalid');
        nameError.textContent = validation.errors.departmentName;
        nameError.classList.add('visible');
        nameInput.focus();
      }
      if (validation.errors.departmentCode) {
        codeInput.classList.add('is-invalid');
        codeError.textContent = validation.errors.departmentCode;
        codeError.classList.add('visible');
      }
      if (validation.errors.description) {
        descInput.classList.add('is-invalid');
        descError.textContent = validation.errors.description;
        descError.classList.add('visible');
      }
      return;
    }

    // Khóa nút submit và hiển thị spinner loading
    isSubmitting = true;
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    closeIcon.disabled = true;
    const originalSubmitHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `
      <div class="spinner btn-spinner"></div>
      <span>Đang lưu...</span>
    `;

    const payload = {
      departmentName,
      description: description || null,
      ...(departmentCode ? { departmentCode: departmentCode.toUpperCase() } : {}),
      location: locationInput.value.trim() || null,
      phone: phoneInput.value.trim() || null,
      isActive: activeInput ? activeInput.checked : true,
    };

    try {
      let result;
      if (typeof onSubmit === 'function') {
        result = await onSubmit(mode === 'create' ? payload : targetId, payload);
      } else if (mode === 'create') {
        result = await departmentService.createDepartment(payload);
        showToast(`Đã thêm phòng ban '${payload.departmentName}' thành công.`, 'success');
      } else {
        result = await departmentService.updateDepartment(targetId, payload);
        showToast(`Đã cập nhật phòng ban '${payload.departmentName}' thành công.`, 'success');
      }

      isSubmitting = false;
      closeDepartmentFormModal();

      if (typeof onSuccess === 'function') {
        await onSuccess(result);
      }
    } catch (err) {
      isSubmitting = false;
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      closeIcon.disabled = false;
      submitBtn.innerHTML = originalSubmitHtml;

      // Phân tích mã lỗi Backend có cấu trúc
      const status = err.status || err.statusCode;
      const errorCode = err.data?.errorCode || err.data?.code || err.code;
      const errorMsg = err.data?.message || err.message || 'Đã có lỗi xảy ra.';

      const isDuplicateName =
        errorCode === 'DUPLICATE_DEPARTMENT_NAME' ||
        (status === 409 && (errorMsg.includes('Tên phòng ban') || errorMsg.toLowerCase().includes('departmentname')));

      const isDuplicateCode =
        errorCode === 'DUPLICATE_DEPARTMENT_CODE' ||
        (status === 409 && (errorMsg.includes('Mã phòng ban') || errorMsg.toLowerCase().includes('departmentcode') || errorMsg.toLowerCase().includes('mã')));

      if (isDuplicateName) {
        nameInput.classList.add('is-invalid');
        const displayMsg = errorMsg || `Tên phòng ban '${departmentName}' đã tồn tại trong hệ thống.`;
        nameError.textContent = displayMsg;
        nameError.classList.add('visible');
        nameInput.focus();
        bannerErrorText.textContent = displayMsg;
        bannerError.classList.add('visible');
      } else if (isDuplicateCode) {
        codeInput.classList.add('is-invalid');
        const displayMsg = (errorMsg && errorMsg.includes('Mã phòng ban'))
          ? (errorMsg.includes('khác') ? errorMsg : `${errorMsg} Vui lòng nhập mã khác.`)
          : 'Mã phòng ban đã tồn tại. Vui lòng nhập mã khác.';
        codeError.textContent = displayMsg;
        codeError.classList.add('visible');
        codeInput.focus();
        bannerErrorText.textContent = displayMsg;
        bannerError.classList.add('visible');
      } else if (status === 409) {
        bannerErrorText.textContent = errorMsg || 'Mã hoặc tên phòng ban đã tồn tại. Vui lòng nhập thông tin khác.';
        bannerError.classList.add('visible');
      } else if (status === 400) {
        bannerErrorText.textContent = errorMsg || 'Dữ liệu đầu vào không hợp lệ. Vui lòng kiểm tra lại các trường thông tin.';
        bannerError.classList.add('visible');
      } else if (status === 404) {
        bannerErrorText.textContent = errorMsg || 'Phòng ban không tồn tại hoặc đã bị xóa khỏi hệ thống.';
        bannerError.classList.add('visible');
        showToast('Phòng ban không tồn tại hoặc đã bị xóa.', 'error');
      } else if (status === 401 || status === 403) {
        bannerErrorText.textContent = 'Bạn không có quyền thực hiện thao tác này. Vui lòng kiểm tra lại quyền tài khoản.';
        bannerError.classList.add('visible');
        showToast('Từ chối truy cập: Bạn không có quyền thực hiện thao tác này.', 'error');
      } else if (status >= 500) {
        bannerErrorText.textContent = 'Lỗi hệ thống: Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.';
        bannerError.classList.add('visible');
        showToast('Lỗi máy chủ nội bộ. Vui lòng thử lại sau.', 'error');
      } else {
        bannerErrorText.textContent = errorMsg || 'Không thể kết nối máy chủ. Vui lòng thử lại sau.';
        bannerError.classList.add('visible');
      }
    }
  });

  // 5. Sự kiện đóng modal: Nút X và Nút Hủy
  const handleClose = () => {
    if (!isSubmitting) closeDepartmentFormModal();
  };
  closeIcon.addEventListener('click', handleClose);
  cancelBtn.addEventListener('click', handleClose);

  // 6. Đóng modal khi click ra ngoài backdrop overlay
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isSubmitting) {
      closeDepartmentFormModal();
    }
  });

  // 7. Đóng modal khi nhấn phím Escape
  escKeyHandler = (e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      closeDepartmentFormModal();
    }
  };
  document.addEventListener('keydown', escKeyHandler);

  // Kích hoạt transition mở modal mượt mà
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    // Autofocus vào ô Tên phòng ban
    setTimeout(() => {
      nameInput.focus();
      if (isEdit && nameInput.value) {
        nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      }
    }, 50);
  });

  return overlay;
}

export default {
  openDepartmentFormModal,
  closeDepartmentFormModal,
  validateDepartmentForm,
};
