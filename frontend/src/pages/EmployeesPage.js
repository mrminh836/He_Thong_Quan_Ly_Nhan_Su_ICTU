import { renderPageHeader } from '../components/PageHeader.js';
import { employeeService } from '../services/employeeService.js';
import { departmentService } from '../services/departmentService.js';
import { getCurrentUserRole } from '../services/authService.js';
import { ROLES } from '../utils/rbac.js';
import { showToast } from '../components/Toast.js';
import { qs, qsa, sanitizeHTML } from '../utils/dom.js';
import { openEmployeeDetailModal } from '../components/EmployeeDetailModal.js';
import { openEmployeeFormModal } from '../components/EmployeeFormModal.js';
import { openEmployeeEditModal } from '../components/EmployeeEditModal.js';

// State nội bộ của trang Quản lý nhân sự
let pageState = {
  employees: [],
  departments: [],
  stats: {
    totalEmployees: 0,
    activeEmployees: 0,
    deptsWithEmployees: 0,
  },
  isLoading: false,
  isError: false,
  errorMessage: '',
  searchQuery: '',
  departmentId: 'all',
  currentPage: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
  isDeptLoading: false,
};

let debounceTimer = null;

/**
 * Render cấu trúc khung HTML của trang Quản lý nhân sự
 * Tuân thủ chuẩn Enterprise HRM SaaS: sạch sẽ, hiện đại, tối ưu responsive
 */
export function renderEmployeesPage() {
  const userRole = getCurrentUserRole();
  const canManage = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;

  const headerHtml = renderPageHeader({
    title: 'Quản lý nhân sự',
    subtitle: 'Quản lý hồ sơ và thông tin nhân viên trong hệ thống',
    breadcrumbs: [
      { label: 'Trang chủ', path: '/dashboard' },
      { label: 'Quản lý nhân sự' },
    ],
    actions: `
      <button class="btn btn-secondary" id="btn-refresh-emp" title="Tải lại dữ liệu mới nhất">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Làm mới</span>
      </button>
      ${
        canManage
          ? `
        <button class="btn btn-primary" id="btn-add-emp" title="Thêm nhân sự mới vào hệ thống">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>Thêm nhân viên</span>
        </button>
      `
          : ''
      }
    `,
  });

  return `
    ${headerHtml}

    <!-- 1. THANH CÔNG CỤ TÌM KIẾM VÀ BỘ LỌC (SEARCH & FILTER TOOLBAR) -->
    <div class="emp-toolbar">
      <!-- Ô tìm kiếm nhanh với Debounce và nút Clear -->
      <div class="emp-search-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input 
          type="text" 
          id="emp-search-input" 
          class="emp-search-input"
          placeholder="Tìm theo mã nhân viên hoặc họ tên..." 
          autocomplete="off"
        />
        <button type="button" id="emp-search-clear" class="emp-search-clear" title="Xóa nội dung tìm kiếm">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Bộ lọc phòng ban và các nút điều khiển -->
      <div class="emp-filter-controls">
        <label for="emp-dept-filter" class="emp-filter-label">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Phòng ban:
        </label>
        <select class="select-input emp-filter-select" id="emp-dept-filter">
          <option value="all">Tất cả phòng ban</option>
          <!-- Danh sách phòng ban sẽ được tải tự động từ GET /api/departments -->
        </select>

        <button type="button" class="btn-reset-filters" id="btn-reset-filters" title="Đặt lại từ khóa tìm kiếm và phòng ban về mặc định">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>Đặt lại bộ lọc</span>
        </button>

        <span class="emp-results-count" id="emp-results-count">Đang tải...</span>
      </div>
    </div>

    <!-- 3. THÔNG BÁO LỖI NẾU GỌI API THẤT BẠI -->
    <div id="emp-error-banner" class="emp-error-banner" style="display: none;">
      <svg viewBox="0 0 24 24" width="36" height="36" stroke="#ef4444" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div class="emp-error-title">Không thể tải danh sách nhân sự</div>
      <div class="emp-error-desc" id="emp-error-desc-text">Đã có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại.</div>
      <button class="btn btn-secondary btn-sm" id="btn-retry-emp">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Thử lại ngay</span>
      </button>
    </div>

    <!-- 4. BẢNG DANH SÁCH NHÂN VIÊN -->
    <div class="table-container emp-table-wrapper" id="emp-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 120px;">Mã nhân viên</th>
            <th style="min-width: 220px;">Họ và tên</th>
            <th style="min-width: 180px;">Phòng ban</th>
            <th style="width: 140px;">Số điện thoại</th>
            <th style="width: 130px;">Ngày vào làm</th>
            <th style="width: 140px; text-align: center;">Trạng thái</th>
            <th style="width: 110px; text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody id="emp-table-body">
          <!-- Dữ liệu render động bằng JS -->
        </tbody>
      </table>
    </div>

    <!-- 5. PHÂN TRANG (PAGINATION) -->
    <div class="emp-pagination-wrapper" id="emp-pagination" style="display: none;">
      <div class="emp-pagination-left">
        <div class="emp-limit-selector">
          <span>Hiển thị</span>
          <select class="select-input emp-limit-select" id="emp-limit-select">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          <span>bản ghi / trang</span>
        </div>
        <div id="emp-pagination-info">
          Hiển thị 0 - 0 trên tổng số 0 nhân viên
        </div>
      </div>

      <div class="emp-pagination-right" id="emp-pagination-controls">
        <!-- Nút Trước, các số trang, nút Sau -->
      </div>
    </div>
  `;
}

/**
 * Khởi tạo các sự kiện tương tác và nạp dữ liệu ban đầu
 */
export function initEmployeesPageEvents() {
  // 1. Nút Làm mới
  const refreshBtn = qs('#btn-refresh-emp');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.querySelector('svg')?.classList.add('spinning');
      loadEmployeeData().finally(() => {
        refreshBtn.querySelector('svg')?.classList.remove('spinning');
      });
    });
  }

  // 2. Nút Thêm nhân viên
  const addBtn = qs('#btn-add-emp');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openEmployeeFormModal({
        triggerEl: addBtn,
        onSuccess: () => {
          loadEmployeeData();
        },
      });
    });
  }

  // 3. Ô tìm kiếm với Realtime Debounce (350ms)
  const searchInput = qs('#emp-search-input');
  const searchClear = qs('#emp-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (searchClear) {
        searchClear.classList.toggle('visible', Boolean(val));
      }

      // Xóa timer debounce cũ nếu người dùng vẫn đang gõ liên tục
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        pageState.searchQuery = val;
        pageState.currentPage = 1; // Reset về trang 1 khi đổi từ khóa
        loadEmployeeData();
      }, 350);
    });
  }

  // 4. Nút Xóa từ khóa tìm kiếm
  if (searchClear && searchInput) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      pageState.searchQuery = '';
      searchClear.classList.remove('visible');
      searchInput.focus();
      pageState.currentPage = 1;
      loadEmployeeData();
    });
  }

  // 5. Bộ lọc phòng ban
  const deptFilter = qs('#emp-dept-filter');
  if (deptFilter) {
    deptFilter.addEventListener('change', (e) => {
      pageState.departmentId = e.target.value;
      pageState.currentPage = 1; // Reset về trang 1 khi đổi bộ lọc
      loadEmployeeData();
    });
  }

  // 6. Nút Đặt lại bộ lọc (Reset)
  const resetBtn = qs('#btn-reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (searchClear) searchClear.classList.remove('visible');
      if (deptFilter) deptFilter.value = 'all';

      pageState.searchQuery = '';
      pageState.departmentId = 'all';
      pageState.currentPage = 1;
      loadEmployeeData();
    });
  }

  // 7. Chọn số lượng bản ghi mỗi trang (Limit select: 10, 20, 50)
  const limitSelect = qs('#emp-limit-select');
  if (limitSelect) {
    limitSelect.addEventListener('change', (e) => {
      pageState.pageSize = Number(e.target.value) || 10;
      pageState.currentPage = 1;
      loadEmployeeData();
    });
  }

  // 8. Nút Thử lại khi API gặp lỗi
  const retryBtn = qs('#btn-retry-emp');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadEmployeeData();
    });
  }

  // 9. Lắng nghe các nút Thao tác trên bảng (Event Delegation)
  const tableWrapper = qs('#emp-table-wrapper');
  if (tableWrapper) {
    tableWrapper.addEventListener('click', handleTableActionClick);
  }

  // 10. Lắng nghe chuyển trang trên Pagination
  const paginationControls = qs('#emp-pagination-controls');
  if (paginationControls) {
    paginationControls.addEventListener('click', handlePaginationClick);
  }

  // 11. Tải danh mục phòng ban động & nạp dữ liệu nhân sự thực tế
  loadDepartmentsDropdown();
  loadEmployeeData();
}

/**
 * Tải danh sách phòng ban từ Backend API và điền vào dropdown lọc
 */
async function loadDepartmentsDropdown() {
  const deptFilter = qs('#emp-dept-filter');
  if (!deptFilter) return;

  pageState.isDeptLoading = true;

  try {
    const res = await departmentService.getDepartments({ limit: 100 });
    const items = res.items || [];
    pageState.departments = items;

    // Tạo các option phòng ban động
    let optionsHtml = '<option value="all">Tất cả phòng ban</option>';
    items.forEach((dept) => {
      const id = dept.id || dept.departmentId;
      const name = dept.departmentName;
      optionsHtml += `<option value="${id}">${sanitizeHTML(name)}</option>`;
    });

    deptFilter.innerHTML = optionsHtml;
    // Khôi phục giá trị đã chọn nếu có
    if (pageState.departmentId && pageState.departmentId !== 'all') {
      deptFilter.value = pageState.departmentId;
    }
  } catch (err) {
    console.warn('[EmployeesPage] Không thể tải danh sách phòng ban:', err.message);
    deptFilter.innerHTML = `
      <option value="all">Tất cả phòng ban</option>
      <option value="" disabled>Lỗi tải danh mục phòng ban</option>
    `;
    showToast('Không thể tải danh sách phòng ban. Vui lòng thử lại.', 'warning');
  } finally {
    pageState.isDeptLoading = false;
  }
}

/**
 * Gọi Backend API lấy danh sách nhân viên thực tế có phân trang và lọc
 */
async function loadEmployeeData() {
  pageState.isLoading = true;
  pageState.isError = false;

  renderLoadingState();
  hideErrorBanner();

  try {
    const response = await employeeService.getEmployees({
      page: pageState.currentPage,
      limit: pageState.pageSize,
      departmentId: pageState.departmentId,
      search: pageState.searchQuery,
    });

    pageState.employees = response.items || [];
    pageState.total = response.pagination?.total || 0;
    pageState.totalPages = response.pagination?.totalPages || 0;
    pageState.currentPage = response.pagination?.page || 1;

    renderSuccessState();
  } catch (error) {
    console.error('[EmployeesPage] Lỗi tải dữ liệu nhân viên:', error);
    pageState.isError = true;
    pageState.errorMessage = error.message || 'Không thể kết nối máy chủ.';
    renderErrorState();
  } finally {
    pageState.isLoading = false;
  }
}

/**
 * Hiển thị skeleton loading khi đang tải dữ liệu
 */
function renderLoadingState() {
  const tbody = qs('#emp-table-body');
  const countEl = qs('#emp-results-count');
  if (countEl) countEl.textContent = 'Đang tải dữ liệu...';

  if (!tbody) return;

  // Render 5 hàng skeleton placeholder
  tbody.innerHTML = Array.from({ length: 5 })
    .map(
      () => `
      <tr class="skeleton-row">
        <td><div class="skeleton-cell w-short"></div></td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%;" class="skeleton-cell"></div>
            <div>
              <div class="skeleton-cell w-long" style="margin-bottom: 4px;"></div>
              <div class="skeleton-cell w-medium"></div>
            </div>
          </div>
        </td>
        <td><div class="skeleton-cell w-medium"></div></td>
        <td><div class="skeleton-cell w-medium"></div></td>
        <td><div class="skeleton-cell w-short"></div></td>
        <td style="text-align: center;"><div class="skeleton-cell w-badge" style="margin: 0 auto;"></div></td>
        <td style="text-align: right;"><div class="skeleton-cell w-short" style="margin-left: auto;"></div></td>
      </tr>
    `
    )
    .join('');
}

/**
 * Render bảng danh sách nhân viên khi tải thành công
 */
function renderSuccessState() {
  const tbody = qs('#emp-table-body');
  const countEl = qs('#emp-results-count');
  const paginationWrapper = qs('#emp-pagination');

  if (!tbody) return;

  // Cập nhật số lượng hiển thị trên toolbar
  if (countEl) {
    countEl.textContent = `Tổng cộng: ${pageState.total.toLocaleString('vi-VN')} nhân viên`;
  }

  // 1. Trường hợp không có dữ liệu
  if (!pageState.employees || pageState.employees.length === 0) {
    if (paginationWrapper) paginationWrapper.style.display = 'none';

    // Phân biệt trạng thái: Chưa có dữ liệu hệ thống vs Không tìm thấy kết quả theo bộ lọc
    const hasFilter = Boolean(pageState.searchQuery) || (pageState.departmentId && pageState.departmentId !== 'all');

    if (hasFilter) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-state-icon" style="background-color: #f1f5f9; color: #64748b;">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <div class="empty-state-title">Không tìm thấy nhân viên phù hợp</div>
              <div class="empty-state-desc">
                Không có nhân sự nào khớp với từ khóa tìm kiếm hoặc phòng ban đã chọn.
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-empty-reset" style="margin-top: 8px;">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                <span>Đặt lại bộ lọc</span>
              </button>
            </div>
          </td>
        </tr>
      `;

      qs('#btn-empty-reset')?.addEventListener('click', () => {
        const searchInput = qs('#emp-search-input');
        const deptFilter = qs('#emp-dept-filter');
        const searchClear = qs('#emp-search-clear');
        if (searchInput) searchInput.value = '';
        if (deptFilter) deptFilter.value = 'all';
        if (searchClear) searchClear.classList.remove('visible');

        pageState.searchQuery = '';
        pageState.departmentId = 'all';
        pageState.currentPage = 1;
        loadEmployeeData();
      });
      return;
    }

    // Danh sách rỗng hoàn toàn trong hệ thống
    const userRole = getCurrentUserRole();
    const canManage = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </div>
            <div class="empty-state-title">Hệ thống chưa có nhân sự nào</div>
            <div class="empty-state-desc">
              Bắt đầu xây dựng cơ cấu tổ chức bằng cách thêm nhân viên mới vào các phòng ban.
            </div>
            ${
              canManage
                ? `
              <button class="btn btn-primary btn-sm" id="btn-empty-add-emp" style="margin-top: 8px;">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span>Thêm nhân viên đầu tiên</span>
              </button>
            `
                : ''
            }
          </div>
        </td>
      </tr>
    `;

    qs('#btn-empty-add-emp')?.addEventListener('click', (e) => {
      openEmployeeFormModal({
        triggerEl: e.currentTarget,
        onSuccess: () => {
          loadEmployeeData();
        },
      });
    });
    return;
  }

  // 2. Render các hàng dữ liệu nhân viên
  const userRole = getCurrentUserRole();
  const canEdit = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;

  tbody.innerHTML = pageState.employees
    .map((emp) => {
      const id = emp.employeeId;
      const code = sanitizeHTML(emp.employeeCode || '--');
      const name = sanitizeHTML(emp.fullName || '--');
      const dept = sanitizeHTML(emp.departmentName || 'Chưa phân bổ');
      const phone = emp.phone ? sanitizeHTML(emp.phone) : '<span style="color: #94a3b8;">--</span>';
      const hireDate = formatDateVN(emp.hireDate);
      const email = emp.email ? sanitizeHTML(emp.email) : null;
      const initials = getInitials(emp.fullName);

      // Phân loại trạng thái (ACTIVE, ONLEAVE, RESIGNED, INACTIVE)
      let statusHtml = '';
      const rawStatus = (emp.status || '').toUpperCase();
      if (rawStatus === 'ACTIVE') {
        statusHtml = `<span class="badge-status-active"><span class="status-indicator-dot dot-active"></span> Đang làm việc</span>`;
      } else if (rawStatus === 'ONLEAVE') {
        statusHtml = `<span class="badge-status-onleave"><span class="status-indicator-dot dot-onleave"></span> Nghỉ phép</span>`;
      } else if (rawStatus === 'RESIGNED') {
        statusHtml = `<span class="badge-status-resigned"><span class="status-indicator-dot dot-resigned"></span> Đã thôi việc</span>`;
      } else {
        statusHtml = `<span class="badge-status-inactive"><span class="status-indicator-dot dot-inactive"></span> Tạm dừng</span>`;
      }

      // TUYỆT ĐỐI KHÔNG HIỂN THỊ CCCD TRONG BẢNG DANH SÁCH
      return `
        <tr data-id="${id}">
          <td>
            <span class="emp-code-badge">${code}</span>
          </td>
          <td>
            <div class="emp-name-cell">
              <div class="emp-avatar-placeholder">${sanitizeHTML(initials)}</div>
              <div>
                <div class="emp-name-text">${name}</div>
                ${email ? `<div class="emp-email-subtext">${email}</div>` : ''}
              </div>
            </div>
          </td>
          <td>
            <div class="emp-dept-cell">
              <span class="emp-dept-badge">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>
                ${dept}
              </span>
            </div>
          </td>
          <td>
            <span class="emp-phone-cell">${phone}</span>
          </td>
          <td>
            <span class="emp-date-cell">${hireDate}</span>
          </td>
          <td style="text-align: center;">
            ${statusHtml}
          </td>
          <td class="emp-action-cell">
            <div class="emp-action-buttons">
              <button 
                type="button" 
                class="emp-action-icon-btn btn-view" 
                data-action="view" 
                data-id="${id}" 
                title="Xem chi tiết hồ sơ nhân sự"
                aria-label="Xem chi tiết"
              >
                <svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              ${
                canEdit
                  ? `
                <button 
                  type="button" 
                  class="emp-action-icon-btn btn-edit" 
                  data-action="edit" 
                  data-id="${id}" 
                  title="Chỉnh sửa thông tin nhân sự"
                  aria-label="Chỉnh sửa"
                >
                  <svg viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
              `
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // 3. Cập nhật phân trang
  renderPagination();
}

/**
 * Hiển thị khối điều khiển phân trang
 */
function renderPagination() {
  const paginationWrapper = qs('#emp-pagination');
  const infoEl = qs('#emp-pagination-info');
  const controlsEl = qs('#emp-pagination-controls');
  const limitSelect = qs('#emp-limit-select');

  if (!paginationWrapper || !infoEl || !controlsEl) return;

  if (pageState.total === 0) {
    paginationWrapper.style.display = 'none';
    return;
  }

  paginationWrapper.style.display = 'flex';

  if (limitSelect) {
    limitSelect.value = String(pageState.pageSize);
  }

  const from = (pageState.currentPage - 1) * pageState.pageSize + 1;
  const to = Math.min(pageState.currentPage * pageState.pageSize, pageState.total);
  infoEl.textContent = `Hiển thị ${from} - ${to} trên tổng số ${pageState.total.toLocaleString('vi-VN')} nhân viên`;

  // Xây dựng danh sách các nút phân trang
  let controlsHtml = '';

  // Nút Previous
  const hasPrev = pageState.currentPage > 1;
  controlsHtml += `
    <button 
      type="button" 
      class="emp-page-btn" 
      data-page="${pageState.currentPage - 1}" 
      ${!hasPrev ? 'disabled' : ''} 
      title="Trang trước"
      aria-label="Trang trước"
    >
      <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  `;

  // Các nút số trang
  const totalPages = pageState.totalPages;
  const current = pageState.currentPage;

  // Hiển thị tối đa 5 nút trang
  let startPage = Math.max(1, current - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    controlsHtml += `<button type="button" class="emp-page-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      controlsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
    }
  }

  for (let p = startPage; p <= endPage; p++) {
    const isActive = p === current;
    controlsHtml += `
      <button 
        type="button" 
        class="emp-page-btn ${isActive ? 'active' : ''}" 
        data-page="${p}"
      >
        ${p}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      controlsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
    }
    controlsHtml += `<button type="button" class="emp-page-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  // Nút Next
  const hasNext = pageState.currentPage < totalPages;
  controlsHtml += `
    <button 
      type="button" 
      class="emp-page-btn" 
      data-page="${pageState.currentPage + 1}" 
      ${!hasNext ? 'disabled' : ''} 
      title="Trang tiếp theo"
      aria-label="Trang tiếp theo"
    >
      <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;

  controlsEl.innerHTML = controlsHtml;
}

/**
 * Xử lý sự kiện click chuyển trang
 */
function handlePaginationClick(e) {
  const btn = e.target.closest('.emp-page-btn');
  if (!btn || btn.disabled) return;

  const targetPage = Number(btn.dataset.page);
  if (targetPage && targetPage !== pageState.currentPage) {
    pageState.currentPage = targetPage;
    loadEmployeeData();
  }
}

/**
 * Xử lý sự kiện click vào các nút thao tác trên bảng nhân viên
 */
function handleTableActionClick(e) {
  const btn = e.target.closest('.emp-action-icon-btn');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'view') {
    openEmployeeDetailModal(id, btn);
  } else if (action === 'edit') {
    const targetEmp = pageState.employees.find((e) => String(e.employeeId) === String(id));
    openEmployeeEditModal({
      employeeId: id,
      employee: targetEmp,
      triggerEl: btn,
      onSuccess: () => {
        loadEmployeeData();
      },
    });
  }
}

/**
 * Hiển thị banner lỗi khi API thất bại
 */
function renderErrorState() {
  const banner = qs('#emp-error-banner');
  const desc = qs('#emp-error-desc-text');
  const tbody = qs('#emp-table-body');
  const paginationWrapper = qs('#emp-pagination');

  if (banner) banner.style.display = 'flex';
  if (desc) desc.textContent = pageState.errorMessage || 'Đã có lỗi xảy ra khi kết nối máy chủ.';
  if (tbody) tbody.innerHTML = '';
  if (paginationWrapper) paginationWrapper.style.display = 'none';

  showToast(pageState.errorMessage || 'Lỗi kết nối máy chủ', 'error');
}

/**
 * Ẩn banner lỗi
 */
function hideErrorBanner() {
  const banner = qs('#emp-error-banner');
  if (banner) banner.style.display = 'none';
}

/**
 * Định dạng ngày sang dd/MM/yyyy
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
 * Lấy chữ cái đầu đại diện làm Avatar
 */
function getInitials(fullName) {
  if (!fullName) return 'NV';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default {
  render: renderEmployeesPage,
  initEvents: initEmployeesPageEvents,
};
