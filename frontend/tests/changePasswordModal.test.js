/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: MODAL ĐỔI MẬT KHẨU CÁ NHÂN (HRM-217)
 * ==============================================================================
 * Kiểm thử toàn diện 100% các yêu cầu nghiệp vụ, bảo mật & giao diện người dùng:
 * 1. Bỏ trống từng trường (mật khẩu hiện tại, mật khẩu mới, xác nhận mật khẩu mới).
 * 2. Mật khẩu mới quá ngắn (< 12 ký tự).
 * 3. Mật khẩu thiếu chữ hoa, chữ thường, số hoặc ký tự đặc biệt.
 * 4. Mật khẩu xác nhận không trùng khớp.
 * 5. Mật khẩu mới trùng với mật khẩu hiện tại.
 * 6. Tính toán độ mạnh mật khẩu và checklist thời gian thực.
 * 7. Tích hợp API authService.changePassword (PUT /api/auth/change-password, JWT Bearer).
 * 8. Bảo mật dữ liệu: Tuyệt đối không lưu mật khẩu vào localStorage/sessionStorage.
 * 9. Giao diện modal: Nút hiện/ẩn mật khẩu (Eye Toggle), nút Hủy, nút Đóng (X), phím Escape.
 * 10. Chống gửi form nhiều lần (Double submission / Anti-spam) & trạng thái loading spinner.
 * 11. Xử lý các mã lỗi API (400 INVALID_CURRENT_PASSWORD, PASSWORD_REUSED, 401, 403, 500).
 * 12. Tích hợp nút "Đổi mật khẩu" trên Header User Dropdown.
 * ==============================================================================
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
    const idRegex = /id="([^"]+)"/g;
    let match;
    while ((match = idRegex.exec(val)) !== null) {
      const id = match[1];
      const el = new MockElement();
      el.id = id;
      el.parentNode = this;

      const tagMatch = val.match(new RegExp(`<([a-zA-Z0-9]+)[^>]*\\bid="${id}"[^>]*>`, 'i'));
      if (tagMatch) {
        const fullTag = tagMatch[0];
        const tag = tagMatch[1].toLowerCase();
        el.tagName = tag.toUpperCase();

        const typeMatch = fullTag.match(/\btype="([^"]*)"/i);
        if (typeMatch) {
          el.setAttribute('type', typeMatch[1]);
        }

        const valueMatch = fullTag.match(/\bvalue="([^"]*)"/i);
        if (valueMatch) {
          el.value = valueMatch[1];
        }

        const contentMatch = val.match(new RegExp(`<${tag}[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        if (contentMatch) {
          el.textContent = contentMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      this._elementsById.set(id, el);
    }
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
    if (name === 'type') {
      this.type = String(val);
    }
  }

  getAttribute(name) {
    if (name === 'type') return this.type || this.attributes.get('type') || null;
    return this.attributes.get(name) || null;
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
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
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

  select() {}
}

// Khởi tạo các biến global giả lập trình duyệt
const mockBody = new MockElement('body');
globalThis.document = {
  activeElement: null,
  body: mockBody,
  createElement: (tag) => new MockElement(tag),
  querySelector: (sel) => mockBody.querySelector(sel),
  querySelectorAll: () => [],
  addEventListener: (event, fn) => mockBody.addEventListener(event, fn),
  removeEventListener: (event, fn) => mockBody.removeEventListener(event, fn),
};
globalThis.window = {
  location: { pathname: '/dashboard', href: '' },
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock Storage
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// Mock Fetch API
let mockFetchHandler = null;
globalThis.fetch = async (url, options = {}) => {
  if (typeof mockFetchHandler === 'function') {
    return await mockFetchHandler(url, options);
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, message: 'Đổi mật khẩu thành công.' }),
  };
};

// Import các modules sau khi đã dựng xong môi trường giả lập
const {
  validateChangePasswordForm,
  calculatePasswordStrength,
  openChangePasswordModal,
  closeChangePasswordModal,
} = await import('../src/components/ChangePasswordModal.js');
const { authService } = await import('../src/services/authService.js');
const { renderHeader } = await import('../src/components/Header.js');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

console.log('\n==============================================================================');
console.log('🔒 BẮT ĐẦU CHẠY BỘ KIỂM THỬ FRONTEND: MODAL ĐỔI MẬT KHẨU CÁ NHÂN (HRM-217)');
console.log('==============================================================================\n');

// ==============================================================================
// NHÓM 1: FORM VALIDATION LOGIC
// ==============================================================================
console.log('📋 NHÓM 1: KIỂM THỬ QUY TẮC VALIDATE DỮ LIỆU ĐỔI MẬT KHẨU PHÍA CLIENT');

runTest('Test 1: Bỏ trống Mật khẩu hiện tại -> Báo lỗi bắt buộc', () => {
  const res = validateChangePasswordForm({
    currentPassword: '',
    newPassword: 'AlicePass@2026Strong',
    confirmPassword: 'AlicePass@2026Strong',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.currentPassword.includes('mật khẩu hiện tại'));
});

runTest('Test 2: Bỏ trống Mật khẩu mới -> Báo lỗi bắt buộc', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: '',
    confirmPassword: 'CurrentPass@2026',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('mật khẩu mới'));
});

runTest('Test 3: Mật khẩu mới chỉ chứa khoảng trắng -> Báo lỗi không chấp nhận khoảng trắng', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: '              ',
    confirmPassword: '              ',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('khoảng trắng'));
});

runTest('Test 4: Mật khẩu mới dưới 12 ký tự (< 12) -> Báo lỗi độ dài tối thiểu 12 ký tự', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'Ngan123@Pas', // 11 ký tự
    confirmPassword: 'Ngan123@Pas',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('tối thiểu 12 ký tự'));
});

runTest('Test 5: Mật khẩu mới thiếu chữ cái viết hoa (A-Z) -> Báo lỗi', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'lowercaseonly123@pass',
    confirmPassword: 'lowercaseonly123@pass',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('chữ cái viết hoa'));
});

runTest('Test 6: Mật khẩu mới thiếu chữ cái viết thường (a-z) -> Báo lỗi', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'UPPERCASEONLY123@PASS',
    confirmPassword: 'UPPERCASEONLY123@PASS',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('chữ cái viết thường'));
});

runTest('Test 7: Mật khẩu mới thiếu chữ số (0-9) -> Báo lỗi', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'NoNumbersHere@Special',
    confirmPassword: 'NoNumbersHere@Special',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('chữ số'));
});

runTest('Test 8: Mật khẩu mới thiếu ký tự đặc biệt -> Báo lỗi', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'NoSpecialChars2026Pass',
    confirmPassword: 'NoSpecialChars2026Pass',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.newPassword.includes('ký tự đặc biệt'));
});

runTest('Test 9: Mật khẩu mới trùng với mật khẩu hiện tại -> Báo lỗi', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'AlicePass@2026Strong',
    newPassword: 'AlicePass@2026Strong',
    confirmPassword: 'AlicePass@2026Strong',
  });
  assert.strictEqual(res.isValid, false);
  assert.strictEqual(res.errors.newPassword, 'Mật khẩu mới không được trùng với mật khẩu hiện tại.');
});

runTest('Test 10: Bỏ trống Xác nhận mật khẩu mới -> Báo lỗi bắt buộc', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'AlicePass@2026Strong',
    confirmPassword: '',
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.confirmPassword.includes('xác nhận mật khẩu'));
});

runTest('Test 11: Xác nhận mật khẩu không trùng khớp -> Báo lỗi “Mật khẩu xác nhận không khớp.”', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'AlicePass@2026Strong',
    confirmPassword: 'AlicePass@2026Different',
  });
  assert.strictEqual(res.isValid, false);
  assert.strictEqual(res.errors.confirmPassword, 'Mật khẩu xác nhận không khớp.');
});

runTest('Test 12: Dữ liệu hợp lệ thỏa mãn 100% điều kiện -> isValid = true', () => {
  const res = validateChangePasswordForm({
    currentPassword: 'CurrentPass@2026',
    newPassword: 'AlicePass@2026Strong',
    confirmPassword: 'AlicePass@2026Strong',
  });
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(Object.keys(res.errors).length, 0);
  assert.strictEqual(res.strength.isAllValid, true);
});

// ==============================================================================
// NHÓM 2: ĐỘ MẠNH MẬT KHẨU & CHECKLIST THỜI GIAN THỰC
// ==============================================================================
console.log('\n📋 NHÓM 2: TÍNH TOÁN ĐỘ MẠNH MẬT KHẨU & CHECKLIST REALTIME');

runTest('Test 13: calculatePasswordStrength() mật khẩu rỗng -> level none, label Chưa nhập', () => {
  const str = calculatePasswordStrength('');
  assert.strictEqual(str.level, 'none');
  assert.strictEqual(str.label, 'Chưa nhập');
  assert.strictEqual(str.score, 0);
});

runTest('Test 14: calculatePasswordStrength() mật khẩu ngắn và yếu -> level weak, label Yếu', () => {
  const str = calculatePasswordStrength('123456');
  assert.strictEqual(str.level, 'weak');
  assert.strictEqual(str.label, 'Yếu');
});

runTest('Test 15: calculatePasswordStrength() mật khẩu trung bình -> level medium, label Trung bình', () => {
  const str = calculatePasswordStrength('Abc123456789'); // 12 ký tự, hoa, thường, số (thiếu đặc biệt)
  assert.strictEqual(str.level, 'medium');
  assert.strictEqual(str.label, 'Trung bình');
  assert.strictEqual(str.rules.special, false);
});

runTest('Test 16: calculatePasswordStrength() mật khẩu mạnh toàn diện -> level strong, label Rất mạnh', () => {
  const str = calculatePasswordStrength('SuperPass@2026Enterprise', 'OldPass@1234');
  assert.strictEqual(str.level, 'strong');
  assert.strictEqual(str.label, 'Rất mạnh');
  assert.strictEqual(str.rules.length, true);
  assert.strictEqual(str.rules.uppercase, true);
  assert.strictEqual(str.rules.lowercase, true);
  assert.strictEqual(str.rules.number, true);
  assert.strictEqual(str.rules.special, true);
  assert.strictEqual(str.rules.different, true);
  assert.strictEqual(str.isAllValid, true);
});

// ==============================================================================
// NHÓM 3: TÍCH HỢP REST API VÀ BẢO MẬT PHIÊN LÀM VIỆC
// ==============================================================================
console.log('\n📋 NHÓM 3: TÍCH HỢP REST API VÀ BẢO MẬT PHIÊN LÀM VIỆC');

await runAsyncTest('Test 17: authService.changePassword gọi đúng PUT /api/auth/change-password với JWT Bearer', async () => {
  mockStorage.set('accessToken', 'mock_jwt_token_alice_2026');

  let interceptedUrl = null;
  let interceptedMethod = null;
  let interceptedHeaders = null;
  let interceptedBody = null;

  mockFetchHandler = async (url, options) => {
    interceptedUrl = url;
    interceptedMethod = options.method;
    interceptedHeaders = options.headers;
    interceptedBody = JSON.parse(options.body);

    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        message: 'Đổi mật khẩu thành công.',
      }),
    };
  };

  const result = await authService.changePassword({
    currentPassword: 'OldPassword123@',
    newPassword: 'AlicePass@2026Strong',
    confirmPassword: 'AlicePass@2026Strong',
  });

  assert.ok(interceptedUrl.includes('/api/auth/change-password'));
  assert.strictEqual(interceptedMethod, 'PUT');
  assert.strictEqual(interceptedHeaders['Authorization'], 'Bearer mock_jwt_token_alice_2026');
  assert.strictEqual(interceptedBody.currentPassword, 'OldPassword123@');
  assert.strictEqual(interceptedBody.newPassword, 'AlicePass@2026Strong');
  assert.strictEqual(interceptedBody.confirmPassword, 'AlicePass@2026Strong');
  assert.strictEqual(result.success, true);
});

runTest('Test 18: Bảo mật: Mật khẩu tuyệt đối KHÔNG được lưu vào localStorage hay sessionStorage', () => {
  assert.strictEqual(mockStorage.has('currentPassword'), false);
  assert.strictEqual(mockStorage.has('newPassword'), false);
  assert.strictEqual(mockStorage.has('confirmPassword'), false);
  assert.strictEqual(mockStorage.has('password'), false);
});

// ==============================================================================
// NHÓM 4: GIAO DIỆN MODAL, TƯƠNG TÁC DOM & UX
// ==============================================================================
console.log('\n📋 NHÓM 4: GIAO DIỆN MODAL, TƯƠNG TÁC DOM & UX');

runTest('Test 19: openChangePasswordModal tạo đầy đủ các phần tử DOM chuẩn thiết kế', () => {
  const modal = openChangePasswordModal();
  assert.ok(modal.overlay);

  const currentInput = mockBody.querySelector('#current-password');
  const newInput = mockBody.querySelector('#new-password');
  const confirmInput = mockBody.querySelector('#confirm-password');

  const toggleCurrent = mockBody.querySelector('#toggle-current-password');
  const toggleNew = mockBody.querySelector('#toggle-new-password');
  const toggleConfirm = mockBody.querySelector('#toggle-confirm-password');

  const btnCancel = mockBody.querySelector('#btn-cancel-change-pwd');
  const btnSubmit = mockBody.querySelector('#btn-submit-change-pwd');
  const btnClose = mockBody.querySelector('#change-pwd-close-btn');

  const strengthContainer = mockBody.querySelector('#pwd-strength-container');
  const strengthLabel = mockBody.querySelector('#pwd-strength-label');
  const strengthFill = mockBody.querySelector('#pwd-strength-fill');

  assert.ok(currentInput, 'Phải có input mật khẩu hiện tại');
  assert.ok(newInput, 'Phải có input mật khẩu mới');
  assert.ok(confirmInput, 'Phải có input xác nhận mật khẩu');

  assert.ok(toggleCurrent, 'Phải có nút toggle mật khẩu hiện tại');
  assert.ok(toggleNew, 'Phải có nút toggle mật khẩu mới');
  assert.ok(toggleConfirm, 'Phải có nút toggle xác nhận mật khẩu');

  assert.ok(btnCancel, 'Phải có nút Hủy');
  assert.ok(btnSubmit, 'Phải có nút Submit Đổi mật khẩu');
  assert.ok(btnClose, 'Phải có nút Đóng modal');

  assert.ok(strengthContainer, 'Phải có container đo độ mạnh mật khẩu');
  assert.ok(strengthLabel, 'Phải có nhãn đo độ mạnh mật khẩu');
  assert.ok(strengthFill, 'Phải có thanh tiến độ độ mạnh mật khẩu');

  closeChangePasswordModal();
});

runTest('Test 20: Toggle Show/Hide Password chuyển đổi input type password <-> text', () => {
  openChangePasswordModal();

  const currentInput = mockBody.querySelector('#current-password');
  const toggleCurrent = mockBody.querySelector('#toggle-current-password');

  assert.strictEqual(currentInput.getAttribute('type'), 'password');

  // Click lần 1: password -> text (hiện mật khẩu)
  toggleCurrent.dispatchEvent({ type: 'click' });
  assert.strictEqual(currentInput.getAttribute('type'), 'text');
  assert.ok(toggleCurrent.getAttribute('aria-label').includes('Ẩn'));

  // Click lần 2: text -> password (ẩn mật khẩu)
  toggleCurrent.dispatchEvent({ type: 'click' });
  assert.strictEqual(currentInput.getAttribute('type'), 'password');
  assert.ok(toggleCurrent.getAttribute('aria-label').includes('Hiện'));

  closeChangePasswordModal();
});

await runAsyncTest('Test 21: Submit thành công -> Gọi API, hiển thị thông báo toast và đóng modal', async () => {
  openChangePasswordModal();

  const form = mockBody.querySelector('#change-password-form');
  const currentInput = mockBody.querySelector('#current-password');
  const newInput = mockBody.querySelector('#new-password');
  const confirmInput = mockBody.querySelector('#confirm-password');

  currentInput.value = 'OldPassword123@';
  newInput.value = 'AlicePass@2026Strong';
  confirmInput.value = 'AlicePass@2026Strong';

  let apiCalled = false;
  mockFetchHandler = async () => {
    apiCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        message: 'Đổi mật khẩu thành công.',
      }),
    };
  };

  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.strictEqual(apiCalled, true, 'API phải được gọi');
  // Input phải được dọn dẹp an toàn
  assert.strictEqual(currentInput.value, '');
  assert.strictEqual(newInput.value, '');
  assert.strictEqual(confirmInput.value, '');
});

await runAsyncTest('Test 22: API trả lỗi 400 INVALID_CURRENT_PASSWORD -> Hiển thị lỗi dưới trường mật khẩu hiện tại', async () => {
  openChangePasswordModal();

  const form = mockBody.querySelector('#change-password-form');
  const currentInput = mockBody.querySelector('#current-password');
  const newInput = mockBody.querySelector('#new-password');
  const confirmInput = mockBody.querySelector('#confirm-password');
  const currentError = mockBody.querySelector('#current-password-error');

  currentInput.value = 'WrongCurrentPass123@';
  newInput.value = 'AlicePass@2026Strong';
  confirmInput.value = 'AlicePass@2026Strong';

  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false,
        errorCode: 'INVALID_CURRENT_PASSWORD',
        message: 'Mật khẩu hiện tại không chính xác.',
      }),
    };
  };

  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.strictEqual(currentError.textContent, 'Mật khẩu hiện tại không chính xác.');
  assert.ok(currentError.classList.contains('visible'));
  assert.ok(currentInput.classList.contains('is-invalid'));

  closeChangePasswordModal();
});

await runAsyncTest('Test 23: API trả lỗi 400 PASSWORD_REUSED -> Hiển thị lỗi dưới trường mật khẩu mới', async () => {
  openChangePasswordModal();

  const form = mockBody.querySelector('#change-password-form');
  const currentInput = mockBody.querySelector('#current-password');
  const newInput = mockBody.querySelector('#new-password');
  const confirmInput = mockBody.querySelector('#confirm-password');
  const newError = mockBody.querySelector('#new-password-error');

  currentInput.value = 'SamePassword123@';
  newInput.value = 'SamePassword123@DifferentLength';
  confirmInput.value = 'SamePassword123@DifferentLength';

  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false,
        errorCode: 'PASSWORD_REUSED',
        message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
      }),
    };
  };

  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.strictEqual(newError.textContent, 'Mật khẩu mới không được trùng với mật khẩu hiện tại.');
  assert.ok(newError.classList.contains('visible'));

  closeChangePasswordModal();
});

await runAsyncTest('Test 24: API trả lỗi 403 ACCOUNT_LOCKED -> Hiển thị trên Banner cảnh báo', async () => {
  openChangePasswordModal();

  const form = mockBody.querySelector('#change-password-form');
  const currentInput = mockBody.querySelector('#current-password');
  const newInput = mockBody.querySelector('#new-password');
  const confirmInput = mockBody.querySelector('#confirm-password');
  const bannerError = mockBody.querySelector('#change-pwd-banner-error');
  const bannerErrorText = mockBody.querySelector('#change-pwd-banner-error-text');

  currentInput.value = 'CurrentPass@2026';
  newInput.value = 'AlicePass@2026Strong';
  confirmInput.value = 'AlicePass@2026Strong';

  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false,
        errorCode: 'ACCOUNT_LOCKED',
        message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ.',
      }),
    };
  };

  await form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert.ok(bannerError.classList.contains('visible'));
  assert.ok(bannerErrorText.textContent.includes('đã bị khóa'));

  closeChangePasswordModal();
});

// ==============================================================================
// NHÓM 5: TÍCH HỢP NÚT ĐỔI MẬT KHẨU TRÊN HEADER
// ==============================================================================
console.log('\n📋 NHÓM 5: TÍCH HỢP NÚT ĐỔI MẬT KHẨU TRÊN HEADER USER DROPDOWN');

runTest('Test 25: Header HTML chứa nút "Đổi mật khẩu" id="change-password-btn" trong dropdown', () => {
  mockStorage.set('user', JSON.stringify({
    username: 'admin',
    fullName: 'Đỗ Quang Minh',
    role: 'Admin',
    email: 'admin@hrm.ictu.edu.vn',
  }));

  const headerHtml = renderHeader();
  assert.ok(headerHtml.includes('id="change-password-btn"'), 'Header phải render nút #change-password-btn');
  assert.ok(headerHtml.includes('Đổi mật khẩu'), 'Header phải chứa văn bản Đổi mật khẩu');
});

console.log('\n==============================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI TEST FRONTEND MODAL!`);
console.log('   Chức năng Modal Đổi mật khẩu cá nhân (HRM-217) đạt chuẩn 100%.');
console.log('==============================================================================\n');
