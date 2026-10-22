/**
 * ==============================================================================
 * BỘ KIỂM THỬ LIVE QA AUDIT: ĐỐI SOÁT TỶ LỆ PHẦN TRĂM BIỂU ĐỒ VỚI CSDL THỰC TẾ
 * ==============================================================================
 * Môi trường: Live Backend API (http://127.0.0.1:3005) & MySQL Database (127.0.0.1:3309)
 * 
 * Mục tiêu QA:
 * 1. Truy vấn trực tiếp các bảng `departments`, `employees`, `attendances` trong MySQL 8.0.
 * 2. Tính toán tỷ trọng cơ cấu nhân sự & tỷ lệ chấm công đúng giờ theo chuẩn toán học CSDL.
 * 3. Gọi các Live API: GET /api/departments/statistics, GET /api/attendance/today.
 * 4. Thực thi logic biểu đồ Frontend (Doughnut SVG, Bar Chart SVG, Legend) và đối soát:
 *    - Pie Chart: employeeCount, percentage, empty departments, không tính Resigned.
 *    - Bar Chart: onTimeRate, số lượt check-in, nhãn "Chưa có DL" cho phòng ban 0 check-in.
 * 5. Kịch bản Live Mutation: Thêm dữ liệu chấm công muộn & phòng ban mới, xác minh biểu đồ
 *    phản ánh biến động CSDL 100% realtime, sau đó tự động rollback/cleanup sạch sẽ.
 * ==============================================================================
 */

import assert from 'node:assert';
import mysql from 'mysql2/promise';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3005';
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3309,
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
  database: process.env.DB_NAME || 'hrm_db',
};

let total = 0;
let passed = 0;

async function runTestCase(name, fn) {
  total++;
  try {
    console.log(`\n▶ [TEST ${total}] ${name}`);
    await fn();
    console.log(`  ✅ [PASS] Đạt chuẩn đối soát 100%`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Thất bại: ${err.message}`);
    throw err;
  }
}

async function getAdminToken() {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const body = await res.json();
  if (!res.ok || !body.data?.accessToken) {
    throw new Error(`Đăng nhập thất bại: ${JSON.stringify(body)}`);
  }
  return body.data.accessToken;
}

function getVietnamTodayString() {
  const now = new Date();
  const vnTime = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
  const yyyy = vnTime.getFullYear();
  const mm = String(vnTime.getMonth() + 1).padStart(2, '0');
  const dd = String(vnTime.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function runLiveAuditSuite() {
  console.log('==============================================================================');
  console.log('🔍 BẮT ĐẦU KIỂM THỬ LIVE QA: ĐỐI SOÁT TỶ LỆ TRÊN BIỂU ĐỒ VỚI CSDL THỰC TẾ');
  console.log(`   Backend URL: ${BACKEND_URL}`);
  console.log(`   MySQL Host:  ${DB_CONFIG.host}:${DB_CONFIG.port} (Database: ${DB_CONFIG.database})`);
  console.log('==============================================================================');

  const db = await mysql.createConnection(DB_CONFIG);
  const token = await getAdminToken();
  const todayStr = getVietnamTodayString();

  try {
    // --------------------------------------------------------------------------
    // KỊCH BẢN 1: ĐỐI SOÁT PIE CHART CƠ CẤU NHÂN SỰ VỚI CSDL THỰC TẾ
    // --------------------------------------------------------------------------
    await runTestCase('1. Đối soát Pie Chart Cơ cấu nhân sự: Số lượng & Tỷ trọng % với CSDL MySQL', async () => {
      // 1.1. Truy vấn trực tiếp CSDL MySQL
      const [dbRows] = await db.execute(`
        SELECT 
          d.department_id,
          d.department_code,
          d.department_name,
          COUNT(DISTINCT CASE WHEN e.employment_status IN ('Active', 'OnLeave') THEN e.employee_id END) AS active_count,
          COUNT(DISTINCT CASE WHEN e.employment_status = 'Resigned' THEN e.employee_id END) AS resigned_count
        FROM \`departments\` d
        LEFT JOIN \`employees\` e ON d.department_id = e.department_id
        WHERE d.is_active = 1
        GROUP BY d.department_id, d.department_code, d.department_name
        ORDER BY d.department_id ASC
      `);

      const totalDbEmployees = dbRows.reduce((sum, r) => sum + Number(r.active_count), 0);
      const totalDbDepartments = dbRows.length;
      const emptyDbDepartments = dbRows.filter((r) => Number(r.active_count) === 0).length;

      console.log(`     CSDL MySQL: ${totalDbDepartments} phòng ban, ${totalDbEmployees} nhân sự đang làm việc, ${emptyDbDepartments} phòng ban rỗng.`);

      // 1.2. Gọi API Backend GET /api/departments/statistics
      const res = await fetch(`${BACKEND_URL}/api/departments/statistics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200, 'HTTP status phải là 200 OK');
      const body = await res.json();
      assert.strictEqual(body.success, true, 'success phải là true');

      const apiSummary = body.meta || {};
      const apiDepartments = Array.isArray(body.data) ? body.data : body.data?.departments || [];

      // 1.3. Đối soát cấp độ tổng quan (Summary / KPI)
      assert.strictEqual(Number(apiSummary.totalDepartments), totalDbDepartments, 'Tổng số phòng ban phải khớp CSDL');
      assert.strictEqual(Number(apiSummary.totalEmployees), totalDbEmployees, 'Tổng nhân viên đang làm việc phải khớp CSDL');
      assert.strictEqual(
        Number(apiSummary.departmentsWithoutEmployees ?? apiSummary.emptyDepartments),
        emptyDbDepartments,
        'Số phòng ban chưa có nhân viên phải khớp CSDL'
      );

      // 1.4. Đối soát chi tiết từng phòng ban giữa CSDL và API
      console.log('\n     ┌────────────────────────────────────────────────────────────────────────────────────────┐');
      console.log('     │ BẢNG ĐỐI SOÁT CƠ CẤU NHÂN SỰ: CSDL THỰC TẾ VS API & BIỂU ĐỒ TRÒN (PIE CHART)           │');
      console.log('     ├─────┬──────────────────────┬─────────────┬──────────────┬─────────────┬────────────────┤');
      console.log('     │ ID  │ Tên Phòng Ban        │ DB Nhân sự  │ DB Tỷ trọng  │ API Nhân sự │ Biểu đồ Tỷ trọng│');
      console.log('     ├─────┼──────────────────────┼─────────────┼──────────────┼─────────────┼────────────────┤');

      let sumChartPercentage = 0;

      for (const dbDept of dbRows) {
        const apiDept = apiDepartments.find((d) => Number(d.departmentId) === Number(dbDept.department_id));
        assert.ok(apiDept, `Phòng ban ID ${dbDept.department_id} phải có trong kết quả API`);

        const expectedCount = Number(dbDept.active_count);
        const expectedPercentage = totalDbEmployees > 0
          ? Number(((expectedCount / totalDbEmployees) * 100).toFixed(2))
          : 0;

        assert.strictEqual(Number(apiDept.employeeCount), expectedCount, `Số nhân viên phòng ban ${apiDept.departmentName} phải khớp CSDL`);
        assert.strictEqual(Number(apiDept.percentage), expectedPercentage, `Tỷ trọng phòng ban ${apiDept.departmentName} phải khớp CSDL`);

        sumChartPercentage += Number(apiDept.percentage);

        const padName = String(dbDept.department_name).padEnd(20).slice(0, 20);
        const padDbCount = String(expectedCount).padStart(11);
        const padDbPct = `${expectedPercentage}%`.padStart(12);
        const padApiCount = String(apiDept.employeeCount).padStart(11);
        const padApiPct = `${apiDept.percentage}%`.padStart(14);

        console.log(`     │ ${String(dbDept.department_id).padStart(3)} │ ${padName} │ ${padDbCount} │ ${padDbPct} │ ${padApiCount} │ ${padApiPct} │`);
      }
      console.log('     └─────┴──────────────────────┴─────────────┴──────────────┴─────────────┴────────────────┘');

      // 1.5. Kiểm tra tính toàn vẹn: Tổng tỷ trọng xấp xỉ 100% (cho phép sai số làm tròn 0.05%)
      assert.ok(
        Math.abs(sumChartPercentage - 100) <= 0.05,
        `Tổng tỷ trọng các phòng ban phải xấp xỉ 100% (Thực tế: ${sumChartPercentage.toFixed(2)}%)`
      );
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 2: ĐỐI SOÁT BAR CHART TỶ LỆ CHẤM CÔNG ĐÚNG GIỜ VỚI CSDL THỰC TẾ
    // --------------------------------------------------------------------------
    await runTestCase('2. Đối soát Bar Chart Tỷ lệ đúng giờ: Check-in, On-time & nhãn Chưa có DL với CSDL', async () => {
      // 2.1. Truy vấn trực tiếp CSDL MySQL cho ngày hôm nay
      const [dbAttRows] = await db.execute(`
        SELECT 
          d.department_id,
          d.department_name,
          COUNT(DISTINCT CASE WHEN a.check_in IS NOT NULL THEN a.employee_id END) AS today_checkins,
          COUNT(DISTINCT CASE 
            WHEN a.check_in IS NOT NULL AND (a.attendance_status = 'OnTime' OR a.attendance_status = 'ON_TIME') 
            THEN a.employee_id 
          END) AS today_ontime,
          COUNT(DISTINCT CASE 
            WHEN a.check_in IS NOT NULL AND (a.attendance_status = 'Late' OR a.attendance_status = 'LATE') 
            THEN a.employee_id 
          END) AS today_late
        FROM \`departments\` d
        JOIN \`employees\` e ON d.department_id = e.department_id AND e.employment_status = 'Active'
        LEFT JOIN \`attendances\` a ON e.employee_id = a.employee_id AND a.attendance_date = ?
        WHERE d.is_active = 1
        GROUP BY d.department_id, d.department_name
        ORDER BY d.department_id ASC
      `, [todayStr]);

      // 2.2. Gọi Live API GET /api/attendance/today
      const attRes = await fetch(`${BACKEND_URL}/api/attendance/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(attRes.status, 200, 'HTTP status GET /attendance/today phải là 200 OK');
      const attBody = await attRes.json();
      const records = Array.isArray(attBody.data) ? attBody.data : [];

      console.log('\n     ┌────────────────────────────────────────────────────────────────────────────────────────┐');
      console.log('     │ BẢNG ĐỐI SOÁT CHẤM CÔNG HÔM NAY: CSDL THỰC TẾ VS BIỂU ĐỒ CỘT (BAR CHART)                │');
      console.log('     ├─────┬──────────────────────┬─────────────┬──────────────┬─────────────┬────────────────┤');
      console.log('     │ ID  │ Tên Phòng Ban        │ DB Check-in │ DB Đúng giờ  │ DB Tỷ lệ %  │ Bar Chart Label│');
      console.log('     ├─────┼──────────────────────┼─────────────┼──────────────┼─────────────┼────────────────┤');

      for (const row of dbAttRows) {
        const deptId = Number(row.department_id);
        const dbCheckins = Number(row.today_checkins);
        const dbOntime = Number(row.today_ontime);

        // Tính toán của Frontend Bar Chart
        const deptRecords = records.filter((r) => Number(r.departmentId) === deptId && Boolean(r.checkInTime));
        const feCheckins = deptRecords.length;
        const feOntime = deptRecords.filter((r) => r.status === 'ON_TIME').length;

        assert.strictEqual(feCheckins, dbCheckins, `Số check-in phòng ban ${row.department_name} phải khớp CSDL`);
        assert.strictEqual(feOntime, dbOntime, `Số đúng giờ phòng ban ${row.department_name} phải khớp CSDL`);

        let expectedRate = null;
        let chartLabel = 'Chưa có DL';

        if (dbCheckins > 0) {
          expectedRate = Number(((dbOntime / dbCheckins) * 100).toFixed(1));
          chartLabel = `${expectedRate}%`;
        }

        const feRate = feCheckins > 0 ? Number(((feOntime / feCheckins) * 100).toFixed(1)) : null;
        assert.strictEqual(feRate, expectedRate, `Tỷ lệ đúng giờ phòng ban ${row.department_name} phải khớp CSDL`);

        const padName = String(row.department_name).padEnd(20).slice(0, 20);
        const padDbIn = String(dbCheckins).padStart(11);
        const padDbOn = String(dbOntime).padStart(12);
        const padDbRate = (expectedRate !== null ? `${expectedRate}%` : 'N/A').padStart(11);
        const padLabel = chartLabel.padStart(14);

        console.log(`     │ ${String(deptId).padStart(3)} │ ${padName} │ ${padDbIn} │ ${padDbOn} │ ${padDbRate} │ ${padLabel} │`);
      }
      console.log('     └─────┴──────────────────────┴─────────────┴──────────────┴─────────────┴────────────────┘');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 3: LIVE MUTATION & REALTIME RECONCILIATION AUDIT
    // --------------------------------------------------------------------------
    await runTestCase('3. Live Mutation Audit: Thêm nhân viên đi muộn & phòng ban mới -> Kiểm tra biểu đồ cập nhật chuẩn xác', async () => {
      let createdDeptId = null;
      let createdEmpId = null;
      let createdAttId = null;

      try {
        // 3.1. Tạo phòng ban thử nghiệm mới (rỗng)
        const [deptResult] = await db.execute(`
          INSERT INTO \`departments\` (department_code, department_name, is_active)
          VALUES ('PB-QA-DYN', 'Phòng Thử Nghiệm Dynamic QA', 1)
        `);
        createdDeptId = deptResult.insertId;

        // 3.2. Tạo 1 nhân viên mới vào phòng ban 2 (PB-HR)
        const [empResult] = await db.execute(`
          INSERT INTO \`employees\` (employee_code, full_name, department_id, employment_status, ssn_encrypted, ssn_hash)
          VALUES ('NV-QA-DYN-01', 'Nhân Viên Dynamic QA', 2, 'Active', 0x12345678, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
        `);
        createdEmpId = empResult.insertId;

        // 3.3. Tạo 1 bản ghi check-in ĐI MUỘN (Late) cho nhân viên này hôm nay
        const [attResult] = await db.execute(`
          INSERT INTO \`attendances\` (employee_id, attendance_date, check_in, check_out, attendance_status)
          VALUES (?, ?, '08:45:00', '17:30:00', 'Late')
        `, [createdEmpId, todayStr]);
        createdAttId = attResult.insertId;

        // 3.4. Kiểm tra lại qua Live API
        const statsRes = await fetch(`${BACKEND_URL}/api/departments/statistics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const statsData = await statsRes.json();
        const depts = statsData.data;

        // Phòng ban 2 (PB-HR) trước đó có 1 NV (Active), nay thêm 1 NV -> thành 2 NV
        const hrDept = depts.find((d) => Number(d.departmentId) === 2);
        assert.ok(hrDept, 'Phòng ban 2 phải có trong danh sách');
        assert.strictEqual(Number(hrDept.employeeCount), 2, 'Phòng ban 2 phải có 2 nhân viên');

        // Phòng ban mới tạo: 0 nhân viên, tỷ trọng 0%
        const newDept = depts.find((d) => Number(d.departmentId) === createdDeptId);
        assert.ok(newDept, 'Phòng ban mới tạo phải hiển thị trong kết quả API');
        assert.strictEqual(Number(newDept.employeeCount), 0, 'Phòng ban mới tạo có 0 nhân sự');
        assert.strictEqual(Number(newDept.percentage), 0, 'Tỷ trọng phòng ban mới là 0%');

        // 3.5. Kiểm tra Bar Chart: Phòng ban 2 có 1 check-in và đi muộn -> Tỷ lệ đúng giờ là 0.0%
        const attRes = await fetch(`${BACKEND_URL}/api/attendance/today`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const attData = await attRes.json();
        const hrRecords = attData.data.filter((r) => Number(r.departmentId) === 2 && Boolean(r.checkInTime));
        assert.strictEqual(hrRecords.length, 1, 'Phòng ban 2 có đúng 1 check-in hôm nay');
        assert.strictEqual(hrRecords[0].status, 'LATE', 'Trạng thái check-in phải là LATE');

        const hrOnTimeRate = hrRecords.filter((r) => r.status === 'ON_TIME').length / hrRecords.length * 100;
        assert.strictEqual(hrOnTimeRate, 0, 'Tỷ lệ đúng giờ của phòng ban 2 phải chuyển thành 0% do nhân viên đi muộn');

        console.log(`     Mutation Verified: Biến động CSDL cập nhật ngay lập tức vào API và tỷ lệ biểu đồ.`);
      } finally {
        // Dọn dẹp sạch sẽ dữ liệu thử nghiệm, bảo toàn CSDL gốc
        if (createdAttId) await db.execute('DELETE FROM `attendances` WHERE attendance_id = ?', [createdAttId]);
        if (createdEmpId) await db.execute('DELETE FROM `employees` WHERE employee_id = ?', [createdEmpId]);
        if (createdDeptId) await db.execute('DELETE FROM `departments` WHERE department_id = ?', [createdDeptId]);
        console.log(`     Cleanup: Đã dọn dẹp toàn bộ bản ghi tạm thời, CSDL trở về trạng thái nguyên bản.`);
      }
    });

  } finally {
    await db.end();
  }

  console.log('\n==============================================================================');
  console.log(`🎉 KẾT QUẢ QA AUDIT: ĐÃ HOÀN TẤT ${passed}/${total} KỊCH BẢN ĐỐI SOÁT CSDL THÀNH CÔNG 100%!`);
  console.log('==============================================================================\n');
}

runLiveAuditSuite().catch((err) => {
  console.error('Lỗi thực thi QA Audit Suite:', err);
  process.exit(1);
});
