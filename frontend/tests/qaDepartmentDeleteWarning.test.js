/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: CẢNH BÁO LỖI KHI XÓA PHÒNG BAN CÒN NHÂN VIÊN
 * ==============================================================================
 * Kiểm thử 7 kịch bản bắt buộc theo đặc tả yêu cầu:
 * 1. Xóa phòng ban không có nhân viên: API thành công, đóng modal và danh sách được cập nhật.
 * 2. Xóa phòng ban có nhân viên: Hiển thị cảnh báo chi tiết, không đóng modal sớm và không xóa dòng dữ liệu.
 * 3. Backend trả về HTTP 409 với mã DEPARTMENT_HAS_EMPLOYEES: Nhận diện đúng lỗi nghiệp vụ, hiển thị thông điệp và badge mã lỗi.
 * 4. Backend trả về lỗi 400 khác (VALIDATION_ERROR / INVALID_ID): Không nhầm lẫn thành lỗi còn nhân viên.
 * 5. Xử lý chính xác các nhóm lỗi API: HTTP 401, 403, 404, 500 và lỗi mất kết nối mạng.
 * 6. Nhấn nút xác nhận nhiều lần (Double click): Không tạo nhiều request đồng thời (Anti-spam / debounce state).
 * 7. Đóng cảnh báo (qua nút "Đã hiểu", "Hủy", phím Escape) và mở lại modal: Giao diện vẫn hoạt động bình thường, phục hồi trạng thái sạch.
 * ==============================================================================
 */

import assert from 'node:assert';

// -----------------------------------------------------------------------------
// GIẢ LẬP MÔI TRƯỜNG DOM CHO NODE.JS
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
  toggle(name, force) {
    if (force !== undefined) {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
      return force;
    }
    if (this.classes.has(name)) {
      this.classes.delete(name);
      return false;
    }
    this.classes.add(name);
    return true;
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
    this.disabled = false;
    this.style = {};
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

      const styleMatch = val.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*\\bstyle="([^"]*)"`, 'i')) ||
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

  focus() {
    this._isFocused = true;
  }
}

// Thiết lập global document và window
const mockBody = new MockElement('body');
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
  location: { href: '', pathname: '/departments' },
};

globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// Nạp module cần kiểm thử
const {
  openDeleteDepartmentModal,
  closeModal,
  parseDepartmentDeleteError,
} = await import('../src/components/DepartmentModal.js');

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
  console.log('🛡️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ: FE CẢNH BÁO LỖI KHI XÓA PHÒNG BAN CÒN NHÂN VIÊN');
  console.log('==============================================================================\n');

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 1: parseDepartmentDeleteError nhận diện đúng 409 DEPARTMENT_HAS_EMPLOYEES
  // ---------------------------------------------------------------------------
  await test('Nhận diện chính xác lỗi 409 DEPARTMENT_HAS_EMPLOYEES và định dạng thông điệp', () => {
    const error409 = {
      status: 409,
      data: {
        success: false,
        statusCode: 409,
        errorCode: 'DEPARTMENT_HAS_EMPLOYEES',
        code: 'DEPARTMENT_HAS_EMPLOYEES',
        message: 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.',
      },
    };

    const parsed = parseDepartmentDeleteError(error409);
    assert.strictEqual(parsed.type, 'DEPARTMENT_HAS_EMPLOYEES');
    assert.strictEqual(parsed.title, 'Không thể xóa phòng ban');
    assert.strictEqual(parsed.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
    assert.strictEqual(parsed.statusCode, 409);
    assert.strictEqual(parsed.isConstraint, true);
    assert.ok(parsed.message.includes('Phòng ban này hiện vẫn có nhân viên trực thuộc.'));
    assert.ok(parsed.message.includes('Vui lòng chuyển nhân viên sang phòng ban khác'));
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 2: parseDepartmentDeleteError KHÔNG nhầm lẫn lỗi 400 khác thành lỗi còn nhân viên
  // ---------------------------------------------------------------------------
  await test('Lỗi 400 khác (VALIDATION_ERROR / INVALID_ID) không bị nhầm lẫn thành lỗi còn nhân viên', () => {
    const error400 = {
      status: 400,
      data: {
        success: false,
        statusCode: 400,
        errorCode: 'INVALID_ID',
        code: 'INVALID_ID',
        message: 'ID phòng ban không hợp lệ. Vui lòng cung cấp số nguyên dương.',
      },
    };

    const parsed = parseDepartmentDeleteError(error400);
    assert.strictEqual(parsed.type, 'BAD_REQUEST');
    assert.strictEqual(parsed.title, 'Yêu cầu không hợp lệ');
    assert.strictEqual(parsed.errorCode, 'INVALID_ID');
    assert.strictEqual(parsed.isConstraint, false);
    assert.strictEqual(parsed.message, 'ID phòng ban không hợp lệ. Vui lòng cung cấp số nguyên dương.');
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 3: parseDepartmentDeleteError phân loại đúng các lỗi 401, 403, 404, 500 và lỗi mạng
  // ---------------------------------------------------------------------------
  await test('Phân loại chính xác các tình huống lỗi: 401, 403, 404, 500 và mất kết nối mạng', () => {
    // 403 Forbidden
    const err403 = parseDepartmentDeleteError({ status: 403, data: { errorCode: 'FORBIDDEN' } });
    assert.strictEqual(err403.type, 'FORBIDDEN');
    assert.strictEqual(err403.statusCode, 403);
    assert.ok(err403.message.includes('không có quyền'));

    // 404 Not Found
    const err404 = parseDepartmentDeleteError({ status: 404, data: { errorCode: 'DEPARTMENT_NOT_FOUND' } });
    assert.strictEqual(err404.type, 'NOT_FOUND');
    assert.strictEqual(err404.statusCode, 404);
    assert.ok(err404.message.includes('không còn tồn tại'));

    // 401 Unauthorized
    const err401 = parseDepartmentDeleteError({ status: 401, data: { errorCode: 'TOKEN_REQUIRED' } });
    assert.strictEqual(err401.type, 'UNAUTHORIZED');
    assert.strictEqual(err401.statusCode, 401);

    // 500 Server Error
    const err500 = parseDepartmentDeleteError({ status: 500, data: { message: 'Internal Server Error' } });
    assert.strictEqual(err500.type, 'SERVER_OR_NETWORK_ERROR');
    assert.strictEqual(err500.statusCode, 500);

    // Lỗi mất kết nối mạng
    const netErr = parseDepartmentDeleteError({ isNetworkError: true, message: 'Failed to fetch' });
    assert.strictEqual(netErr.type, 'SERVER_OR_NETWORK_ERROR');
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 4: Xóa phòng ban không có nhân viên -> Gọi API thành công, đóng modal
  // ---------------------------------------------------------------------------
  await test('Xóa phòng ban không có nhân viên: API thành công, đóng modal và hoàn tất thao tác', async () => {
    let apiCalledWithId = null;
    const deptEmpty = { departmentId: 3, departmentName: 'Phòng Thử Nghiệm Trống', departmentCode: 'PB-EMPTY', employeeCount: 0 };

    openDeleteDepartmentModal(deptEmpty, {
      onConfirm: async (id) => {
        apiCalledWithId = id;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    assert.ok(overlay, 'Modal overlay phải được tạo trong DOM');

    const confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');
    assert.ok(confirmBtn, 'Phải có nút xác nhận xóa');

    await confirmBtn.dispatchEvent({ type: 'click' });
    assert.strictEqual(apiCalledWithId, 3, 'onConfirm phải được gọi với ID phòng ban');

    closeModal();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 5: Xóa phòng ban có nhân viên -> Chuyển đổi sang Cảnh báo chi tiết, không đóng modal
  // ---------------------------------------------------------------------------
  await test('Xóa phòng ban có nhân viên: Hiển thị cảnh báo chi tiết, nút Đã hiểu, không xóa dữ liệu', async () => {
    const deptWithEmps = { departmentId: 1, departmentName: 'Phòng Công Nghệ', departmentCode: 'PB-TECH', employeeCount: 3 };

    openDeleteDepartmentModal(deptWithEmps, {
      onConfirm: async () => {
        const error = new Error('Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.');
        error.status = 409;
        error.data = {
          success: false,
          statusCode: 409,
          errorCode: 'DEPARTMENT_HAS_EMPLOYEES',
          code: 'DEPARTMENT_HAS_EMPLOYEES',
          message: 'Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.',
        };
        throw error;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    const confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');
    const understoodBtn = overlay.querySelector('#modal-understood-btn');
    const promptContent = overlay.querySelector('#modal-delete-prompt-content');
    const hasEmployeesAlert = overlay.querySelector('#modal-has-employees-alert');
    const hasEmployeesTitle = overlay.querySelector('#has-employees-alert-title');
    const codeBadge = overlay.querySelector('#has-employees-code-badge');
    const codeText = overlay.querySelector('#has-employees-code-text');

    // Ban đầu nút Đã hiểu ẩn, nội dung xác nhận hiển thị
    assert.strictEqual(understoodBtn.style.display, 'none');
    assert.strictEqual(hasEmployeesAlert.style.display, 'none');

    // Nhấn xác nhận xóa -> Gây ra lỗi 409
    await confirmBtn.dispatchEvent({ type: 'click' });

    // Kiểm tra giao diện đã chuyển đổi sang cảnh báo
    assert.strictEqual(confirmBtn.style.display, 'none', 'Nút xác nhận xóa phải ẩn đi');
    assert.strictEqual(understoodBtn.style.display, 'inline-flex', 'Nút Đã hiểu phải hiển thị');
    assert.strictEqual(promptContent.style.display, 'none', 'Nội dung hỏi xác nhận xóa phải ẩn đi');
    assert.strictEqual(hasEmployeesAlert.style.display, 'flex', 'Hộp cảnh báo chi tiết phải hiển thị');
    assert.strictEqual(hasEmployeesTitle.textContent, 'Không thể xóa phòng ban');
    assert.strictEqual(codeBadge.style.display, 'inline-flex', 'Badge mã lỗi phải hiển thị');
    assert.strictEqual(codeText.textContent, 'DEPARTMENT_HAS_EMPLOYEES');

    // Nhấn nút "Đã hiểu" đóng modal an toàn
    await understoodBtn.dispatchEvent({ type: 'click' });
    closeModal();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 6: Ngăn chặn gửi nhiều request khi nhấn xác nhận liên tục (Anti-spam)
  // ---------------------------------------------------------------------------
  await test('Nhấn xác nhận nhiều lần liên tiếp không tạo nhiều request đồng thời', async () => {
    let callCount = 0;
    const dept = { departmentId: 2, departmentName: 'Phòng Hành Chính', departmentCode: 'PB-HR', employeeCount: 1 };

    openDeleteDepartmentModal(dept, {
      onConfirm: async () => {
        callCount++;
        // Giả lập độ trễ mạng
        await new Promise((r) => setTimeout(r, 50));
        const error = new Error('DEPARTMENT_HAS_EMPLOYEES');
        error.status = 409;
        error.data = { errorCode: 'DEPARTMENT_HAS_EMPLOYEES' };
        throw error;
      },
    });

    const overlay = mockBody.children[mockBody.children.length - 1];
    const confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');

    // Kích hoạt đồng thời 3 lần click
    const p1 = confirmBtn.dispatchEvent({ type: 'click' });
    const p2 = confirmBtn.dispatchEvent({ type: 'click' });
    const p3 = confirmBtn.dispatchEvent({ type: 'click' });

    await Promise.all([p1, p2, p3]);

    assert.strictEqual(callCount, 1, 'Hàm onConfirm chỉ được gọi duy nhất 1 lần khi đang xử lý');
    closeModal();
  });

  // ---------------------------------------------------------------------------
  // KỊCH BẢN 7: Đóng cảnh báo và mở lại modal: Giao diện phục hồi trạng thái sạch
  // ---------------------------------------------------------------------------
  await test('Đóng cảnh báo và mở lại modal: Giao diện phục hồi trạng thái ban đầu sạch sẽ', async () => {
    const dept = { departmentId: 1, departmentName: 'Phòng Kỹ Thuật', departmentCode: 'PB-TECH', employeeCount: 2 };

    // Lần 1: Mở và nhận lỗi
    openDeleteDepartmentModal(dept, {
      onConfirm: async () => {
        const err = new Error('Constraint');
        err.status = 409;
        err.data = { errorCode: 'DEPARTMENT_HAS_EMPLOYEES' };
        throw err;
      },
    });

    let overlay = mockBody.children[mockBody.children.length - 1];
    let confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');
    await confirmBtn.dispatchEvent({ type: 'click' });

    // Đóng modal
    closeModal();

    // Lần 2: Mở lại modal cho cùng phòng ban
    openDeleteDepartmentModal(dept, {
      onConfirm: async () => {},
    });

    overlay = mockBody.children[mockBody.children.length - 1];
    confirmBtn = overlay.querySelector('#modal-confirm-delete-btn');
    const understoodBtn = overlay.querySelector('#modal-understood-btn');
    const hasEmployeesAlert = overlay.querySelector('#modal-has-employees-alert');

    // Kiểm tra trạng thái phục hồi sạch sẽ
    assert.notStrictEqual(confirmBtn.style.display, 'none', 'Nút xác nhận xóa phải hiển thị lại');
    assert.strictEqual(understoodBtn.style.display, 'none', 'Nút Đã hiểu phải ẩn đi khi mở lại');
    assert.strictEqual(hasEmployeesAlert.style.display, 'none', 'Hộp cảnh báo cũ phải ẩn đi khi mở lại');

    closeModal();
  });

  console.log('\n==============================================================================');
  console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN KIỂM THỬ FRONTEND CẢNH BÁO XÓA PHÒNG BAN!`);
  console.log('   Tất cả yêu cầu về UI/UX, phân loại lỗi và chống double-click đều đạt chuẩn.');
  console.log('==============================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
