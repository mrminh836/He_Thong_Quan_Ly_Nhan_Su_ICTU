/**
 * BỘ KIỂM THỬ TỰ ĐỘNG FRONTEND: AUTH SERVICE & STORAGE VALIDATION
 * Sử dụng Node.js built-in assert
 */

import assert from 'node:assert';

// Giả lập localStorage cho môi trường Node.js test
const mockLocalStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => mockLocalStorageStore.get(key) || null,
  setItem: (key, val) => mockLocalStorageStore.set(key, String(val)),
  removeItem: (key) => mockLocalStorageStore.delete(key),
  clear: () => mockLocalStorageStore.clear(),
};

// Import sau khi đã mock localStorage
const {
  setAccessToken,
  getAccessToken,
  setCurrentUser,
  getCurrentUser,
  isAuthenticated,
  logout,
  handleRememberUsername,
  getRememberedUsername,
  STORAGE_KEYS,
} = await import('../src/services/authService.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`);
    throw err;
  }
}

console.log('\n============================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ FRONTEND AUTH SERVICE & STORAGE');
console.log('============================================================\n');

// Reset storage trước khi test
globalThis.localStorage.clear();

test('Test 1: Khởi đầu khi chưa lưu token -> isAuthenticated() trả về false', () => {
  assert.strictEqual(isAuthenticated(), false);
  assert.strictEqual(getAccessToken(), null);
  assert.strictEqual(getCurrentUser(), null);
});

test('Test 2: Lưu access token hợp lệ -> isAuthenticated() trả về true', () => {
  const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakeToken';
  setAccessToken(fakeToken);

  assert.strictEqual(getAccessToken(), fakeToken);
  assert.strictEqual(isAuthenticated(), true);
});

test('Test 3: Lưu và lấy thông tin người dùng (User object)', () => {
  const mockUser = {
    id: 1,
    username: 'admin',
    role: 'Admin',
    fullName: 'Đỗ Quang Minh',
    email: 'minh.dq@hrm.local',
  };

  setCurrentUser(mockUser);
  const retrieved = getCurrentUser();

  assert.deepStrictEqual(retrieved, mockUser);
  assert.strictEqual(retrieved.username, 'admin');
  assert.strictEqual(retrieved.role, 'Admin');
});

test('Test 4: Ghi nhớ tên đăng nhập (Remember Me)', () => {
  handleRememberUsername('admin_user', true);
  assert.strictEqual(getRememberedUsername(), 'admin_user');

  // Hủy ghi nhớ
  handleRememberUsername('admin_user', false);
  assert.strictEqual(getRememberedUsername(), '');
});

test('Test 5: Đăng xuất (Logout) -> Xóa token và user, giữ nguyên remember me', () => {
  setAccessToken('token_truoc_khi_logout');
  setCurrentUser({ id: 99, username: 'test' });
  handleRememberUsername('ghi_nho_admin', true);

  assert.strictEqual(isAuthenticated(), true);

  // Kích hoạt logout
  logout();

  assert.strictEqual(getAccessToken(), null);
  assert.strictEqual(getCurrentUser(), null);
  assert.strictEqual(isAuthenticated(), false);
  // Kiểm tra tên đăng nhập ghi nhớ vẫn còn nguyên để tiện lợi cho lần sau
  assert.strictEqual(getRememberedUsername(), 'ghi_nho_admin');
});

test('Test 6: Validation định dạng Email (Regex)', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  assert.strictEqual(emailRegex.test('admin@hrm.local'), true);
  assert.strictEqual(emailRegex.test('vana.nguyen@company.com.vn'), true);
  assert.strictEqual(emailRegex.test('admin'), false);
  assert.strictEqual(emailRegex.test('admin@'), false);
  assert.strictEqual(emailRegex.test('admin@domain'), false);
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ FRONTEND AUTH!`);
console.log('============================================================\n');
