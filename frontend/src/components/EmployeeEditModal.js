import { employeeService } from '../services/employeeService.js';
import { departmentService } from '../services/departmentService.js';
import { getCurrentUserRole } from '../services/authService.js';
import { ROLES } from '../utils/rbac.js';
import { showToast } from './Toast.js';
import { qs, sanitizeHTML } from '../utils/dom.js';

/**
 * ==============================================================================
 * COMPONENT: EmployeeEditModal (Modal Chỉnh Sửa Hồ Sơ Nhân Viên Chuẩn Enterprise)
 * ==============================================================================
 * Các tính năng cốt lõi:
 * 1. Chỉnh sửa Chức vụ, Mức lương, Số điện thoại và Dropdown Phòng ban.
 * 2. Tự động nạp dữ liệu cũ của nhân viên (Prefill chính xác từ Backend API).
 * 3. Tải danh mục phòng ban động từ GET /api/departments, tự chọn phòng ban hiện tại.
 * 4. Xử lý trường hợp phòng ban cũ không còn trong danh mục hoạt động.
 * 5. Tự động kiểm tra tính hợp lệ dữ liệu (Frontend Validation) & realtime feedback.
 * 6. Tuân thủ nghiêm ngặt bảo mật và scope backend:
 *    - Tuyệt đối KHÔNG gửi CCCD, EmployeeID, UserID lên API cập nhật.
 *    - Chỉ gửi các trường được backend hỗ trợ: position, salary, phone.
 * 7. Chống spam/gửi request trùng (Double Submission Prevention) với loading spinner.
 * 8. Giữ nguyên dữ liệu người dùng khi cập nhật thất bại để người dùng sửa.
 * 9. Dọn dẹp sạch sẽ bộ nhớ tạm (zeroing state) tránh lẫn dữ liệu giữa các nhân viên.
 * 10. Quản lý Accessibility: focus, Escape key, đóng khi click ngoài backdrop an toàn.
 */

let activeModalOverlay = null;
let isSubmitting = false;
let triggerElement = null;
let escKeyHandler = null;
let currentEmployeeId = null;
let currentEmployeeData = null;
let cachedDepartments = null;

const PHONE_REGEX = /^[0-9+()\-.\s]{9,20}$/;

/**
 * Hàm kiểm tra tính hợp lệ của dữ liệu chỉnh sửa nhân sự
 * @param {object} fields
 * @param {string} fields.position - Chức vụ
 * @param {string|number} [fields.salary] - Mức lương
 * @param {string} [fields.phone] - Số điện thoại
 * @param {string|number} [fields.departmentId] - ID phòng ban
 * @returns {{ isValid: boolean, errors: Record<string, string>, parsed: object }}
 */
export function validateEmployeeEditForm(fields = {}) {
  const errors = {};
  const parsed = {};
  let isValid = true;

  // 1. Kiểm tra Chức vụ (Bắt buộc, 1 - 50 ký tự)
  const rawPosition = fields.position !== undefined && fields.position !== null ? String(fields.position).trim() : '';
  if (!rawPosition) {
    errors.position = 'Vui lòng nhập chức vụ của nhân viên.';
    isValid = false;
  } else if (rawPosition.length > 50) {
    errors.position = 'Chức vụ không được vượt quá 50 ký tự.';
    isValid = false;
  } else {
    parsed.position = rawPosition;
  }

  // 2. Kiểm tra Mức lương (Số hợp lệ không âm, <= 9,999,999,999.99)
  const rawSalary = fields.salary;
  if (rawSalary !== undefined && rawSalary !== null && String(rawSalary).trim() !== '') {
    // Loại bỏ dấu chấm, phẩy phân cách hàng nghìn nếu người dùng nhập
    const cleanSalaryStr = String(rawSalary).replace(/[,\s]/g, '');
    const numSalary = Number(cleanSalaryStr);

    if (isNaN(numSalary) || !isFinite(numSalary)) {
      errors.salary = 'Mức lương phải là số hợp lệ.';
      isValid = false;
    } else if (numSalary < 0) {
      errors.salary = 'Mức lương không được là số âm.';
      isValid = false;
    } else if (numSalary > 9999999999.99) {
      errors.salary = 'Mức lương không được vượt quá 9,999,999,999.99 VNĐ.';
      isValid = false;
    } else {
      parsed.salary = Number(numSalary.toFixed(2));
    }
  } else {
    parsed.salary = undefined;
  }

  // 3. Kiểm tra Số điện thoại (Tùy chọn, 9-20 số)
  const rawPhone = fields.phone !== undefined && fields.phone !== null ? String(fields.phone).trim() : '';
  if (rawPhone) {
    if (rawPhone.length > 20) {
      errors.phone = 'Số điện thoại không được vượt quá 20 ký tự.';
      isValid = false;
    } else if (!PHONE_REGEX.test(rawPhone)) {
      errors.phone = 'Số điện thoại không đúng định dạng (9-20 chữ số).';
      isValid = false;
    } else {
      parsed.phone = rawPhone;
    }
  } else {
    parsed.phone = null; // Cho phép gửi null để xóa số điện thoại
  }

  // 4. Kiểm tra Phòng ban (Bắt buộc chọn)
  const deptId = fields.departmentId;
  if (deptId === undefined || deptId === null || String(deptId).trim() === '' || deptId === 'all') {
    errors.departmentId = 'Vui lòng chọn phòng ban cho nhân viên.';
    isValid = false;
  } else {
    parsed.departmentId = Number(deptId);
  }

  return { isValid, errors, parsed };
}

/**
 * Đóng modal chỉnh sửa hồ sơ nhân viên và dọn dẹp bộ nhớ sạch sẽ
 */
export function closeEmployeeEditModal() {
  if (isSubmitting) return; // Ngăn đóng khi đang xử lý request

  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  document.body.style.overflow = '';

  // Dọn dẹp state để tránh rò rỉ dữ liệu giữa các nhân viên
  currentEmployeeId = null;
  currentEmployeeData = null;

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      // Trả lại focus cho nút đã bấm mở modal (Accessibility)
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
 * Mở modal chỉnh sửa thông tin nhân viên
 * @param {object} options
 * @param {number|string} options.employeeId - ID nhân viên cần sửa
 * @param {object} [options.employee] - Dữ liệu nhân viên có sẵn (nếu có)
 * @param {HTMLElement} [options.triggerEl] - Phần tử nút kích hoạt
 * @param {Function} [options.onSuccess] - Callback sau khi lưu thành công
 */
export async function openEmployeeEditModal({
  employeeId,
  employee = null,
  triggerEl = null,
  onSuccess = null,
} = {}) {
  // 1. Kiểm tra quyền truy cập (RBAC)
  const userRole = getCurrentUserRole();
  const canEdit = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;
  if (!canEdit) {
    showToast('Bạn không có quyền chỉnh sửa hồ sơ nhân viên.', 'error');
    return;
  }

  if (!employeeId || isNaN(Number(employeeId))) {
    showToast('Mã định danh nhân viên không hợp lệ.', 'error');
    return;
  }

  // Đóng modal cũ nếu còn mở
  closeEmployeeEditModal();

  triggerElement = triggerEl || document.activeElement;
  currentEmployeeId = Number(employeeId);
  currentEmployeeData = employee ? { ...employee } : null;

  // Tạo khung Modal Overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'employee-edit-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container emp-edit-modal-container" role="dialog" aria-modal="true" aria-labelledby="emp-edit-modal-title">
      <!-- 1. MODAL HEADER -->
      <div class="modal-header">
        <div class="modal-title-group">
          <h2 class="modal-title" id="emp-edit-modal-title">Chỉnh sửa hồ sơ nhân viên</h2>
          <p class="modal-subtitle">Cập nhật chức vụ, mức lương và số điện thoại của nhân sự.</p>
        </div>
        <button type="button" class="modal-close-btn" id="btn-close-emp-edit" aria-label="Đóng cửa sổ">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- 2. MODAL BODY -->
      <div class="modal-body" id="emp-edit-modal-body">
        <div class="loading-container" style="padding: 40px 16px;">
          <div class="spinner"></div>
          <span style="font-size: 13px; color: #64748b;">Đang tải dữ liệu hồ sơ nhân sự...</span>
        </div>
      </div>

      <!-- 3. MODAL FOOTER -->
      <div class="modal-footer" id="emp-edit-modal-footer" style="display: none;">
        <button type="button" class="btn btn-secondary" id="btn-cancel-emp-edit">Hủy</button>
        <button type="submit" form="emp-edit-form" class="btn btn-primary" id="btn-submit-emp-edit">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <span id="btn-submit-text">Lưu thay đổi</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Khóa cuộn trang nền
  document.body.style.overflow = 'hidden';

  // Hiệu ứng mở modal mượt mà
  requestAnimationFrame(() => {
    overlay.classList.add('active');
  });

  // Gắn sự kiện đóng modal
  const handleClose = () => closeEmployeeEditModal();
  overlay.querySelector('#btn-close-emp-edit')?.addEventListener('click', handleClose);
  overlay.querySelector('#btn-cancel-emp-edit')?.addEventListener('click', handleClose);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  });

  escKeyHandler = (e) => {
    if (e.key === 'Escape') handleClose();
  };
  document.addEventListener('keydown', escKeyHandler);

  // Nạp dữ liệu nhân viên và danh sách phòng ban
  await initEditModalData(overlay, currentEmployeeId, onSuccess);
}

/**
 * Nạp dữ liệu nhân viên và render form chỉnh sửa
 */
async function initEditModalData(overlay, employeeId, onSuccess) {
  const bodyEl = overlay.querySelector('#emp-edit-modal-body');
  const footerEl = overlay.querySelector('#emp-edit-modal-footer');
  if (!bodyEl) return;

  try {
    // 1. Tải song song: Chi tiết nhân viên và danh mục phòng ban
    const [empData, deptList] = await Promise.all([
      currentEmployeeData && currentEmployeeData.position !== undefined
        ? Promise.resolve(currentEmployeeData)
        : employeeService.getEmployeeById(employeeId),
      loadDepartmentsList(),
    ]);

    currentEmployeeData = empData;

    // 2. Render Form chỉnh sửa
    renderEditFormContent(overlay, empData, deptList, onSuccess);
    if (footerEl) footerEl.style.display = 'flex';
  } catch (error) {
    console.error('[EmployeeEditModal] Lỗi nạp thông tin nhân viên:', error);
    const statusCode = error.status || error.statusCode;
    const errorMsg = error.message || 'Không thể tải thông tin nhân viên.';

    bodyEl.innerHTML = `
      <div class="empty-state empty-state-error" style="padding: 32px 16px;">
        <div class="empty-state-icon" style="background-color: #fef2f2; color: #ef4444;">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="empty-state-title">${statusCode === 404 ? 'Không tìm thấy nhân viên' : 'Lỗi tải dữ liệu'}</div>
        <div class="empty-state-desc">${sanitizeHTML(errorMsg)}</div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-retry-load-emp" style="margin-top: 12px;">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>Thử lại</span>
        </button>
      </div>
    `;

    overlay.querySelector('#btn-retry-load-emp')?.addEventListener('click', () => {
      bodyEl.innerHTML = `
        <div class="loading-container" style="padding: 40px 16px;">
          <div class="spinner"></div>
          <span style="font-size: 13px; color: #64748b;">Đang tải lại dữ liệu...</span>
        </div>
      `;
      initEditModalData(overlay, employeeId, onSuccess);
    });
  }
}

/**
 * Tải danh mục phòng ban và cache lại
 * @returns {Promise<Array>}
 */
async function loadDepartmentsList() {
  if (cachedDepartments && Array.isArray(cachedDepartments) && cachedDepartments.length > 0) {
    return cachedDepartments;
  }
  try {
    const res = await departmentService.getDepartments({ limit: 100 });
    cachedDepartments = res.items || [];
    return cachedDepartments;
  } catch (err) {
    console.warn('[EmployeeEditModal] Không thể tải danh sách phòng ban:', err.message);
    return [];
  }
}

/**
 * Render cấu trúc Form chỉnh sửa hồ sơ nhân viên
 */
function renderEditFormContent(overlay, emp, deptList, onSuccess) {
  const bodyEl = overlay.querySelector('#emp-edit-modal-body');
  if (!bodyEl) return;

  const fullName = sanitizeHTML(emp.fullName || 'Nhân viên');
  const employeeCode = sanitizeHTML(emp.employeeCode || '--');
  const email = emp.email ? sanitizeHTML(emp.email) : 'Chưa có email';
  const position = sanitizeHTML(emp.position || '');
  const phone = emp.phone ? sanitizeHTML(emp.phone) : '';
  const currentDeptId = emp.departmentId || emp.department_id || null;
  const currentDeptName = emp.departmentName || emp.department_name || '';

  // Định dạng mức lương ban đầu (số nguyên/thực không kèm ký hiệu)
  let initialSalary = '';
  if (emp.baseSalary !== undefined && emp.baseSalary !== null && String(emp.baseSalary).trim() !== '') {
    const num = Number(emp.baseSalary);
    if (!isNaN(num)) {
      initialSalary = String(num);
    }
  } else if (emp.salary !== undefined && emp.salary !== null) {
    const num = Number(emp.salary);
    if (!isNaN(num)) {
      initialSalary = String(num);
    }
  }

  // Chữ cái đại diện avatar
  const initials = (emp.fullName || 'NV')
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  // Tạo các options cho dropdown phòng ban
  let deptOptionsHtml = '<option value="">-- Chọn phòng ban --</option>';
  let isCurrentDeptInList = false;

  if (deptList.length === 0) {
    deptOptionsHtml += '<option value="" disabled>Chưa có danh mục phòng ban trong hệ thống</option>';
  } else {
    deptList.forEach((d) => {
      const dId = d.id || d.departmentId;
      const dName = sanitizeHTML(d.departmentName || d.name || `Phòng ban #${dId}`);
      const dCode = d.departmentCode ? ` (${sanitizeHTML(d.departmentCode)})` : '';
      const isSelected = String(dId) === String(currentDeptId);
      if (isSelected) isCurrentDeptInList = true;
      deptOptionsHtml += `<option value="${dId}" ${isSelected ? 'selected' : ''}>${dName}${dCode}</option>`;
    });
  }

  // Nếu phòng ban hiện tại của nhân viên không có trong danh sách nạp về (vd: bị vô hiệu hóa)
  if (currentDeptId && !isCurrentDeptInList) {
    deptOptionsHtml += `<option value="${currentDeptId}" selected>${sanitizeHTML(currentDeptName || `Phòng ban #${currentDeptId}`)} (Hiện tại - Không còn trong danh mục)</option>`;
  }

  bodyEl.innerHTML = `
    <!-- 1. Thẻ định danh nhân sự (Thông tin cố định) -->
    <div class="emp-edit-identity-card">
      <div class="emp-edit-avatar">${sanitizeHTML(initials)}</div>
      <div class="emp-edit-identity-info">
        <div class="emp-edit-name">${fullName}</div>
        <div class="emp-edit-meta">
          <span class="emp-code-badge">${employeeCode}</span>
          <span>•</span>
          <span>${email}</span>
        </div>
      </div>
    </div>

    <!-- 2. Thông báo phạm vi cập nhật an toàn của Backend -->
    <div class="emp-edit-scope-notice">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>API hỗ trợ cập nhật <strong>Chức vụ</strong>, <strong>Mức lương</strong> và <strong>Số điện thoại</strong>. Thông tin Phòng ban được hiển thị chuẩn hóa từ danh mục hệ thống.</span>
    </div>

    <!-- Banner thông báo lỗi tổng thể -->
    <div class="form-banner-error" id="emp-edit-banner-error" role="alert">
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span id="emp-edit-banner-error-text"></span>
    </div>

    <!-- 3. Form chỉnh sửa -->
    <form id="emp-edit-form" autocomplete="off" novalidate>
      <!-- Trường 1: Chức vụ (Bắt buộc) -->
      <div class="form-group">
        <label class="form-label" for="edit-emp-position">
          Chức vụ công tác <span class="required">*</span>
        </label>
        <input 
          type="text" 
          id="edit-emp-position" 
          name="position" 
          class="form-input" 
          placeholder="Ví dụ: Chuyên viên Phân tích nghiệp vụ, Senior Developer..." 
          maxlength="50" 
          value="${position}" 
          required 
        />
        <div class="form-error-msg" id="edit-emp-position-error"></div>
        <span class="form-hint">Nhập chức danh hiện tại của nhân sự (tối đa 50 ký tự).</span>
      </div>

      <!-- Trường 2: Mức lương cơ bản (Tùy chọn) -->
      <div class="form-group form-group-spaced">
        <label class="form-label" for="edit-emp-salary">
          Mức lương cơ bản (VNĐ) <span class="form-hint-inline">(Số không âm)</span>
        </label>
        <div class="salary-input-wrapper">
          <input 
            type="number" 
            id="edit-emp-salary" 
            name="salary" 
            class="form-input" 
            placeholder="Ví dụ: 25000000" 
            min="0" 
            step="100000" 
            max="9999999999.99" 
            value="${initialSalary}" 
          />
          <div class="salary-preview-text" id="salary-preview-text">
            <span>Định dạng:</span> <strong id="salary-preview-val"></strong>
          </div>
        </div>
        <div class="form-error-msg" id="edit-emp-salary-error"></div>
        <span class="form-hint">Mức lương cơ bản hàng tháng tính theo Việt Nam Đồng.</span>
      </div>

      <!-- Trường 3: Số điện thoại liên hệ -->
      <div class="form-group form-group-spaced">
        <label class="form-label" for="edit-emp-phone">
          Số điện thoại liên hệ
        </label>
        <input 
          type="tel" 
          id="edit-emp-phone" 
          name="phone" 
          class="form-input" 
          placeholder="Ví dụ: 0912345678 hoặc +84912345678" 
          maxlength="20" 
          value="${phone}" 
        />
        <div class="form-error-msg" id="edit-emp-phone-error"></div>
        <span class="form-hint">Số điện thoại di động Việt Nam (9 đến 20 ký tự). Để trống nếu muốn xóa số điện thoại.</span>
      </div>

      <!-- Trường 4: Dropdown Phòng ban -->
      <div class="form-group form-group-spaced">
        <label class="form-label" for="editDepartmentId">
          Phòng ban trực thuộc <span class="required">*</span>
        </label>
        <div class="dept-select-wrapper">
          <select id="editDepartmentId" name="departmentId" class="select-input" required>
            ${deptOptionsHtml}
          </select>
        </div>
        <div class="form-error-msg" id="edit-emp-dept-error"></div>
        <span class="form-hint" id="edit-dept-hint">
          Phòng ban phân bổ nhân sự theo sơ đồ tổ chức thực tế.
        </span>
      </div>
    </form>
  `;

  // Thiết lập autofocus vào ô chức vụ (Accessibility)
  const positionInput = overlay.querySelector('#edit-emp-position');
  if (positionInput) {
    setTimeout(() => {
      try {
        positionInput.focus();
        positionInput.select();
      } catch {
        // Ignored
      }
    }, 100);
  }

  // Xử lý preview tiền tệ realtime cho mức lương
  const salaryInput = overlay.querySelector('#edit-emp-salary');
  const salaryPreviewBox = overlay.querySelector('#salary-preview-text');
  const salaryPreviewVal = overlay.querySelector('#salary-preview-val');

  const updateSalaryPreview = () => {
    const val = salaryInput?.value;
    if (val && !isNaN(Number(val)) && Number(val) >= 0) {
      salaryPreviewVal.textContent = new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(Number(val));
      salaryPreviewBox?.classList.add('visible');
    } else {
      salaryPreviewBox?.classList.remove('visible');
    }
  };
  updateSalaryPreview();
  salaryInput?.addEventListener('input', updateSalaryPreview);

  // Xóa cảnh báo realtime khi người dùng bắt đầu sửa
  overlay.querySelectorAll('.form-input, .select-input').forEach((input) => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      const errBox = overlay.querySelector(`#${input.id}-error`) || overlay.querySelector(`#edit-emp-${input.name}-error`);
      if (errBox) {
        errBox.classList.remove('visible');
        errBox.textContent = '';
      }
      hideBannerError(overlay);
    });
  });

  // Gắn sự kiện submit form
  const form = overlay.querySelector('#emp-edit-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormSubmit(overlay, emp.employeeId, onSuccess);
    });
  }
}

/**
 * Xử lý submit form cập nhật nhân viên
 */
async function handleFormSubmit(overlay, employeeId, onSuccess) {
  if (isSubmitting) return; // Chống gửi trùng request liên tục

  hideBannerError(overlay);
  clearFieldErrors(overlay);

  const positionInput = overlay.querySelector('#edit-emp-position');
  const salaryInput = overlay.querySelector('#edit-emp-salary');
  const phoneInput = overlay.querySelector('#edit-emp-phone');
  const deptSelect = overlay.querySelector('#editDepartmentId');

  const rawFields = {
    position: positionInput ? positionInput.value : '',
    salary: salaryInput ? salaryInput.value : '',
    phone: phoneInput ? phoneInput.value : '',
    departmentId: deptSelect ? deptSelect.value : '',
  };

  // 1. Kiểm tra validation phía client
  const validation = validateEmployeeEditForm(rawFields);
  if (!validation.isValid) {
    displayValidationErrors(overlay, validation.errors);
    return;
  }

  // 2. Chuẩn bị payload chuẩn Backend PUT /api/employees/:id
  // TUYỆT ĐỐI KHÔNG gửi CCCD, EmployeeID, UserID lên API
  const payload = {
    position: validation.parsed.position,
  };

  if (validation.parsed.salary !== undefined) {
    payload.salary = validation.parsed.salary;
  }

  if (validation.parsed.phone !== undefined) {
    payload.phone = validation.parsed.phone;
  }

  // Bắt đầu gửi API
  setSubmitLoadingState(overlay, true);

  try {
    const updatedEmployee = await employeeService.updateEmployee(employeeId, payload);

    showToast('Cập nhật thông tin nhân viên thành công.', 'success');
    closeEmployeeEditModal();

    // Kích hoạt callback tải lại danh sách
    if (typeof onSuccess === 'function') {
      try {
        onSuccess(updatedEmployee);
      } catch (cbErr) {
        console.warn('[EmployeeEditModal] Lỗi trong callback onSuccess:', cbErr);
      }
    }
  } catch (error) {
    console.error('[EmployeeEditModal] Lỗi cập nhật nhân sự:', error);
    setSubmitLoadingState(overlay, false);

    // Xử lý phân loại mã lỗi HTTP
    const status = error.status || error.statusCode;
    const responseData = error.data || {};
    const backendMessage = responseData.message || error.message || 'Cập nhật thất bại. Vui lòng kiểm tra lại.';

    if (status === 400) {
      if (responseData.errors && typeof responseData.errors === 'object') {
        displayValidationErrors(overlay, responseData.errors);
      }
      showBannerError(overlay, backendMessage);
    } else if (status === 401) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
    } else if (status === 403) {
      showBannerError(overlay, 'Bạn không có quyền cập nhật thông tin nhân viên này (Yêu cầu quyền ADMIN hoặc HR_MANAGER).');
    } else if (status === 404) {
      showBannerError(overlay, 'Nhân viên không tồn tại trong hệ thống hoặc đã bị xóa.');
    } else {
      showBannerError(overlay, backendMessage);
    }
  }
}

/**
 * Hiển thị lỗi validation trên từng trường input
 */
function displayValidationErrors(overlay, errors = {}) {
  let firstInvalidInput = null;

  Object.entries(errors).forEach(([field, msg]) => {
    let inputEl = null;
    let errEl = null;

    if (field === 'position') {
      inputEl = overlay.querySelector('#edit-emp-position');
      errEl = overlay.querySelector('#edit-emp-position-error');
    } else if (field === 'salary' || field === 'baseSalary') {
      inputEl = overlay.querySelector('#edit-emp-salary');
      errEl = overlay.querySelector('#edit-emp-salary-error');
    } else if (field === 'phone') {
      inputEl = overlay.querySelector('#edit-emp-phone');
      errEl = overlay.querySelector('#edit-emp-phone-error');
    } else if (field === 'departmentId') {
      inputEl = overlay.querySelector('#editDepartmentId');
      errEl = overlay.querySelector('#edit-emp-dept-error');
    }

    if (inputEl) {
      inputEl.classList.add('is-invalid');
      if (!firstInvalidInput) firstInvalidInput = inputEl;
    }

    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.add('visible');
    }
  });

  if (firstInvalidInput && typeof firstInvalidInput.focus === 'function') {
    firstInvalidInput.focus();
  }
}

/**
 * Xóa toàn bộ trạng thái lỗi trên form
 */
function clearFieldErrors(overlay) {
  overlay.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  overlay.querySelectorAll('.form-error-msg').forEach((el) => {
    el.classList.remove('visible');
    el.textContent = '';
  });
}

/**
 * Hiển thị banner lỗi chung
 */
function showBannerError(overlay, message) {
  const banner = overlay.querySelector('#emp-edit-banner-error');
  const text = overlay.querySelector('#emp-edit-banner-error-text');
  if (banner && text) {
    text.textContent = message;
    banner.classList.add('visible');
  }
}

/**
 * Ẩn banner lỗi chung
 */
function hideBannerError(overlay) {
  const banner = overlay.querySelector('#emp-edit-banner-error');
  if (banner) {
    banner.classList.remove('visible');
  }
}

/**
 * Cập nhật trạng thái loading khi submit form (Chống spam click)
 */
function setSubmitLoadingState(overlay, isLoading) {
  isSubmitting = isLoading;
  const submitBtn = overlay.querySelector('#btn-submit-emp-edit');
  const cancelBtn = overlay.querySelector('#btn-cancel-emp-edit');
  const closeBtn = overlay.querySelector('#btn-close-emp-edit');
  const submitText = overlay.querySelector('#btn-submit-text');

  if (submitBtn) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
      submitBtn.classList.add('is-loading');
      if (submitText) submitText.textContent = 'Đang lưu...';
    } else {
      submitBtn.classList.remove('is-loading');
      if (submitText) submitText.textContent = 'Lưu thay đổi';
    }
  }

  if (cancelBtn) cancelBtn.disabled = isLoading;
  if (closeBtn) closeBtn.disabled = isLoading;
}

export default {
  openEmployeeEditModal,
  closeEmployeeEditModal,
  validateEmployeeEditForm,
};
