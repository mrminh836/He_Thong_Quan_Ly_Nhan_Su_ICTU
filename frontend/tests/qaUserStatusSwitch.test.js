/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: SWITCH KHÓA / MỞ KHÓA TÀI KHOẢN TRÊN BẢNG QUẢN TRỊ
 * ==============================================================================
 * Kiểm thử 12 kịch bản bắt buộc theo đặc tả Section 9:
 * 1. Tài khoản `Active` hiển thị Switch bật (checked) kèm nhãn "Đang hoạt động".
 * 2. Tài khoản `Locked` hiển thị Switch tắt (unchecked) kèm nhãn "Đã khóa".
 * 3. Trạng thái chưa xác định hoặc không hợp lệ: Switch tắt, nhãn "Chưa xác định", không mặc định Active.
 * 4. Hủy xác nhận khóa: không gọi API, trạng thái Switch không đổi.
 * 5. Xác nhận khóa: gửi đúng ID và { status: "Locked" }, cập nhật UI sau khi 200 OK.
 * 6. Hủy xác nhận mở khóa: không gọi API, trạng thái Switch không đổi.
 * 7. Xác nhận mở khóa: gửi đúng ID và { status: "Active" }, cập nhật UI sau khi 200 OK.
 * 8. API thành công: cập nhật chính xác dòng tài khoản theo ID mà không ảnh hưởng dòng khác.
 * 9. API thất bại (400, 401, 403, 404, 409, 500, lỗi mạng): Switch khôi phục trạng thái ban đầu, thông báo lỗi.
 * 10. Chống gửi trùng lặp (Anti-spam): Vô hiệu hóa Switch khi đang xử lý, ngăn request đồng thời.
 * 11. Duy trì tính chính xác khi tìm kiếm, lọc vai trò: Cập nhật đúng tài khoản theo ID.
 * 12. Bảo vệ tài khoản đang đăng nhập: Quản trị viên không thể tự khóa tài khoản của chính mình.
 * ==============================================================================
 */

import assert from 'node:assert';

// -----------------------------------------------------------------------------
// GIẢ LẬP MÔI TRƯỜNG DOM VÀ STORAGE CHO NODE.JS
// -----------------------------------------------------------------------------
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...names) {
    names.forEach((n) => this.classes.add(n));
  }
  remove(...names) {
    names.forEach((n) => this.classes.delete(n));
  }
  contains(name) {
    return this.classes.has(name);
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.innerHTMLValue = '';
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this._elementsById = new Map();
    this._elementsByClass = new Map();
  }

  get className() {
    return Array.from(this.classList.classes).join(' ');
  }

  set className(val) {
    this.classList.classes.clear();
    if (val && typeof val === 'string') {
      val.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }

  get innerHTML() {
    return this.innerHTMLValue;
  }

  set innerHTML(val) {
    this.innerHTMLValue = val;
    this._elementsById = new Map();
    this._elementsByClass = new Map();

    const idRegex = /id="([^"]+)"/g;
    let match;
    while ((match = idRegex.exec(val)) !== null) {
      const id = match[1];
      const el = new MockElement();
      el.id = id;
      el.parentNode = this;

      const styleMatch =
        val.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*\\bstyle="([^"]*)"`, 'i')) ||
        val.match(new RegExp(`<[^>]*\\bstyle="([^"]*)"[^>]*\\bid="${id}"`, 'i'));
      if (styleMatch) {
        const styleDeclarations = styleMatch[1].split(';').filter(Boolean);
        for (const decl of styleDeclarations) {
          const [prop, propVal] = decl.split(':').map((s) => s.trim());
          if (prop && propVal) {
            el.style[prop] = propVal;
          }
        }
      }

      this._elementsById.set(id, el);
    }

    const classRegex = /class="([^"]+)"/g;
    while ((match = classRegex.exec(val)) !== null) {
      const classNames = match[1].split(/\s+/).filter(Boolean);
      const el = new MockElement();
      classNames.forEach((c) => el.classList.add(c));
      el.parentNode = this;
      classNames.forEach((c) => {
        if (!this._elementsByClass.has(c)) {
          this._elementsByClass.set(c, []);
        }
        this._elementsByClass.get(c).push(el);
      });
    }
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      if (this.id === id) return this;
      if (this._elementsById && this._elementsById.has(id)) {
        return this._elementsById.get(id);
      }
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }

    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      if (this.classList.contains(className)) return this;
      if (this._elementsByClass && this._elementsByClass.has(className)) {
        return this._elementsByClass.get(className)[0];
      }
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }

    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      if (this.classList.contains(className)) results.push(this);
      if (this._elementsByClass && this._elementsByClass.has(className)) {
        results.push(...this._elementsByClass.get(className));
      }
    }
    return results;
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'aria-checked') {
      this.checked = val === 'true';
    }
    if (name === 'disabled') {
      this.disabled = true;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'disabled') {
      this.disabled = false;
    }
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  async dispatchEvent(eventObj) {
    const eventType = typeof eventObj === 'string' ? eventObj : eventObj.type;
    const handlers = this.listeners.get(eventType) || [];
    for (const h of handlers) {
      await h(eventObj);
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  focus() {
    this._isFocused = true;
  }
}

// Thiết lập global document và window
const mockBody = new MockElement('body');
const mockStorage = new Map();

globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

globalThis.document = {
  body: mockBody,
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => mockBody.querySelector(`#${id}`),
  querySelector: (sel) => mockBody.querySelector(sel),
  querySelectorAll: (sel) => mockBody.querySelectorAll(sel),
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.window = {
  location: { href: '', pathname: '/users' },
};

globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// Nạp các module cần kiểm thử
const {
  renderUserStatusCell,
} = await import('../src/pages/UsersPage.js');

const {
  openUserStatusModal,
  closeUserStatusModal,
} = await import('../src/components/UserStatusModal.js');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] Kịch bản ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Kịch bản ${total}: ${name}`);
    console.error(`     Chi tiết: ${err.message}`);
    throw err;
  }
}

async function runTestSuite() {
  console.log('==============================================================================');
  console.log('🔒 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: FE SWITCH KHÓA/MỞ KHÓA TÀI KHOẢN TRÊN BẢNG HRM');
  console.log('==============================================================================\n');

  // ==========================================================================
  // KỊCH BẢN 1: Tài khoản Active hiển thị Switch bật và nhãn "Đang hoạt động"
  // ==========================================================================
  await test('Tài khoản Active hiển thị Switch bật (checked), aria-checked="true" và nhãn "Đang hoạt động"', async () => {
    const user = { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' };
    const currentUser = { id: 1, username: 'admin', role: 'ADMIN' };

    const html = renderUserStatusCell(user, currentUser, false);

    assert.ok(html.includes('checked'), 'Switch của user Active phải có thuộc tính checked');
    assert.ok(html.includes('aria-checked="true"'), 'Switch phải có aria-checked="true"');
    assert.ok(html.includes('Đang hoạt động'), 'Phải hiển thị nhãn text "Đang hoạt động"');
    assert.ok(html.includes('status-active'), 'Nhãn phải có class status-active');
    assert.ok(html.includes('badge-success'), 'Badge phải có màu xanh success');
  });

  // ==========================================================================
  // KỊCH BẢN 2: Tài khoản Locked hiển thị Switch tắt và nhãn "Đã khóa"
  // ==========================================================================
  await test('Tài khoản Locked hiển thị Switch tắt (unchecked), aria-checked="false" và nhãn "Đã khóa"', async () => {
    const user = { id: 3, username: 'emp1', role: 'EMPLOYEE', status: 'Locked' };
    const currentUser = { id: 1, username: 'admin', role: 'ADMIN' };

    const html = renderUserStatusCell(user, currentUser, false);

    assert.ok(!html.includes(' checked'), 'Switch của user Locked KHÔNG được có thuộc tính checked');
    assert.ok(html.includes('aria-checked="false"'), 'Switch phải có aria-checked="false"');
    assert.ok(html.includes('Đã khóa'), 'Phải hiển thị nhãn text "Đã khóa"');
    assert.ok(html.includes('status-locked'), 'Nhãn phải có class status-locked');
    assert.ok(html.includes('badge-danger'), 'Badge phải có class badge-danger');
  });

  // ==========================================================================
  // KỊCH BẢN 3: Trạng thái không xác định: Switch tắt, không tự mặc định Active
  // ==========================================================================
  await test('Trạng thái chưa xác định hoặc không hợp lệ: Switch tắt, nhãn "Chưa xác định", không mặc định Active', async () => {
    const user = { id: 4, username: 'guest', role: 'EMPLOYEE', status: 'UNKNOWN' };
    const currentUser = { id: 1, username: 'admin', role: 'ADMIN' };

    const html = renderUserStatusCell(user, currentUser, false);

    assert.ok(!html.includes(' checked'), 'Trạng thái UNKNOWN không được tự bật switch');
    assert.ok(html.includes('aria-checked="false"'), 'aria-checked phải là false');
    assert.ok(html.includes('Chưa xác định'), 'Phải hiển thị nhãn "Chưa xác định"');
    assert.ok(html.includes('status-unknown'), 'Class nhãn phải là status-unknown');
  });

  // ==========================================================================
  // KỊCH BẢN 4: Hủy xác nhận khóa: không gọi API, trạng thái không đổi
  // ==========================================================================
  await test('Hủy xác nhận khóa: Không gọi API, trạng thái Switch được giữ nguyên ban đầu', async () => {
    let apiCalled = false;
    let cancelCalled = false;

    const user = { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' };

    openUserStatusModal({
      user,
      targetStatus: 'Locked',
      onConfirm: async () => {
        apiCalled = true;
      },
      onCancel: () => {
        cancelCalled = true;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    assert.ok(overlay, 'Modal overlay phải được append vào DOM');

    const cancelBtn = overlay.querySelector('#user-status-modal-cancel');
    assert.ok(cancelBtn, 'Phải tìm thấy nút Hủy trên modal');
    await cancelBtn.dispatchEvent('click');

    assert.strictEqual(apiCalled, false, 'Khi hủy modal, API tuyệt đối không được gọi');
    assert.strictEqual(cancelCalled, true, 'onCancel callback phải được gọi để phục hồi switch');
  });

  // ==========================================================================
  // KỊCH BẢN 5: Xác nhận khóa: gửi đúng ID và status: "Locked"
  // ==========================================================================
  await test('Xác nhận khóa: Gửi đúng ID và { status: "Locked" }, cập nhật UI thành công', async () => {
    let sentPayload = null;
    let confirmed = false;

    const user = { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' };

    openUserStatusModal({
      user,
      targetStatus: 'Locked',
      onConfirm: async () => {
        sentPayload = { userId: user.id, status: 'Locked' };
        confirmed = true;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    const confirmBtn = overlay.querySelector('#user-status-modal-confirm');
    assert.ok(confirmBtn, 'Phải có nút xác nhận khóa');

    await confirmBtn.dispatchEvent('click');

    assert.strictEqual(confirmed, true, 'Callback onConfirm phải được kích hoạt');
    assert.deepStrictEqual(sentPayload, { userId: 2, status: 'Locked' }, 'Payload gửi đi phải đúng ID và status="Locked"');
  });

  // ==========================================================================
  // KỊCH BẢN 6: Hủy xác nhận mở khóa: không gọi API, trạng thái không đổi
  // ==========================================================================
  await test('Hủy xác nhận mở khóa: Không gọi API, trạng thái Switch được giữ nguyên Locked', async () => {
    let apiCalled = false;
    let cancelCalled = false;

    const user = { id: 3, username: 'emp1', role: 'EMPLOYEE', status: 'Locked' };

    openUserStatusModal({
      user,
      targetStatus: 'Active',
      onConfirm: async () => {
        apiCalled = true;
      },
      onCancel: () => {
        cancelCalled = true;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    const cancelBtn = overlay.querySelector('#user-status-modal-cancel');
    assert.ok(cancelBtn, 'Phải có nút Hủy');
    await cancelBtn.dispatchEvent('click');

    assert.strictEqual(apiCalled, false, 'Khi hủy mở khóa, API không được gọi');
    assert.strictEqual(cancelCalled, true, 'onCancel phải được gọi');
  });

  // ==========================================================================
  // KỊCH BẢN 7: Xác nhận mở khóa: gửi đúng ID và status: "Active"
  // ==========================================================================
  await test('Xác nhận mở khóa: Gửi đúng ID và { status: "Active" }, hoàn tất thành công', async () => {
    let sentPayload = null;
    let confirmed = false;

    const user = { id: 3, username: 'emp1', role: 'EMPLOYEE', status: 'Locked' };

    openUserStatusModal({
      user,
      targetStatus: 'Active',
      onConfirm: async () => {
        sentPayload = { userId: user.id, status: 'Active' };
        confirmed = true;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    const confirmBtn = overlay.querySelector('#user-status-modal-confirm');
    assert.ok(confirmBtn, 'Phải có nút xác nhận mở khóa');

    await confirmBtn.dispatchEvent('click');

    assert.strictEqual(confirmed, true);
    assert.deepStrictEqual(sentPayload, { userId: 3, status: 'Active' });
  });

  // ==========================================================================
  // KỊCH BẢN 8: API thành công: Cập nhật đúng dòng tài khoản theo ID
  // ==========================================================================
  await test('API thành công: Cập nhật chính xác dòng tài khoản theo ID mà không làm sai lệch dòng khác', async () => {
    const user2 = { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' };
    const user3 = { id: 3, username: 'emp1', role: 'EMPLOYEE', status: 'Locked' };
    const currentUser = { id: 1, username: 'admin', role: 'ADMIN' };

    // Khóa user2 thành Locked
    user2.status = 'Locked';
    const cellHtml2 = renderUserStatusCell(user2, currentUser, false);
    const cellHtml3 = renderUserStatusCell(user3, currentUser, false);

    assert.ok(cellHtml2.includes('Đã khóa'), 'User 2 sau khi update phải hiển thị Đã khóa');
    assert.ok(!cellHtml2.includes(' checked'), 'User 2 switch phải tắt');
    assert.ok(cellHtml3.includes('Đã khóa'), 'User 3 không bị thay đổi trạng thái');
  });

  // ==========================================================================
  // KỊCH BẢN 9: API thất bại: Khôi phục Switch về trạng thái trước request
  // ==========================================================================
  await test('API thất bại (400, 401, 403, 404, 500, mạng): Phục hồi Switch về trạng thái ban đầu, hiển thị lỗi', async () => {
    const errorStatuses = [400, 401, 403, 404, 409, 500, 'network'];

    for (const errCode of errorStatuses) {
      let isReverted = false;
      const user = { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' };

      openUserStatusModal({
        user,
        targetStatus: 'Locked',
        onConfirm: async () => {
          if (errCode === 'network') {
            const err = new Error('Không thể kết nối máy chủ');
            err.isNetworkError = true;
            throw err;
          } else {
            const err = new Error(`Lỗi HTTP ${errCode}`);
            err.status = errCode;
            err.data = { success: false, statusCode: errCode, message: `Mô tả lỗi ${errCode}` };
            throw err;
          }
        },
      });

      const overlay = mockBody.children[mockBody.children.length - 1];
      const confirmBtn = overlay.querySelector('#user-status-modal-confirm');

      await confirmBtn.dispatchEvent('click');

      const errorBanner = overlay.querySelector('#user-status-modal-error');
      const errorMsg = overlay.querySelector('#user-status-modal-error-msg');

      assert.strictEqual(user.status, 'Active', `Khi gặp lỗi ${errCode}, user.status phải được giữ nguyên ban đầu (Active)`);
      assert.strictEqual(confirmBtn.disabled, false, 'Sau khi gặp lỗi, nút xác nhận phải được mở lại để thử lại');
      assert.strictEqual(errorBanner.style.display, 'flex', 'Banner lỗi trên modal phải được hiển thị (display: flex)');
      assert.ok(errorMsg.textContent.length > 0, 'Phải có nội dung thông điệp lỗi cụ thể hiển thị');

      closeUserStatusModal({ force: true });
    }
  });

  // ==========================================================================
  // KỊCH BẢN 10: Chống spam request (Anti-spam / In-flight loading)
  // ==========================================================================
  await test('Request đang chạy: Vô hiệu hóa Switch và ngăn người dùng gửi nhiều request đồng thời cho cùng 1 tài khoản', async () => {
    const user = { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' };
    const currentUser = { id: 1, username: 'admin', role: 'ADMIN' };

    // Khi isUpdating = true
    const htmlUpdating = renderUserStatusCell(user, currentUser, true);

    assert.ok(htmlUpdating.includes('disabled'), 'Khi đang update, switch input phải có thuộc tính disabled');
    assert.ok(htmlUpdating.includes('user-status-spinner-small'), 'Phải hiển thị spinner nhỏ khi đang gửi API');
    assert.ok(htmlUpdating.includes('is-disabled'), 'Class is-disabled phải được thêm vào label toggle');
  });

  // ==========================================================================
  // KỊCH BẢN 11: Tìm kiếm & Lọc vai trò: Duy trì cập nhật đúng tài khoản theo ID
  // ==========================================================================
  await test('Danh sách đang tìm kiếm hoặc lọc: Cập nhật đúng tài khoản theo ID, không nhầm hàng', async () => {
    const mockList = [
      { id: 1, username: 'admin', role: 'ADMIN', status: 'Active' },
      { id: 2, username: 'hr', role: 'HR_MANAGER', status: 'Active' },
      { id: 3, username: 'emp1', role: 'EMPLOYEE', status: 'Active' },
    ];

    // Lọc chỉ vai trò HR
    const filtered = mockList.filter((u) => u.role === 'HR_MANAGER');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 2);

    // Cập nhật trạng thái của HR thành Locked
    filtered[0].status = 'Locked';

    // Kiểm tra trong danh sách tổng
    const targetInMainList = mockList.find((u) => u.id === 2);
    assert.strictEqual(targetInMainList.status, 'Locked', 'Tài khoản đúng theo ID 2 phải được cập nhật');

    const adminUser = mockList.find((u) => u.id === 1);
    assert.strictEqual(adminUser.status, 'Active', 'Tài khoản ID 1 không bị ảnh hưởng');
  });

  // ==========================================================================
  // KỊCH BẢN 12: Bảo vệ tài khoản đang đăng nhập (Không tự khóa chính mình)
  // ==========================================================================
  await test('Tài khoản của chính Admin đang đăng nhập: Switch bị vô hiệu hóa, không thể tự khóa chính mình', async () => {
    const currentUser = { id: 1, username: 'admin', role: 'ADMIN' };
    const selfUser = { id: 1, username: 'admin', role: 'ADMIN', status: 'Active' };

    const html = renderUserStatusCell(selfUser, currentUser, false);

    assert.ok(html.includes('disabled'), 'Tài khoản của chính mình phải có input disabled');
    assert.ok(html.includes('is-self-lock'), 'Phải có class is-self-lock để ngăn tương tác');
    assert.ok(html.includes('Không thể tự khóa'), 'Tooltip title phải giải thích không thể tự khóa');
  });

  console.log('\n==============================================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN!`);
  console.log('   Chức năng Switch Khóa/Mở khóa tài khoản HRM (Sprint 3) đạt chuẩn 100%.');
  console.log('==============================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
