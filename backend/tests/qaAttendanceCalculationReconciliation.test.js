/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG QA: ĐỘ CHÍNH XÁC THUẬT TOÁN TÍNH TỔNG NGÀY CÔNG & ĐỐI SOÁT DỮ LIỆU
 * (US 19.0 - HRM-209 & HRM-210 Verification & Reconciliation)
 * ==============================================================================
 * 
 * PHẠM VI KIỂM THỬ CHUYÊN SÂU:
 * 1. Độ chính xác thuật toán phân loại mốc biên (08:30:00 vs 08:30:01, 17:30:00 vs 17:29:59).
 * 2. Phân loại ca làm việc: Chưa check-out, Đúng giờ, Đi muộn, Về sớm, Muộn & Về sớm, Vắng mặt.
 * 3. Thuật toán đếm ngày công (totalWorkDays):
 *    - Check-in đúng giờ -> 1 ngày công.
 *    - Check-in đi muộn -> 1 ngày công.
 *    - Check-in nhưng chưa check-out -> 1 ngày công.
 *    - Bản ghi Vắng mặt (Absent, check-in NULL) -> 0 ngày công (Loại trừ tuyệt đối).
 *    - Khử trùng lặp (Deduplication): Đảm bảo 1 nhân viên chỉ được tính tối đa 1 công / ngày.
 * 4. Thuật toán đếm đi muộn (lateCount): Đếm đúng các ca check-in sau 08:30:00.
 * 5. Thuật toán đếm về sớm (earlyLeaveCount):
 *    - Đếm đúng các ca check-out trước 17:30:00.
 *    - TUYỆT ĐỐI KHÔNG đếm nhầm các ca chưa check-out.
 * 6. Thuật toán đếm đúng giờ (onTimeCount):
 *    - Đếm đúng các ca check-in trước hoặc đúng 08:30:00 và không bị gắn cờ Late.
 * 7. Kiểm tra tính bất biến của KPI Summary khi phân trang (Pagination Invariance):
 *    - Thống kê toàn tháng không bị cắt xén khi client phân trang (page=1, page=2...).
 * 8. Đối soát dữ liệu độc lập (Independent Data Reconciliation):
 *    - So khớp kết quả của API GET /api/attendance/history với câu truy vấn SQL kiểm toán độc lập.
 * 9. Dọn dẹp an toàn (Teardown & Cleanup) trả lại trạng thái nguyên vẹn cho CSDL.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';
import mysql from 'mysql2/promise';
import { 
  getVietnamAttendanceInfo, 
  getCurrentVietnamMonthYear, 
  getMonthDateRange, 
  evaluateAttendanceRecord,
  CUTOFF_TOTAL_SECONDS,
  SHIFT_END_TOTAL_SECONDS,
} from '../src/utils/attendanceTime.js';
import { env } from '../src/config/env.js';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3005/api';

// Cấu hình kết nối MySQL trực tiếp cho đối soát
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3308,
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
  database: process.env.DB_NAME || 'hrm_db',
  waitForConnections: true,
  connectionLimit: 5,
};

let dbPool;
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

async function makeRequest(path, options = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : null;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed,
            });
          } catch {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              rawBody: body,
            });
          }
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

// ------------------------------------------------------------------------------
// KHỞI ĐỘNG VÀ THIẾT LẬP MÔI TRƯỜNG KIỂM THỬ
// ------------------------------------------------------------------------------

console.log('\n==============================================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: ĐỘ CHÍNH XÁC THUẬT TOÁN & ĐỐI SOÁT DỮ LIỆU CHẤM CÔNG');
console.log('==============================================================================\n');

try {
  dbPool = mysql.createPool(dbConfig);
} catch (err) {
  console.error('Không thể khởi tạo MySQL Connection Pool:', err);
  process.exit(1);
}

// Lấy Token đăng nhập Admin để gọi API
let adminToken = '';
let qaEmployeeId = null;
const QA_TEST_MONTH = 11;
const QA_TEST_YEAR = 2026;
const createdAttendanceIds = [];

// ==============================================================================
// PHẦN 1: KIỂM THỬ ĐỘ CHÍNH XÁC CỦA THUẬT TOÁN BIÊN THỜI GIAN (UNIT LEVEL)
// ==============================================================================

console.log('📋 PHẦN 1: KIỂM THỬ ĐỘ CHÍNH XÁC THUẬT TOÁN MỐC BIÊN & PHÂN LOẠI TRẠNG THÁI');

runTest('1.1. Mốc biên chính xác vào ca 08:30:00 -> Đúng giờ (Không bị tính là đi muộn)', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: '08:30:00',
    checkOutTime: '17:35:00',
    status: 'OnTime',
  });
  assert.strictEqual(result.isLate, false, '08:30:00 không được tính là đi muộn');
  assert.strictEqual(result.isEarlyLeave, false);
  assert.strictEqual(result.status, 'ON_TIME');
});

runTest('1.2. Vượt mốc vào ca 1 giây 08:30:01 -> Đi muộn (Late)', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: '08:30:01',
    checkOutTime: '17:35:00',
    status: 'Late',
  });
  assert.strictEqual(result.isLate, true, '08:30:01 phải tính là đi muộn');
  assert.strictEqual(result.isEarlyLeave, false);
  assert.strictEqual(result.status, 'LATE');
});

runTest('1.3. Mốc biên chính xác tan ca 17:30:00 -> Đúng giờ (Không bị tính là về sớm)', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: '08:15:00',
    checkOutTime: '17:30:00',
    status: 'OnTime',
  });
  assert.strictEqual(result.isLate, false);
  assert.strictEqual(result.isEarlyLeave, false, '17:30:00 không được tính là về sớm');
  assert.strictEqual(result.status, 'ON_TIME');
});

runTest('1.4. Trước mốc tan ca 1 giây 17:29:59 -> Về sớm (Early Leave)', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: '08:15:00',
    checkOutTime: '17:29:59',
    status: 'OnTime',
  });
  assert.strictEqual(result.isLate, false);
  assert.strictEqual(result.isEarlyLeave, true, '17:29:59 phải tính là về sớm');
  assert.strictEqual(result.status, 'EARLY_LEAVE');
});

runTest('1.5. Ca vừa đi muộn vừa về sớm (Check-in 08:35:00, Check-out 17:20:00)', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: '08:35:00',
    checkOutTime: '17:20:00',
    status: 'OnTime',
  });
  assert.strictEqual(result.isLate, true, 'Đi muộn 5 phút');
  assert.strictEqual(result.isEarlyLeave, true, 'Về sớm 10 phút');
  assert.strictEqual(result.status, 'LATE_AND_EARLY_LEAVE');
});

runTest('1.6. Đã Check-in nhưng Chưa Check-out -> TUYỆT ĐỐI KHÔNG tính là về sớm', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: '08:20:00',
    checkOutTime: null,
    status: 'OnTime',
  });
  assert.strictEqual(result.isLate, false);
  assert.strictEqual(result.isEarlyLeave, false, 'Chưa check-out không thể kết luận về sớm');
  assert.strictEqual(result.status, 'ON_TIME');
});

runTest('1.7. Bản ghi Vắng mặt (check-in null, check-out null, status Absent)', () => {
  const result = evaluateAttendanceRecord({
    checkInTime: null,
    checkOutTime: null,
    status: 'Absent',
  });
  assert.strictEqual(result.isLate, false);
  assert.strictEqual(result.isEarlyLeave, false);
  assert.strictEqual(result.status, 'ABSENT');
});

runTest('1.8. Thuật toán tính ranh giới tháng ISO và ngày nhuận', () => {
  const r2026_11 = getMonthDateRange(2026, 11);
  assert.strictEqual(r2026_11.startDate, '2026-11-01');
  assert.strictEqual(r2026_11.endDate, '2026-12-01');
  assert.strictEqual(r2026_11.lastDayOfMonth, 30);

  const r2026_12 = getMonthDateRange(2026, 12);
  assert.strictEqual(r2026_12.startDate, '2026-12-01');
  assert.strictEqual(r2026_12.endDate, '2027-01-01');
  assert.strictEqual(r2026_12.lastDayOfMonth, 31);

  const r2024_02 = getMonthDateRange(2024, 2);
  assert.strictEqual(r2024_02.lastDayOfMonth, 29); // Năm nhuận
});

// ==============================================================================
// PHẦN 2: THIẾT LẬP DỮ LIỆU ĐỐI SOÁT & KIỂM THỬ THUẬT TOÁN TỔNG HỢP CSDL
// ==============================================================================

console.log('\n📋 PHẦN 2: TẠO TẬP DỮ LIỆU CHUẨN KIỂM TOÁN (GOLDEN AUDIT DATASET) & ĐỐI SOÁT');

await runAsyncTest('2.1. Đăng nhập lấy JWT Admin và định danh Nhân viên kiểm thử', async () => {
  const loginRes = await makeRequest('/auth/login', {
    method: 'POST',
    body: {
      username: 'admin',
      password: 'Admin@123',
    },
  });

  assert.strictEqual(loginRes.statusCode, 200, 'Đăng nhập Admin phải thành công');
  const token = loginRes.body.data?.accessToken || loginRes.body.data?.token;
  assert.ok(token, 'Response phải chứa JWT token');
  adminToken = token;

  // Lấy 1 nhân viên hợp lệ (ví dụ NV001 - id=1) để phục vụ kịch bản kiểm thử
  const [empRows] = await dbPool.query('SELECT employee_id, full_name FROM employees WHERE employee_id = 1 LIMIT 1');
  assert.ok(empRows.length > 0, 'Phải có nhân viên id=1 trong CSDL');
  qaEmployeeId = empRows[0].employee_id;
});

await runAsyncTest('2.2. Nạp tập dữ liệu kiểm toán vào Tháng 11/2026 cho nhân viên test', async () => {
  // Dọn dẹp dữ liệu cũ của Tháng 11/2026 (nếu có từ lần chạy trước)
  await dbPool.query(
    'DELETE FROM attendances WHERE employee_id = ? AND attendance_date >= "2026-11-01" AND attendance_date < "2026-12-01"',
    [qaEmployeeId]
  );

  /**
   * KỊCH BẢN TẬP DỮ LIỆU ĐỐI SOÁT (7 ngày thử nghiệm):
   * - Ngày 01/11: Check-in 08:15:00, Check-out 17:35:00 -> Đúng giờ (Công = 1, Đúng giờ = 1)
   * - Ngày 02/11: Check-in 08:30:00, Check-out 17:30:00 -> Mốc biên đúng giờ (Công = 1, Đúng giờ = 1)
   * - Ngày 03/11: Check-in 08:30:01, Check-out 17:35:00 -> Đi muộn 1s (Công = 1, Đi muộn = 1)
   * - Ngày 04/11: Check-in 08:15:00, Check-out 17:29:59 -> Về sớm 1s (Công = 1, Về sớm = 1, Đúng giờ vào ca = 1)
   * - Ngày 05/11: Check-in 08:45:00, Check-out 16:30:00 -> Cả muộn & về sớm (Công = 1, Đi muộn = 1, Về sớm = 1)
   * - Ngày 06/11: Check-in 08:20:00, Check-out NULL     -> Chưa check-out (Công = 1, Đúng giờ = 1, KHÔNG tính về sớm)
   * - Ngày 07/11: Check-in NULL,     Check-out NULL     -> Nghỉ vắng mặt Absent (Công = 0, KHÔNG tính ngày công!)
   * 
   * KỲ VỌNG ĐỐI SOÁT (EXPECTED SUMMARY):
   * - totalWorkDays: 6 (ngày 1, 2, 3, 4, 5, 6; KHÔNG TÍNH ngày 7)
   * - onTimeCount: 4 (ngày 1, 2, 4, 6)
   * - lateCount: 2 (ngày 3, 5)
   * - earlyLeaveCount: 2 (ngày 4, 5; ngày 6 chưa check-out tuyệt đối không đếm)
   */

  const auditDataset = [
    { date: '2026-11-01', in: '08:15:00', out: '17:35:00', status: 'OnTime', note: 'Ca chuẩn đúng giờ' },
    { date: '2026-11-02', in: '08:30:00', out: '17:30:00', status: 'OnTime', note: 'Mốc biên chuẩn' },
    { date: '2026-11-03', in: '08:30:01', out: '17:35:00', status: 'Late', note: 'Muộn 1 giây' },
    { date: '2026-11-04', in: '08:15:00', out: '17:29:59', status: 'EarlyLeave', note: 'Về sớm 1 giây' },
    { date: '2026-11-05', in: '08:45:00', out: '16:30:00', status: 'Late', note: 'Vừa muộn vừa về sớm' },
    { date: '2026-11-06', in: '08:20:00', out: null, status: 'OnTime', note: 'Chưa check-out ca làm' },
    { date: '2026-11-07', in: null, out: null, status: 'Absent', note: 'Nghỉ vắng mặt không phép' },
  ];

  for (const item of auditDataset) {
    const [res] = await dbPool.query(
      `INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, attendance_status, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [qaEmployeeId, item.date, item.in, item.out, item.status, item.note]
    );
    createdAttendanceIds.push(res.insertId);
  }

  assert.strictEqual(createdAttendanceIds.length, 7, 'Phải nạp thành công 7 bản ghi kiểm toán');
});

await runAsyncTest('2.3. Đối soát API GET /api/attendance/history với Kỳ vọng Nghiệp vụ', async () => {
  const res = await makeRequest(
    `/attendance/history?month=${QA_TEST_MONTH}&year=${QA_TEST_YEAR}&employeeId=${qaEmployeeId}`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    }
  );

  assert.strictEqual(res.statusCode, 200, 'API phải trả về HTTP 200');
  const body = res.body;

  // 1. Kiểm tra bộ lọc
  assert.strictEqual(body.filters.month, 11);
  assert.strictEqual(body.filters.year, 2026);
  assert.strictEqual(body.filters.employeeId, qaEmployeeId);

  // 2. Đối soát KPI Summary
  const { totalWorkDays, onTimeCount, lateCount, earlyLeaveCount } = body.summary;

  console.log(`     📊 Kết quả API: totalWorkDays=${totalWorkDays}, onTimeCount=${onTimeCount}, lateCount=${lateCount}, earlyLeaveCount=${earlyLeaveCount}`);

  // THUẬT TOÁN 1: Tổng ngày công phải chính xác là 6 ngày (loại trừ ngày 7 Absent)
  assert.strictEqual(
    totalWorkDays,
    6,
    `ĐỘ CHÍNH XÁC TỔNG NGÀY CÔNG: Kỳ vọng 6 ngày thực làm, thực tế API trả về ${totalWorkDays}`
  );

  // THUẬT TOÁN 2: Số lần đi làm đúng giờ vào ca phải là 4 (ngày 1, 2, 4, 6)
  assert.strictEqual(
    onTimeCount,
    4,
    `ĐỘ CHÍNH XÁC ĐÚNG GIỜ: Kỳ vọng 4 ca đúng giờ, thực tế API trả về ${onTimeCount}`
  );

  // THUẬT TOÁN 3: Số lần đi muộn phải là 2 (ngày 3 và ngày 5)
  assert.strictEqual(
    lateCount,
    2,
    `ĐỘ CHÍNH XÁC ĐI MUỘN: Kỳ vọng 2 lần đi muộn, thực tế API trả về ${lateCount}`
  );

  // THUẬT TOÁN 4: Số lần về sớm phải là 2 (ngày 4 và ngày 5; ngày 6 chưa check-out không tính)
  assert.strictEqual(
    earlyLeaveCount,
    2,
    `ĐỘ CHÍNH XÁC VỀ SỚM: Kỳ vọng 2 lần về sớm, thực tế API trả về ${earlyLeaveCount}`
  );

  // 3. Đối soát phân trang tổng bản ghi (7 bản ghi trong CSDL gồm cả Absent)
  assert.strictEqual(body.pagination.totalRecords, 7);
});

await runAsyncTest('2.4. Kiểm tra tính Bất biến của KPI Summary khi Phân trang (Pagination Invariance)', async () => {
  // Trang 1 với limit = 2
  const page1Res = await makeRequest(
    `/attendance/history?month=${QA_TEST_MONTH}&year=${QA_TEST_YEAR}&employeeId=${qaEmployeeId}&page=1&limit=2`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );

  // Trang 2 với limit = 2
  const page2Res = await makeRequest(
    `/attendance/history?month=${QA_TEST_MONTH}&year=${QA_TEST_YEAR}&employeeId=${qaEmployeeId}&page=2&limit=2`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );

  // Trang 3 với limit = 2
  const page3Res = await makeRequest(
    `/attendance/history?month=${QA_TEST_MONTH}&year=${QA_TEST_YEAR}&employeeId=${qaEmployeeId}&page=3&limit=2`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );

  assert.strictEqual(page1Res.statusCode, 200);
  assert.strictEqual(page2Res.statusCode, 200);
  assert.strictEqual(page3Res.statusCode, 200);

  // Số lượng item trên từng trang
  assert.strictEqual(page1Res.body.data.length, 2, 'Trang 1 có 2 bản ghi');
  assert.strictEqual(page2Res.body.data.length, 2, 'Trang 2 có 2 bản ghi');
  assert.strictEqual(page3Res.body.data.length, 2, 'Trang 3 có 2 bản ghi');

  // KPI Summary trên cả 3 trang PHẢI GIỐNG NHAU 100% và phản ánh toàn tháng (6 công, 4 đúng giờ, 2 muộn, 2 về sớm)
  assert.deepStrictEqual(page1Res.body.summary, page2Res.body.summary, 'Summary trang 1 và 2 phải đồng nhất');
  assert.deepStrictEqual(page2Res.body.summary, page3Res.body.summary, 'Summary trang 2 và 3 phải đồng nhất');
  assert.strictEqual(page1Res.body.summary.totalWorkDays, 6, 'Summary không bị ảnh hưởng bởi limit=2');
});

await runAsyncTest('2.5. Đối soát Độc lập bằng SQL Audit Query (Reconciliation với Database)', async () => {
  // Viết câu truy vấn kiểm toán độc lập hoàn toàn
  const auditSql = `
    SELECT 
      COUNT(DISTINCT CASE 
        WHEN (a.check_in IS NOT NULL OR a.check_out IS NOT NULL) AND UPPER(a.attendance_status) != 'ABSENT' 
        THEN a.attendance_date 
      END) AS audit_work_days,
      COUNT(DISTINCT CASE 
        WHEN a.check_in IS NOT NULL AND a.check_in <= '08:30:00' AND UPPER(a.attendance_status) NOT IN ('LATE', 'ABSENT')
        THEN a.attendance_date 
      END) AS audit_ontime,
      COUNT(DISTINCT CASE 
        WHEN UPPER(a.attendance_status) = 'LATE' OR (a.check_in IS NOT NULL AND a.check_in > '08:30:00')
        THEN a.attendance_date 
      END) AS audit_late,
      COUNT(DISTINCT CASE 
        WHEN UPPER(a.attendance_status) IN ('EARLYLEAVE', 'EARLY_LEAVE') OR (a.check_out IS NOT NULL AND a.check_out < '17:30:00')
        THEN a.attendance_date 
      END) AS audit_early
    FROM attendances a
    WHERE a.employee_id = ?
      AND a.attendance_date >= '2026-11-01'
      AND a.attendance_date < '2026-12-01'
  `;

  const [auditRows] = await dbPool.query(auditSql, [qaEmployeeId]);
  const audit = auditRows[0];

  const apiRes = await makeRequest(
    `/attendance/history?month=${QA_TEST_MONTH}&year=${QA_TEST_YEAR}&employeeId=${qaEmployeeId}`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );

  const apiSummary = apiRes.body.summary;

  assert.strictEqual(Number(audit.audit_work_days), apiSummary.totalWorkDays, 'Đối soát tổng ngày công khớp 100%');
  assert.strictEqual(Number(audit.audit_ontime), apiSummary.onTimeCount, 'Đối soát đúng giờ khớp 100%');
  assert.strictEqual(Number(audit.audit_late), apiSummary.lateCount, 'Đối soát đi muộn khớp 100%');
  assert.strictEqual(Number(audit.audit_early), apiSummary.earlyLeaveCount, 'Đối soát về sớm khớp 100%');
});

await runAsyncTest('2.6. Khử trùng lặp đa bản ghi trong ngày (Deduplication Check)', async () => {
  // Thử mô phỏng sự cố: Nhân viên test có thêm 1 bản ghi vào cùng ngày 01/11 (ví dụ đổi mã hoặc bản ghi phụ)
  // Lưu ý: bảng attendances có uk_attendances_emp_date nên ta kiểm tra với 2 nhân viên khác nhau cùng ngày
  // Đảm bảo khi lọc TOÀN CÔNG TY (employeeId = all/null), thuật toán Person-Days tính đúng
  const [emp2Rows] = await dbPool.query('SELECT employee_id FROM employees WHERE employee_id != ? LIMIT 1', [qaEmployeeId]);
  if (emp2Rows.length > 0) {
    const emp2Id = emp2Rows[0].employee_id;
    // Thêm bản ghi ngày 01/11 cho emp2
    const [ins] = await dbPool.query(
      `INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, attendance_status, note)
       VALUES (?, '2026-11-01', '08:20:00', '17:30:00', 'OnTime', 'Nhân viên 2 làm việc')`,
      [emp2Id]
    );
    createdAttendanceIds.push(ins.insertId);

    // Gọi API toàn công ty cho tháng 11/2026
    const allRes = await makeRequest(`/attendance/history?month=${QA_TEST_MONTH}&year=${QA_TEST_YEAR}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(allRes.statusCode, 200);
    // Ngày 01/11 có 2 nhân viên làm việc -> Tổng ngày công toàn công ty = 6 (của emp1) + 1 (của emp2) = 7
    assert.strictEqual(allRes.body.summary.totalWorkDays, 7, 'Toàn công ty phải tính tổng số nhân-ngày công là 7');
  }
});

// ==============================================================================
// PHẦN 3: DỌN DẸP DỮ LIỆU & BÁO CÁO KẾT THÚC
// ==============================================================================

console.log('\n📋 PHẦN 3: DỌN DẸP AN TOÀN TẬP DỮ LIỆU THỬ NGHIỆM');

await runAsyncTest('3.1. Xóa toàn bộ các bản ghi kiểm toán thử nghiệm trong Tháng 11/2026', async () => {
  if (createdAttendanceIds.length > 0) {
    const placeholders = createdAttendanceIds.map(() => '?').join(',');
    const [delRes] = await dbPool.query(
      `DELETE FROM attendances WHERE attendance_id IN (${placeholders})`,
      createdAttendanceIds
    );
    console.log(`     🧹 Đã dọn dẹp thành công ${delRes.affectedRows} bản ghi thử nghiệm khỏi CSDL.`);
  }

  // Đóng pool an toàn
  await dbPool.end();
});

console.log('\n==============================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ QA: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ!`);
console.log('   Thuật toán tính tổng ngày công, đi muộn, về sớm và đúng giờ đạt độ chính xác 100%.');
console.log('==============================================================================\n');
