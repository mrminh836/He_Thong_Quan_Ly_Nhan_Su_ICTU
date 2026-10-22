import { renderPageHeader } from '../components/PageHeader.js';
import { showToast } from '../components/Toast.js';
import { qs, qsa, sanitizeHTML } from '../utils/dom.js';
import { userService } from '../services/userService.js';
import { getCurrentUser } from '../services/authService.js';
import { normalizeRole, getRoleBadgeInfo, ROLES } from '../utils/rbac.js';
import { openUserStatusModal } from '../components/UserStatusModal.js';

/**
 * ==============================================================================
 * TRANG QUẢN TRỊ NGƯỜI DÙNG & TRẠNG THÁI TÀI KHOẢN (HRM ICTU)
 * Hỗ trợ Switch/Toggle trực tiếp: Active <-> Locked
 * Modal xác nhận WAI-ARIA, chống spam request, bảo vệ tài khoản đang đăng nhập
 * ==============================================================================
 */

// Bộ nhớ trạng thái cục bộ của trang
let usersData = [];
let updatingUserIds = new Set();
let searchQuery = '';
let roleFilter = 'all';

/**
 * Render cấu trúc HTML ban đầu của trang Users
 */
export function renderUsersPage() {
  const headerHtml = renderPageHeader({
    title: 'Quản lý tài khoản người dùng',
    subtitle: 'Phân quyền vai trò hệ thống & Khóa/Mở khóa tài khoản (RBAC)',
    breadcrumbs: [{ label: 'Trang chủ', path: '/dashboard' }, { label: 'Tài khoản' }],
    actions: `
      <button class="btn btn-primary" id="btn-create-user" type="button">
        <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <span>Cấp tài khoản mới</span>
      </button>
    `,
  });

  return `
    ${headerHtml}

    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="users-search-input" placeholder="Tìm theo tên đăng nhập, họ tên hoặc mã NV..." aria-label="Tìm kiếm người dùng" />
      </div>

      <div class="filter-group">
        <select class="select-input" id="users-role-filter" aria-label="Lọc theo vai trò">
          <option value="all">Tất cả vai trò</option>
          <option value="admin">Quản trị viên (Admin)</option>
          <option value="hr">Quản lý nhân sự (HR)</option>
          <option value="employee">Nhân viên (Employee)</option>
        </select>
        <span class="badge badge-purple" id="users-count-badge">Đang tải...</span>
      </div>
    </div>

    <div class="table-container" id="users-table-container">
      <table class="data-table" id="users-data-table">
        <thead>
          <tr>
            <th style="width: 60px;">ID</th>
            <th>Tên đăng nhập (Username)</th>
            <th>Vai trò (Role)</th>
            <th>Hồ sơ nhân viên liên kết</th>
            <th>Trạng thái tài khoản</th>
            <th style="text-align: right; width: 140px;">Thao tác</th>
          </tr>
        </thead>
        <tbody id="users-table-body">
          <tr>
            <td colspan="6" style="text-align: center; padding: 32px; color: var(--color-text-muted);">
              Đang tải danh sách tài khoản người dùng...
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Định dạng cấu trúc ô Trạng thái tài khoản chứa Switch/Toggle và nhãn văn bản
 * @param {object} user - Người dùng
 * @param {object|null} currentUser - Người dùng đang đăng nhập
 * @param {boolean} isUpdating - Trạng thái đang gửi API
 * @returns {string} HTML string
 */
export function renderUserStatusCell(user, currentUser, isUpdating = false) {
  const status = user.status || '';
  const isActive = status === 'Active';
  const isLocked = status === 'Locked';
  const isUnknown = !isActive && !isLocked;

  const currentUserId = currentUser ? (currentUser.id || currentUser.userId) : null;
  const isSelf = currentUserId && Number(currentUserId) === Number(user.id);

  let labelText = 'Chưa xác định';
  let labelClass = 'status-unknown';
  let badgeClass = 'badge-gray';

  if (isActive) {
    labelText = 'Đang hoạt động';
    labelClass = 'status-active';
    badgeClass = 'badge-success';
  } else if (isLocked) {
    labelText = 'Đã khóa';
    labelClass = 'status-locked';
    badgeClass = 'badge-danger';
  }

  // Accessibility attributes
  const ariaChecked = isActive ? 'true' : 'false';
  const switchTitle = isSelf
    ? 'Tài khoản của chính bạn (Không thể tự khóa)'
    : isUpdating
    ? 'Đang cập nhật trạng thái...'
    : isActive
    ? 'Nhấn để khóa tài khoản này'
    : 'Nhấn để mở khóa tài khoản này';

  return `
    <div class="user-status-cell" id="user-status-cell-${user.id}">
      <label class="user-toggle-switch ${isSelf ? 'is-self-lock' : ''} ${isUpdating ? 'is-disabled' : ''}" 
             title="${sanitizeHTML(switchTitle)}">
        <input 
          type="checkbox" 
          class="user-status-checkbox" 
          id="user-switch-${user.id}"
          data-user-id="${user.id}" 
          role="switch" 
          aria-label="Khóa hoặc mở khóa tài khoản ${sanitizeHTML(user.username || '')}"
          aria-checked="${ariaChecked}"
          ${isActive ? 'checked' : ''}
          ${isUpdating || isSelf ? 'disabled' : ''}
        />
        <span class="user-toggle-slider" aria-hidden="true"></span>
      </label>

      <span class="badge ${badgeClass} user-status-label ${labelClass}" id="user-status-text-${user.id}">
        ${sanitizeHTML(labelText)}
      </span>

      ${isUpdating ? '<span class="user-status-spinner-small" title="Đang xử lý..."></span>' : ''}
    </div>
  `;
}

/**
 * Render toàn bộ danh sách các hàng trong bảng người dùng
 * @param {Array<object>} list 
 */
export function renderUserRows(list) {
  const tbody = qs('#users-table-body');
  const countBadge = qs('#users-count-badge');
  if (!tbody) return;

  const currentUser = getCurrentUser();

  if (countBadge) {
    countBadge.textContent = `${list.length} tài khoản`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 32px; color: var(--color-text-muted);">
          Không tìm thấy tài khoản người dùng nào phù hợp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list
    .map((user) => {
      const roleInfo = getRoleBadgeInfo(user.role);
      const isUpdating = updatingUserIds.has(Number(user.id));
      const statusCellHtml = renderUserStatusCell(user, currentUser, isUpdating);

      const empDisplay = user.fullName
        ? `<strong>${sanitizeHTML(user.fullName)}</strong> ${user.employeeCode ? `<span style="color: var(--color-text-muted);">(${sanitizeHTML(user.employeeCode)})</span>` : ''}`
        : `<span style="color: var(--color-text-muted); font-style: italic;">Chưa liên kết</span>`;

      return `
        <tr data-user-id="${user.id}" id="user-row-${user.id}">
          <td>${user.id}</td>
          <td>
            <strong>${sanitizeHTML(user.username || '--')}</strong>
          </td>
          <td>
            <span class="badge ${sanitizeHTML(roleInfo.badgeClass)}">${sanitizeHTML(roleInfo.label)}</span>
          </td>
          <td>${empDisplay}</td>
          <td>${statusCellHtml}</td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm user-reset-pwd-btn" data-user="${sanitizeHTML(user.username || '')}" ${isUpdating ? 'disabled' : ''}>
              Đặt lại MK
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  attachTableEventListeners();
}

/**
 * Gắn các sự kiện lắng nghe tương tác trên bảng dữ liệu
 */
function attachTableEventListeners() {
  const currentUser = getCurrentUser();
  const currentUserId = currentUser ? (currentUser.id || currentUser.userId) : null;

  // Lắng nghe thay đổi trạng thái Switch
  qsa('.user-status-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      const userId = Number(checkbox.dataset.userId);
      const user = usersData.find((u) => Number(u.id) === userId);

      if (!user) {
        showToast('Không tìm thấy thông tin tài khoản.', 'error');
        return;
      }

      // 1. Kiểm tra trường hợp đặc biệt: Quản trị viên tự thao tác trên chính tài khoản của mình
      if (currentUserId && Number(currentUserId) === userId) {
        // Hoàn trả lại trạng thái ban đầu của checkbox
        checkbox.checked = user.status === 'Active';
        checkbox.setAttribute('aria-checked', checkbox.checked ? 'true' : 'false');
        showToast('Quản trị viên không thể tự khóa tài khoản của chính mình để tránh mất quyền quản trị.', 'warning');
        return;
      }

      // 2. Chặn thao tác trùng lặp nếu request trước đó đang chạy
      if (updatingUserIds.has(userId)) {
        checkbox.checked = user.status === 'Active';
        return;
      }

      // Trạng thái dự kiến chuyển đổi
      const targetStatus = checkbox.checked ? 'Active' : 'Locked';

      // Giữ checkbox ở trạng thái ban đầu cho đến khi người dùng xác nhận trên modal
      checkbox.checked = user.status === 'Active';

      // 3. Mở Modal xác nhận (Khóa hoặc Mở khóa)
      openUserStatusModal({
        user,
        targetStatus,
        triggerEl: checkbox,
        onConfirm: async () => {
          // Bắt đầu cập nhật: Đánh dấu đang xử lý và cập nhật UI loading dòng đó
          updatingUserIds.add(userId);
          updateRowLoadingState(userId, true);

          try {
            const result = await userService.updateUserStatus(userId, targetStatus);

            // Cập nhật state dữ liệu trong bộ nhớ
            user.status = targetStatus;

            // Cập nhật DOM của ô trạng thái
            updateUserStatusDOM(userId, targetStatus);

            // Thông báo thành công theo đặc tả
            const successMsg = targetStatus === 'Locked'
              ? 'Đã khóa tài khoản thành công.'
              : 'Đã mở khóa tài khoản thành công.';
            showToast(successMsg, 'success');

            return result;
          } catch (err) {
            // Khôi phục trạng thái Switch về giá trị ban đầu đã xác nhận
            updateUserStatusDOM(userId, user.status);

            // Xử lý thông điệp lỗi cụ thể
            let errorMsg = 'Có lỗi xảy ra khi cập nhật trạng thái tài khoản.';
            if (err?.isNetworkError) {
              errorMsg = 'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra kết nối mạng.';
            } else if (err?.status === 401) {
              errorMsg = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
            } else if (err?.status === 403) {
              errorMsg = 'Bạn không có quyền thực hiện thao tác này (Yêu cầu quyền Admin).';
            } else if (err?.status === 404) {
              errorMsg = 'Tài khoản người dùng không tồn tại hoặc đã bị xóa.';
            } else if (err?.data?.message) {
              errorMsg = err.data.message;
            } else if (err?.message) {
              errorMsg = err.message;
            }

            showToast(errorMsg, 'error');
            throw err; // Ném lỗi để modal hiển thị banner lỗi
          } finally {
            updatingUserIds.delete(userId);
            updateRowLoadingState(userId, false);
          }
        },
        onCancel: () => {
          // Khi hủy bỏ: Giữ nguyên switch ở trạng thái ban đầu, không gọi API
          checkbox.checked = user.status === 'Active';
          checkbox.setAttribute('aria-checked', checkbox.checked ? 'true' : 'false');
        },
      });
    });
  });

  // Nút đặt lại mật khẩu
  qsa('.user-reset-pwd-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uname = btn.dataset.user;
      showToast(`Đã chọn đặt lại mật khẩu cho tài khoản [${uname}].`, 'info');
    });
  });
}

/**
 * Cập nhật giao diện Switch và Label của một người dùng theo ID
 * @param {number|string} userId 
 * @param {string} newStatus 
 */
export function updateUserStatusDOM(userId, newStatus) {
  const cell = qs(`#user-status-cell-${userId}`);
  const user = usersData.find((u) => Number(u.id) === Number(userId));
  if (!cell || !user) return;

  const currentUser = getCurrentUser();
  const isUpdating = updatingUserIds.has(Number(userId));
  cell.outerHTML = renderUserStatusCell({ ...user, status: newStatus }, currentUser, isUpdating);

  // Gắn lại sự kiện cho phần tử vừa được thay thế
  const newCheckbox = qs(`#user-switch-${userId}`);
  if (newCheckbox) {
    attachCheckboxEventListener(newCheckbox);
  }
}

/**
 * Cập nhật trạng thái loading cho một dòng người dùng
 * @param {number|string} userId 
 * @param {boolean} isLoading 
 */
function updateRowLoadingState(userId, isLoading) {
  const checkbox = qs(`#user-switch-${userId}`);
  const row = qs(`#user-row-${userId}`);
  const resetBtn = row ? row.querySelector('.user-reset-pwd-btn') : null;

  if (checkbox) {
    checkbox.disabled = isLoading;
    const parentLabel = checkbox.closest('.user-toggle-switch');
    if (parentLabel) {
      if (isLoading) {
        parentLabel.classList.add('is-disabled');
      } else {
        parentLabel.classList.remove('is-disabled');
      }
    }
  }

  if (resetBtn) {
    resetBtn.disabled = isLoading;
  }

  const cell = qs(`#user-status-cell-${userId}`);
  if (cell) {
    let spinner = cell.querySelector('.user-status-spinner-small');
    if (isLoading && !spinner) {
      spinner = document.createElement('span');
      spinner.className = 'user-status-spinner-small';
      spinner.title = 'Đang xử lý...';
      cell.appendChild(spinner);
    } else if (!isLoading && spinner) {
      spinner.remove();
    }
  }
}

/**
 * Gắn sự kiện độc lập cho một checkbox sau khi DOM được thay thế
 * @param {HTMLInputElement} checkbox 
 */
function attachCheckboxEventListener(checkbox) {
  const currentUser = getCurrentUser();
  const currentUserId = currentUser ? (currentUser.id || currentUser.userId) : null;

  checkbox.addEventListener('change', async () => {
    const userId = Number(checkbox.dataset.userId);
    const user = usersData.find((u) => Number(u.id) === userId);
    if (!user) return;

    if (currentUserId && Number(currentUserId) === userId) {
      checkbox.checked = user.status === 'Active';
      checkbox.setAttribute('aria-checked', checkbox.checked ? 'true' : 'false');
      showToast('Quản trị viên không thể tự khóa tài khoản của chính mình để tránh mất quyền quản trị.', 'warning');
      return;
    }

    if (updatingUserIds.has(userId)) {
      checkbox.checked = user.status === 'Active';
      return;
    }

    const targetStatus = checkbox.checked ? 'Active' : 'Locked';
    checkbox.checked = user.status === 'Active';

    openUserStatusModal({
      user,
      targetStatus,
      triggerEl: checkbox,
      onConfirm: async () => {
        updatingUserIds.add(userId);
        updateRowLoadingState(userId, true);

        try {
          const result = await userService.updateUserStatus(userId, targetStatus);
          user.status = targetStatus;
          updateUserStatusDOM(userId, targetStatus);

          const successMsg = targetStatus === 'Locked'
            ? 'Đã khóa tài khoản thành công.'
            : 'Đã mở khóa tài khoản thành công.';
          showToast(successMsg, 'success');
          return result;
        } catch (err) {
          updateUserStatusDOM(userId, user.status);
          let errorMsg = 'Có lỗi xảy ra khi cập nhật trạng thái tài khoản.';
          if (err?.isNetworkError) {
            errorMsg = 'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra kết nối mạng.';
          } else if (err?.status === 401) {
            errorMsg = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
          } else if (err?.status === 403) {
            errorMsg = 'Bạn không có quyền thực hiện thao tác này (Yêu cầu quyền Admin).';
          } else if (err?.status === 404) {
            errorMsg = 'Tài khoản người dùng không tồn tại hoặc đã bị xóa.';
          } else if (err?.data?.message) {
            errorMsg = err.data.message;
          } else if (err?.message) {
            errorMsg = err.message;
          }
          showToast(errorMsg, 'error');
          throw err;
        } finally {
          updatingUserIds.delete(userId);
          updateRowLoadingState(userId, false);
        }
      },
      onCancel: () => {
        checkbox.checked = user.status === 'Active';
        checkbox.setAttribute('aria-checked', checkbox.checked ? 'true' : 'false');
      },
    });
  });
}

/**
 * Áp dụng bộ lọc tìm kiếm & vai trò
 */
function applyFilters() {
  let filtered = [...usersData];

  // Lọc theo từ khóa tìm kiếm
  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((u) => {
      const username = (u.username || '').toLowerCase();
      const fullName = (u.fullName || '').toLowerCase();
      const empCode = (u.employeeCode || '').toLowerCase();
      const role = (u.role || '').toLowerCase();
      return username.includes(q) || fullName.includes(q) || empCode.includes(q) || role.includes(q);
    });
  }

  // Lọc theo vai trò được chọn
  if (roleFilter !== 'all') {
    filtered = filtered.filter((u) => {
      const norm = normalizeRole(u.role);
      if (roleFilter === 'admin') return norm === ROLES.ADMIN;
      if (roleFilter === 'hr') return norm === ROLES.HR_MANAGER;
      if (roleFilter === 'employee') return norm === ROLES.EMPLOYEE;
      return true;
    });
  }

  renderUserRows(filtered);
}

/**
 * Tải danh sách người dùng từ API Backend
 */
export async function loadUsersList() {
  const tbody = qs('#users-table-body');
  const countBadge = qs('#users-count-badge');

  try {
    const users = await userService.getUsers();
    usersData = Array.isArray(users) ? users : [];
    applyFilters();
  } catch (err) {
    console.error('[UsersPage] Lỗi khi tải danh sách người dùng:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 32px; color: #dc2626;">
            Không thể tải danh sách tài khoản. Vui lòng kiểm tra kết nối API backend.
          </td>
        </tr>
      `;
    }
    if (countBadge) {
      countBadge.textContent = 'Lỗi kết nối';
      countBadge.className = 'badge badge-danger';
    }
    showToast('Không thể nạp danh sách tài khoản người dùng từ máy chủ.', 'error');
  }
}

/**
 * Khởi tạo toàn bộ sự kiện cho trang Users
 */
export function initUsersPageEvents() {
  // Nút tạo mới tài khoản
  const createBtn = qs('#btn-create-user');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      showToast('Tính năng cấp tài khoản mới sẽ kết nối API ở Sprint sau.', 'info');
    });
  }

  // Input tìm kiếm (Debounced)
  const searchInput = qs('#users-search-input');
  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        searchQuery = e.target.value;
        applyFilters();
      }, 200);
    });
  }

  // Dropdown lọc theo vai trò
  const roleSelect = qs('#users-role-filter');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      roleFilter = e.target.value;
      applyFilters();
    });
  }

  // Nạp dữ liệu người dùng từ Backend
  loadUsersList();
}

/**
 * Hàm lấy danh sách usersData hiện tại (hỗ trợ kiểm thử)
 */
export function getInternalUsersData() {
  return usersData;
}

/**
 * Hàm thiết lập usersData phục vụ unit test
 */
export function setInternalUsersData(list) {
  usersData = Array.isArray(list) ? list : [];
}

export default {
  render: renderUsersPage,
  initEvents: initUsersPageEvents,
  loadUsersList,
  renderUserStatusCell,
  renderUserRows,
  updateUserStatusDOM,
  getInternalUsersData,
  setInternalUsersData,
};
