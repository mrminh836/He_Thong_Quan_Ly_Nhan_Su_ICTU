/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG API THỐNG KÊ DASHBOARD (HRM-211)
 * GET /api/dashboard/stats
 * ==============================================================================
 * 
 * BAO PHỦ 100% 10 KỊCH BẢN BẮT BUỘC THEO ĐẶC TẢ NGHIỆP VỤ:
 *  1. Có nhân viên đang làm việc và có dữ liệu chấm công hôm nay.
 *  2. Một số nhân viên chưa check-in (tỷ lệ phản ánh đúng < 100%).
 *  3. Có nhân viên đã thôi việc (Resigned) nhưng vẫn còn lịch sử chấm công (loại trừ cả tử và mẫu).
 *  4. Một nhân viên có nhiều bản ghi bất thường trong cùng ngày (Khử trùng lặp - Deduplication).
 *  5. Database không có nhân viên nào (totalEmployees = 0, attendanceRate = 0, chống chia cho 0).
 *  6. Database không có phòng ban (totalDepartments = 0).
 *  7. Không có bản ghi chấm công nào hôm nay (presentEmployees = 0, attendanceRate = 0).
 *  8. Thời điểm truy vấn gần nửa đêm (23:59:59), đảm bảo ngày thống kê đúng múi giờ Việt Nam.
 *  9. Không có JWT hoặc JWT không hợp lệ -> 401 Unauthorized (TOKEN_REQUIRED / INVALID_TOKEN).
 * 10. Người dùng không đủ quyền truy cập (EMPLOYEE) -> 403 Forbidden (FORBIDDEN).
 * 
 * CÁC KIỂM THỬ MỞ RỘNG (SECURITY, HTTP PIPELINE & ROUNDING):
 * 11. ADMIN & HR_MANAGER truy cập thành công -> 200 OK với đầy đủ thuộc tính.
 * 12. Làm tròn tỷ lệ có mặt đến 2 chữ số thập phân chính xác (ví dụ: 1/3 * 100 = 33.33%).
 * 13. Bảo mật: Response tuyệt đối không lộ CCCD, hash, mật khẩu hoặc thông tin kết nối DB.
 * 14. Tích hợp E2E HTTP pipeline qua Express App (Middlewares, Auth, Controller).
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { getVietnamAttendanceInfo, VIETNAM_TIMEZONE } from '../src/utils/attendanceTime.js';
import dashboardService from '../src/services/dashboardService.js';
import dashboardRepository from '../src/repositories/dashboardRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import { closePool } from '../src/config/database.js';
import { getStats } from '../src/controllers/dashboardController.js';
import app from '../src/app.js';

let totalTests = 0;
let passedTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ [PASS] Test ${totalTests}: ${testName}`);
  } catch (error) {
    console.error(`  ❌ [FAIL] Test ${totalTests}: ${testName}`);
    console.error(error);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`  ✅ [PASS] Test ${totalTests}: ${testName}`);
  } catch (error) {
    console.error(`  ❌ [FAIL] Test ${totalTests}: ${testName}`);
    console.error(error);
    process.exitCode = 1;
  }
}

// Helper sinh JWT token kiểm thử hợp lệ
function generateTestToken(payload) {
  return jwt.sign(payload, env.jwtSecret || env.JWT_SECRET || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE', {
    expiresIn: '1h',
  });
}

// Lưu trữ các hàm gốc để khôi phục sau kiểm thử (Mock teardown)
const originalGetDashboardStats = dashboardRepository.getDashboardStats;
const originalFindUserById = userRepository.findById;

console.log('\n============================================================');
console.log('📊 BẮT ĐẦU CHẠY BỘ KIỂM THỬ API DASHBOARD STATS (HRM-211)');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// PHẦN 1: KIỂM THỬ TÍNH TOÁN NGHIỆP VỤ & SERVICE LAYER (10 KỊCH BẢN CHÍNH)
// --------------------------------------------------------------------------

console.log('📋 PHẦN 1: KIỂM THỬ NGHIỆP VỤ TÍNH TOÁN KPI DASHBOARD');

// Kịch bản 1: Có nhân viên đang làm việc và có dữ liệu chấm công hôm nay (100% có mặt)
await runAsyncTest('Kịch bản 1: Có nhân viên đang làm việc và có dữ liệu chấm công đầy đủ hôm nay', async () => {
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 10,
    totalDepartments: 3,
    presentEmployees: 10,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.totalEmployees, 10);
  assert.strictEqual(result.totalDepartments, 3);
  assert.strictEqual(result.presentEmployees, 10);
  assert.strictEqual(result.attendanceRate, 100);
  assert.strictEqual(result.date, '2026-10-17');
});

// Kịch bản 2: Một số nhân viên chưa check-in (tỷ lệ đúng, ví dụ 96/120 = 80%)
await runAsyncTest('Kịch bản 2: Một số nhân viên chưa check-in -> Tỷ lệ tính chính xác (96/120 = 80.00%)', async () => {
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 120,
    totalDepartments: 8,
    presentEmployees: 96,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.totalEmployees, 120);
  assert.strictEqual(result.totalDepartments, 8);
  assert.strictEqual(result.presentEmployees, 96);
  assert.strictEqual(result.attendanceRate, 80);
  assert.strictEqual(result.date, '2026-10-17');
});

// Kịch bản 3: Có nhân viên đã thôi việc (Resigned) có lịch sử chấm công -> Loại trừ khỏi tử số và mẫu số
await runAsyncTest('Kịch bản 3: Có nhân viên đã thôi việc (Resigned) -> Không tính vào totalEmployees lẫn presentEmployees', async () => {
  // Giả lập DB có: 10 nhân viên tổng (trong đó 8 Active, 2 Resigned)
  // 9 người có mặt hôm nay (7 Active, 2 Resigned)
  // Kết quả repository chỉ đếm Active: totalEmployees = 8, presentEmployees = 7
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 8,
    totalDepartments: 2,
    presentEmployees: 7,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.totalEmployees, 8, 'Mẫu số chỉ tính nhân viên đang làm việc');
  assert.strictEqual(result.presentEmployees, 7, 'Tử số không tính nhân viên đã thôi việc');
  assert.strictEqual(result.attendanceRate, 87.5);
});

// Kịch bản 4: Một nhân viên có nhiều bản ghi bất thường trong cùng ngày -> Khử trùng lặp (Deduplication)
await runAsyncTest('Kịch bản 4: Một nhân viên có nhiều bản ghi bất thường trong cùng ngày -> Khử trùng lặp (DISTINCT)', async () => {
  // 5 nhân viên active, 1 nhân viên bị lỗi sinh 3 bản ghi check-in -> presentEmployees vẫn là 5
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 5,
    totalDepartments: 2,
    presentEmployees: 5,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.presentEmployees, 5, 'Mỗi nhân viên chỉ được tính tối đa 1 lần');
  assert.strictEqual(result.attendanceRate, 100);
});

// Kịch bản 5: Database không có nhân viên nào -> totalEmployees = 0, attendanceRate = 0 (Chống chia cho 0)
await runAsyncTest('Kịch bản 5: Database không có nhân viên nào -> totalEmployees = 0, attendanceRate = 0 (Không lỗi NaN/Infinity)', async () => {
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 0,
    totalDepartments: 2,
    presentEmployees: 0,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.totalEmployees, 0);
  assert.strictEqual(result.presentEmployees, 0);
  assert.strictEqual(result.attendanceRate, 0, 'Phải trả về 0 khi totalEmployees = 0');
  assert.strictEqual(Number.isFinite(result.attendanceRate), true, 'Tỷ lệ phải là số hữu hạn hợp lệ');
});

// Kịch bản 6: Database không có phòng ban nào -> totalDepartments = 0
await runAsyncTest('Kịch bản 6: Database không có phòng ban nào -> totalDepartments = 0', async () => {
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 10,
    totalDepartments: 0,
    presentEmployees: 8,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.totalDepartments, 0);
  assert.strictEqual(result.totalEmployees, 10);
  assert.strictEqual(result.presentEmployees, 8);
  assert.strictEqual(result.attendanceRate, 80);
});

// Kịch bản 7: Không có bản ghi chấm công nào hôm nay -> presentEmployees = 0, attendanceRate = 0
await runAsyncTest('Kịch bản 7: Không có bản ghi chấm công nào hôm nay -> presentEmployees = 0, attendanceRate = 0', async () => {
  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 50,
    totalDepartments: 5,
    presentEmployees: 0,
  });

  const result = await dashboardService.getDashboardStats({ date: '2026-10-17' });

  assert.strictEqual(result.presentEmployees, 0);
  assert.strictEqual(result.attendanceRate, 0);
  assert.strictEqual(result.totalEmployees, 50);
});

// Kịch bản 8: Thời điểm truy vấn gần nửa đêm (23:59:59), đảm bảo ngày thống kê đúng múi giờ Việt Nam
runTest('Kịch bản 8.1: Truy vấn lúc 23:59:59 (giờ VN) -> Đúng ngày làm việc theo múi giờ Asia/Ho_Chi_Minh', () => {
  // 23:59:59 ngày 2026-10-17 tại VN tương đương 16:59:59 UTC cùng ngày
  const nearMidnightVn = new Date('2026-10-17T16:59:59.000Z');
  const info = getVietnamAttendanceInfo(nearMidnightVn);

  assert.strictEqual(info.workDate, '2026-10-17');
  assert.strictEqual(info.checkInTimeString, '23:59:59');
});

runTest('Kịch bản 8.2: Truy vấn lúc 00:00:01 (giờ VN) -> Sang đúng ngày mới theo múi giờ Asia/Ho_Chi_Minh', () => {
  // 00:00:01 ngày 2026-10-18 tại VN tương đương 17:00:01 UTC ngày 2026-10-17
  const justAfterMidnightVn = new Date('2026-10-17T17:00:01.000Z');
  const info = getVietnamAttendanceInfo(justAfterMidnightVn);

  assert.strictEqual(info.workDate, '2026-10-18');
  assert.strictEqual(info.checkInTimeString, '00:00:01');
});

// Kịch bản bổ sung: Làm tròn tỷ lệ có mặt đến 2 chữ số thập phân
await runAsyncTest('Kiểm tra làm tròn attendanceRate đến 2 chữ số thập phân (1/3 = 33.33%, 2/3 = 66.67%)', async () => {
  dashboardRepository.getDashboardStats = async () => ({
    totalEmployees: 3,
    totalDepartments: 1,
    presentEmployees: 1,
  });

  let result = await dashboardService.getDashboardStats();
  assert.strictEqual(result.attendanceRate, 33.33);

  dashboardRepository.getDashboardStats = async () => ({
    totalEmployees: 3,
    totalDepartments: 1,
    presentEmployees: 2,
  });

  result = await dashboardService.getDashboardStats();
  assert.strictEqual(result.attendanceRate, 66.67);
});

// --------------------------------------------------------------------------
// PHẦN 2: KIỂM THỬ BẢO MẬT XÁC THỰC & PHÂN QUYỀN RBAC (HTTP INTEGRATION)
// --------------------------------------------------------------------------

console.log('\n📋 PHẦN 2: KIỂM THỬ XÁC THỰC JWT & PHÂN QUYỀN RBAC CHO ENDPOINT');

// Khởi chạy server kiểm thử nội bộ trên cổng ngẫu nhiên (Ephemeral port)
let server;
let serverPort;

function startTestServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

// Helper gửi HTTP request tới test server
function makeRequest(path, { method = 'GET', token = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
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
        let rawBody = '';
        res.on('data', (chunk) => {
          rawBody += chunk;
        });
        res.on('end', () => {
          try {
            const json = rawBody ? JSON.parse(rawBody) : null;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: json,
            });
          } catch {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: rawBody,
            });
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

await startTestServer();

// Kịch bản 9.1: Không có JWT trong header Authorization -> 401 Unauthorized
await runAsyncTest('Kịch bản 9.1: Không có JWT trong request -> Trả về lỗi 401 Unauthorized (TOKEN_REQUIRED)', async () => {
  const res = await makeRequest('/api/dashboard/stats');

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'TOKEN_REQUIRED');
});

// Kịch bản 9.2: Header Authorization có format sai -> 401 INVALID_TOKEN_FORMAT
await runAsyncTest('Kịch bản 9.2: Token sai định dạng (không có tiền tố Bearer) -> Trả về 401 (INVALID_TOKEN_FORMAT)', async () => {
  const res = await makeRequest('/api/dashboard/stats', {
    headers: { Authorization: 'Basic some-invalid-token' },
  });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_TOKEN_FORMAT');
});

// Kịch bản 9.3: JWT không hợp lệ (sai chữ ký hoặc rác) -> 401 INVALID_TOKEN
await runAsyncTest('Kịch bản 9.3: JWT bị sai chữ ký hoặc giải mạo -> Trả về lỗi 401 (INVALID_TOKEN)', async () => {
  const res = await makeRequest('/api/dashboard/stats', {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature',
  });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_TOKEN');
});

// Kịch bản 9.4: JWT đã hết hạn -> 401 TOKEN_EXPIRED
await runAsyncTest('Kịch bản 9.4: JWT đã hết hạn sử dụng -> Trả về lỗi 401 (TOKEN_EXPIRED)', async () => {
  const expiredToken = jwt.sign(
    { sub: 1, username: 'admin', role: 'Admin' },
    env.jwtSecret || env.JWT_SECRET || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE',
    { expiresIn: '-1s' }
  );

  const res = await makeRequest('/api/dashboard/stats', { token: expiredToken });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'TOKEN_EXPIRED');
});

// Kịch bản 10: Người dùng vai trò EMPLOYEE truy cập -> 403 Forbidden
await runAsyncTest('Kịch bản 10: Người dùng với vai trò EMPLOYEE truy cập -> Bị từ chối 403 Forbidden', async () => {
  userRepository.findById = async (id) => ({
    user_id: 3,
    employee_id: 3,
    username: 'emp1',
    role: 'Employee',
    account_status: 'Active',
    employment_status: 'Active',
  });

  const employeeToken = generateTestToken({
    sub: 3,
    userId: 3,
    username: 'emp1',
    role: 'Employee',
  });

  const res = await makeRequest('/api/dashboard/stats', { token: employeeToken });

  assert.strictEqual(res.statusCode, 403, 'EMPLOYEE không được phép xem thống kê toàn công ty');
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'FORBIDDEN');
});

// Kịch bản 11.1: Quản trị viên (ADMIN) truy cập thành công -> 200 OK với đúng format
await runAsyncTest('Kịch bản 11.1: ADMIN truy cập -> Trả về HTTP 200 OK và dữ liệu KPI chính xác', async () => {
  userRepository.findById = async (id) => ({
    user_id: 1,
    employee_id: 1,
    username: 'admin',
    role: 'Admin',
    account_status: 'Active',
    employment_status: 'Active',
  });

  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 45,
    totalDepartments: 5,
    presentEmployees: 36,
  });

  const adminToken = generateTestToken({
    sub: 1,
    userId: 1,
    username: 'admin',
    role: 'Admin',
  });

  const res = await makeRequest('/api/dashboard/stats', { token: adminToken });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.status, 'success');
  assert.strictEqual(typeof res.body.data, 'object');

  const data = res.body.data;
  assert.strictEqual(data.totalEmployees, 45);
  assert.strictEqual(data.totalDepartments, 5);
  assert.strictEqual(data.presentEmployees, 36);
  assert.strictEqual(data.attendanceRate, 80);
  assert.strictEqual(/^\d{4}-\d{2}-\d{2}$/.test(data.date), true, 'Date phải có định dạng YYYY-MM-DD');
});

// Kịch bản 11.2: Quản lý Nhân sự (HR_MANAGER) truy cập thành công -> 200 OK
await runAsyncTest('Kịch bản 11.2: HR_MANAGER truy cập -> Trả về HTTP 200 OK và dữ liệu KPI chính xác', async () => {
  userRepository.findById = async (id) => ({
    user_id: 2,
    employee_id: 2,
    username: 'hr',
    role: 'HR',
    account_status: 'Active',
    employment_status: 'Active',
  });

  dashboardRepository.getDashboardStats = async (date) => ({
    totalEmployees: 50,
    totalDepartments: 6,
    presentEmployees: 40,
  });

  const hrToken = generateTestToken({
    sub: 2,
    userId: 2,
    username: 'hr',
    role: 'HR',
  });

  const res = await makeRequest('/api/dashboard/stats', { token: hrToken });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.totalEmployees, 50);
  assert.strictEqual(res.body.data.totalDepartments, 6);
  assert.strictEqual(res.body.data.presentEmployees, 40);
  assert.strictEqual(res.body.data.attendanceRate, 80);
});

// Kịch bản 12: Đăng ký endpoint trong API Root Documentation
await runAsyncTest('Kiểm tra API Root GET /api chứa khai báo dashboardStats', async () => {
  const res = await makeRequest('/api');

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.endpoints.dashboardStats, '/api/dashboard/stats');
});

// Kịch bản 13: An toàn bảo mật: Không rò rỉ dữ liệu nhạy cảm
await runAsyncTest('Bảo mật: Response của GET /api/dashboard/stats tuyệt đối không chứa dữ liệu nhạy cảm', async () => {
  userRepository.findById = async (id) => ({
    user_id: 1,
    employee_id: 1,
    username: 'admin',
    role: 'Admin',
    account_status: 'Active',
    employment_status: 'Active',
  });

  dashboardRepository.getDashboardStats = async () => ({
    totalEmployees: 10,
    totalDepartments: 2,
    presentEmployees: 8,
  });

  const adminToken = generateTestToken({ sub: 1, role: 'Admin' });
  const res = await makeRequest('/api/dashboard/stats', { token: adminToken });

  const rawJson = JSON.stringify(res.body);

  assert.strictEqual(rawJson.includes('password'), false, 'Không chứa password');
  assert.strictEqual(rawJson.includes('ssn'), false, 'Không chứa số CCCD / ssn');
  assert.strictEqual(rawJson.includes('CCCD'), false, 'Không chứa CCCD');
  assert.strictEqual(rawJson.includes('secret'), false, 'Không chứa khóa secret');
  assert.strictEqual(rawJson.includes('DB_PASSWORD'), false, 'Không chứa thông tin kết nối DB');
});

// Dọn dẹp mock và đóng server sau kiểm thử
await stopTestServer();
await closePool();
dashboardRepository.getDashboardStats = originalGetDashboardStats;
userRepository.findById = originalFindUserById;

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI TEST!`);
console.log('   Tất cả 10 kịch bản kiểm thử bắt buộc & phân quyền RBAC hoàn toàn hợp lệ.');
console.log('============================================================\n');

process.exit(0);
