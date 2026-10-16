import { employeeService } from '../services/employeeService.js';
import { departmentService } from '../services/departmentService.js';
import { showToast } from './Toast.js';
import { qs, qsa, sanitizeHTML } from '../utils/dom.js';

/**
 * ==============================================================================
 * COMPONENT: EmployeeFormModal (Modal Thêm Mới Nhân Viên Chuẩn Enterprise HRM)
 * ==============================================================================
 * 1. Form thiết kế chuyên nghiệp, chia 3 nhóm thông tin (Cơ bản, Công việc, Bổ sung).
 * 2. Validate chặt chẽ phía Frontend trước khi gọi Backend API.
 * 3. Bảo vệ dữ liệu CCCD: Chỉ dùng để nhập liệu, gửi trực tiếp qua API, không lưu
 *    vào storage, không log ra console, tự động dọn dẹp bộ nhớ khi đóng modal.
 * 4. Chống gửi trùng request (Double Submission Prevention) với trạng thái loading.
 * 5. Bắt và phân loại lỗi HTTP (409 Conflict trùng mã/CCCD/email, 400, 401, 403, 500, lỗi mạng).
 * 6. Giữ lại dữ liệu người dùng đã nhập khi gặp lỗi để dễ dàng chỉnh sửa.
 * 7. Accessibility: Quản lý focus, phím Escape, đóng khi click ngoài backdrop an toàn.
 */

let activeModalOverlay = null;
let isSubmitting = false;
let triggerElement = null;
let escKeyHandler = null;

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_REGEX = /^[0-9+()\-.\s]{9,20}$/;
const CODE_REGEX = /^[A-Za-z0-9_-]{2,20}$/;

/**
 * Kiểm tra định dạng ngày YYYY-MM-DD hợp lệ
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (!dateStr || !DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && dateStr === d.toISOString().split('T')[0];
}

/**
 * Hàm kiểm tra tính hợp lệ dữ liệu form thêm nhân viên phía Frontend
 * @param {object} fields
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateEmployeeForm(fields = {}) {
  const errors = {};
  let isValid = true;

  // 1. Họ và tên (Bắt buộc, 2 - 100 ký tự)
  const fullName = String(fields.fullName || '').trim();
  if (!fullName) {
    errors.fullName = 'Vui lòng nhập họ và tên nhân viên.';
    isValid = false;
  } else if (fullName.length < 2 || fullName.length > 100) {
    errors.fullName = 'Họ và tên phải có độ dài từ 2 đến 100 ký tự.';
    isValid = false;
  }

  // 2. Số CCCD / CMND (Bắt buộc, 9 hoặc 12 số)
  const cccd = String(fields.cccd || '').trim().replace(/[\s\-_.]/g, '');
  if (!cccd) {
    errors.cccd = 'Vui lòng nhập số CCCD/CMND.';
    isValid = false;
  } else if (!/^\d+$/.test(cccd)) {
    errors.cccd = 'Số CCCD/CMND chỉ được chứa các chữ số (0-9).';
    isValid = false;
  } else if (cccd.length !== 12 && cccd.length !== 9) {
    errors.cccd = 'Số CCCD gắn chip phải có đúng 12 chữ số (hoặc 9 chữ số đối với CMND cũ).';
    isValid = false;
  }

  // 3. Phòng ban trực thuộc (Bắt buộc)
  const deptId = fields.departmentId;
  if (!deptId || deptId === '' || deptId === 'all') {
    errors.departmentId = 'Vui lòng chọn phòng ban trực thuộc cho nhân viên.';
    isValid = false;
  }

  // 4. Mã nhân viên (Tùy chọn, nếu nhập phải đúng định dạng 2-20 ký tự)
  const empCode = String(fields.employeeCode || '').trim();
  if (empCode && !CODE_REGEX.test(empCode)) {
    errors.employeeCode = 'Mã nhân viên phải từ 2 đến 20 ký tự, chỉ chứa chữ cái, số, gạch nối (-) hoặc gạch dưới (_).';
    isValid = false;
  }

  // 5. Số điện thoại (Tùy chọn)
  const phone = String(fields.phone || '').trim();
  if (phone && !PHONE_REGEX.test(phone)) {
    errors.phone = 'Số điện thoại không đúng định dạng (từ 9 đến 20 chữ số).';
    isValid = false;
  }

  // 6. Email (Tùy chọn)
  const email = String(fields.email || '').trim();
  if (email && (!EMAIL_REGEX.test(email) || email.length > 100)) {
    errors.email = 'Địa chỉ email không đúng định dạng hợp lệ.';
    isValid = false;
  }

  // 7. Ngày vào làm (Tùy chọn, nếu nhập phải đúng định dạng)
  const hireDate = String(fields.hireDate || '').trim();
  if (hireDate && !isValidDate(hireDate)) {
    errors.hireDate = 'Ngày vào làm không đúng định dạng (YYYY-MM-DD).';
    isValid = false;
  }

  // 8. Ngày sinh (Tùy chọn, nhân sự >= 15 tuổi)
  const dob = String(fields.dateOfBirth || '').trim();
  if (dob) {
    if (!isValidDate(dob)) {
      errors.dateOfBirth = 'Ngày sinh không đúng định dạng (YYYY-MM-DD).';
      isValid = false;
    } else {
      const birthYear = new Date(dob).getFullYear();
      const currentYear = new Date().getFullYear();
      if (birthYear > currentYear || currentYear - birthYear < 15) {
        errors.dateOfBirth = 'Ngày sinh không hợp lý (nhân sự phải từ 15 tuổi trở lên).';
        isValid = false;
      }
    }
  }

  // 9. Lương cơ bản (Tùy chọn, phải là số không âm)
  const baseSalary = fields.baseSalary;
  if (baseSalary !== undefined && baseSalary !== null && String(baseSalary).trim() !== '') {
    const salaryNum = Number(baseSalary);
    if (isNaN(salaryNum) || salaryNum < 0) {
      errors.baseSalary = 'Mức lương cơ bản phải là số không âm.';
      isValid = false;
    }
  }

  // 10. Địa chỉ (Tùy chọn, tối đa 255 ký tự)
  const address = String(fields.address || '').trim();
  if (address && address.length > 255) {
    errors.address = 'Địa chỉ không được vượt quá 255 ký tự.';
    isValid = false;
  }

  return { isValid, errors };
}

/**
 * Đóng modal thêm nhân viên và dọn dẹp form khỏi DOM
 * @param {boolean} [force=false]
 */
export function closeEmployeeFormModal(force = false) {
  if (isSubmitting && !force) return; // Không đóng khi đang gửi API
  isSubmitting = false;

  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler);
    escKeyHandler = null;
  }

  // Khôi phục thanh cuộn nền trang
  document.body.style.overflow = '';

  if (activeModalOverlay) {
    activeModalOverlay.classList.remove('active');
    setTimeout(() => {
      if (activeModalOverlay && activeModalOverlay.parentNode) {
        // Xóa form và giá trị CCCD khỏi DOM hoàn toàn
        const cccdInput = activeModalOverlay.querySelector('#emp-form-cccd');
        if (cccdInput) cccdInput.value = '';
        activeModalOverlay.parentNode.removeChild(activeModalOverlay);
      }
      activeModalOverlay = null;

      // Trả focus về phần tử đã mở modal (Accessibility)
      if (triggerElement && typeof triggerElement.focus === 'function') {
        try {
          triggerElement.focus();
        } catch {
          // Bỏ qua
        }
        triggerElement = null;
      }
    }, 200);
  }
}

/**
 * Mở modal thêm nhân viên mới
 * @param {object} options
 * @param {Function} [options.onSuccess] - Callback khi tạo thành công
 * @param {HTMLElement} [options.triggerEl] - Nút đã kích hoạt mở modal
 */
export async function openEmployeeFormModal({ onSuccess, triggerEl } = {}) {
  // Chặn mở nhiều modal trùng lặp
  if (activeModalOverlay) {
    closeEmployeeFormModal();
  }

  triggerElement = triggerEl || document.activeElement;
  isSubmitting = false;

  const todayStr = new Date().toISOString().split('T')[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'employee-form-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-container emp-form-modal-container" role="dialog" aria-modal="true" aria-labelledby="emp-form-modal-title">
      <div class="modal-header">
        <div class="modal-title-group">
          <h2 class="modal-title" id="emp-form-modal-title">Thêm nhân viên mới</h2>
          <p class="modal-subtitle">Nhập thông tin để tạo hồ sơ nhân viên trong hệ thống.</p>
        </div>
        <button type="button" class="modal-close-btn" id="btn-close-emp-form" aria-label="Đóng cửa sổ">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="modal-body emp-form-modal-body">
        <!-- Banner lỗi chung từ Backend -->
        <div id="emp-form-banner-error" class="form-banner-error" role="alert">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span id="emp-form-banner-error-text">Đã có lỗi xảy ra.</span>
        </div>

        <form id="emp-create-form" novalidate autocomplete="off">
          <!-- NHÓM 1: THÔNG TIN CƠ BẢN -->
          <div class="emp-form-section">
            <div class="emp-form-section-header">
              <span class="emp-form-section-badge">1</span>
              <span class="emp-form-section-title">Thông tin cơ bản</span>
            </div>

            <div class="emp-form-grid-2col">
              <div class="form-group">
                <label for="emp-form-code" class="form-label">
                  Mã nhân viên
                  <span class="form-hint-inline">(Tự sinh nếu để trống)</span>
                </label>
                <input 
                  type="text" 
                  id="emp-form-code" 
                  class="form-input" 
                  placeholder="Ví dụ: NV006" 
                  maxlength="20"
                />
                <div class="form-error-msg" id="err-emp-code"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-fullname" class="form-label">
                  Họ và tên <span class="required">*</span>
                </label>
                <input 
                  type="text" 
                  id="emp-form-fullname" 
                  class="form-input" 
                  placeholder="Ví dụ: Nguyễn Văn A" 
                  maxlength="100" 
                  required
                />
                <div class="form-error-msg" id="err-emp-fullname"></div>
              </div>
            </div>

            <div class="emp-form-grid-2col">
              <div class="form-group">
                <label for="emp-form-cccd" class="form-label">
                  Số CCCD / CMND <span class="required">*</span>
                  <span class="form-hint-inline">(Mã hóa AES-256 bảo mật)</span>
                </label>
                <input 
                  type="text" 
                  id="emp-form-cccd" 
                  class="form-input" 
                  placeholder="12 chữ số CCCD (hoặc 9 số CMND)" 
                  maxlength="12"
                  autocomplete="off"
                  required
                />
                <div class="form-error-msg" id="err-emp-cccd"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-phone" class="form-label">Số điện thoại</label>
                <input 
                  type="tel" 
                  id="emp-form-phone" 
                  class="form-input" 
                  placeholder="Ví dụ: 0912345678" 
                  maxlength="20"
                />
                <div class="form-error-msg" id="err-emp-phone"></div>
              </div>
            </div>

            <div class="emp-form-grid-2col">
              <div class="form-group">
                <label for="emp-form-dob" class="form-label">Ngày sinh</label>
                <input 
                  type="date" 
                  id="emp-form-dob" 
                  class="form-input"
                />
                <div class="form-error-msg" id="err-emp-dob"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-gender" class="form-label">Giới tính</label>
                <select id="emp-form-gender" class="select-input form-input">
                  <option value="Male">Nam</option>
                  <option value="Female">Nữ</option>
                  <option value="Other">Khác</option>
                </select>
                <div class="form-error-msg" id="err-emp-gender"></div>
              </div>
            </div>
          </div>

          <!-- NHÓM 2: THÔNG TIN CÔNG VIỆC -->
          <div class="emp-form-section">
            <div class="emp-form-section-header">
              <span class="emp-form-section-badge">2</span>
              <span class="emp-form-section-title">Thông tin công việc</span>
            </div>

            <div class="emp-form-grid-2col">
              <div class="form-group">
                <label for="emp-form-dept" class="form-label">
                  Phòng ban trực thuộc <span class="required">*</span>
                </label>
                <select id="emp-form-dept" class="select-input form-input" required>
                  <option value="">-- Đang nạp danh sách phòng ban --</option>
                </select>
                <div class="form-error-msg" id="err-emp-dept"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-position" class="form-label">Chức danh / Vị trí</label>
                <input 
                  type="text" 
                  id="emp-form-position" 
                  class="form-input" 
                  placeholder="Ví dụ: Kỹ sư Phần mềm" 
                  value="Nhân viên"
                  maxlength="50"
                />
                <div class="form-error-msg" id="err-emp-position"></div>
              </div>
            </div>

            <div class="emp-form-grid-3col">
              <div class="form-group">
                <label for="emp-form-hiredate" class="form-label">Ngày vào làm</label>
                <input 
                  type="date" 
                  id="emp-form-hiredate" 
                  class="form-input" 
                  value="${todayStr}"
                />
                <div class="form-error-msg" id="err-emp-hiredate"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-salary" class="form-label">Lương cơ bản (VND)</label>
                <input 
                  type="number" 
                  id="emp-form-salary" 
                  class="form-input" 
                  placeholder="0" 
                  min="0" 
                  step="500000"
                />
                <div class="form-error-msg" id="err-emp-salary"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-status" class="form-label">Trạng thái nhân sự</label>
                <select id="emp-form-status" class="select-input form-input">
                  <option value="Active">Đang làm việc (Active)</option>
                  <option value="OnLeave">Nghỉ phép (OnLeave)</option>
                  <option value="Resigned">Đã thôi việc (Resigned)</option>
                </select>
                <div class="form-error-msg" id="err-emp-status"></div>
              </div>
            </div>
          </div>

          <!-- NHÓM 3: THÔNG TIN BỔ SUNG -->
          <div class="emp-form-section">
            <div class="emp-form-section-header">
              <span class="emp-form-section-badge">3</span>
              <span class="emp-form-section-title">Thông tin bổ sung</span>
            </div>

            <div class="emp-form-grid-2col">
              <div class="form-group">
                <label for="emp-form-email" class="form-label">Email công việc</label>
                <input 
                  type="email" 
                  id="emp-form-email" 
                  class="form-input" 
                  placeholder="Ví dụ: a.nguyen@hrm.local" 
                  maxlength="100"
                />
                <div class="form-error-msg" id="err-emp-email"></div>
              </div>

              <div class="form-group">
                <label for="emp-form-address" class="form-label">Địa chỉ liên hệ</label>
                <input 
                  type="text" 
                  id="emp-form-address" 
                  class="form-input" 
                  placeholder="Ví dụ: Số 123 Đường Lương Ngọc Quyến, TP. Thái Nguyên" 
                  maxlength="255"
                />
                <div class="form-error-msg" id="err-emp-address"></div>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-cancel-emp-form">Hủy</button>
        <button type="button" class="btn btn-primary" id="btn-submit-emp-form">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span id="btn-submit-emp-text">Thêm nhân viên</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activeModalOverlay = overlay;

  // Khóa cuộn trang nền
  document.body.style.overflow = 'hidden';

  // Kích hoạt transition
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    // Autofocus trường Họ tên
    const fullnameInput = overlay.querySelector('#emp-form-fullname');
    if (fullnameInput) fullnameInput.focus();
  });

  // Tải danh sách phòng ban thực tế vào dropdown
  loadDepartmentSelectOptions(overlay);

  // Gắn sự kiện đóng modal
  const handleClose = () => closeEmployeeFormModal();
  overlay.querySelector('#btn-close-emp-form')?.addEventListener('click', handleClose);
  overlay.querySelector('#btn-cancel-emp-form')?.addEventListener('click', handleClose);

  // Đóng khi click ngoài backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  });

  // Đóng khi ấn Escape
  escKeyHandler = (e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      handleClose();
    }
  };
  document.addEventListener('keydown', escKeyHandler);

  // Tự động xóa lỗi realtime khi người dùng nhập dữ liệu
  setupRealtimeErrorClearing(overlay);

  // Gắn sự kiện Submit form
  const submitBtn = overlay.querySelector('#btn-submit-emp-form');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      handleSubmitEmployeeForm(overlay, onSuccess);
    });
  }

  // Hỗ trợ submit khi ấn Enter trong các input text
  const formEl = overlay.querySelector('#emp-create-form');
  if (formEl) {
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmitEmployeeForm(overlay, onSuccess);
    });
  }
}

/**
 * Tải danh mục phòng ban từ Backend API và điền vào dropdown của Form
 * @param {HTMLElement} overlay
 */
async function loadDepartmentSelectOptions(overlay) {
  const deptSelect = overlay.querySelector('#emp-form-dept');
  if (!deptSelect) return;

  try {
    const res = await departmentService.getDepartments({ limit: 100 });
    const items = res.items || [];

    if (items.length === 0) {
      deptSelect.innerHTML = '<option value="">-- Chưa có phòng ban nào trong hệ thống --</option>';
      return;
    }

    let html = '<option value="">-- Chọn phòng ban trực thuộc --</option>';
    items.forEach((dept) => {
      const id = dept.id || dept.departmentId;
      const name = dept.departmentName;
      const code = dept.departmentCode ? ` (${dept.departmentCode})` : '';
      html += `<option value="${id}">${sanitizeHTML(name + code)}</option>`;
    });

    deptSelect.innerHTML = html;
  } catch (err) {
    console.warn('[EmployeeFormModal] Không thể nạp phòng ban:', err.message);
    deptSelect.innerHTML = '<option value="">-- Lỗi tải danh sách phòng ban --</option>';
  }
}

/**
 * Thiết lập tự động xóa thông báo lỗi khi người dùng gõ vào trường bị lỗi
 * @param {HTMLElement} overlay
 */
function setupRealtimeErrorClearing(overlay) {
  const fieldMapping = [
    { inputId: '#emp-form-fullname', errId: '#err-emp-fullname' },
    { inputId: '#emp-form-cccd', errId: '#err-emp-cccd' },
    { inputId: '#emp-form-dept', errId: '#err-emp-dept' },
    { inputId: '#emp-form-code', errId: '#err-emp-code' },
    { inputId: '#emp-form-phone', errId: '#err-emp-phone' },
    { inputId: '#emp-form-email', errId: '#err-emp-email' },
    { inputId: '#emp-form-dob', errId: '#err-emp-dob' },
    { inputId: '#emp-form-hiredate', errId: '#err-emp-hiredate' },
    { inputId: '#emp-form-salary', errId: '#err-emp-salary' },
    { inputId: '#emp-form-address', errId: '#err-emp-address' },
  ];

  fieldMapping.forEach(({ inputId, errId }) => {
    const inputEl = overlay.querySelector(inputId);
    const errEl = overlay.querySelector(errId);
    if (inputEl && errEl) {
      const clearError = () => {
        inputEl.classList.remove('is-invalid');
        errEl.classList.remove('visible');
        errEl.textContent = '';
      };
      inputEl.addEventListener('input', clearError);
      inputEl.addEventListener('change', clearError);
    }
  });
}

/**
 * Xử lý khi nhấn nút Thêm nhân viên (Submit form)
 * @param {HTMLElement} overlay
 * @param {Function} [onSuccess]
 */
async function handleSubmitEmployeeForm(overlay, onSuccess) {
  if (isSubmitting) return;

  const bannerError = overlay.querySelector('#emp-form-banner-error');
  const bannerErrorText = overlay.querySelector('#emp-form-banner-error-text');
  if (bannerError) bannerError.classList.remove('visible');

  // Lấy dữ liệu từ các trường form
  const rawData = {
    employeeCode: overlay.querySelector('#emp-form-code')?.value.trim() || undefined,
    fullName: overlay.querySelector('#emp-form-fullname')?.value.trim() || '',
    cccd: overlay.querySelector('#emp-form-cccd')?.value.trim() || '',
    departmentId: overlay.querySelector('#emp-form-dept')?.value || '',
    phone: overlay.querySelector('#emp-form-phone')?.value.trim() || undefined,
    email: overlay.querySelector('#emp-form-email')?.value.trim() || undefined,
    dateOfBirth: overlay.querySelector('#emp-form-dob')?.value || undefined,
    gender: overlay.querySelector('#emp-form-gender')?.value || 'Male',
    position: overlay.querySelector('#emp-form-position')?.value.trim() || 'Nhân viên',
    hireDate: overlay.querySelector('#emp-form-hiredate')?.value || undefined,
    baseSalary: overlay.querySelector('#emp-form-salary')?.value || undefined,
    employmentStatus: overlay.querySelector('#emp-form-status')?.value || 'Active',
    address: overlay.querySelector('#emp-form-address')?.value.trim() || undefined,
  };

  // 1. Kiểm tra validation phía client
  const validation = validateEmployeeForm(rawData);
  if (!validation.isValid) {
    displayValidationErrors(overlay, validation.errors);
    return;
  }

  // 2. Chuẩn bị payload gửi Backend
  const payload = {
    fullName: rawData.fullName,
    cccd: rawData.cccd.replace(/[\s\-_.]/g, ''),
    departmentId: Number(rawData.departmentId),
    ...(rawData.employeeCode && { employeeCode: rawData.employeeCode.toUpperCase() }),
    ...(rawData.phone && { phone: rawData.phone }),
    ...(rawData.email && { email: rawData.email.toLowerCase() }),
    ...(rawData.dateOfBirth && { dateOfBirth: rawData.dateOfBirth }),
    ...(rawData.gender && { gender: rawData.gender }),
    ...(rawData.position && { position: rawData.position }),
    ...(rawData.hireDate && { hireDate: rawData.hireDate }),
    ...(rawData.baseSalary !== undefined && rawData.baseSalary !== '' && { baseSalary: Number(rawData.baseSalary) }),
    ...(rawData.employmentStatus && { employmentStatus: rawData.employmentStatus }),
    ...(rawData.address && { address: rawData.address }),
  };

  // 3. Chuyển sang trạng thái Đang gửi (Loading state & disable nút)
  setSubmittingState(overlay, true);

  try {
    const createdEmployee = await employeeService.createEmployee(payload);

    setSubmittingState(overlay, false);
    showToast(`Thêm nhân viên "${payload.fullName}" thành công!`, 'success');

    // Đóng modal và reset form
    closeEmployeeFormModal(true);

    // Trigger callback làm mới danh sách
    if (typeof onSuccess === 'function') {
      onSuccess(createdEmployee);
    }
  } catch (error) {
    setSubmittingState(overlay, false);

    const errorMsg = error.message || 'Không thể tạo nhân viên mới.';
    const statusCode = error.status || error.statusCode;
    const errorCode = error.data?.errorCode || '';

    // Phân loại lỗi Backend để highlight đúng trường
    if (statusCode === 409 || errorCode.includes('DUPLICATE')) {
      if (errorCode === 'DUPLICATE_EMPLOYEE_CODE' || errorMsg.includes('Mã nhân viên')) {
        highlightFieldError(overlay, '#emp-form-code', '#err-emp-code', errorMsg);
        return;
      }
      if (errorCode === 'DUPLICATE_CCCD' || errorMsg.includes('CCCD') || errorMsg.includes('CMND')) {
        highlightFieldError(overlay, '#emp-form-cccd', '#err-emp-cccd', errorMsg);
        return;
      }
      if (errorCode === 'DUPLICATE_EMAIL' || errorMsg.includes('email')) {
        highlightFieldError(overlay, '#emp-form-email', '#err-emp-email', errorMsg);
        return;
      }
    }

    if (statusCode === 400 && error.data?.message) {
      if (errorMsg.includes('Họ và tên')) {
        highlightFieldError(overlay, '#emp-form-fullname', '#err-emp-fullname', errorMsg);
        return;
      }
      if (errorMsg.includes('CCCD') || errorMsg.includes('CMND')) {
        highlightFieldError(overlay, '#emp-form-cccd', '#err-emp-cccd', errorMsg);
        return;
      }
      if (errorMsg.includes('phòng ban') || errorMsg.includes('departmentId')) {
        highlightFieldError(overlay, '#emp-form-dept', '#err-emp-dept', errorMsg);
        return;
      }
    }

    // Hiển thị trên banner lỗi chung nếu là lỗi khác
    if (bannerError && bannerErrorText) {
      bannerErrorText.textContent = errorMsg;
      bannerError.classList.add('visible');
    }
    showToast(errorMsg, 'error');
  }
}

/**
 * Hiển thị các lỗi validation lên giao diện và focus vào trường đầu tiên bị lỗi
 * @param {HTMLElement} overlay
 * @param {Record<string, string>} errors
 */
function displayValidationErrors(overlay, errors) {
  const mapping = {
    fullName: { input: '#emp-form-fullname', err: '#err-emp-fullname' },
    cccd: { input: '#emp-form-cccd', err: '#err-emp-cccd' },
    departmentId: { input: '#emp-form-dept', err: '#err-emp-dept' },
    employeeCode: { input: '#emp-form-code', err: '#err-emp-code' },
    phone: { input: '#emp-form-phone', err: '#err-emp-phone' },
    email: { input: '#emp-form-email', err: '#err-emp-email' },
    dateOfBirth: { input: '#emp-form-dob', err: '#err-emp-dob' },
    hireDate: { input: '#emp-form-hiredate', err: '#err-emp-hiredate' },
    baseSalary: { input: '#emp-form-salary', err: '#err-emp-salary' },
    address: { input: '#emp-form-address', err: '#err-emp-address' },
  };

  let firstInvalidEl = null;

  Object.entries(errors).forEach(([fieldKey, errorText]) => {
    const config = mapping[fieldKey];
    if (config) {
      const inputEl = overlay.querySelector(config.input);
      const errEl = overlay.querySelector(config.err);
      if (inputEl && errEl) {
        inputEl.classList.add('is-invalid');
        errEl.textContent = errorText;
        errEl.classList.add('visible');

        if (!firstInvalidEl) {
          firstInvalidEl = inputEl;
        }
      }
    }
  });

  if (firstInvalidEl && typeof firstInvalidEl.focus === 'function') {
    firstInvalidEl.focus();
  }
}

/**
 * Đánh dấu lỗi cho một trường cụ thể
 */
function highlightFieldError(overlay, inputSelector, errSelector, message) {
  const inputEl = overlay.querySelector(inputSelector);
  const errEl = overlay.querySelector(errSelector);
  if (inputEl) {
    inputEl.classList.add('is-invalid');
    inputEl.focus();
  }
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('visible');
  }
}

/**
 * Đặt trạng thái đang gửi cho form
 * @param {HTMLElement} overlay
 * @param {boolean} submitting
 */
function setSubmittingState(overlay, submitting) {
  isSubmitting = submitting;
  const submitBtn = overlay.querySelector('#btn-submit-emp-form');
  const cancelBtn = overlay.querySelector('#btn-cancel-emp-form');
  const closeBtn = overlay.querySelector('#btn-close-emp-form');
  const submitText = overlay.querySelector('#btn-submit-emp-text');

  if (submitBtn) {
    submitBtn.disabled = submitting;
    if (submitting) {
      submitBtn.classList.add('is-loading');
      if (submitText) submitText.textContent = 'Đang lưu nhân viên...';
    } else {
      submitBtn.classList.remove('is-loading');
      if (submitText) submitText.textContent = 'Thêm nhân viên';
    }
  }

  if (cancelBtn) cancelBtn.disabled = submitting;
  if (closeBtn) closeBtn.disabled = submitting;
}

export default {
  openEmployeeFormModal,
  closeEmployeeFormModal,
  validateEmployeeForm,
};
