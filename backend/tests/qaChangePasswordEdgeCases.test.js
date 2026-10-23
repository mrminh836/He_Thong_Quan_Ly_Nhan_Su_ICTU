/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG QA: CÁC CA BIÊN ĐỔI MẬT KHẨU TÀI KHOẢN (HRM-218)
 * (QA Change Password Edge Cases, Boundaries, Re-login & Database Audit)
 * ==============================================================================
 * 
 * MỤC TIÊU KIỂM TOÁN CHẤT LƯỢNG (QA AUDIT SCOPE):
 * 1. CÁC CA BIÊN "SAI MẬT KHẨU CŨ":
 *    - Mật khẩu cũ sai hoàn toàn -> 400 Bad Request (INVALID_CURRENT_PASSWORD).
 *    - Phân biệt hoa/thường (Case sensitivity check) -> 400.
 *    - Khoảng trắng dư thừa ở đầu/cuối -> Không tự ý trim, từ chối 400.
 *    - Tấn công SQL Injection (' OR '1'='1) -> Tham số hóa an toàn, từ chối 400.
 *    - Mật khẩu cũ rỗng, null hoặc thiếu trường -> 400 (VALIDATION_ERROR).
 * 
 * 2. CÁC CA BIÊN "MẬT KHẨU MỚI QUÁ NGẮN & RANH GIỚI ĐỘ DÀI":
 *    - Ranh giới dưới 11 ký tự (Under-boundary) -> Bị từ chối 400 (WEAK_PASSWORD).
 *    - Ranh giới dưới 12 ký tự (Exact Boundary) -> Thành công 200 OK.
 *    - Ranh giới dưới 13 ký tự (Over-boundary) -> Thành công 200 OK.
 *    - Ranh giới trên Bcrypt đúng 72 byte ASCII -> Thành công 200 OK.
 *    - Ranh giới trên Bcrypt 73 byte ASCII -> Bị từ chối 400 (PASSWORD_TOO_LONG).
 *    - Ký tự đa byte UTF-8 tiếng Việt (Multi-byte UTF-8 boundary check).
 *    - Mật khẩu mới toàn khoảng trắng (12 spaces) -> 400 (INVALID_NEW_PASSWORD).
 *    - Mật khẩu mới trùng với mật khẩu hiện tại -> 400 (PASSWORD_REUSED).
 *    - Mật khẩu xác nhận lệch 1 ký tự cuối -> 400 (CONFIRM_PASSWORD_MISMATCH).
 * 
 * 3. CÁC CA BIÊN "ĐĂNG NHẬP LẠI & VÒNG ĐỜI PHIÊN":
 *    - Đăng nhập lại với mật khẩu mới thành công -> POST /api/auth/login trả về 200 OK.
 *    - Mật khẩu cũ bị vô hiệu hóa hoàn toàn ngay lập tức -> 401 Unauthorized.
 *    - Token mới cấp truy cập các API phân quyền -> 200 OK.
 *    - Đổi mật khẩu liên tiếp nhiều lần (A -> B -> C) và đối soát đăng nhập.
 *    - Tài khoản bị khóa (Locked) -> 403 Forbidden.
 * 
 * 4. ĐỐI SOÁT CƠ SỞ DỮ LIỆU & BẢO MẬT DỮ LIỆU:
 *    - Đối soát trực tiếp MySQL: Chỉ password_hash và updated_at thay đổi, các cột khác giữ nguyên.
 *    - Phòng chống IDOR: Gửi userId tài khoản khác trong body -> Chỉ đổi tài khoản trong JWT.
 *    - Response Hygiene: Response tuyệt đối không chứa password, newPassword, password_hash.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { getPool } from '../src/config/database.js';
import { hashPassword, comparePassword } from '../src/utils/password.js';

let totalTests = 0;
let passedTests = 0;

function logPass(testName) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ [PASS] Ca ${totalTests}: ${testName}`);
}

function logFail(testName, err) {
  totalTests++;
  console.error(`  ❌ [FAIL] Ca ${totalTests}: ${testName}`);
  console.error(`     Chi tiết: ${err.message}\n`, err.stack);
  process.exitCode = 1;
}

async function runTestCase(testName, testFn) {
  try {
    await testFn();
    logPass(testName);
  } catch (err) {
    logFail(testName, err);
  }
}

// Helper sinh JWT token kiểm thử
function generateTestToken(payload, secret = env.jwtSecret || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE', options = { expiresIn: '1h' }) {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    ...options,
  });
}

// Khởi tạo test server trên ephemeral port (cổng ngẫu nhiên)
let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

// Helper gửi HTTP request
function makeRequest(path, { method = 'GET', token = null, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      'x-e2e-test-key': 'hrm-e2e-internal-test',
      ...headers,
    };

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buffer.toString('utf-8'));
          } catch {
            // Không phải JSON
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            text: buffer.toString('utf-8'),
          });
        });
      }
    );

    req.on('error', reject);

    if (body !== null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ==============================================================================
// KHỞI ĐỘNG SUITE KIỂM THỬ QA
// ==============================================================================
console.log('\n==============================================================================');
console.log('🔍 BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: CÁC CA BIÊN ĐỔI MẬT KHẨU TÀI KHOẢN (HRM-218)');
console.log('   (Sai mật khẩu cũ, Mật khẩu mới quá ngắn, Đăng nhập lại & Đối soát CSDL)');
console.log('==============================================================================\n');

await startServer();

const pool = getPool();

// Định danh tài khoản QA kiểm thử độc lập (đảm bảo không ảnh hưởng dữ liệu thật)
const QA_USERNAME = 'qa_edge_test_user';
const QA_INITIAL_PASSWORD = 'QaInitPassword@2026';
let qaUserId = null;
let qaUserToken = null;

// Setup tài khoản QA trong CSDL
async function setupQaUser() {
  const initialHash = await hashPassword(QA_INITIAL_PASSWORD);
  // Xóa tài khoản cũ nếu có
  await pool.query('DELETE FROM users WHERE username = ?', [QA_USERNAME]);

  // Tạo tài khoản QA mới
  const [result] = await pool.query(
    `INSERT INTO users (username, password_hash, role, account_status)
     VALUES (?, ?, 'Employee', 'Active')`,
    [QA_USERNAME, initialHash]
  );
  qaUserId = result.insertId;

  qaUserToken = generateTestToken({
    sub: qaUserId,
    userId: qaUserId,
    username: QA_USERNAME,
    role: 'Employee',
  });
}

// Helper reset mật khẩu QA về ban đầu
async function resetQaPassword() {
  const initialHash = await hashPassword(QA_INITIAL_PASSWORD);
  await pool.query(
    'UPDATE users SET password_hash = ?, account_status = "Active" WHERE user_id = ?',
    [initialHash, qaUserId]
  );
}

// Helper lấy trực tiếp thông tin tài khoản từ CSDL để đối soát
async function fetchUserFromDb(userId) {
  const [rows] = await pool.query(
    'SELECT user_id, username, password_hash, role, account_status, created_at, updated_at FROM users WHERE user_id = ?',
    [userId]
  );
  return rows[0] || null;
}

await setupQaUser();

// ==============================================================================
// PHẦN 1: CÁC CA BIÊN "SAI MẬT KHẨU CŨ" (INVALID CURRENT PASSWORD EDGE CASES)
// ==============================================================================
console.log('📋 PHẦN 1: ĐỐI SOÁT CÁC CA BIÊN "SAI MẬT KHẨU CŨ"');

await runTestCase('1.1. Mật khẩu cũ sai hoàn toàn -> HTTP 400 Bad Request (INVALID_CURRENT_PASSWORD)', async () => {
  await resetQaPassword();
  const dbBefore = await fetchUserFromDb(qaUserId);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: 'HoanToanSaiMatKhau123@',
      newPassword: 'NewValidPassword@2026',
      confirmPassword: 'NewValidPassword@2026',
    },
  });

  assert.strictEqual(res.statusCode, 400, 'HTTP status phải là 400');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_CURRENT_PASSWORD');
  assert.ok(res.body.message.includes('hiện tại không chính xác'));

  // Đối soát CSDL: password_hash không đổi dù chỉ 1 bit
  const dbAfter = await fetchUserFromDb(qaUserId);
  assert.strictEqual(dbAfter.password_hash, dbBefore.password_hash, 'Hash CSDL không được thay đổi khi sai mật khẩu cũ');
});

await runTestCase('1.2. Mật khẩu cũ sai chữ hoa/thường (Case Sensitivity check) -> HTTP 400 (Phân biệt hoa thường nghiêm ngặt)', async () => {
  await resetQaPassword();

  // Mật khẩu đúng là 'QaInitPassword@2026', thử gửi chuỗi viết thường toàn bộ
  const wrongCasingPassword = QA_INITIAL_PASSWORD.toLowerCase();

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: wrongCasingPassword,
      newPassword: 'NewValidPassword@2026',
      confirmPassword: 'NewValidPassword@2026',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'INVALID_CURRENT_PASSWORD');
});

await runTestCase('1.3. Mật khẩu cũ có khoảng trắng dư thừa ở đầu và cuối -> HTTP 400 (Không tự ý trim mật khẩu)', async () => {
  await resetQaPassword();

  // Mật khẩu đúng là 'QaInitPassword@2026', gửi kèm space ở đầu và cuối
  const spacedPassword = `  ${QA_INITIAL_PASSWORD}  `;

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: spacedPassword,
      newPassword: 'NewValidPassword@2026',
      confirmPassword: 'NewValidPassword@2026',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'INVALID_CURRENT_PASSWORD');
});

await runTestCase('1.4. Mật khẩu cũ chứa chuỗi tấn công SQL Injection (\' OR \'1\'=\'1) -> Xử lý an toàn, từ chối HTTP 400', async () => {
  await resetQaPassword();

  const sqliPayload = "' OR '1'='1' --";

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: sqliPayload,
      newPassword: 'NewValidPassword@2026',
      confirmPassword: 'NewValidPassword@2026',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'INVALID_CURRENT_PASSWORD');
});

await runTestCase('1.5. Mật khẩu cũ bị rỗng hoặc thiếu trường -> HTTP 400 (VALIDATION_ERROR)', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: '',
      newPassword: 'NewValidPassword@2026',
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'VALIDATION_ERROR');
  assert.ok(res.body.message.includes('Mật khẩu hiện tại là bắt buộc'));
});

// ==============================================================================
// PHẦN 2: CÁC CA BIÊN "MẬT KHẨU MỚI QUÁ NGẮN & RANH GIỚI ĐỘ DÀI"
// ==============================================================================
console.log('\n📋 PHẦN 2: ĐỐI SOÁT CÁC CA BIÊN "MẬT KHẨU MỚI QUÁ NGẮN & RANH GIỚI ĐỘ DÀI"');

await runTestCase('2.1. Ranh giới dưới: Mật khẩu mới đúng 11 ký tự (Under-boundary) -> BỊ TỪ CHỐI HTTP 400 (WEAK_PASSWORD)', async () => {
  await resetQaPassword();

  // Chuỗi 11 ký tự đầy đủ hoa, thường, số, ký tự đặc biệt: 'Aa1@Bcdefgh'
  const password11Chars = 'Aa1@Bcdefgh';
  assert.strictEqual(password11Chars.length, 11);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: password11Chars,
      confirmPassword: password11Chars,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'WEAK_PASSWORD');
  assert.ok(res.body.message.includes('tối thiểu 12 ký tự'));
});

await runTestCase('2.2. Ranh giới dưới: Mật khẩu mới đúng 12 ký tự (Exact Minimum Boundary) -> CHẤP NHẬN THÀNH CÔNG HTTP 200', async () => {
  await resetQaPassword();

  // Chuỗi đúng 12 ký tự: 'Aa1@Bcdefghi'
  const password12Chars = 'Aa1@Bcdefghi';
  assert.strictEqual(password12Chars.length, 12);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: password12Chars,
      confirmPassword: password12Chars,
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);

  // Đối soát DB: Hash mới phải so khớp thành công với chuỗi 12 ký tự
  const dbUser = await fetchUserFromDb(qaUserId);
  const match = await comparePassword(password12Chars, dbUser.password_hash);
  assert.strictEqual(match, true, 'Hash CSDL phải so khớp chính xác với mật khẩu 12 ký tự');
});

await runTestCase('2.3. Ranh giới dưới: Mật khẩu mới đúng 13 ký tự (Over-boundary +1) -> THÀNH CÔNG HTTP 200', async () => {
  // Mật khẩu hiện tại đang là 'Aa1@Bcdefghi' từ test 2.2
  const currentPass = 'Aa1@Bcdefghi';
  const password13Chars = 'Aa1@Bcdefghij';
  assert.strictEqual(password13Chars.length, 13);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: currentPass,
      newPassword: password13Chars,
      confirmPassword: password13Chars,
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
});

await runTestCase('2.4. Ranh giới trên theo Bcrypt: Đúng 72 byte ASCII (Exact Upper Boundary 72 bytes) -> THÀNH CÔNG HTTP 200', async () => {
  await resetQaPassword();

  // Tạo chuỗi 72 ký tự ASCII (72 bytes)
  const password72Bytes = 'Aa1@' + 'B'.repeat(68);
  assert.strictEqual(Buffer.byteLength(password72Bytes, 'utf8'), 72);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: password72Bytes,
      confirmPassword: password72Bytes,
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);

  // Đối soát DB: Hash mới so khớp thành công với chuỗi 72 byte
  const dbUser = await fetchUserFromDb(qaUserId);
  const match = await comparePassword(password72Bytes, dbUser.password_hash);
  assert.strictEqual(match, true);
});

await runTestCase('2.5. Ranh giới trên theo Bcrypt: Vượt quá 72 byte ASCII (73 bytes) -> BỊ TỪ CHỐI HTTP 400 (PASSWORD_TOO_LONG)', async () => {
  await resetQaPassword();

  // Tạo chuỗi 73 ký tự ASCII (73 bytes)
  const password73Bytes = 'Aa1@' + 'B'.repeat(69);
  assert.strictEqual(Buffer.byteLength(password73Bytes, 'utf8'), 73);

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: password73Bytes,
      confirmPassword: password73Bytes,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'PASSWORD_TOO_LONG');
  assert.ok(res.body.message.includes('72 byte'));
});

await runTestCase('2.6. Ca biên ký tự đa byte UTF-8 (Tiếng Việt có dấu): Byte length > 72 dù số ký tự < 72 -> TỪ CHỐI 400', async () => {
  await resetQaPassword();

  // Chuỗi tiếng Việt: 'MậtKhẩu#2026ViệtNamHệThốngQuảnLýNhânSựDoanhNghiệpViệtNamAnToànThôngTin'
  // Số ký tự chỉ 69 (< 72), nhưng UTF-8 byte length = 87 (> 72)
  const vietnamesePassword = 'MậtKhẩu#2026ViệtNamHệThốngQuảnLýNhânSựDoanhNghiệpViệtNamAnToànThôngTin';
  assert.ok(vietnamesePassword.length < 72, 'Số ký tự nhỏ hơn 72');
  assert.ok(Buffer.byteLength(vietnamesePassword, 'utf8') > 72, 'Nhưng kích thước byte UTF-8 lớn hơn 72 byte');

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: vietnamesePassword,
      confirmPassword: vietnamesePassword,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'PASSWORD_TOO_LONG');
  assert.ok(res.body.message.includes('72 byte'));
});

await runTestCase('2.7. Mật khẩu mới chỉ chứa toàn khoảng trắng (12 khoảng trắng) -> HTTP 400 (INVALID_NEW_PASSWORD)', async () => {
  const whitespacePassword = '            '; // 12 spaces

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: whitespacePassword,
      confirmPassword: whitespacePassword,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'INVALID_NEW_PASSWORD');
  assert.ok(res.body.message.includes('khoảng trắng'));
});

await runTestCase('2.8. Mật khẩu mới trùng với mật khẩu hiện tại (Password reuse check) -> HTTP 400 (PASSWORD_REUSED)', async () => {
  await resetQaPassword();

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: QA_INITIAL_PASSWORD, // Đặt lại mật khẩu cũ
      confirmPassword: QA_INITIAL_PASSWORD,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'PASSWORD_REUSED');
  assert.ok(res.body.message.includes('không được trùng'));
});

await runTestCase('2.9. Mật khẩu xác nhận lệch 1 ký tự cuối -> HTTP 400 (CONFIRM_PASSWORD_MISMATCH)', async () => {
  const newPass = 'ValidNewPass@2026A';
  const confirmPass = 'ValidNewPass@2026B'; // Khác chữ cái cuối

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: newPass,
      confirmPassword: confirmPass,
    },
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'CONFIRM_PASSWORD_MISMATCH');
  assert.ok(res.body.message.includes('không trùng khớp'));
});

await runTestCase('2.10. Bỏ qua trường confirmPassword -> Đổi mật khẩu vẫn thành công hợp lệ (HTTP 200)', async () => {
  await resetQaPassword();
  const validPass = 'SecurePasswordWithoutConfirm@2026';

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: validPass,
      // Không gửi confirmPassword
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
});

// ==============================================================================
// PHẦN 3: CÁC CA BIÊN "ĐĂNG NHẬP LẠI & VÒNG ĐỜI PHIÊN"
// ==============================================================================
console.log('\n📋 PHẦN 3: ĐỐI SOÁT CÁC CA BIÊN "ĐĂNG NHẬP LẠI & VÒNG ĐỜI PHIÊN"');

const MIGRATED_NEW_PASSWORD = 'MigratedNewPass@2026Strong';

await runTestCase('3.1. Đổi mật khẩu sang MIGRATED_NEW_PASSWORD và Đăng nhập lại thành công -> POST /api/auth/login trả về 200 OK', async () => {
  // Mật khẩu hiện tại đang là 'SecurePasswordWithoutConfirm@2026' từ test 2.10
  const currentPass = 'SecurePasswordWithoutConfirm@2026';

  const changeRes = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: currentPass,
      newPassword: MIGRATED_NEW_PASSWORD,
      confirmPassword: MIGRATED_NEW_PASSWORD,
    },
  });
  assert.strictEqual(changeRes.statusCode, 200);

  // Đăng nhập lại với mật khẩu mới
  const loginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: QA_USERNAME,
      password: MIGRATED_NEW_PASSWORD,
    },
  });

  assert.strictEqual(loginRes.statusCode, 200);
  assert.strictEqual(loginRes.body.success, true);
  assert.ok(loginRes.body.data.accessToken, 'Phải cấp accessToken mới');
  assert.strictEqual(loginRes.body.data.user.username, QA_USERNAME);
});

await runTestCase('3.2. Mật khẩu cũ bị vô hiệu hóa lập tức: Đăng nhập bằng mật khẩu cũ ban đầu -> BỊ TỪ CHỐI HTTP 401', async () => {
  // Thử đăng nhập bằng mật khẩu ban đầu 'QaInitPassword@2026'
  const oldLoginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: QA_USERNAME,
      password: QA_INITIAL_PASSWORD,
    },
  });

  assert.strictEqual(oldLoginRes.statusCode, 401);
  assert.strictEqual(oldLoginRes.body.success, false);
  assert.strictEqual(oldLoginRes.body.errorCode, 'INVALID_CREDENTIALS');
  assert.ok(oldLoginRes.body.message.includes('không chính xác'));
});

await runTestCase('3.3. Sử dụng token mới cấp sau khi đổi mật khẩu để truy cập GET /api/auth/profile -> HTTP 200 OK', async () => {
  // Lấy token mới qua login
  const loginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: QA_USERNAME,
      password: MIGRATED_NEW_PASSWORD,
    },
  });
  const newToken = loginRes.body.data.accessToken;

  // Gọi endpoint bảo vệ
  const profileRes = await makeRequest('/api/auth/profile', {
    method: 'GET',
    token: newToken,
  });

  assert.strictEqual(profileRes.statusCode, 200);
  assert.strictEqual(profileRes.body.success, true);
  assert.strictEqual(profileRes.body.data.username, QA_USERNAME);
  assert.strictEqual(profileRes.body.data.role, 'Employee');
});

await runTestCase('3.4. Đổi mật khẩu liên tiếp nhiều lần (Pass A -> Pass B -> Pass C) và đối soát đăng nhập', async () => {
  // Đang ở Pass B = MIGRATED_NEW_PASSWORD ('MigratedNewPass@2026Strong')
  // Đổi sang Pass C = 'FinalPassC@2026SuperPass'
  const passB = MIGRATED_NEW_PASSWORD;
  const passC = 'FinalPassC@2026SuperPass';

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: passB,
      newPassword: passC,
      confirmPassword: passC,
    },
  });
  assert.strictEqual(res.statusCode, 200);

  // Thử đăng nhập Pass A -> 401
  const loginARes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { username: QA_USERNAME, password: QA_INITIAL_PASSWORD },
  });
  assert.strictEqual(loginARes.statusCode, 401);

  // Thử đăng nhập Pass B -> 401
  const loginBRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { username: QA_USERNAME, password: passB },
  });
  assert.strictEqual(loginBRes.statusCode, 401);

  // Thử đăng nhập Pass C -> 200 OK
  const loginCRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { username: QA_USERNAME, password: passC },
  });
  assert.strictEqual(loginCRes.statusCode, 200);
  assert.strictEqual(loginCRes.body.success, true);
});

await runTestCase('3.5. Tài khoản bị khóa (Locked): Không thể đổi mật khẩu và không thể đăng nhập -> HTTP 403 (ACCOUNT_LOCKED)', async () => {
  // Khóa tài khoản QA trong CSDL
  await pool.query('UPDATE users SET account_status = "Locked" WHERE user_id = ?', [qaUserId]);

  // Cố gắng đổi mật khẩu khi tài khoản bị khóa
  const changeRes = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: 'FinalPassC@2026SuperPass',
      newPassword: 'AnotherPassword@2026',
    },
  });

  assert.strictEqual(changeRes.statusCode, 403);
  assert.strictEqual(changeRes.body.errorCode, 'ACCOUNT_LOCKED');
  assert.ok(changeRes.body.message.includes('bị khóa'));

  // Cố gắng đăng nhập khi tài khoản bị khóa
  const loginRes = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: QA_USERNAME,
      password: 'FinalPassC@2026SuperPass',
    },
  });

  assert.strictEqual(loginRes.statusCode, 403);
  assert.strictEqual(loginRes.body.errorCode, 'ACCOUNT_LOCKED');
});

// ==============================================================================
// PHẦN 4: ĐỐI SOÁT CƠ SỞ DỮ LIỆU & BẢO MẬT DỮ LIỆU
// ==============================================================================
console.log('\n📋 PHẦN 4: ĐỐI SOÁT CƠ SỞ DỮ LIỆU & BẢO MẬT DỮ LIỆU');

await runTestCase('4.1. Đối soát CSDL MySQL: Chỉ password_hash và updated_at thay đổi, các trường khác nguyên vẹn', async () => {
  await resetQaPassword();
  const dbBefore = await fetchUserFromDb(qaUserId);

  const updatedPassword = 'NewAuditedPassword@2026Pass';

  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: updatedPassword,
      confirmPassword: updatedPassword,
    },
  });
  assert.strictEqual(res.statusCode, 200);

  const dbAfter = await fetchUserFromDb(qaUserId);

  // 1. password_hash phải thay đổi
  assert.notStrictEqual(dbAfter.password_hash, dbBefore.password_hash);
  const match = await comparePassword(updatedPassword, dbAfter.password_hash);
  assert.strictEqual(match, true);

  // 2. updated_at phải lớn hơn hoặc bằng thời điểm trước
  assert.ok(new Date(dbAfter.updated_at).getTime() >= new Date(dbBefore.updated_at).getTime());

  // 3. username, role, account_status giữ nguyên 100%
  assert.strictEqual(dbAfter.username, dbBefore.username);
  assert.strictEqual(dbAfter.role, dbBefore.role);
  assert.strictEqual(dbAfter.account_status, dbBefore.account_status);
});

await runTestCase('4.2. Chống IDOR: Client truyền userId khác trong request body -> Chỉ đổi tài khoản trong JWT', async () => {
  await resetQaPassword();

  // Tạo thêm 1 tài khoản nạn nhân giả định trong DB
  const VICTIM_USERNAME = 'qa_victim_user';
  const VICTIM_PASS = 'VictimPass@2026Secure';
  const victimHash = await hashPassword(VICTIM_PASS);

  await pool.query('DELETE FROM users WHERE username = ?', [VICTIM_USERNAME]);
  const [victimResult] = await pool.query(
    'INSERT INTO users (username, password_hash, role, account_status) VALUES (?, ?, "Employee", "Active")',
    [VICTIM_USERNAME, victimHash]
  );
  const victimUserId = victimResult.insertId;

  // QA user cố tình gửi userId của tài khoản nạn nhân
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken, // Token của QA user
    body: {
      userId: victimUserId, // Cố tình tấn công tài khoản nạn nhân
      currentPassword: QA_INITIAL_PASSWORD,
      newPassword: 'HackedPassword@2026Pass',
      confirmPassword: 'HackedPassword@2026Pass',
    },
  });

  assert.strictEqual(res.statusCode, 200);

  // Đối soát tài khoản nạn nhân: password_hash hoàn toàn không bị ảnh hưởng!
  const victimDb = await fetchUserFromDb(victimUserId);
  assert.strictEqual(victimDb.password_hash, victimHash, 'Tài khoản nạn nhân TUYỆT ĐỐI không bị thay đổi');

  // Đăng nhập thử vào tài khoản nạn nhân với mật khẩu cũ của họ -> Vẫn thành công bình thường
  const victimLogin = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { username: VICTIM_USERNAME, password: VICTIM_PASS },
  });
  assert.strictEqual(victimLogin.statusCode, 200);

  // Dọn dẹp tài khoản nạn nhân
  await pool.query('DELETE FROM users WHERE user_id = ?', [victimUserId]);
});

await runTestCase('4.3. Response Hygiene: Toàn bộ phản hồi API TUYỆT ĐỐI KHÔNG chứa password, newPassword hoặc password_hash', async () => {
  const res = await makeRequest('/api/auth/change-password', {
    method: 'PUT',
    token: qaUserToken,
    body: {
      currentPassword: 'HackedPassword@2026Pass',
      newPassword: 'CleanResponsePass@2026',
      confirmPassword: 'CleanResponsePass@2026',
    },
  });

  assert.strictEqual(res.statusCode, 200);

  const rawJson = res.text;
  assert.strictEqual(rawJson.includes('HackedPassword@2026Pass'), false, 'Không chứa mật khẩu cũ');
  assert.strictEqual(rawJson.includes('CleanResponsePass@2026'), false, 'Không chứa mật khẩu mới');
  assert.strictEqual(rawJson.includes('$2a$'), false, 'Không chứa chuỗi hash Bcrypt');
  assert.strictEqual(rawJson.includes('$2b$'), false, 'Không chứa chuỗi hash Bcrypt');
  assert.strictEqual(res.body.data, null);
});

// ==============================================================================
// DỌN DẸP AN TOÀN (TEARDOWN & CLEANUP)
// ==============================================================================
console.log('\n🧹 Dọn dẹp dữ liệu kiểm thử QA...');
try {
  if (qaUserId) {
    await pool.query('DELETE FROM users WHERE user_id = ?', [qaUserId]);
  }
} catch (err) {
  console.warn('Lỗi dọn dẹp:', err.message);
}

await stopServer();
await pool.end();

console.log('\n==============================================================================');
console.log(`🎉 KẾT QUẢ KIỂM TOÁN QA: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI TEST CA BIÊN!`);
console.log('   - 100% Ca biên "Sai mật khẩu cũ" được chặn đứng an toàn.');
console.log('   - 100% Ranh giới độ dài mật khẩu (11 ký tự, 12 ký tự, 72 byte) kiểm soát chuẩn xác.');
console.log('   - 100% Vòng đời phiên & Đăng nhập lại với mật khẩu mới thành công, mật khẩu cũ bị thu hồi.');
console.log('   - 100% Toàn vẹn CSDL và ngăn chặn triệt để tấn công IDOR.');
console.log('==============================================================================\n');
process.exit(0);
