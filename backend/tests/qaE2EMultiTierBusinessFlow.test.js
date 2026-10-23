/**
 * ==============================================================================
 * BỘ KIỂM THỬ TÍCH HỢP E2E TOÀN BỘ LUỒNG NGHIỆP VỤ TRÊN MÔI TRƯỜNG DOCKER COMPOSE ĐA TẦNG
 * ==============================================================================
 * Hệ thống: Quản lý Nhân sự HRM - ICTU (Enterprise Architecture)
 * Môi trường kiểm thử: Docker Compose Multi-Tier Stack (13 Containers):
 *   - Tầng 1: Nginx Reverse Proxy (Port 80 HTTP Redirect, Port 443 HTTPS SSL Gateway)
 *   - Tầng 2: Frontend SPA Client (Port 5173 - React/Vite Dashboard)
 *   - Tầng 3: Backend API Runtime (Port 3005 - Express Node.js, RBAC, JWT, AES-256)
 *   - Tầng 4: Database Tier (Port 3309 - MySQL 8.0, phpMyAdmin 8084)
 *   - Tầng 5: Observability Tier (Prometheus 9090, Alertmanager 9093, Grafana 3001, Loki 3100, Exporters)
 * ==============================================================================
 */

import assert from 'node:assert';
import https from 'node:https';
import http from 'node:http';
import mysql from 'mysql2/promise';

// Cấu hình URL endpoint trên môi trường Docker Compose
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3005';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const NGINX_HTTP_URL = 'http://127.0.0.1:80';
const NGINX_HTTPS_URL = 'https://127.0.0.1:443';
const PROMETHEUS_URL = 'http://127.0.0.1:9090';
const ALERTMANAGER_URL = 'http://127.0.0.1:9093';
const LOKI_URL = 'http://127.0.0.1:3100';
const GRAFANA_URL = 'http://127.0.0.1:3001';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3309,
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
  database: process.env.DB_NAME || 'hrm_db',
};

const CCCD_ENCRYPTION_KEY = process.env.CCCD_ENCRYPTION_KEY || 'ICTU_HRM_SECRET_KEY_2026_AES256_DEV';

let totalTests = 0;
let passedTests = 0;
const testResults = [];

async function test(suite, name, fn) {
  totalTests++;
  const testNumber = totalTests;
  try {
    process.stdout.write(`  [TEST ${testNumber.toString().padStart(2, '0')}] ${name} ... `);
    await fn();
    console.log(`✅ [PASS]`);
    passedTests++;
    testResults.push({ suite, name, status: 'PASS' });
  } catch (err) {
    console.log(`❌ [FAIL]`);
    console.error(`     👉 Chi tiết lỗi: ${err.message}`);
    testResults.push({ suite, name, status: 'FAIL', error: err.message });
    process.exitCode = 1;
  }
}

// Helper thực thi HTTP/HTTPS request thuần
function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;
    const isHttps = parsed.protocol === 'https:';

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
      rejectUnauthorized: false, // Bỏ qua chứng chỉ tự ký trên môi trường dev/staging
    };

    let postData = options.body;
    if (postData && typeof postData === 'object' && !Buffer.isBuffer(postData)) {
      postData = JSON.stringify(postData);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = client.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let json = null;
        const text = buffer.toString('utf-8');
        try {
          json = JSON.parse(text);
        } catch (_) {}

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json,
          text,
          buffer,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout khi gửi request tới ${urlStr}`));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log(`\n==============================================================================`);
  console.log(`🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ E2E TOÀN DIỆN MÔI TRƯỜNG DOCKER COMPOSE ĐA TẦNG`);
  console.log(`   Hệ thống: Quản lý Nhân sự (HRM - ICTU)`);
  console.log(`   Backend API: ${BACKEND_URL}`);
  console.log(`   MySQL Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log(`==============================================================================\n`);

  let dbConn = null;
  let adminToken = '';
  let hrToken = '';
  let empToken = '';
  let testDepartmentId = null;
  let testEmployeeId = null;

  try {
    dbConn = await mysql.createConnection(DB_CONFIG);

    // =========================================================================
    // SUITE 1: HẠ TẦNG DOCKER COMPOSE ĐA TẦNG (MULTI-TIER INFRASTRUCTURE STACK)
    // =========================================================================
    console.log(`\n📦 SUITE 1: KIỂM TRA TRẠNG THÁI HẠ TẦNG DOCKER COMPOSE ĐA TẦNG`);

    await test('Hạ tầng', 'Backend API Health check (/api/health) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/health`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'UP');
    });

    await test('Hạ tầng', 'Backend Database Connectivity (/api/health/db) -> 200 OK Connected', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/health/db`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.databaseStatus, 'HEALTHY');
    });

    await test('Hạ tầng', 'Nginx Port 80 HTTP Redirect -> 301 chuyển hướng HTTPS', async () => {
      const res = await httpRequest(`${NGINX_HTTP_URL}/`);
      assert.strictEqual(res.statusCode, 301);
      assert.ok(res.headers.location.startsWith('https://'));
    });

    await test('Hạ tầng', 'Nginx Port 443 HTTPS Reverse Proxy -> 200 OK chuyển tiếp Backend', async () => {
      const res = await httpRequest(`${NGINX_HTTPS_URL}/api/health`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.status, 'UP');
    });

    await test('Hạ tầng', 'Frontend SPA Client (Port 5173) -> 200 OK phục vụ HTML index', async () => {
      const res = await httpRequest(`${FRONTEND_URL}/`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.text.includes('<div id="app">') || res.text.includes('<div id="root">') || res.text.includes('/assets/'));
    });

    await test('Hạ tầng', 'Prometheus Server (Port 9090) -> 200 OK Healthy', async () => {
      const res = await httpRequest(`${PROMETHEUS_URL}/-/healthy`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.text.includes('Prometheus Server is Healthy'));
    });

    await test('Hạ tầng', 'Alertmanager Server (Port 9093) -> 200 OK Healthy', async () => {
      const res = await httpRequest(`${ALERTMANAGER_URL}/-/healthy`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.text.includes('OK'));
    });

    await test('Hạ tầng', 'Loki Centralized Logging (Port 3100) -> 200 OK Ready', async () => {
      const res = await httpRequest(`${LOKI_URL}/ready`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.text.trim(), 'ready');
    });

    await test('Hạ tầng', 'Grafana Dashboard Server (Port 3001) -> 200 OK Database Healthy', async () => {
      const res = await httpRequest(`${GRAFANA_URL}/api/health`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.database, 'ok');
    });

    // =========================================================================
    // SUITE 2: XÁC THỰC, PHÂN QUYỀN RBAC & QUẢN LÝ PHIÊN (AUTH & RBAC FLOW)
    // =========================================================================
    console.log(`\n🔑 SUITE 2: LUỒNG XÁC THỰC, PHÂN QUYỀN RBAC & QUẢN LÝ PHIÊN`);

    await test('Xác thực', 'Đăng nhập tài khoản Quản trị viên (admin/Admin@123) -> Nhận JWT Admin', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        body: { username: 'admin', password: 'Admin@123' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.role, 'Admin');
      assert.ok(res.body.data.accessToken);
      adminToken = res.body.data.accessToken;
    });

    await test('Xác thực', 'Đăng nhập tài khoản Quản lý Nhân sự (hr/Hr@123) -> Nhận JWT HR', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        body: { username: 'hr', password: 'Hr@123' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.role, 'HR');
      assert.ok(res.body.data.accessToken);
      hrToken = res.body.data.accessToken;
    });

    await test('Xác thực', 'Đăng nhập tài khoản Nhân viên (emp1/Emp@123) -> Nhận JWT Employee', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        body: { username: 'emp1', password: 'Emp@123' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.role, 'Employee');
      assert.ok(res.body.data.accessToken);
      empToken = res.body.data.accessToken;
    });

    await test('Xác thực', 'Kiểm tra phân quyền RBAC: Employee bị CHẶN tạo phòng ban -> 403 Forbidden', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/departments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${empToken}` },
        body: { departmentName: 'Phòng Bị Chặn', departmentCode: 'PB-BLOCKED' },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Xác thực', 'Quản lý khóa tài khoản & Thu hồi JWT tức thì (US 4.0)', async () => {
      // 1. Khóa tài khoản emp1 (user_id = 3)
      const lockRes = await httpRequest(`${BACKEND_URL}/api/users/3/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'Locked' },
      });
      assert.strictEqual(lockRes.statusCode, 200);

      // 2. Token cũ bị từ chối NGAY LẬP TỨC trên route bảo vệ
      const accessRes = await httpRequest(`${BACKEND_URL}/api/attendance/today`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.strictEqual(accessRes.statusCode, 403); // Chặn do tài khoản Locked

      // 3. Đăng nhập mới bị từ chối
      const loginRes = await httpRequest(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        body: { username: 'emp1', password: 'Emp@123' },
      });
      assert.strictEqual(loginRes.statusCode, 403);

      // 4. Mở khóa lại an toàn để các bài test sau hoạt động bình thường
      const unlockRes = await httpRequest(`${BACKEND_URL}/api/users/3/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'Active' },
      });
      assert.strictEqual(unlockRes.statusCode, 200);

      // 5. Cấp lại token mới cho emp1
      const reLoginRes = await httpRequest(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        body: { username: 'emp1', password: 'Emp@123' },
      });
      assert.strictEqual(reLoginRes.statusCode, 200);
      empToken = reLoginRes.body.data.accessToken;
    });

    // =========================================================================
    // SUITE 3: QUẢN LÝ PHÒNG BAN & RÀNG BUỘC TOÀN VẸN KHÓA NGOẠI (DEPARTMENTS)
    // =========================================================================
    console.log(`\n🏢 SUITE 3: QUẢN LÝ PHÒNG BAN & RÀNG BUỘC TOÀN VẸN (US 7.0 & US 8.0)`);

    const testDeptCode = `PB-QA-${Date.now().toString().slice(-4)}`;
    await test('Phòng ban', `Tạo mới phòng ban thử nghiệm (${testDeptCode}) -> 201 Created`, async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/departments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentCode: testDeptCode,
          departmentName: 'Phòng Thử Nghiệm QA Đa Tầng',
          location: 'Tầng 5 Tòa Nhà C',
          phone: '0208-9999-888',
          description: 'Phòng ban phục vụ kiểm thử tích hợp tự động',
        },
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      testDepartmentId = res.body.data.departmentId || res.body.data.department_id || res.body.data.id;
      assert.ok(testDepartmentId);
    });

    await test('Phòng ban', 'Cập nhật thông tin phòng ban (US 7.0) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/departments/${testDepartmentId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentName: 'Phòng QA Đa Tầng (Đã cập nhật)',
          location: 'Tầng 6 Tòa Nhà C',
          phone: '0208-9999-999',
          description: 'Cập nhật thông tin phòng ban thành công',
        },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('Phòng ban', 'Ràng buộc xóa phòng ban có nhân viên (US 8.0) -> TỪ CHỐI 409 Conflict', async () => {
      // Phòng ban ID 1 (PB-TECH) có nhiều nhân viên trực thuộc
      const res = await httpRequest(`${BACKEND_URL}/api/departments/1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.errorCode, 'DEPARTMENT_HAS_EMPLOYEES');
    });

    await test('Phòng ban', 'Xóa thành công phòng ban rỗng (0 nhân viên) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/departments/${testDepartmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('Phòng ban', 'Thống kê cơ cấu nhân sự theo phòng ban (US 21.0) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/departments/statistics`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data) || Array.isArray(res.body.data?.departments));
    });

    // =========================================================================
    // SUITE 4: VÒNG ĐỜI NHÂN SỰ & BẢO MẬT MÃ HÓA CCCD AES-256 (EMPLOYEES FLOW)
    // =========================================================================
    console.log(`\n👤 SUITE 4: VÒNG ĐỜI HỒ SƠ NHÂN SỰ & BẢO MẬT CCCD AES-256`);

    const rawCccd = '038204009988';
    const testEmpCode = `NVQA${Date.now().toString().slice(-4)}`;

    await test('Nhân sự', `Thêm mới nhân sự với CCCD 12 số (${testEmpCode}) -> 201 Created`, async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/employees`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          employeeCode: testEmpCode,
          fullName: 'Nguyễn Văn QA E2E',
          email: `${testEmpCode.toLowerCase()}@hrm.local`,
          phone: '0988776655',
          gender: 'Male',
          dateOfBirth: '1995-10-20',
          cccd: rawCccd,
          departmentId: 1,
          position: 'Kỹ sư QA Tự động hóa',
          baseSalary: 21000000.00,
          hireDate: '2026-01-15',
          employmentStatus: 'Active',
        },
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      testEmployeeId = res.body.data.employeeId || res.body.data.employee_id || res.body.data.id;
      assert.ok(testEmployeeId);
    });

    await test('Nhân sự', 'Kiểm toán CSDL MySQL: CCCD mã hóa AES-256 & ssn_hash HMAC-SHA-256', async () => {
      const [rows] = await dbConn.query(
        `SELECT 
          employee_id, 
          ssn_masked, 
          ssn_hash, 
          HEX(ssn_encrypted) AS hex_encrypted,
          CAST(AES_DECRYPT(ssn_encrypted, ?) AS CHAR CHARACTER SET utf8mb4) AS decrypted_cccd
         FROM employees WHERE employee_id = ?`,
        [CCCD_ENCRYPTION_KEY, testEmployeeId]
      );
      assert.strictEqual(rows.length, 1);
      const row = rows[0];
      assert.strictEqual(row.ssn_masked, '0382******88', 'Số CCCD che mờ phải chuẩn');
      assert.strictEqual(row.ssn_hash.length, 64, 'ssn_hash phải là chuỗi HMAC 64 ký tự hex');
      assert.ok(row.hex_encrypted.length >= 32, 'ssn_encrypted phải là chuỗi nhị phân mã hóa');
      assert.strictEqual(row.decrypted_cccd, rawCccd, 'AES_DECRYPT từ MySQL phải giải mã chính xác CCCD gốc');
    });

    await test('Nhân sự', 'Cập nhật hồ sơ nhân sự (US 13.0) -> CCCD bảo toàn bit-by-bit', async () => {
      const updateRes = await httpRequest(`${BACKEND_URL}/api/employees/${testEmployeeId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          position: 'Senior QA Automation Engineer',
          baseSalary: 25000000.00,
          phone: '0988776699',
        },
      });
      assert.strictEqual(updateRes.statusCode, 200);

      // Xem chi tiết và giải mã
      const detailRes = await httpRequest(`${BACKEND_URL}/api/employees/${testEmployeeId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(detailRes.statusCode, 200);
      assert.strictEqual(detailRes.body.data.cccd, rawCccd, 'CCCD sau cập nhật phải giữ nguyên chính xác');
    });

    await test('Nhân sự', 'Thôi việc nhân viên (US 14.0) -> Chuyển Resigned & Khóa tài khoản', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/employees/${testEmployeeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { action: 'RESIGN' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.employmentStatus, 'Resigned');
    });

    // =========================================================================
    // SUITE 5: CHẤM CÔNG & XUẤT BÁO CÁO DOANH NGHIỆP (ATTENDANCE & EXPORT FLOW)
    // =========================================================================
    console.log(`\n⏱️ SUITE 5: CHẤM CÔNG & XUẤT BÁO CÁO DOANH NGHIỆP`);

    await test('Chấm công', 'Nhân viên thực hiện Check-in ngày làm việc -> 200/201/409 (Đã check-in)', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/attendance/check-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${empToken}` },
        body: {},
      });
      // Có thể đã check-in trước đó trong ngày -> cho phép 200, 201 hoặc 409 (ALREADY_CHECKED_IN)
      assert.ok([200, 201, 400, 409].includes(res.statusCode), `Check-in statusCode không hợp lệ: ${res.statusCode}`);
    });

    await test('Chấm công', 'Nhân viên thực hiện Check-out kết thúc ca -> 200/409 (Đã check-out)', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/attendance/check-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${empToken}` },
        body: {},
      });
      assert.ok([200, 400, 409].includes(res.statusCode), `Check-out statusCode không hợp lệ: ${res.statusCode}`);
    });

    await test('Chấm công', 'Lấy bảng chấm công hôm nay (/api/attendance/today) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/attendance/today`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('Chấm công', 'Lấy lịch sử chấm công theo tháng (US 19.0) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/attendance/history`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('Báo cáo', 'Xuất báo cáo Excel (.xlsx) chuẩn Enterprise (US 22.0) -> PK zip header', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/reports/attendance/export?format=xlsx`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('spreadsheetml'));
      assert.strictEqual(res.buffer.slice(0, 4).toString(), 'PK\x03\x04', 'File Excel phải có header PK Zip');
      assert.ok(res.buffer.length > 5000, 'Dung lượng file Excel hợp lệ');
    });

    await test('Báo cáo', 'Xuất báo cáo CSV (.csv) có UTF-8 BOM chuẩn tiếng Việt -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/reports/attendance/export?format=csv`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('text/csv'));
      // Kiểm tra 3 byte UTF-8 BOM (\xEF\xBB\xBF)
      assert.strictEqual(res.buffer[0], 0xEF);
      assert.strictEqual(res.buffer[1], 0xBB);
      assert.strictEqual(res.buffer[2], 0xBF);
    });

    // =========================================================================
    // SUITE 6: DASHBOARD KPI & ĐỐI SOÁT CSDL THỜI GIAN THỰC (DASHBOARD FLOW)
    // =========================================================================
    console.log(`\n📊 SUITE 6: DASHBOARD KPI & ĐỐI SOÁT CSDL THỜI GIAN THỰC`);

    let dashboardStats = null;
    await test('Dashboard', 'Lấy thống kê chỉ số KPI (/api/dashboard/stats) -> 200 OK', async () => {
      const res = await httpRequest(`${BACKEND_URL}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      dashboardStats = res.body.data;
      assert.ok(typeof dashboardStats.totalEmployees === 'number');
      assert.ok(typeof dashboardStats.totalDepartments === 'number');
    });

    await test('Dashboard', 'Đối soát CSDL thời gian thực: Số nhân sự và phòng ban khớp 100%', async () => {
      const [deptRows] = await dbConn.query('SELECT COUNT(*) AS cnt FROM departments');
      const [empRows] = await dbConn.query("SELECT COUNT(*) AS cnt FROM employees WHERE employment_status = 'Active'");
      
      assert.strictEqual(dashboardStats.totalDepartments, deptRows[0].cnt, 'Số phòng ban Dashboard phải khớp CSDL');
      assert.strictEqual(dashboardStats.totalEmployees, empRows[0].cnt, 'Số nhân viên Active Dashboard phải khớp CSDL');
    });

    // =========================================================================
    // SUITE 7: HẠ TẦNG OBSERVABILITY, ALERT RULES & LOG STREAMING (SRE FLOW)
    // =========================================================================
    console.log(`\n📡 SUITE 7: OBSERVABILITY, CẢNH BÁO ALERT RULES & LOKI LOGGING`);

    await test('Observability', 'Prometheus Scrape: Đủ 5/5 Targets đều ở trạng thái UP (US 29.0)', async () => {
      const res = await httpRequest(`${PROMETHEUS_URL}/api/v1/targets`);
      assert.strictEqual(res.statusCode, 200);
      const targets = res.body.data.activeTargets;
      assert.strictEqual(targets.length, 5, 'Phải có đúng 5 active scrape targets');
      for (const t of targets) {
        assert.strictEqual(t.health, 'up', `Target ${t.labels.job} phải có health = up`);
      }
    });

    await test('Observability', 'Prometheus Alert Rules: Nạp đủ 6 rules trong rules/alerts.yml (US 31.0)', async () => {
      const res = await httpRequest(`${PROMETHEUS_URL}/api/v1/rules`);
      assert.strictEqual(res.statusCode, 200);
      const groups = res.body.data.groups;
      assert.strictEqual(groups.length, 1);
      const group = groups[0];
      assert.strictEqual(group.name, 'hrm-infrastructure-alerts');
      assert.strictEqual(group.rules.length, 6, 'Phải có đúng 6 alert rules');
      const expectedRuleNames = [
        'HighCPUUsage',
        'HighRAMUsage',
        'MySQLTooManyConnections',
        'InstanceDown',
        'HRMApplicationDown',
        'MySQLExporterDown',
      ];
      const actualRuleNames = group.rules.map((r) => r.name);
      assert.deepStrictEqual(actualRuleNames, expectedRuleNames);
    });

    await test('Observability', 'Prometheus kết nối Alertmanager qua mạng nội bộ monitoring', async () => {
      const res = await httpRequest(`${PROMETHEUS_URL}/api/v1/alertmanagers`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.activeAlertmanagers.length >= 1);
      assert.strictEqual(res.body.data.activeAlertmanagers[0].url, 'http://alertmanager:9093/api/v2/alerts');
    });

    await test('Observability', 'Loki Log Stream: Tiếp nhận log luồng E2E từ container hrm-app (US 30.0)', async () => {
      const query = encodeURIComponent('{container="hrm-app"}');
      const res = await httpRequest(`${LOKI_URL}/loki/api/v1/query_range?query=${query}`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.ok(res.body.data.result.length >= 1, 'Loki phải có ít nhất 1 stream log từ hrm-app');
    });

  } finally {
    // Dọn dẹp dữ liệu thử nghiệm
    console.log(`\n🧹 DỌN DẸP DỮ LIỆU THỬ NGHIỆM`);
    if (dbConn && testEmployeeId) {
      await dbConn.query('DELETE FROM employees WHERE employee_id = ?', [testEmployeeId]);
      console.log(`  - Đã dọn dẹp nhân viên thử nghiệm ID ${testEmployeeId}`);
    }
    if (dbConn) {
      await dbConn.end();
    }
  }

  // =========================================================================
  // TỔNG KẾT KẾT QUẢ KIỂM THỬ
  // =========================================================================
  console.log(`\n==============================================================================`);
  console.log(`📊 TỔNG KẾT BỘ KIỂM THỬ E2E TOÀN BỘ LUỒNG NGHIỆP VỤ TRÊN DOCKER COMPOSE:`);
  console.log(`   - Tổng số test cases: ${totalTests}`);
  console.log(`   - Số test thành công: ${passedTests} ✅`);
  console.log(`   - Số test thất bại:   ${totalTests - passedTests} ${totalTests === passedTests ? '🎉' : '❌'}`);
  console.log(`   - Tỷ lệ hoàn thành:   ${((passedTests / totalTests) * 100).toFixed(2)}%`);
  console.log(`==============================================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Lỗi nghiêm trọng khi thực thi E2E Test Suite:', err);
  process.exit(1);
});
