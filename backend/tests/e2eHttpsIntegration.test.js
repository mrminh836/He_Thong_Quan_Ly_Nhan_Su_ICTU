/**
 * ==============================================================================
 * BỘ KIỂM THỬ TÍCH HỢP ĐẦU CUỐI (E2E INTEGRATION TEST SUITE) QUA HTTPS
 * HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
 * ==============================================================================
 * Phạm vi kiểm thử:
 * 1. Hạ tầng Reverse Proxy Nginx & Chứng chỉ X.509 SSL (hrm.local:443)
 * 2. Toàn bộ Security Headers bắt buộc & nâng cao (Lab 1 & Lab 5)
 * 3. Luồng Xác thực & Đăng nhập (Auth, JWT, RBAC: Admin, HR, Employee)
 * 4. Luồng CRUD Nhân sự & Bảo mật mã hóa AES-256 số CCCD
 * 5. Luồng Chấm công (Check-in, Check-out, Today Board, Phân quyền RBAC)
 * 6. Frontend SPA Routing & Fallback qua HTTPS
 * ==============================================================================
 */

import assert from 'node:assert';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidatePaths = [
  path.resolve(__dirname, '../../certs/hrm.local.crt'),
  path.resolve(__dirname, '../certs/hrm.local.crt'),
  '/usr/src/app/certs/hrm.local.crt',
  '/usr/src/certs/hrm.local.crt',
  '/certs/hrm.local.crt'
];
const certPath = candidatePaths.find(p => fs.existsSync(p));

if (!certPath) {
  console.error(`❌ Không tìm thấy chứng chỉ SSL tại bất kỳ đường dẫn nào: ${candidatePaths.join(', ')}`);
  process.exit(1);
}

const caCert = fs.readFileSync(certPath);

const isDocker = process.env.DB_HOST === 'mysql-db';
const NGINX_HOST = process.env.NGINX_HOST || (isDocker ? 'hrm-nginx' : '127.0.0.1');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết lỗi: ${err.message}`);
    if (err.stack && process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exitCode = 1;
  }
}

const testRunClientIp = `10.99.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;

/**
 * Thực thi HTTP request qua TLS / HTTPS trực tiếp tới Reverse Proxy Nginx
 * Xác thực nghiêm ngặt chứng chỉ số tự ký X.509 (rejectUnauthorized: true với CA cert)
 */
function requestHttps({ path: reqPath, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    let postData = null;
    const reqHeaders = {
      Host: 'hrm.local',
      'X-Forwarded-For': testRunClientIp,
      'x-e2e-test-key': 'hrm-e2e-internal-test',
      ...headers,
    };

    if (body) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      host: NGINX_HOST,
      port: 443,
      servername: 'hrm.local',
      path: reqPath,
      method,
      headers: reqHeaders,
      ca: caCert,
      rejectUnauthorized: true, // Bắt buộc xác minh đúng chứng chỉ số của hrm.local
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          rawBody: rawData,
          body: json,
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Thực thi HTTP request (Cổng 80) để kiểm tra chuyển hướng 301
 */
function requestHttp({ path: reqPath = '/', headers = {} }) {
  return new Promise((resolve, reject) => {
    const options = {
      host: NGINX_HOST,
      port: 80,
      path: reqPath,
      method: 'GET',
      headers: {
        Host: 'hrm.local',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Kiểm tra bộ Security Headers chuẩn DevSecOps trên response
 */
function assertSecurityHeaders(headers, { checkCSP = false } = {}) {
  assert.strictEqual(
    headers['x-frame-options']?.toUpperCase(),
    'SAMEORIGIN',
    'Thiếu hoặc sai header X-Frame-Options: SAMEORIGIN'
  );
  assert.strictEqual(
    headers['x-content-type-options'],
    'nosniff',
    'Thiếu hoặc sai header X-Content-Type-Options: nosniff'
  );
  assert.strictEqual(
    headers['referrer-policy'],
    'strict-origin-when-cross-origin',
    'Thiếu hoặc sai header Referrer-Policy'
  );
  assert.strictEqual(
    headers['permissions-policy'],
    'camera=(), microphone=(), geolocation=()',
    'Thiếu hoặc sai header Permissions-Policy'
  );
  assert.strictEqual(
    headers['x-xss-protection'],
    '1; mode=block',
    'Thiếu hoặc sai header X-XSS-Protection: 1; mode=block'
  );
  assert.strictEqual(
    headers['x-permitted-cross-domain-policies'],
    'none',
    'Thiếu hoặc sai header X-Permitted-Cross-Domain-Policies: none'
  );
  assert.strictEqual(
    headers['x-powered-by'],
    undefined,
    'Lỗi bảo mật: Bị rò rỉ header X-Powered-By'
  );

  if (checkCSP) {
    assert.ok(
      headers['content-security-policy'],
      'Thiếu header Content-Security-Policy cho Frontend'
    );
    assert.ok(
      headers['content-security-policy'].includes("default-src 'self'"),
      'CSP phải có default-src self'
    );
  }
}

// ==============================================================================
// KHỞI CHẠY BỘ KIỂM THỬ E2E
// ==============================================================================
console.log('\n======================================================================');
console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TÍCH HỢP ĐẦU CUỐI E2E QUA HTTPS (HRM-135)');
console.log('======================================================================\n');

// Khởi tạo kết nối DB để dọn dẹp dữ liệu kiểm thử
let dbConn = null;
try {
  dbConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
  });
} catch (dbErr) {
  console.warn(`⚠️ Cảnh báo kết nối DB trực tiếp: ${dbErr.message}`);
}

// Biến lưu giữ token giữa các bước kiểm thử
let adminToken = '';
let hrToken = '';
let empToken = '';
let testEmployeeId = null;
const uniqueSuffix = Date.now().toString().slice(-6);
const testEmployeeCode = `NV-E2E-${uniqueSuffix}`;
const testEmployeeEmail = `test.e2e.${uniqueSuffix}@hrm.local`;
const testEmployeeSsn = `038204${uniqueSuffix}`;

try {
  // ----------------------------------------------------------------------------
  // NHÓM 1: HẠ TẦNG REVERSE PROXY NGINX, HTTPS & SECURITY HEADERS
  // ----------------------------------------------------------------------------
  console.log('--- NHÓM 1: HẠ TẦNG HTTPS, X.509 CERTIFICATE & SECURITY HEADERS ---');

  await test('Test 1.1: Bắt tay TLS/HTTPS thành công với chứng chỉ X.509 tự ký (certs/hrm.local.crt)', async () => {
    const res = await requestHttps({ path: '/api/health' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.status, 'success');
    assert.strictEqual(res.body?.data?.status, 'UP');
  });

  await test('Test 1.2: Toàn bộ Security Headers xuất hiện trên API HTTPS response', async () => {
    const res = await requestHttps({ path: '/api/health' });
    assertSecurityHeaders(res.headers);
  });

  await test('Test 1.3: Trang chủ Frontend SPA phản hồi 200 OK kèm đầy đủ Security Headers và CSP', async () => {
    const res = await requestHttps({ path: '/' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.rawBody.includes('<div id="app"></div>'), 'Phải chứa thẻ mount SPA');
    assertSecurityHeaders(res.headers, { checkCSP: true });
  });

  await test('Test 1.4: Phản hồi lỗi 404 (Route API không tồn tại) vẫn bảo toàn đầy đủ Security Headers', async () => {
    const res = await requestHttps({ path: '/api/non-existent-route-404' });
    assert.strictEqual(res.statusCode, 404);
    assertSecurityHeaders(res.headers);
  });

  await test('Test 1.5: Truy cập file nhạy cảm (.env/.key) bị Nginx chặn 404 với đầy đủ Security Headers', async () => {
    const res = await requestHttps({ path: '/secret.env' });
    assert.strictEqual(res.statusCode, 404);
    assertSecurityHeaders(res.headers);
  });

  await test('Test 1.6: HTTP port 80 tự động chuyển hướng 301 Moved Permanently sang HTTPS', async () => {
    const res = await requestHttp({ path: '/api/health' });
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.headers['location'], 'https://hrm.local/api/health');
    assert.strictEqual(res.headers['x-frame-options']?.toUpperCase(), 'SAMEORIGIN');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  });

  // ----------------------------------------------------------------------------
  // NHÓM 2: E2E LUỒNG XÁC THỰC & ĐĂNG NHẬP (AUTHENTICATION & JWT)
  // ----------------------------------------------------------------------------
  console.log('\n--- NHÓM 2: E2E LUỒNG XÁC THỰC & ĐĂNG NHẬP (AUTHENTICATION & JWT) ---');

  await test('Test 2.1: Đăng nhập với mật khẩu sai -> Trả về 401 Unauthorized', async () => {
    const res = await requestHttps({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin', password: 'WrongPassword@999' },
    });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body?.success, false);
    assert.strictEqual(res.body?.errorCode, 'INVALID_CREDENTIALS');
  });

  await test('Test 2.2: Đăng nhập với username không tồn tại -> Trả về 401 Unauthorized', async () => {
    const res = await requestHttps({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'non_existent_user', password: 'AnyPassword@123' },
    });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body?.success, false);
    assert.strictEqual(res.body?.errorCode, 'INVALID_CREDENTIALS');
  });

  await test('Test 2.3: Đăng nhập thiếu username hoặc password -> Trả về 400 Bad Request', async () => {
    const res = await requestHttps({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin' },
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body?.success, false);
    assert.strictEqual(res.body?.errorCode, 'VALIDATION_ERROR');
  });

  await test('Test 2.4: Đăng nhập thành công tài khoản ADMIN (admin / Admin@123) qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'admin', password: 'Admin@123' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.ok(res.body?.data?.accessToken, 'Phải cấp accessToken');
    assert.strictEqual(res.body?.data?.user?.username, 'admin');
    assert.strictEqual(res.body?.data?.user?.role, 'Admin');
    assert.strictEqual(res.body?.data?.user?.password, undefined, 'Tuyệt đối không lộ password');
    assert.strictEqual(res.body?.data?.user?.password_hash, undefined, 'Tuyệt đối không lộ password_hash');
    adminToken = res.body.data.accessToken;
  });

  await test('Test 2.5: Lấy thông tin hồ sơ cá nhân (GET /api/auth/profile) với Bearer Token', async () => {
    const res = await requestHttps({
      path: '/api/auth/profile',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.data?.username, 'admin');
    assert.strictEqual(res.body?.data?.role, 'Admin');
  });

  await test('Test 2.6: Đăng nhập thành công tài khoản HR (hr / Hr@123) qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'hr', password: 'Hr@123' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.data?.user?.role, 'HR');
    hrToken = res.body.data.accessToken;
  });

  await test('Test 2.7: Đăng nhập thành công tài khoản EMPLOYEE (emp1 / Emp@123) qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/auth/login',
      method: 'POST',
      body: { username: 'emp1', password: 'Emp@123' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.data?.user?.role, 'Employee');
    empToken = res.body.data.accessToken;
  });

  await test('Test 2.8: Truy cập API cần bảo vệ bằng Token giả mạo -> 401 Unauthorized', async () => {
    const res = await requestHttps({
      path: '/api/auth/profile',
      headers: { Authorization: 'Bearer fake.invalid.jwt_token' },
    });
    assert.strictEqual(res.statusCode, 401);
  });

  // ----------------------------------------------------------------------------
  // NHÓM 3: E2E LUỒNG CRUD NHÂN SỰ & BẢO MẬT DỮ LIỆU CCCD
  // ----------------------------------------------------------------------------
  console.log('\n--- NHÓM 3: E2E LUỒNG CRUD NHÂN SỰ & MÃ HÓA AES-256 CCCD ---');

  await test('Test 3.1 [RBAC]: Nhân viên thường (EMPLOYEE) bị chặn xem danh sách nhân sự -> 403 Forbidden', async () => {
    const res = await requestHttps({
      path: '/api/employees',
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body?.errorCode, 'FORBIDDEN');
  });

  await test('Test 3.2 [RBAC]: Nhân viên thường (EMPLOYEE) bị chặn tạo mới nhân sự -> 403 Forbidden', async () => {
    const res = await requestHttps({
      path: '/api/employees',
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` },
      body: {
        employeeCode: testEmployeeCode,
        fullName: 'Hacker Test',
        email: testEmployeeEmail,
        departmentId: 1,
        ssn: testEmployeeSsn,
      },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  await test('Test 3.3 [Read List]: Quản trị viên (ADMIN) lấy danh sách nhân viên phân trang qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/employees?page=1&limit=5',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.ok(Array.isArray(res.body?.data), 'data phải là một mảng nhân viên');
    assert.ok(res.body?.pagination?.total >= 5, 'Phải có ít nhất 5 nhân sự mẫu');
    assert.strictEqual(res.body?.pagination?.page, 1);
    assert.strictEqual(res.body?.pagination?.limit, 5);
  });

  await test('Test 3.4 [Privacy Audit]: Danh sách nhân viên tuyệt đối KHÔNG lộ số CCCD rõ hoặc ciphertext', async () => {
    const res = await requestHttps({
      path: '/api/employees?page=1&limit=10',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    for (const emp of res.body.data) {
      assert.strictEqual(emp.ssn, undefined, 'Không được trả trường ssn trong danh sách');
      assert.strictEqual(emp.ssn_encrypted, undefined, 'Không được trả trường ssn_encrypted');
      assert.strictEqual(emp.ssn_hash, undefined, 'Không được trả trường ssn_hash');
      if (emp.ssnMasked) {
        assert.ok(emp.ssnMasked.includes('******'), 'CCCD hiển thị phải được che mờ');
      }
    }
  });

  await test('Test 3.5 [Filter & Search]: Lọc theo phòng ban và tìm kiếm nhân viên qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/employees?departmentId=1&search=Minh',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.data.length >= 1, 'Phải tìm thấy nhân viên Đỗ Quang Minh');
    assert.strictEqual(res.body.data[0].employeeCode, 'NV001');
  });

  await test('Test 3.6 [Validation]: Thêm nhân viên với số CCCD không hợp lệ -> 400 Bad Request', async () => {
    const res = await requestHttps({
      path: '/api/employees',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeCode: testEmployeeCode,
        fullName: 'Nguyễn Văn Lỗi',
        email: testEmployeeEmail,
        departmentId: 1,
        ssn: '12345ABC', // CCCD chứa chữ cái
      },
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body?.errorCode, 'VALIDATION_ERROR');
  });

  await test('Test 3.7 [Create Success]: Quản trị viên thêm mới nhân viên hoàn chỉnh qua HTTPS (Mã hóa AES-256)', async () => {
    const res = await requestHttps({
      path: '/api/employees',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeCode: testEmployeeCode,
        fullName: 'Lê Hoàng Nam (E2E Test)',
        email: testEmployeeEmail,
        phone: '0912345678',
        gender: 'Male',
        departmentId: 1,
        position: 'QA Automation Engineer',
        baseSalary: 19500000,
        ssn: testEmployeeSsn,
      },
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.data?.employeeCode, testEmployeeCode);
    assert.strictEqual(res.body?.data?.ssn, undefined, 'Response tạo mới không trả số CCCD rõ');
    assert.ok(res.body?.data?.employeeId, 'Phải sinh employeeId');
    testEmployeeId = res.body.data.employeeId;
  });

  await test('Test 3.8 [Integrity]: Chặn tạo nhân viên trùng mã NV hoặc trùng số CCCD -> 409 Conflict', async () => {
    // Thử trùng mã NV
    const resDupCode = await requestHttps({
      path: '/api/employees',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeCode: testEmployeeCode, // Trùng mã
        fullName: 'Người Trùng Mã',
        email: `other.${uniqueSuffix}@hrm.local`,
        departmentId: 1,
        ssn: '038204111222',
      },
    });
    assert.strictEqual(resDupCode.statusCode, 409);
    assert.strictEqual(resDupCode.body?.errorCode, 'DUPLICATE_EMPLOYEE_CODE');

    // Thử trùng số CCCD
    const resDupSsn = await requestHttps({
      path: '/api/employees',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        employeeCode: `NV-DIFF-${uniqueSuffix}`,
        fullName: 'Người Trùng CCCD',
        email: `diff.${uniqueSuffix}@hrm.local`,
        departmentId: 1,
        ssn: testEmployeeSsn, // Trùng CCCD
      },
    });
    assert.strictEqual(resDupSsn.statusCode, 409);
    assert.strictEqual(resDupSsn.body?.errorCode, 'DUPLICATE_CCCD');
  });

  await test('Test 3.9 [Read Detail & Decryption]: Quản trị viên xem chi tiết nhân viên và giải mã chuẩn xác 100% CCCD', async () => {
    const res = await requestHttps({
      path: `/api/employees/${testEmployeeId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.success, true);
    assert.strictEqual(res.body?.data?.employeeCode, testEmployeeCode);
    assert.strictEqual(res.body?.data?.cccd, testEmployeeSsn, 'Số CCCD giải mã từ AES_DECRYPT phải khớp 100%');
  });

  await test('Test 3.10 [Detail RBAC]: Nhân viên thường (EMPLOYEE) bị chặn xem chi tiết nhân viên khác -> 403 Forbidden', async () => {
    const res = await requestHttps({
      path: `/api/employees/${testEmployeeId}`,
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.strictEqual(res.statusCode, 403);
  });

  // ----------------------------------------------------------------------------
  // NHÓM 4: E2E LUỒNG CHẤM CÔNG (ATTENDANCE) & PHÂN QUYỀN RBAC
  // ----------------------------------------------------------------------------
  console.log('\n--- NHÓM 4: E2E LUỒNG CHẤM CÔNG (CHECK-IN / CHECK-OUT / TODAY BOARD) ---');

  await test('Test 4.1 [RBAC]: Gọi API check-in khi chưa đăng nhập -> 401 Unauthorized', async () => {
    const res = await requestHttps({
      path: '/api/attendance/check-in',
      method: 'POST',
    });
    assert.strictEqual(res.statusCode, 401);
  });

  await test('Test 4.2 [Check-in Flow]: Nhân viên (emp1) thực hiện Check-in vào ca qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/attendance/check-in',
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` },
      body: { fakeEmployeeId: 9999, fakeTime: '00:00:00' }, // Kiểm tra chống giả mạo
    });

    // Nếu hôm nay chưa check-in -> 201 Created; Nếu đã có bản ghi -> 409 ALREADY_CHECKED_IN
    if (res.statusCode === 201) {
      assert.strictEqual(res.body?.success, true);
      assert.ok(res.body?.data?.checkInTime, 'Phải có giờ check-in');
      assert.ok(['ON_TIME', 'LATE'].includes(res.body?.data?.status), 'Trạng thái phải là ON_TIME hoặc LATE');
    } else {
      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body?.errorCode, 'ALREADY_CHECKED_IN');
    }
  });

  await test('Test 4.3 [Check-in Duplicate]: Thử Check-in lần thứ hai trong ngày -> 409 Conflict', async () => {
    const res = await requestHttps({
      path: '/api/attendance/check-in',
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body?.errorCode, 'ALREADY_CHECKED_IN');
  });

  await test('Test 4.4 [Check-out Flow]: Nhân viên (emp1) thực hiện Check-out tan ca qua HTTPS', async () => {
    const res = await requestHttps({
      path: '/api/attendance/check-out',
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` },
    });

    if (res.statusCode === 200) {
      assert.strictEqual(res.body?.success, true);
      assert.ok(res.body?.data?.checkOutTime, 'Phải có giờ check-out');
    } else {
      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body?.errorCode, 'ALREADY_CHECKED_OUT');
    }
  });

  await test('Test 4.5 [Check-out Duplicate]: Thử Check-out lần thứ hai trong ngày -> 409 Conflict', async () => {
    const res = await requestHttps({
      path: '/api/attendance/check-out',
      method: 'POST',
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body?.errorCode, 'ALREADY_CHECKED_OUT');
  });

  await test('Test 4.6 [Today Board - Employee]: Nhân viên chỉ xem bản ghi cá nhân, ẩn chỉ số công ty', async () => {
    const res = await requestHttps({
      path: '/api/attendance/today',
      headers: { Authorization: `Bearer ${empToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.summary, undefined, 'Nhân viên thường không được xem summary toàn công ty');
    if (res.body?.data) {
      assert.strictEqual(res.body.data.employeeId, 3, 'Chỉ xem bản ghi của chính emp1 (employeeId: 3)');
    }
  });

  await test('Test 4.7 [Today Board - Admin]: Quản trị viên xem bảng chấm công toàn công ty và thẻ KPI summary', async () => {
    const res = await requestHttps({
      path: '/api/attendance/today',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body?.data), 'Admin phải nhận mảng danh sách toàn công ty');
    assert.ok(res.body?.summary, 'Admin phải nhận khối summary thống kê KPI');
    assert.ok(typeof res.body.summary.totalEmployees === 'number');
    assert.ok(typeof res.body.summary.checkedIn === 'number');
    assert.ok(typeof res.body.summary.checkedOut === 'number');
    assert.ok(typeof res.body.summary.late === 'number');
  });

  // ----------------------------------------------------------------------------
  // NHÓM 5: FRONTEND SPA ROUTE FALLBACK QUA HTTPS
  // ----------------------------------------------------------------------------
  console.log('\n--- NHÓM 5: FRONTEND SPA ROUTING & FALLBACK QUA HTTPS ---');

  await test('Test 5.1: SPA Fallback cho các client-side routes (/employees, /attendances) trả về 200 OK', async () => {
    const resEmployees = await requestHttps({ path: '/employees' });
    assert.strictEqual(resEmployees.statusCode, 200);
    assert.ok(resEmployees.rawBody.includes('<div id="app"></div>'));

    const resAttendances = await requestHttps({ path: '/attendances' });
    assert.strictEqual(resAttendances.statusCode, 200);
    assert.ok(resAttendances.rawBody.includes('<div id="app"></div>'));
  });
} finally {
  // Dọn dẹp dữ liệu kiểm thử nhân viên tự động tạo trong DB
  if (dbConn) {
    try {
      if (testEmployeeId) {
        await dbConn.query('DELETE FROM attendances WHERE employee_id = ?', [testEmployeeId]);
        await dbConn.query('DELETE FROM employees WHERE employee_id = ?', [testEmployeeId]);
        console.log(`\n🧹 [CLEANUP] Đã dọn dẹp bản ghi kiểm thử Employee ID ${testEmployeeId} thành công.`);
      }
      await dbConn.end();
    } catch (cleanupErr) {
      console.warn(`⚠️ Lỗi dọn dẹp DB: ${cleanupErr.message}`);
    }
  }
}

console.log('\n======================================================================');
console.log(`🎉 TỔNG KẾT: ĐÃ HOÀN THÀNH ${passedTests}/${totalTests} BÀI KIỂM THỬ E2E QUA HTTPS!`);
console.log('======================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
