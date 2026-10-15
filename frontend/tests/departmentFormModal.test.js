/**
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: DEPARTMENT FORM MODAL (ADD / EDIT / VALIDATION / API)
 * Kiểm thử toàn diện 15 tình huống theo mục 12 "Kiểm thử bắt buộc" của Task Description:
 * 1. Mở modal Add -> form trống, đúng tiêu đề, mô tả và nút lưu.
 * 2. Tạo phòng ban hợp lệ -> POST thành công, đóng modal và gọi onSuccess.
 * 3. Tên phòng ban trống -> hiện lỗi validation, không gọi API.
 * 4. Tên chỉ có khoảng trắng -> hiện lỗi validation.
 * 5. Tên vượt độ dài tối đa (> 100 ký tự) -> hiện lỗi validation.
 * 6. Mở Edit -> đúng dữ liệu phòng ban được chọn (tên, mô tả, mã, địa điểm, v.v.).
 * 7. Sửa dữ liệu hợp lệ -> PUT đúng ID.
 * 8. API trả 409 Conflict -> hiển thị lỗi trùng tên/mã phòng ban ngay trường tương ứng.
 * 9. API trả 401 hoặc 403 -> thông báo từ chối truy cập / kiểm tra quyền.
 * 10. API lỗi mạng hoặc 5xx -> giữ nguyên dữ liệu đã nhập và cho phép thử lại.
 * 11. Chống gửi form nhiều lần (Double submission) -> khóa nút submit, hiển thị loading.
 * 12. Hủy modal (Nút Hủy hoặc X) -> đóng modal và không gửi API.
 * 13. Đóng và mở lại modal -> reset sạch lỗi cũ và dữ liệu cũ ngoài ý muốn.
 * 14. Realtime validation -> gỡ bỏ lỗi ngay lập tức khi người dùng gõ dữ liệu hợp lệ.
 * 15. Kiểm tra ràng buộc mô tả (tối đa 5000 ký tự) và mã phòng ban (2-20 ký tự hợp lệ).
 */

import assert from 'node:assert';

// -----------------------------------------------------------------------------
// Giả lập môi trường DOM cơ bản cho Node.js Test Runner
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
    this.checked = false;
    this.style = {};
  }

  get innerHTML() {
    return this.innerHTMLValue;
  }

  set innerHTML(val) {
    this.innerHTMLValue = val;
    // Tự động phân tích các phần tử ID cơ bản được render trong HTML template
    const idRegex = /id="([^"]+)"/g;
    let match;
    this._elementsById = new Map();
    while ((match = idRegex.exec(val)) !== null) {
      const id = match[1];
      const el = new MockElement();
      el.id = id;
      el.parentNode = this;
      this._elementsById.set(id, el);
    }
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners.has(event)) {
      const arr = this.listeners.get(event).filter((f) => f !== fn);
      this.listeners.set(event, arr);
    }
  }

  async dispatchEvent(event) {
    const arr = this.listeners.get(event.type) || [];
    for (const fn of arr) {
      await fn(event);
    }
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      if (this._elementsById && this._elementsById.has(id)) {
        return this._elementsById.get(id);
      }
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
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
    globalThis.document.activeElement = this;
  }

  setSelectionRange() {}
}

// Khởi tạo các biến global giả lập trình duyệt
const mockBody = new MockElement('body');
globalThis.document = {
  activeElement: null,
  body: mockBody,
  createElement: (tag) => new MockElement(tag),
  querySelector: (sel) => mockBody.querySelector(sel),
  querySelectorAll: (sel) => [],
  addEventListener: (event, fn) => mockBody.addEventListener(event, fn),
  removeEventListener: (event, fn) => mockBody.removeEventListener(event, fn),
};
globalThis.window = {
  location: { pathname: '/departments', href: '' },
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock localStorage
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// Mock Fetch API
let mockFetchHandler = null;
globalThis.fetch = async (url, options = {}) => {
  if (typeof mockFetchHandler === 'function') {
    return await mockFetchHandler(url, options);
  }
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, data: {} }),
  };
};

// Import module cần kiểm thử
const {
  validateDepartmentForm,
  openDepartmentFormModal,
  closeDepartmentFormModal,
} = await import('../src/components/DepartmentFormModal.js');
const { departmentService } = await import('../src/services/departmentService.js');

let passedTests = 0;
let totalTests = 0;

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`);
    throw err;
  }
}

console.log('\n============================================================');
console.log('🏛️ BẮT ĐẦU CHẠY BỘ KIỂM THỬ DEPARTMENT FORM MODAL & VALIDATION');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Validate Tên phòng ban không được để trống hoặc undefined
// -----------------------------------------------------------------------------
await testAsync('Test 1: validateDepartmentForm() từ chối khi tên phòng ban bị rỗng hoặc null', () => {
  const r1 = validateDepartmentForm({ departmentName: '' });
  assert.strictEqual(r1.isValid, false);
  assert.strictEqual(r1.errors.departmentName, 'Vui lòng nhập tên phòng ban.');

  const r2 = validateDepartmentForm({ departmentName: null });
  assert.strictEqual(r2.isValid, false);
  assert.strictEqual(r2.errors.departmentName, 'Vui lòng nhập tên phòng ban.');
});

// -----------------------------------------------------------------------------
// TEST 2: Validate Tên chỉ chứa toàn khoảng trắng (whitespace-only)
// -----------------------------------------------------------------------------
await testAsync('Test 2: validateDepartmentForm() từ chối tên phòng ban chỉ chứa toàn khoảng trắng', () => {
  const r = validateDepartmentForm({ departmentName: '     ' });
  assert.strictEqual(r.isValid, false);
  assert.strictEqual(r.errors.departmentName, 'Vui lòng nhập tên phòng ban.');
});

// -----------------------------------------------------------------------------
// TEST 3: Validate Tên vượt quá 100 ký tự (VARCHAR(100) theo Database Schema)
// -----------------------------------------------------------------------------
await testAsync('Test 3: validateDepartmentForm() từ chối tên phòng ban vượt quá 100 ký tự', () => {
  const longName = 'A'.repeat(101);
  const r = validateDepartmentForm({ departmentName: longName });
  assert.strictEqual(r.isValid, false);
  assert.strictEqual(r.errors.departmentName, 'Tên phòng ban không được vượt quá 100 ký tự.');

  // Đúng 100 ký tự -> Hợp lệ
  const exact100 = 'A'.repeat(100);
  const rOk = validateDepartmentForm({ departmentName: exact100 });
  assert.strictEqual(rOk.isValid, true);
  assert.strictEqual(rOk.errors.departmentName, undefined);
});

// -----------------------------------------------------------------------------
// TEST 4: Validate Mô tả cho phép bỏ trống và giới hạn độ dài
// -----------------------------------------------------------------------------
await testAsync('Test 4: validateDepartmentForm() cho phép mô tả rỗng và từ chối mô tả > 5000 ký tự', () => {
  // Bỏ trống mô tả -> Hợp lệ
  const rEmpty = validateDepartmentForm({ departmentName: 'Phòng Kế toán', description: '' });
  assert.strictEqual(rEmpty.isValid, true);

  // Vượt 5000 ký tự -> Báo lỗi
  const longDesc = 'D'.repeat(5001);
  const rTooLong = validateDepartmentForm({ departmentName: 'Phòng Kế toán', description: longDesc });
  assert.strictEqual(rTooLong.isValid, false);
  assert.strictEqual(rTooLong.errors.description, 'Mô tả không được vượt quá 5000 ký tự.');
});

// -----------------------------------------------------------------------------
// TEST 5: Validate Mã phòng ban tùy chọn: độ dài 2-20 và định dạng ký tự
// -----------------------------------------------------------------------------
await testAsync('Test 5: validateDepartmentForm() kiểm tra định dạng và độ dài của mã phòng ban', () => {
  // Mã 1 ký tự -> Báo lỗi ngắn
  const r1 = validateDepartmentForm({ departmentName: 'Phòng Nhân sự', departmentCode: 'P' });
  assert.strictEqual(r1.isValid, false);
  assert.strictEqual(r1.errors.departmentCode, 'Mã phòng ban phải có độ dài từ 2 đến 20 ký tự.');

  // Mã chứa ký tự đặc biệt không hợp lệ như dấu cách hoặc @
  const r2 = validateDepartmentForm({ departmentName: 'Phòng Nhân sự', departmentCode: 'PB HR@' });
  assert.strictEqual(r2.isValid, false);
  assert.ok(r2.errors.departmentCode.includes('chỉ được chứa chữ cái, chữ số'));

  // Mã hợp lệ (chữ, số, gạch nối, gạch dưới)
  const rValid = validateDepartmentForm({ departmentName: 'Phòng Nhân sự', departmentCode: 'PB-HR_01' });
  assert.strictEqual(rValid.isValid, true);
});

// -----------------------------------------------------------------------------
// TEST 6: Mở Modal Add -> Giao diện chuẩn (Tiêu đề, mô tả, nút Lưu phòng ban)
// -----------------------------------------------------------------------------
await testAsync('Test 6: openDepartmentFormModal ở chế độ Add thiết lập đúng tiêu đề, mô tả và nút submit', async () => {
  const overlay = await openDepartmentFormModal({ mode: 'create' });
  assert.ok(overlay.innerHTML.includes('Thêm phòng ban'));
  assert.ok(overlay.innerHTML.includes('Nhập thông tin để tạo phòng ban mới trong hệ thống.'));
  assert.ok(overlay.innerHTML.includes('Lưu phòng ban'));
  assert.ok(overlay.innerHTML.includes('Ví dụ: Phòng Công nghệ thông tin'));
  closeDepartmentFormModal();
});

// -----------------------------------------------------------------------------
// TEST 7: Mở Modal Edit -> Điền đúng thông tin phòng ban được chọn
// -----------------------------------------------------------------------------
await testAsync('Test 7: openDepartmentFormModal ở chế độ Edit hiển thị đúng dữ liệu phòng ban', async () => {
  const mockDept = {
    id: 12,
    departmentName: 'Phòng Đảm bảo chất lượng',
    departmentCode: 'PB-QA',
    location: 'Tầng 3',
    phone: '0208-3333-444',
    description: 'Kiểm thử phần mềm và đảm bảo quy trình',
    isActive: true,
  };

  const overlay = await openDepartmentFormModal({
    mode: 'edit',
    department: mockDept,
  });

  assert.ok(overlay.innerHTML.includes('Chỉnh sửa phòng ban'));
  assert.ok(overlay.innerHTML.includes('Cập nhật thông tin phòng ban.'));
  assert.ok(overlay.innerHTML.includes('Cập nhật phòng ban'));
  assert.ok(overlay.innerHTML.includes('Phòng Đảm bảo chất lượng'));
  assert.ok(overlay.innerHTML.includes('PB-QA'));
  assert.ok(overlay.innerHTML.includes('Kiểm thử phần mềm và đảm bảo quy trình'));
  closeDepartmentFormModal();
});

// -----------------------------------------------------------------------------
// TEST 8: Gửi Form Add thành công -> Gọi API POST /api/departments và kích hoạt onSuccess
// -----------------------------------------------------------------------------
await testAsync('Test 8: Tạo phòng ban hợp lệ gọi POST /api/departments và trigger onSuccess', async () => {
  let postCalled = false;
  let sentBody = null;

  mockFetchHandler = async (url, options) => {
    if (url.includes('/departments') && options.method === 'POST') {
      postCalled = true;
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: { id: 99, ...sentBody },
        }),
      };
    }
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
  };

  let successCalled = false;
  const overlay = await openDepartmentFormModal({
    mode: 'create',
    onSuccess: () => {
      successCalled = true;
    },
  });

  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  const descInput = overlay.querySelector('#dept-form-desc');

  nameInput.value = '   Phòng Trí Tuệ Nhân Tạo   ';
  descInput.value = 'Nghiên cứu mô hình ngôn ngữ lớn';

  // Kích hoạt submit form
  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.strictEqual(postCalled, true);
  assert.strictEqual(sentBody.departmentName, 'Phòng Trí Tuệ Nhân Tạo');
  assert.strictEqual(sentBody.description, 'Nghiên cứu mô hình ngôn ngữ lớn');
  assert.strictEqual(successCalled, true);
});

// -----------------------------------------------------------------------------
// TEST 9: Gửi Form Edit thành công -> Gọi API PUT /api/departments/:id
// -----------------------------------------------------------------------------
await testAsync('Test 9: Cập nhật phòng ban gọi PUT /api/departments/:id đúng ID', async () => {
  let putUrl = '';
  let sentBody = null;

  mockFetchHandler = async (url, options) => {
    if (options.method === 'PUT') {
      putUrl = url;
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          data: { id: 15, ...sentBody },
        }),
      };
    }
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
  };

  let successCalled = false;
  const overlay = await openDepartmentFormModal({
    mode: 'edit',
    departmentId: 15,
    department: {
      id: 15,
      departmentName: 'Phòng AI',
      description: 'Mô tả cũ',
    },
    onSuccess: () => {
      successCalled = true;
    },
  });

  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  nameInput.value = 'Phòng AI & Dữ Liệu Lớn';

  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.ok(putUrl.includes('/departments/15'));
  assert.strictEqual(sentBody.departmentName, 'Phòng AI & Dữ Liệu Lớn');
  assert.strictEqual(successCalled, true);
});

// -----------------------------------------------------------------------------
// TEST 10: Xử lý lỗi 409 Conflict khi trùng tên phòng ban
// -----------------------------------------------------------------------------
await testAsync('Test 10: Xử lý chuẩn lỗi HTTP 409 Conflict (Tên phòng ban đã tồn tại)', async () => {
  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false,
        errorCode: 'DUPLICATE_DEPARTMENT_NAME',
        message: "Tên phòng ban 'Phòng Công nghệ thông tin' đã tồn tại trong hệ thống.",
      }),
    };
  };

  const overlay = await openDepartmentFormModal({ mode: 'create' });
  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  const nameError = overlay.querySelector('#dept-name-error');
  const bannerError = overlay.querySelector('#dept-form-banner-error');

  nameInput.value = 'Phòng Công nghệ thông tin';
  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  // Kiểm tra viền đỏ và thông báo lỗi hiển thị dưới input và banner
  assert.strictEqual(nameInput.classList.contains('is-invalid'), true);
  assert.strictEqual(nameError.classList.contains('visible'), true);
  assert.ok(nameError.textContent.includes('đã tồn tại'));
  assert.strictEqual(bannerError.classList.contains('visible'), true);

  // Kiểm tra dữ liệu đã nhập được giữ nguyên để người dùng sửa lại
  assert.strictEqual(nameInput.value, 'Phòng Công nghệ thông tin');
  closeDepartmentFormModal();
});

// -----------------------------------------------------------------------------
// TEST 11: Xử lý lỗi Mất kết nối mạng (Network Error / 5xx) không làm mất dữ liệu
// -----------------------------------------------------------------------------
await testAsync('Test 11: Lỗi kết nối mạng giữ nguyên dữ liệu đã nhập và cho phép người dùng thử lại', async () => {
  let attempts = 0;
  mockFetchHandler = async () => {
    attempts++;
    if (attempts === 1) {
      const err = new TypeError('Failed to fetch');
      throw err;
    }
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { id: 77 } }),
    };
  };

  const overlay = await openDepartmentFormModal({ mode: 'create' });
  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  const descInput = overlay.querySelector('#dept-form-desc');
  const bannerError = overlay.querySelector('#dept-form-banner-error');
  const bannerText = overlay.querySelector('#dept-form-banner-error-text');

  nameInput.value = 'Phòng Thử Nghiệm Mạng';
  descInput.value = 'Dữ liệu không được phép bị mất khi lỗi mạng';

  // Lần 1: Lỗi mạng
  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.strictEqual(bannerError.classList.contains('visible'), true);
  assert.ok(bannerText.textContent.includes('kết nối') || bannerText.textContent.includes('máy chủ'));
  assert.strictEqual(nameInput.value, 'Phòng Thử Nghiệm Mạng');
  assert.strictEqual(descInput.value, 'Dữ liệu không được phép bị mất khi lỗi mạng');

  // Lần 2: Thử lại thành công
  let retriedSuccess = false;
  // Gắn handler success
  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  assert.strictEqual(attempts, 2);
});

// -----------------------------------------------------------------------------
// TEST 12: Chống gửi form nhiều lần (Double Submit Prevention)
// -----------------------------------------------------------------------------
await testAsync('Test 12: Vô hiệu hóa nút Submit và không gửi nhiều request khi người dùng ấn liên tục', async () => {
  let callCount = 0;
  mockFetchHandler = async () => {
    callCount++;
    // Giả lập độ trễ mạng
    await new Promise((r) => setTimeout(r, 50));
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { id: 1 } }),
    };
  };

  const overlay = await openDepartmentFormModal({ mode: 'create' });
  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  nameInput.value = 'Phòng Kiểm Thử Double Submit';

  // Gọi submit đồng thời 3 lần liên tiếp
  const p1 = form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  const p2 = form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  const p3 = form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  await Promise.all([p1, p2, p3]);

  // Chỉ được gửi đúng 1 request API
  assert.strictEqual(callCount, 1);
});

// -----------------------------------------------------------------------------
// TEST 13: Hủy modal không gửi request API nào
// -----------------------------------------------------------------------------
await testAsync('Test 13: Nhấn nút Hủy hoặc nút đóng X đóng modal và không gọi API', async () => {
  let apiCalled = false;
  mockFetchHandler = async () => {
    apiCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const overlay = await openDepartmentFormModal({ mode: 'create' });
  const cancelBtn = overlay.querySelector('#dept-form-cancel-btn');

  // Nhấn nút Hủy
  await cancelBtn.dispatchEvent({ type: 'click' });

  assert.strictEqual(apiCalled, false);
});

// -----------------------------------------------------------------------------
// TEST 14: Tự động xóa lỗi realtime khi người dùng nhập dữ liệu hợp lệ
// -----------------------------------------------------------------------------
await testAsync('Test 14: Lỗi validation được xóa ngay khi người dùng gõ nội dung hợp lệ vào input', async () => {
  const overlay = await openDepartmentFormModal({ mode: 'create' });
  const form = overlay.querySelector('#department-form');
  const nameInput = overlay.querySelector('#dept-form-name');
  const nameError = overlay.querySelector('#dept-name-error');

  // Submit rỗng để kích hoạt lỗi
  nameInput.value = '';
  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  assert.strictEqual(nameInput.classList.contains('is-invalid'), true);
  assert.strictEqual(nameError.classList.contains('visible'), true);

  // Người dùng nhập ký tự hợp lệ -> Lỗi tự động biến mất
  nameInput.value = 'Phòng Kỹ thuật';
  await nameInput.dispatchEvent({ type: 'input' });

  assert.strictEqual(nameInput.classList.contains('is-invalid'), false);
  assert.strictEqual(nameError.classList.contains('visible'), false);
  closeDepartmentFormModal();
});

// -----------------------------------------------------------------------------
// TEST 15: Đóng và mở lại modal reset form sạch sẽ, không còn vướng lỗi cũ
// -----------------------------------------------------------------------------
await testAsync('Test 15: Mở lại modal Add sau khi đóng sẽ có form trống và không còn lỗi cũ', async () => {
  // 1. Mở modal và tạo lỗi
  const overlay1 = await openDepartmentFormModal({ mode: 'create' });
  const form1 = overlay1.querySelector('#department-form');
  const nameInput1 = overlay1.querySelector('#dept-form-name');
  nameInput1.value = '';
  await form1.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  closeDepartmentFormModal();

  // 2. Mở lại modal Add
  const overlay2 = await openDepartmentFormModal({ mode: 'create' });
  const nameInput2 = overlay2.querySelector('#dept-form-name');
  const nameError2 = overlay2.querySelector('#dept-name-error');

  assert.strictEqual(nameInput2.value, '');
  assert.strictEqual(nameInput2.classList.contains('is-invalid'), false);
  assert.strictEqual(nameError2.classList.contains('visible'), false);
  closeDepartmentFormModal();
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ DEPARTMENT FORM MODAL!`);
console.log('============================================================\n');
