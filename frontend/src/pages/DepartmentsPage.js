import { renderPageHeader } from '../components/PageHeader.js';
import { departmentService } from '../services/departmentService.js';
import { showToast } from '../components/Toast.js';
import { getCurrentUserRole } from '../services/authService.js';
import { ROLES } from '../utils/rbac.js';
import { qs, qsa } from '../utils/dom.js';
import {
  openAddDepartmentModal,
  openEditDepartmentModal,
  openViewDepartmentModal,
  openDeleteDepartmentModal,
} from '../components/DepartmentModal.js';

// State nội bộ của trang DepartmentsPage
let pageState = {
  departments: [],
  filteredDepartments: [],
  stats: {
    totalDepartments: 0,
    totalEmployees: 0,
    emptyDepartments: 0,
  },
  isLoading: false,
  isError: false,
  errorMessage: '',
  searchQuery: '',
  statusFilter: 'all', // 'all' | 'with_employees' | 'no_employees' | 'active' | 'inactive'
  currentPage: 1,
  pageSize: 10,
};

/**
 * Render cấu trúc khung HTML tĩnh ban đầu của trang Quản lý phòng ban
 */
export function renderDepartmentsPage() {
  const userRole = getCurrentUserRole();
  const canCreate = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;

  const headerHtml = renderPageHeader({
    title: 'Quản lý phòng ban',
    subtitle: 'Quản lý thông tin phòng ban và theo dõi số lượng nhân sự trong hệ thống.',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Quản lý phòng ban' }],
    actions: `
      <button class="btn btn-secondary" id="btn-refresh-dept" title="Tải lại dữ liệu mới nhất">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Làm mới</span>
      </button>
      ${
        canCreate
          ? `
        <button class="btn btn-primary" id="btn-add-dept" title="Thêm phòng ban mới">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Thêm phòng ban</span>
        </button>
      `
          : ''
      }
    `,
  });

  return `
    ${headerHtml}

    <!-- 1. KHU VỰC CÁC THẺ THỐNG KÊ TỔNG QUAN (3 THẺ CHỈ SỐ) -->
    <div class="stats-grid" id="dept-stats-container">
      <!-- Thẻ 1: Tổng số phòng ban -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Tổng số phòng ban</span>
          <span class="stat-value" id="stat-total-depts">--</span>
          <span class="stat-meta">
            <span class="badge badge-blue">Cơ cấu tổ chức</span>
          </span>
        </div>
        <div class="stat-icon icon-blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/></svg>
        </div>
      </div>

      <!-- Thẻ 2: Tổng nhân sự hiện tại -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Tổng nhân sự hiện tại</span>
          <span class="stat-value" id="stat-total-employees">--</span>
          <span class="stat-meta">
            <span class="badge badge-success">Đang làm việc (Active / OnLeave)</span>
          </span>
        </div>
        <div class="stat-icon icon-purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
      </div>

      <!-- Thẻ 3: Phòng ban chưa có nhân sự -->
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-label">Phòng ban chưa có nhân sự</span>
          <span class="stat-value" id="stat-empty-depts">--</span>
          <span class="stat-meta">
            <span class="badge badge-warning">Cần phân bổ hoặc tuyển dụng</span>
          </span>
        </div>
        <div class="stat-icon icon-orange">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
      </div>
    </div>

    <!-- 2. THANH CÔNG CỤ TÌM KIẾM VÀ LỌC -->
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input 
          type="text" 
          id="dept-search-input" 
          placeholder="Tìm theo tên hoặc mã phòng ban..." 
          autocomplete="off"
        />
        <button type="button" id="dept-search-clear" class="dept-search-clear" title="Xóa tìm kiếm">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="filter-group">
        <select class="select-input" id="dept-filter-select">
          <option value="all">Tất cả phòng ban</option>
          <option value="with_employees">Có nhân sự (&gt; 0)</option>
          <option value="no_employees">Chưa có nhân sự (0 NV)</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm ngưng hoạt động</option>
        </select>

        <span class="badge badge-mock" id="dept-results-count">Đang tải...</span>
      </div>
    </div>

    <!-- 3. VÙNG THÔNG BÁO LỖI / NÚT THỬ LẠI NẾU API THẤT BẠI -->
    <div id="dept-error-banner" class="dept-error-banner" style="display: none;">
      <svg viewBox="0 0 24 24" width="32" height="32" stroke="#ef4444" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div class="dept-error-title">Không thể tải dữ liệu phòng ban</div>
      <div class="dept-error-desc" id="dept-error-desc-text">Đã có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại.</div>
      <button class="btn btn-secondary btn-sm" id="btn-retry-fetch" style="margin-top: 8px;">
        <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Thử lại ngay</span>
      </button>
    </div>

    <!-- 4. BẢNG DANH SÁCH PHÒNG BAN -->
    <div class="table-container" id="dept-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">STT</th>
            <th style="min-width: 200px;">Tên phòng ban</th>
            <th style="min-width: 180px;">Mô tả chức năng</th>
            <th style="width: 160px; text-align: center;">Số lượng nhân sự</th>
            <th style="width: 120px; text-align: center;">Trạng thái</th>
            <th style="width: 110px;">Ngày tạo</th>
            <th style="width: 190px; text-align: right;">Thao tác</th>
          </tr>
        </thead>
        <tbody id="dept-table-body">
          <!-- Nội dung bảng sẽ được điền tự động qua JavaScript -->
        </tbody>
      </table>
    </div>

    <!-- 5. PHÂN TRANG -->
    <div class="dept-pagination-wrapper" id="dept-pagination" style="display: none;">
      <div style="font-size: 12px; color: #64748b;" id="pagination-info">
        Hiển thị 1 - 10 trên tổng số 10 phòng ban
      </div>
      <div style="display: flex; gap: 6px;" id="pagination-controls">
        <!-- Nút phân trang -->
      </div>
    </div>
  `;
}

/**
 * Kích hoạt sự kiện tương tác và tải dữ liệu từ Backend
 */
export function initDepartmentsPageEvents() {
  // 1. Gán sự kiện cho Nút Làm mới
  const refreshBtn = qs('#btn-refresh-dept');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.querySelector('svg')?.classList.add('spinning');
      loadDepartmentData().finally(() => {
        refreshBtn.querySelector('svg')?.classList.remove('spinning');
      });
    });
  }

  // 2. Gán sự kiện cho Nút Thêm phòng ban
  const addBtn = qs('#btn-add-dept');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openAddDepartmentModal({
        onSubmit: async (payload) => {
          await departmentService.createDepartment(payload);
          showToast(`Đã thêm phòng ban '${payload.departmentName}' thành công.`, 'success');
          await loadDepartmentData();
        },
      });
    });
  }

  // 3. Gán sự kiện cho Ô tìm kiếm (Search Input với Realtime Filtering)
  const searchInput = qs('#dept-search-input');
  const searchClear = qs('#dept-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      pageState.searchQuery = e.target.value;
      if (searchClear) {
        searchClear.classList.toggle('visible', Boolean(e.target.value));
      }
      applyFilterAndRender();
    });
  }

  if (searchClear && searchInput) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      pageState.searchQuery = '';
      searchClear.classList.remove('visible');
      searchInput.focus();
      applyFilterAndRender();
    });
  }

  // 4. Gán sự kiện cho Bộ lọc (Filter Dropdown)
  const filterSelect = qs('#dept-filter-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      pageState.statusFilter = e.target.value;
      pageState.currentPage = 1;
      applyFilterAndRender();
    });
  }

  // 5. Gán sự kiện cho Nút Thử lại khi lỗi
  const retryBtn = qs('#btn-retry-fetch');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadDepartmentData();
    });
  }

  // 6. Gán sự kiện Click vào các nút Thao tác trên bảng (Event Delegation)
  const tableBody = qs('#dept-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', handleTableActionClick);
  }

  // 7. Tự động tải dữ liệu phòng ban thực tế từ Backend
  loadDepartmentData();
}

/**
 * Gọi API Backend để lấy danh sách phòng ban và số liệu thống kê
 */
async function loadDepartmentData() {
  renderLoadingState();

  try {
    // Gọi song song API danh sách và API thống kê số lượng nhân sự
    const [deptRes, statsRes] = await Promise.all([
      departmentService.getDepartments({ limit: 100 }), // Lấy danh sách đầy đủ để quản lý
      departmentService.getDepartmentStatistics().catch((err) => {
        console.warn('[DepartmentStats API] Thống kê gặp sự cố:', err.message);
        return { departments: [], summary: null };
      }),
    ]);

    const deptList = deptRes.items || [];
    const statsList = statsRes.departments || [];

    // Ghép số lượng nhân viên chính xác theo DepartmentID
    const statsMap = new Map();
    statsList.forEach((s) => {
      statsMap.set(s.departmentId, s);
    });

    const mergedDepartments = deptList.map((dept) => {
      const statInfo = statsMap.get(dept.id || dept.departmentId);
      return {
        ...dept,
        // Ưu tiên số lượng từ API thống kê nếu có, fallback về employeeCount từ department API
        employeeCount: statInfo !== undefined ? statInfo.employeeCount : Number(dept.employeeCount || 0),
        activeCount: statInfo?.activeCount ?? 0,
        onLeaveCount: statInfo?.onLeaveCount ?? 0,
        resignedCount: statInfo?.resignedCount ?? 0,
      };
    });

    // Cập nhật State
    pageState.departments = mergedDepartments;
    pageState.isLoading = false;
    pageState.isError = false;

    // Cập nhật số liệu 3 Thẻ thống kê
    if (statsRes.summary) {
      pageState.stats = {
        totalDepartments: statsRes.summary.totalDepartments ?? mergedDepartments.length,
        totalEmployees: statsRes.summary.totalEmployees ?? 0,
        emptyDepartments: statsRes.summary.emptyDepartments ?? mergedDepartments.filter((d) => d.employeeCount === 0).length,
      };
    } else {
      // Tự động tính toán chính xác nếu API thống kê không trả summary
      pageState.stats = {
        totalDepartments: mergedDepartments.length,
        totalEmployees: mergedDepartments.reduce((sum, d) => sum + (d.employeeCount || 0), 0),
        emptyDepartments: mergedDepartments.filter((d) => (d.employeeCount || 0) === 0).length,
      };
    }

    renderStatsCards();
    applyFilterAndRender();
  } catch (error) {
    console.error('[DepartmentsPage] Lỗi khi tải dữ liệu từ Backend:', error);
    renderErrorState(error.message || 'Không thể kết nối máy chủ');
  }
}

/**
 * Cập nhật số liệu hiển thị trên 3 Thẻ thống kê
 */
function renderStatsCards() {
  const totalDeptsEl = qs('#stat-total-depts');
  const totalEmployeesEl = qs('#stat-total-employees');
  const emptyDeptsEl = qs('#stat-empty-depts');

  if (totalDeptsEl) totalDeptsEl.textContent = pageState.stats.totalDepartments;
  if (totalEmployeesEl) totalEmployeesEl.textContent = pageState.stats.totalEmployees;
  if (emptyDeptsEl) emptyDeptsEl.textContent = pageState.stats.emptyDepartments;
}

/**
 * Lọc danh sách theo từ khóa tìm kiếm và dropdown bộ lọc, sau đó vẽ lại bảng
 */
function applyFilterAndRender() {
  const query = pageState.searchQuery.trim().toLowerCase();
  const filter = pageState.statusFilter;

  let filtered = pageState.departments.filter((dept) => {
    // 1. Tìm kiếm theo tên hoặc mã phòng ban (không phân biệt chữ hoa/thường)
    const nameMatch = (dept.departmentName || '').toLowerCase().includes(query);
    const codeMatch = (dept.departmentCode || '').toLowerCase().includes(query);
    const descMatch = (dept.description || '').toLowerCase().includes(query);
    const matchesSearch = !query || nameMatch || codeMatch || descMatch;

    if (!matchesSearch) return false;

    // 2. Lọc theo trạng thái và số lượng nhân sự
    if (filter === 'with_employees') {
      return (dept.employeeCount || 0) > 0;
    }
    if (filter === 'no_employees') {
      return (dept.employeeCount || 0) === 0;
    }
    if (filter === 'active') {
      return Boolean(dept.isActive);
    }
    if (filter === 'inactive') {
      return !Boolean(dept.isActive);
    }

    return true; // 'all'
  });

  pageState.filteredDepartments = filtered;

  // Cập nhật số lượng kết quả
  const countEl = qs('#dept-results-count');
  if (countEl) {
    if (pageState.departments.length === 0) {
      countEl.textContent = '0 phòng ban';
    } else if (filtered.length === pageState.departments.length) {
      countEl.textContent = `Tổng số: ${filtered.length} phòng ban`;
    } else {
      countEl.textContent = `Hiển thị ${filtered.length} / ${pageState.departments.length} phòng ban`;
    }
  }

  renderTableBody();
}

/**
 * Vẽ nội dung danh sách phòng ban vào bảng `<tbody>`
 */
function renderTableBody() {
  const tableBody = qs('#dept-table-body');
  const errorBanner = qs('#dept-error-banner');
  if (!tableBody) return;

  if (errorBanner) errorBanner.style.display = 'none';

  // 1. Trạng thái Trống (Hệ thống hoàn toàn chưa có phòng ban nào)
  if (pageState.departments.length === 0) {
    const userRole = getCurrentUserRole();
    const canCreate = userRole === ROLES.ADMIN || userRole === ROLES.HR_MANAGER;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/></svg>
            </div>
            <div class="empty-state-title">Chưa có phòng ban nào trong hệ thống</div>
            <div class="empty-state-desc">Hãy khởi tạo cơ cấu phòng ban đầu tiên để bắt đầu phân bổ nhân sự và quản lý tổ chức.</div>
            ${
              canCreate
                ? `
              <button class="btn btn-primary" id="btn-add-first-dept">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Thêm phòng ban đầu tiên</span>
              </button>
            `
                : ''
            }
          </div>
        </td>
      </tr>
    `;

    const firstAddBtn = qs('#btn-add-first-dept');
    if (firstAddBtn) {
      firstAddBtn.addEventListener('click', () => {
        const mainAddBtn = qs('#btn-add-dept');
        if (mainAddBtn) mainAddBtn.click();
      });
    }
    return;
  }

  // 2. Trạng thái Không tìm thấy kết quả phù hợp với từ khóa tìm kiếm
  if (pageState.filteredDepartments.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state" style="padding: 40px 16px;">
            <div class="empty-state-icon" style="background-color: #f1f5f9; color: #64748b;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <div class="empty-state-title">Không tìm thấy phòng ban nào phù hợp</div>
            <div class="empty-state-desc">
              Không có kết quả nào khớp với từ khóa "<strong>${escapeHtml(pageState.searchQuery)}</strong>" hoặc bộ lọc hiện tại.
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-reset-search" style="margin-top: 8px;">
              <span>Xóa bộ lọc tìm kiếm</span>
            </button>
          </div>
        </td>
      </tr>
    `;

    const resetBtn = qs('#btn-reset-search');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const searchInput = qs('#dept-search-input');
        const filterSelect = qs('#dept-filter-select');
        if (searchInput) searchInput.value = '';
        if (filterSelect) filterSelect.value = 'all';
        pageState.searchQuery = '';
        pageState.statusFilter = 'all';
        applyFilterAndRender();
      });
    }
    return;
  }

  // 3. Trạng thái Thành công: Vẽ từng dòng phòng ban thực tế
  const userRole = getCurrentUserRole();
  const isAdmin = userRole === ROLES.ADMIN;
  const isHR = userRole === ROLES.HR_MANAGER;
  const canEdit = isAdmin || isHR;
  const canDelete = isAdmin; // Chỉ ADMIN có quyền xóa phòng ban

  const rowsHtml = pageState.filteredDepartments.map((dept, index) => {
    const stt = index + 1;
    const deptId = dept.id || dept.departmentId;
    const employeeCount = dept.employeeCount || 0;

    // Huy hiệu số lượng nhân sự
    const countBadge = employeeCount > 0
      ? `<span class="badge-count-active" title="Gồm ${dept.activeCount || employeeCount} nhân sự đang làm việc">
           <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
           <span>${employeeCount} nhân sự</span>
         </span>`
      : `<span class="badge-count-zero" title="Phòng ban hiện chưa có nhân sự trực thuộc">
           <span>0 nhân sự (Trống)</span>
         </span>`;

    // Định dạng ngày tạo
    const formattedDate = formatDate(dept.createdAt);

    return `
      <tr data-id="${deptId}">
        <td style="text-align: center; color: var(--color-text-muted); font-weight: 600;">${stt}</td>
        <td>
          <div class="dept-name-cell">
            <span class="dept-name-title">${escapeHtml(dept.departmentName)}</span>
            <div style="display: flex; gap: 6px; align-items: center; margin-top: 3px;">
              <span class="badge badge-blue" style="font-family: monospace; font-size: 11px; padding: 1px 7px;">${escapeHtml(dept.departmentCode || 'N/A')}</span>
              ${dept.location ? `<span style="font-size: 11px; color: var(--color-text-muted);">📍 ${escapeHtml(dept.location)}</span>` : ''}
            </div>
          </div>
        </td>
        <td>
          <div class="dept-desc-text" title="${escapeHtml(dept.description || 'Chưa có mô tả')}">
            ${escapeHtml(dept.description || 'Chưa có mô tả')}
          </div>
        </td>
        <td style="text-align: center;">
          ${countBadge}
        </td>
        <td style="text-align: center;">
          ${
            dept.isActive !== false
              ? `<span class="badge badge-success"><span style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-success); display: inline-block;"></span> Hoạt động</span>`
              : `<span class="badge badge-gray"><span style="width: 6px; height: 6px; border-radius: 50%; background-color: #94a3b8; display: inline-block;"></span> Tạm ngưng</span>`
          }
        </td>
        <td style="color: var(--color-text-muted); font-size: 12px; white-space: nowrap;">
          ${formattedDate}
        </td>
        <td style="text-align: right;">
          <div class="dept-actions-group">
            <button 
              type="button" 
              class="dept-btn-action btn-view" 
              data-action="view" 
              data-id="${deptId}" 
              title="Xem chi tiết phòng ban"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Xem</span>
            </button>

            ${
              canEdit
                ? `
              <button 
                type="button" 
                class="dept-btn-action btn-edit" 
                data-action="edit" 
                data-id="${deptId}" 
                title="Chỉnh sửa thông tin phòng ban"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                <span>Sửa</span>
              </button>
            `
                : ''
            }

            ${
              canDelete
                ? `
              <button 
                type="button" 
                class="dept-btn-action btn-delete" 
                data-action="delete" 
                data-id="${deptId}" 
                title="Xóa phòng ban khỏi hệ thống"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>Xóa</span>
              </button>
            `
                : ''
            }
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableBody.innerHTML = rowsHtml;
}

/**
 * Xử lý các sự kiện click trên các nút Thao tác (Xem chi tiết, Sửa, Xóa)
 */
async function handleTableActionClick(e) {
  const btn = e.target.closest('.dept-btn-action') || e.target.closest('.dept-action-icon-btn');
  if (!btn) return;

  const action = btn.dataset.action;
  const deptId = Number(btn.dataset.id);
  const department = pageState.departments.find((d) => (d.id || d.departmentId) === deptId);

  if (!department) {
    showToast('Không tìm thấy thông tin phòng ban.', 'error');
    return;
  }

  // 1. Xem chi tiết
  if (action === 'view') {
    openViewDepartmentModal(department);
    return;
  }

  // 2. Chỉnh sửa
  if (action === 'edit') {
    openEditDepartmentModal(department, {
      onSubmit: async (id, updates) => {
        await departmentService.updateDepartment(id, updates);
        showToast(`Đã cập nhật phòng ban '${updates.departmentName}' thành công.`, 'success');
        await loadDepartmentData();
      },
    });
    return;
  }

  // 3. Xóa phòng ban
  if (action === 'delete') {
    openDeleteDepartmentModal(department, {
      onConfirm: async (id) => {
        await departmentService.deleteDepartment(id);
        showToast('Xóa phòng ban thành công.', 'success');
        await loadDepartmentData();
      },
    });
  }
}

/**
 * Hiển thị trạng thái đang tải (Loading Skeleton)
 */
function renderLoadingState() {
  const tableBody = qs('#dept-table-body');
  const countEl = qs('#dept-results-count');
  if (countEl) countEl.textContent = 'Đang tải dữ liệu...';

  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="loading-container">
            <div class="spinner"></div>
            <span>Đang tải danh sách phòng ban từ máy chủ...</span>
          </div>
        </td>
      </tr>
    `;
  }
}

/**
 * Hiển thị trạng thái lỗi kết nối hoặc lỗi server
 * @param {string} errorMsg
 */
function renderErrorState(errorMsg) {
  const tableBody = qs('#dept-table-body');
  const errorBanner = qs('#dept-error-banner');
  const errorDesc = qs('#dept-error-desc-text');
  const countEl = qs('#dept-results-count');

  if (countEl) countEl.textContent = 'Lỗi kết nối';

  if (errorBanner && errorDesc) {
    errorDesc.textContent = errorMsg;
    errorBanner.style.display = 'flex';
  }

  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state" style="color: #ef4444;">
            <div class="empty-state-title" style="color: #991b1b;">Không thể tải dữ liệu</div>
            <div class="empty-state-desc">${escapeHtml(errorMsg)}</div>
          </div>
        </td>
      </tr>
    `;
  }
}

/**
 * Format ngày hiển thị chuẩn Việt Nam (dd/mm/yyyy hh:mm)
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Chống tấn công XSS khi render nội dung chuỗi
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default {
  render: renderDepartmentsPage,
  initEvents: initDepartmentsPageEvents,
};
