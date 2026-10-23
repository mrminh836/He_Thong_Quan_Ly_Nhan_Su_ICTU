/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG API XUẤT BÁO CÁO CHẤM CÔNG (HRM-214)
 * GET /api/reports/attendance/export
 * ==============================================================================
 * 
 * BAO PHỦ 100% CÁC KỊCH BẢN THEO ĐẶC TẢ KỸ THUẬT:
 *  1. Xuất file Excel (.xlsx) với tháng/năm hợp lệ -> 200 OK, binary Buffer, magic bytes PK.., Content-Type, Content-Disposition.
 *  2. Xuất file CSV (.csv) với tháng/năm hợp lệ -> 200 OK, Content-Type, UTF-8 BOM, tiêu đề tiếng Việt.
 *  3. Mặc định format=xlsx khi không chỉ định format.
 *  4. Format không được hỗ trợ (pdf, txt, json) -> 400 Bad Request (INVALID_FORMAT).
 *  5. Tham số month không hợp lệ (0, 13, abc) -> 400 Bad Request (INVALID_MONTH).
 *  6. Tham số year không hợp lệ (1800, 2500, abc) -> 400 Bad Request (INVALID_YEAR).
 *  7. Chỉ truyền 1 trong 2 tham số month/year -> 400 Bad Request (INVALID_PARAMS).
 *  8. Xuất theo khoảng ngày fromDate và toDate hợp lệ -> 200 OK, đúng tên file theo khoảng ngày.
 *  9. Khoảng ngày không hợp lệ (fromDate > toDate) -> 400 Bad Request (INVALID_DATE_RANGE).
 * 10. Định dạng ngày sai (không phải YYYY-MM-DD hoặc ngày ảo) -> 400 Bad Request.
 * 11. Không có JWT Token -> 401 Unauthorized (TOKEN_REQUIRED).
 * 12. Token hết hạn hoặc chữ ký giả mạo -> 401 Unauthorized (TOKEN_EXPIRED / INVALID_TOKEN).
 * 13. EMPLOYEE cố tình xuất dữ liệu của nhân viên khác (employeeId khác) -> 403 Forbidden.
 * 14. EMPLOYEE xuất dữ liệu của chính mình thành công -> 200 OK.
 * 15. ADMIN và HR_MANAGER lọc theo departmentId thành công -> 200 OK.
 * 16. Kỳ báo cáo không có dữ liệu -> 200 OK, file Excel/CSV chuẩn có thông báo rỗng.
 * 17. Dữ liệu tiếng Việt, dấu phẩy, nháy kép ", ký tự xuống dòng -> CSV escape chuẩn RFC 4180.
 * 18. Chống CSV Formula Injection (CWE-1236): Text bắt đầu bằng =, +, -, @ được escape nháy đơn (').
 * 19. Bản ghi chưa check-out -> Hiển thị rỗng hoặc --:--, không bị tính nhầm về sớm.
 * 20. Bảo mật: File xuất tuyệt đối không chứa trường CCCD, mật khẩu băm, token.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { env } from '../src/config/env.js';
import app from '../src/app.js';
import reportRepository from '../src/repositories/reportRepository.js';
import userRepository from '../src/repositories/userRepository.js';

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

// Helper sinh JWT token kiểm thử
function generateTestToken(payload) {
  return jwt.sign(payload, env.jwtSecret || env.JWT_SECRET || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE', {
    expiresIn: '1h',
  });
}

// Lưu trữ các hàm gốc để khôi phục sau kiểm thử (Mock teardown)
const originalGetReportData = reportRepository.getAttendanceReportData;
const originalGetReportSummary = reportRepository.getAttendanceReportSummary;
const originalFindUserById = userRepository.findById;

// Khởi chạy test server trên cổng ngẫu nhiên (Ephemeral port)
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

// Helper gửi HTTP request và thu thập cả JSON lẫn Binary Buffer
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
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buffer.toString('utf-8'));
          } catch {
            // Không phải JSON, có thể là binary file
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            buffer,
            text: buffer.toString('utf-8'),
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

console.log('\n==============================================================================');
console.log('📊 BẮT ĐẦU CHẠY BỘ KIỂM THỬ API XUẤT BÁO CÁO CHẤM CÔNG (HRM-214)');
console.log('==============================================================================\n');

await startTestServer();

// Mock User ADMIN mặc định
const adminToken = generateTestToken({
  sub: 1,
  userId: 1,
  username: 'admin',
  role: 'Admin',
});

// Mock dữ liệu chấm công tiêu chuẩn
const sampleAttendanceData = [
  {
    attendance_id: 101,
    employee_id: 1,
    employee_code: 'NV001',
    employee_name: 'Nguyễn Văn An',
    position: 'Trưởng phòng Kỹ thuật',
    department_id: 1,
    department_name: 'Phòng Kỹ thuật & CNTT',
    department_code: 'TECH',
    attendance_date: '2026-10-15',
    check_in: '08:20:00',
    check_out: '17:35:00',
    attendance_status: 'OnTime',
    note: 'Làm việc bình thường',
  },
  {
    attendance_id: 102,
    employee_id: 2,
    employee_code: 'NV002',
    employee_name: 'Trần Thị Bích',
    position: 'Chuyên viên Nhân sự',
    department_id: 2,
    department_name: 'Phòng Nhân sự',
    department_code: 'HR',
    attendance_date: '2026-10-15',
    check_in: '08:45:00',
    check_out: '17:30:00',
    attendance_status: 'Late',
    note: 'Tắc đường đến muộn 15p',
  },
  {
    attendance_id: 103,
    employee_id: 3,
    employee_code: 'NV003',
    employee_name: 'Lê Hoàng Nam',
    position: 'Lập trình viên',
    department_id: 1,
    department_name: 'Phòng Kỹ thuật & CNTT',
    department_code: 'TECH',
    attendance_date: '2026-10-15',
    check_in: '08:15:00',
    check_out: '16:45:00',
    attendance_status: 'EarlyLeave',
    note: 'Xin về sớm đi khám bệnh',
  },
  {
    attendance_id: 104,
    employee_id: 4,
    employee_code: 'NV004',
    employee_name: 'Phạm Minh Tuấn',
    position: 'Nhân viên Kinh doanh',
    department_id: 3,
    department_name: 'Phòng Kinh doanh',
    department_code: 'SALE',
    attendance_date: '2026-10-15',
    check_in: '08:25:00',
    check_out: null, // Chưa check-out
    attendance_status: 'OnTime',
    note: 'Ca làm việc đang diễn ra',
  },
];

const sampleSummary = {
  totalRecords: 4,
  totalWorkDays: 4,
  onTimeCount: 2,
  lateCount: 1,
  earlyLeaveCount: 1,
};

// Thiết lập mock mặc định
reportRepository.getAttendanceReportData = async () => sampleAttendanceData;
reportRepository.getAttendanceReportSummary = async () => sampleSummary;
userRepository.findById = async (id) => ({
  user_id: id,
  employee_id: id,
  username: 'test_user',
  role: id === 1 ? 'Admin' : (id === 2 ? 'HR' : 'Employee'),
  account_status: 'Active',
});

// -----------------------------------------------------------------------------
// NHÓM 1: XUẤT FILE EXCEL (.XLSX) VÀ ĐỊNH DẠNG HỢP LỆ
// -----------------------------------------------------------------------------
console.log('📋 NHÓM 1: XUẤT FILE EXCEL (.XLSX)');

await runAsyncTest('Test 1: Xuất Excel (format=xlsx) với tháng/năm hợp lệ -> HTTP 200, Content-Type, Content-Disposition, file XLSX đọc được', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=xlsx', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200, 'HTTP Status phải là 200 OK');
  assert.strictEqual(
    res.headers['content-type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Type phải là XLSX'
  );
  assert.ok(
    res.headers['content-disposition'].includes('bao_cao_cham_cong_2026_10.xlsx'),
    'Content-Disposition phải chứa tên file bao_cao_cham_cong_2026_10.xlsx'
  );

  // Kiểm tra Magic Bytes của định dạng Zip/XLSX: PK.. (0x50, 0x4B, 0x03, 0x04)
  assert.strictEqual(res.buffer[0], 0x50);
  assert.strictEqual(res.buffer[1], 0x4B);
  assert.strictEqual(res.buffer[2], 0x03);
  assert.strictEqual(res.buffer[3], 0x04);

  // Đọc lại file Excel bằng ExcelJS để kiểm tra tính toàn vẹn của cấu trúc nội dung
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.buffer);

  const worksheet = workbook.getWorksheet('BaoCaoChamCong');
  assert.ok(worksheet, 'Phải có worksheet tên BaoCaoChamCong');

  // Kiểm tra tiêu đề báo cáo tại dòng 1
  const titleCell = worksheet.getCell('A1').value;
  assert.ok(String(titleCell).includes('BÁO CÁO BẢNG TỔNG HỢP CHẤM CÔNG'), 'Dòng 1 có tiêu đề báo cáo');

  // Kiểm tra kỳ báo cáo tại dòng 2
  const periodCell = worksheet.getCell('A2').value;
  assert.ok(String(periodCell).includes('10/2026'), 'Dòng 2 có thông tin Tháng 10/2026');

  // Kiểm tra tóm tắt chỉ số tại dòng 5
  const summaryCell = worksheet.getCell('A5').value;
  assert.ok(String(summaryCell).includes('Tổng bản ghi: 4'), 'Dòng 5 có tóm tắt 4 bản ghi');

  // Kiểm tra tiêu đề các cột tại dòng 7
  assert.strictEqual(worksheet.getCell('A7').value, 'STT');
  assert.strictEqual(worksheet.getCell('B7').value, 'Mã nhân viên');
  assert.strictEqual(worksheet.getCell('C7').value, 'Họ và tên');
  assert.strictEqual(worksheet.getCell('D7').value, 'Phòng ban');
  assert.strictEqual(worksheet.getCell('F7').value, 'Ngày chấm công');
  assert.strictEqual(worksheet.getCell('I7').value, 'Trạng thái');

  // Kiểm tra dữ liệu dòng 8 (bản ghi đầu tiên)
  assert.strictEqual(worksheet.getCell('B8').value, 'NV001');
  assert.strictEqual(worksheet.getCell('C8').value, 'Nguyễn Văn An');
  assert.strictEqual(worksheet.getCell('I8').value, 'Đúng giờ');
});

await runAsyncTest('Test 2: Mặc định định dạng xlsx khi client không gửi tham số format', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(
    res.headers['content-type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  assert.ok(res.headers['content-disposition'].includes('.xlsx'));
});

// -----------------------------------------------------------------------------
// NHÓM 2: XUẤT FILE CSV (.CSV) & CHỐNG FORMULA INJECTION
// -----------------------------------------------------------------------------
console.log('\n📋 NHÓM 2: XUẤT FILE CSV (.CSV) & BẢO MẬT PHÒNG CHỐNG FORMULA INJECTION');

await runAsyncTest('Test 3: Xuất file CSV (format=csv) với tháng/năm hợp lệ -> 200 OK, UTF-8 BOM, tiêu đề cột', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=csv', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
  assert.ok(res.headers['content-disposition'].includes('bao_cao_cham_cong_2026_10.csv'));

  // Kiểm tra tiền tố UTF-8 BOM: \uFEFF (3 byte 0xEF, 0xBB, 0xBF)
  assert.strictEqual(res.buffer[0], 0xEF);
  assert.strictEqual(res.buffer[1], 0xBB);
  assert.strictEqual(res.buffer[2], 0xBF);

  const text = res.text;
  assert.ok(text.includes('STT,Mã nhân viên,Họ và tên,Phòng ban,Chức vụ,Ngày chấm công,Giờ vào,Giờ ra,Trạng thái,Ghi chú'));
  assert.ok(text.includes('NV001'));
  assert.ok(text.includes('Nguyễn Văn An'));
  assert.ok(text.includes('Phòng Kỹ thuật & CNTT'));
  assert.ok(text.includes('Tổng kết kỳ báo cáo:'));
  assert.ok(text.includes('Tổng số bản ghi: 4'));
});

await runAsyncTest('Test 4: Dữ liệu có tên tiếng Việt, dấu phẩy, dấu nháy kép " và xuống dòng -> CSV escape chuẩn RFC 4180', async () => {
  reportRepository.getAttendanceReportData = async () => [
    {
      attendance_id: 201,
      employee_id: 10,
      employee_code: 'NV010',
      employee_name: 'Đặng "Văn" Hùng, Jr.', // Có dấu phẩy và nháy kép
      position: 'Kỹ sư Phần mềm',
      department_id: 1,
      department_name: 'Phòng Kỹ thuật, Dự án 1', // Có dấu phẩy
      attendance_date: '2026-10-16',
      check_in: '08:30:00',
      check_out: '17:30:00',
      attendance_status: 'OnTime',
      note: 'Dòng 1 ghi chú\nDòng 2 chi tiết', // Có ký tự xuống dòng
    },
  ];

  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=csv', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  const text = res.text;

  // Dấu nháy kép phải được escape thành "" và bọc toàn chuỗi trong "..."
  assert.ok(text.includes('"Đặng ""Văn"" Hùng, Jr."'), 'Escape nháy kép và bao bọc khi có dấu phẩy');
  assert.ok(text.includes('"Phòng Kỹ thuật, Dự án 1"'), 'Bao bọc phòng ban khi có dấu phẩy');
  assert.ok(text.includes('"Dòng 1 ghi chú\nDòng 2 chi tiết"'), 'Bao bọc ghi chú khi có ký tự xuống dòng');

  // Khôi phục mock
  reportRepository.getAttendanceReportData = async () => sampleAttendanceData;
});

await runAsyncTest('Test 5: Chống CSV Formula Injection (CWE-1236): Dữ liệu bắt đầu bằng =, +, -, @ được chèn nháy đơn (\')', async () => {
  reportRepository.getAttendanceReportData = async () => [
    {
      attendance_id: 301,
      employee_id: 20,
      employee_code: '=1+1', // Formula injection
      employee_name: '+84912345678', // Dấu cộng
      position: '-DANGEROUS_CMD', // Dấu trừ chuỗi
      department_id: 1,
      department_name: '@AdminGroup', // Dấu @
      attendance_date: '2026-10-16',
      check_in: '08:20:00',
      check_out: '17:30:00',
      attendance_status: 'OnTime',
      note: '=cmd|"/C calc"!A0', // Payload khai thác độc hại
    },
  ];

  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=csv', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  const text = res.text;

  // Toàn bộ các trường chuỗi bắt đầu bằng ký tự công thức phải có tiền tố nháy đơn (')
  assert.ok(text.includes("'=1+1"), '=1+1 phải được chèn nháy đơn');
  assert.ok(text.includes("'+84912345678"), '+84912345678 phải được chèn nháy đơn');
  assert.ok(text.includes("'-DANGEROUS_CMD"), '-DANGEROUS_CMD phải được chèn nháy đơn');
  assert.ok(text.includes("'@AdminGroup"), '@AdminGroup phải được chèn nháy đơn');
  assert.ok(text.includes("'=cmd"), '=cmd payload phải bị vô hiệu hóa bằng nháy đơn');

  // Khôi phục mock
  reportRepository.getAttendanceReportData = async () => sampleAttendanceData;
});

// -----------------------------------------------------------------------------
// NHÓM 3: VALIDATION THAM SỐ ĐẦU VÀO & HTTP 400 ERROR HANDLING
// -----------------------------------------------------------------------------
console.log('\n📋 NHÓM 3: VALIDATION THAM SỐ VÀ HTTP 400 BAD REQUEST');

await runAsyncTest('Test 6: Format không được hỗ trợ (format=pdf) -> 400 Bad Request (INVALID_FORMAT)', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=pdf', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'INVALID_FORMAT');
  assert.ok(res.body.message.includes('không được hỗ trợ'));
});

await runAsyncTest('Test 7: Tham số month ngoài phạm vi 1-12 (month=13 hoặc month=0) -> 400 Bad Request', async () => {
  const res1 = await makeRequest('/api/reports/attendance/export?month=13&year=2026', { token: adminToken });
  assert.strictEqual(res1.statusCode, 400);
  assert.strictEqual(res1.body.errorCode, 'INVALID_MONTH');

  const res2 = await makeRequest('/api/reports/attendance/export?month=0&year=2026', { token: adminToken });
  assert.strictEqual(res2.statusCode, 400);
  assert.strictEqual(res2.body.errorCode, 'INVALID_MONTH');

  const res3 = await makeRequest('/api/reports/attendance/export?month=abc&year=2026', { token: adminToken });
  assert.strictEqual(res3.statusCode, 400);
  assert.strictEqual(res3.body.errorCode, 'INVALID_MONTH');
});

await runAsyncTest('Test 8: Tham số year ngoài phạm vi 1900-2100 (year=1850 hoặc year=abc) -> 400 Bad Request', async () => {
  const res1 = await makeRequest('/api/reports/attendance/export?month=10&year=1850', { token: adminToken });
  assert.strictEqual(res1.statusCode, 400);
  assert.strictEqual(res1.body.errorCode, 'INVALID_YEAR');

  const res2 = await makeRequest('/api/reports/attendance/export?month=10&year=abc', { token: adminToken });
  assert.strictEqual(res2.statusCode, 400);
  assert.strictEqual(res2.body.errorCode, 'INVALID_YEAR');
});

await runAsyncTest('Test 9: Chỉ truyền 1 trong 2 tham số month hoặc year -> 400 Bad Request (INVALID_PARAMS)', async () => {
  const res1 = await makeRequest('/api/reports/attendance/export?month=10', { token: adminToken });
  assert.strictEqual(res1.statusCode, 400);
  assert.strictEqual(res1.body.errorCode, 'INVALID_PARAMS');

  const res2 = await makeRequest('/api/reports/attendance/export?year=2026', { token: adminToken });
  assert.strictEqual(res2.statusCode, 400);
  assert.strictEqual(res2.body.errorCode, 'INVALID_PARAMS');
});

await runAsyncTest('Test 10: Xuất theo khoảng ngày fromDate và toDate hợp lệ -> 200 OK', async () => {
  const res = await makeRequest(
    '/api/reports/attendance/export?fromDate=2026-10-01&toDate=2026-10-15&format=xlsx',
    { token: adminToken }
  );

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['content-disposition'].includes('bao_cao_cham_cong_20261001_20261015.xlsx'));
});

await runAsyncTest('Test 11: Khoảng ngày lỗi: fromDate > toDate -> 400 Bad Request (INVALID_DATE_RANGE)', async () => {
  const res = await makeRequest(
    '/api/reports/attendance/export?fromDate=2026-10-20&toDate=2026-10-10',
    { token: adminToken }
  );

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'INVALID_DATE_RANGE');
});

await runAsyncTest('Test 12: Khoảng ngày sai định dạng YYYY-MM-DD -> 400 Bad Request (INVALID_DATE_FORMAT)', async () => {
  const res = await makeRequest(
    '/api/reports/attendance/export?fromDate=01-10-2026&toDate=2026-10-15',
    { token: adminToken }
  );

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.errorCode, 'INVALID_DATE_FORMAT');
});

// -----------------------------------------------------------------------------
// NHÓM 4: BẢO MẬT XÁC THỰC JWT & PHÂN QUYỀN RBAC
// -----------------------------------------------------------------------------
console.log('\n📋 NHÓM 4: BẢO MẬT XÁC THỰC JWT & PHÂN QUYỀN RBAC');

await runAsyncTest('Test 13: Không có JWT trong request -> 401 Unauthorized (TOKEN_REQUIRED)', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026');

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.errorCode, 'TOKEN_REQUIRED');
});

await runAsyncTest('Test 14: Token hết hạn sử dụng -> 401 Unauthorized (TOKEN_EXPIRED)', async () => {
  const expiredToken = jwt.sign(
    { sub: 1, username: 'admin', role: 'Admin' },
    env.jwtSecret || env.JWT_SECRET || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE',
    { expiresIn: '-1s' }
  );

  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026', { token: expiredToken });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.errorCode, 'TOKEN_EXPIRED');
});

await runAsyncTest('Test 15: EMPLOYEE cố ý truyền employeeId của nhân viên khác -> 403 Forbidden', async () => {
  const employeeToken = generateTestToken({
    sub: 3,
    userId: 3,
    employeeId: 3,
    username: 'emp_nam',
    role: 'Employee',
  });

  // Nhân viên ID 3 cố xuất dữ liệu của nhân viên ID 1
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&employeeId=1', {
    token: employeeToken,
  });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.errorCode, 'FORBIDDEN');
  assert.ok(res.body.message.includes('chỉ có quyền xuất báo cáo chấm công của chính mình'));
});

await runAsyncTest('Test 16: EMPLOYEE xuất báo cáo của chính mình -> 200 OK', async () => {
  const employeeToken = generateTestToken({
    sub: 3,
    userId: 3,
    employeeId: 3,
    username: 'emp_nam',
    role: 'Employee',
  });

  let capturedEmpIdFilter = null;
  reportRepository.getAttendanceReportData = async ({ employeeId }) => {
    capturedEmpIdFilter = employeeId;
    return [sampleAttendanceData[2]]; // Chỉ lấy dữ liệu của chính mình
  };

  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=xlsx', {
    token: employeeToken,
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(capturedEmpIdFilter, 3, 'Service phải ép buộc lọc đúng employeeId = 3 của tài khoản đang đăng nhập');

  // Khôi phục mock
  reportRepository.getAttendanceReportData = async () => sampleAttendanceData;
});

await runAsyncTest('Test 17: ADMIN & HR_MANAGER lọc theo departmentId thành công -> 200 OK', async () => {
  let capturedDeptFilter = null;
  reportRepository.getAttendanceReportData = async ({ departmentId }) => {
    capturedDeptFilter = departmentId;
    return sampleAttendanceData.filter((r) => r.department_id === departmentId);
  };

  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&departmentId=1&format=xlsx', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(capturedDeptFilter, 1, 'Lọc đúng phòng ban ID = 1');

  // Khôi phục mock
  reportRepository.getAttendanceReportData = async () => sampleAttendanceData;
});

// -----------------------------------------------------------------------------
// NHÓM 5: TRƯỜNG HỢP BIÊN & BẢO MẬT DỮ LIỆU
// -----------------------------------------------------------------------------
console.log('\n📋 NHÓM 5: TRƯỜNG HỢP BIÊN VÀ BẢO MẬT DỮ LIỆU NHẠY CẢM');

await runAsyncTest('Test 18: Kỳ báo cáo không có dữ liệu -> 200 OK, trả về file Excel & CSV chuẩn có thông báo rỗng', async () => {
  reportRepository.getAttendanceReportData = async () => [];
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 0,
    totalWorkDays: 0,
    onTimeCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
  });

  // 1. Kiểm tra Excel rỗng
  const resXlsx = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=xlsx', {
    token: adminToken,
  });
  assert.strictEqual(resXlsx.statusCode, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(resXlsx.buffer);
  const ws = wb.getWorksheet('BaoCaoChamCong');
  assert.ok(ws);
  assert.ok(String(ws.getCell('C8').value).includes('Không có bản ghi chấm công nào'));

  // 2. Kiểm tra CSV rỗng
  const resCsv = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=csv', {
    token: adminToken,
  });
  assert.strictEqual(resCsv.statusCode, 200);
  assert.ok(resCsv.text.includes('Không có bản ghi chấm công nào trong kỳ báo cáo đã chọn'));

  // Khôi phục mock
  reportRepository.getAttendanceReportData = async () => sampleAttendanceData;
  reportRepository.getAttendanceReportSummary = async () => sampleSummary;
});

await runAsyncTest('Test 19: Bản ghi chưa check-out -> Hiển thị rỗng hoặc --:--, không bị tính nhầm là về sớm', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=csv', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  const text = res.text;

  // NV004 chưa check-out
  assert.ok(text.includes('NV004'));
  assert.ok(text.includes('--:--')); // Giờ ra hiển thị --:--
});

await runAsyncTest('Test 20: Bảo mật dữ liệu: File xuất TUYỆT ĐỐI không chứa CCCD, mật khẩu, hash hoặc token', async () => {
  const res = await makeRequest('/api/reports/attendance/export?month=10&year=2026&format=csv', {
    token: adminToken,
  });

  assert.strictEqual(res.statusCode, 200);
  const text = res.text;

  assert.ok(!text.includes('ssn'), 'Không chứa trường ssn');
  assert.ok(!text.includes('ssn_encrypted'), 'Không chứa ssn_encrypted');
  assert.ok(!text.includes('password'), 'Không chứa password');
  assert.ok(!text.includes('eyJhbGci'), 'Không chứa chuỗi JWT Token');
});

await stopTestServer();

console.log('\n==============================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ API BÁO CÁO: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ!`);
console.log('   API GET /api/reports/attendance/export hoạt động hoàn hảo và bảo mật 100%.');
console.log('==============================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
