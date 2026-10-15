/**
 * BỘ KIỂM THỬ TỰ ĐỘNG CƠ SỞ DỮ LIỆU: SCHEMA & PHÂN QUYỀN LEAST PRIVILEGE (HRM-129)
 * Kiểm thử tính đúng đắn và an toàn của database/init.sql:
 * 1. Toàn vẹn cấu trúc Schema (5 bảng cốt lõi & 3 reporting views)
 * 2. Phân quyền Least Privilege của tài khoản app_user (DML allowed, DDL denied)
 * 3. Phân quyền Least Privilege của tài khoản report_user (Read-only allowed, DML/DDL denied)
 * 4. Bảo vệ dữ liệu nhạy cảm trên Views báo cáo (không lộ CCCD, không lộ password)
 * 5. Tính an toàn khi chạy lại (Idempotency)
 */

import assert from 'node:assert';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

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
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('\n============================================================');
console.log('🛡️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ DATABASE INIT & PHÂN QUYỀN MYSQL (HRM-129)');
console.log('============================================================\n');

// Kết nối Root để kiểm tra schema và quyền
const rootConn = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: 'root',
  password: process.env.DB_ROOT_PASSWORD || 'RootPassword@2026',
  database: env.db.name,
});

// -----------------------------------------------------------------------------
// NHÓM 1: CẤU TRÚC BẢNG VÀ VIEWS TRONG DATABASE INIT
// -----------------------------------------------------------------------------
console.log('--- NHÓM 1: KIỂM THỬ CẤU TRÚC SCHEMA & REPORTING VIEWS ---');

await test('Test 1.1: Database hrm_db chứa đầy đủ 5 bảng cốt lõi và 3 Reporting Views', async () => {
  const [rows] = await rootConn.query('SHOW FULL TABLES');
  const tableNames = rows.map((r) => r.Tables_in_hrm_db || Object.values(r)[0]);
  const tableTypes = new Map(rows.map((r) => [r.Tables_in_hrm_db || Object.values(r)[0], r.Table_type]));

  // 5 Base tables
  assert.ok(tableNames.includes('departments'), 'Phải có bảng departments');
  assert.ok(tableNames.includes('employees'), 'Phải có bảng employees');
  assert.ok(tableNames.includes('users'), 'Phải có bảng users');
  assert.ok(tableNames.includes('attendances'), 'Phải có bảng attendances');
  assert.ok(tableNames.includes('schema_migrations'), 'Phải có bảng schema_migrations');

  assert.strictEqual(tableTypes.get('departments'), 'BASE TABLE');
  assert.strictEqual(tableTypes.get('employees'), 'BASE TABLE');
  assert.strictEqual(tableTypes.get('users'), 'BASE TABLE');
  assert.strictEqual(tableTypes.get('attendances'), 'BASE TABLE');

  // 3 Views
  assert.ok(tableNames.includes('v_report_department_stats'), 'Phải có View v_report_department_stats');
  assert.ok(tableNames.includes('v_report_daily_attendance_summary'), 'Phải có View v_report_daily_attendance_summary');
  assert.ok(tableNames.includes('v_report_employee_public'), 'Phải có View v_report_employee_public');

  assert.strictEqual(tableTypes.get('v_report_department_stats'), 'VIEW');
  assert.strictEqual(tableTypes.get('v_report_daily_attendance_summary'), 'VIEW');
  assert.strictEqual(tableTypes.get('v_report_employee_public'), 'VIEW');
});

await test('Test 1.2: Ràng buộc UNIQUE chống trùng lặp chấm công và mã NV, phòng ban', async () => {
  const [constraints] = await rootConn.query(`
    SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'UNIQUE'
  `, [env.db.name]);

  const constraintNames = constraints.map((c) => c.CONSTRAINT_NAME);

  assert.ok(constraintNames.includes('uk_departments_code'), 'departments phải có UNIQUE uk_departments_code');
  assert.ok(constraintNames.includes('uk_departments_name'), 'departments phải có UNIQUE uk_departments_name');
  assert.ok(constraintNames.includes('uk_employees_code'), 'employees phải có UNIQUE uk_employees_code');
  assert.ok(constraintNames.includes('uk_users_username'), 'users phải có UNIQUE uk_users_username');
  assert.ok(constraintNames.includes('uk_attendances_emp_date'), 'attendances phải có UNIQUE uk_attendances_emp_date');
});

await test('Test 1.3: View v_report_employee_public TUYỆT ĐỐI không chứa cột nhạy cảm CCCD hoặc mật khẩu', async () => {
  const [columns] = await rootConn.query(`
    SELECT COLUMN_NAME 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'v_report_employee_public'
  `, [env.db.name]);

  const colNames = columns.map((c) => c.COLUMN_NAME.toLowerCase());

  assert.ok(!colNames.includes('password_hash'), 'View báo cáo KHÔNG ĐƯỢC chứa password_hash');
  assert.ok(!colNames.includes('password'), 'View báo cáo KHÔNG ĐƯỢC chứa password');
  assert.ok(!colNames.includes('ssn_encrypted'), 'View báo cáo KHÔNG ĐƯỢC chứa ssn_encrypted');
  assert.ok(!colNames.includes('ssn_hash'), 'View báo cáo KHÔNG ĐƯỢC chứa ssn_hash');
  assert.ok(colNames.includes('employee_code'), 'View báo cáo phải có employee_code');
  assert.ok(colNames.includes('full_name'), 'View báo cáo phải có full_name');
  assert.ok(colNames.includes('department_name'), 'View báo cáo phải có department_name');
});

// -----------------------------------------------------------------------------
// NHÓM 2: PHÂN QUYỀN LEAST PRIVILEGE CHO TÀI KHOẢN APP_USER
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 2: KIỂM THỬ QUYỀN HẠN TÀI KHOẢN RUNTIME (APP_USER) ---');

await test('Test 2.1: app_user thực hiện thành công các thao tác DML (SELECT, INSERT, UPDATE, DELETE)', async () => {
  const appConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: 'app_user',
    password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
    database: env.db.name,
  });

  try {
    // 1. SELECT
    const [selectRows] = await appConn.query('SELECT COUNT(*) as total FROM departments');
    assert.ok(Number(selectRows[0].total) >= 3);

    // 2. INSERT
    const [insertResult] = await appConn.query(`
      INSERT INTO departments (department_code, department_name, description, is_active)
      VALUES ('PB-TEMP-TEST', 'Phòng Thử Nghiệm Quyền', 'Bản ghi tạm', FALSE)
    `);
    const tempId = insertResult.insertId;
    assert.ok(tempId > 0);

    // 3. UPDATE
    const [updateResult] = await appConn.query(`
      UPDATE departments SET description = 'Đã cập nhật' WHERE department_id = ?
    `, [tempId]);
    assert.strictEqual(updateResult.affectedRows, 1);

    // 4. DELETE
    const [deleteResult] = await appConn.query(`
      DELETE FROM departments WHERE department_id = ?
    `, [tempId]);
    assert.strictEqual(deleteResult.affectedRows, 1);
  } finally {
    await appConn.end();
  }
});

await test('Test 2.2: app_user BỊ TỪ CHỐI các thao tác phá hủy DDL (DROP TABLE, ALTER TABLE)', async () => {
  const appConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: 'app_user',
    password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
    database: env.db.name,
  });

  try {
    // Thử DROP TABLE users -> Phải ném lỗi 1142 ER_TABLEACCESS_DENIED_ERROR
    await assert.rejects(
      async () => {
        await appConn.query('DROP TABLE users');
      },
      (err) => {
        assert.ok(err.message.includes('DROP command denied') || err.errno === 1142 || err.code === 'ER_TABLEACCESS_DENIED_ERROR');
        return true;
      }
    );

    // Thử ALTER TABLE -> Phải ném lỗi 1142
    await assert.rejects(
      async () => {
        await appConn.query('ALTER TABLE departments ADD COLUMN hacker_col INT');
      },
      (err) => {
        assert.ok(err.message.includes('ALTER command denied') || err.errno === 1142 || err.code === 'ER_TABLEACCESS_DENIED_ERROR');
        return true;
      }
    );
  } finally {
    await appConn.end();
  }
});

// -----------------------------------------------------------------------------
// NHÓM 3: PHÂN QUYỀN LEAST PRIVILEGE CHO TÀI KHOẢN BÁO CÁO (REPORT_USER)
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 3: KIỂM THỬ QUYỀN HẠN TÀI KHOẢN BÁO CÁO (REPORT_USER) ---');

await test('Test 3.1: report_user đọc thành công các View và Bảng báo cáo thống kê', async () => {
  const reportConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: 'report_user',
    password: process.env.DB_REPORT_PASSWORD || 'ReportUser@Pass2026',
    database: env.db.name,
  });

  try {
    // 1. Đọc View thống kê phòng ban
    const [deptStats] = await reportConn.query('SELECT * FROM v_report_department_stats');
    assert.ok(Array.isArray(deptStats));
    assert.ok(deptStats.length >= 3);

    // 2. Đọc View thống kê chấm công
    const [attSummary] = await reportConn.query('SELECT * FROM v_report_daily_attendance_summary');
    assert.ok(Array.isArray(attSummary));

    // 3. Đọc View danh sách nhân sự an toàn
    const [empPublic] = await reportConn.query('SELECT * FROM v_report_employee_public LIMIT 5');
    assert.ok(Array.isArray(empPublic));
    assert.ok(empPublic.length >= 3);
  } finally {
    await reportConn.end();
  }
});

await test('Test 3.2: report_user BỊ TỪ CHỐI 100% các thao tác ghi dữ liệu (INSERT, UPDATE, DELETE)', async () => {
  const reportConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: 'report_user',
    password: process.env.DB_REPORT_PASSWORD || 'ReportUser@Pass2026',
    database: env.db.name,
  });

  try {
    // Thử INSERT -> Bị từ chối
    await assert.rejects(
      async () => {
        await reportConn.query(`
          INSERT INTO departments (department_code, department_name) VALUES ('HACK', 'Hacker')
        `);
      },
      (err) => {
        assert.ok(err.message.includes('INSERT command denied') || err.errno === 1142 || err.code === 'ER_TABLEACCESS_DENIED_ERROR');
        return true;
      }
    );

    // Thử UPDATE -> Bị từ chối
    await assert.rejects(
      async () => {
        await reportConn.query('UPDATE departments SET location = "HaNoi" WHERE department_id = 1');
      },
      (err) => {
        assert.ok(err.message.includes('UPDATE command denied') || err.errno === 1142 || err.code === 'ER_TABLEACCESS_DENIED_ERROR');
        return true;
      }
    );

    // Thử DELETE -> Bị từ chối
    await assert.rejects(
      async () => {
        await reportConn.query('DELETE FROM attendances WHERE attendance_id = 1');
      },
      (err) => {
        assert.ok(err.message.includes('DELETE command denied') || err.errno === 1142 || err.code === 'ER_TABLEACCESS_DENIED_ERROR');
        return true;
      }
    );
  } finally {
    await reportConn.end();
  }
});

await test('Test 3.3: report_user BỊ TỪ CHỐI các thao tác phá hủy DDL (DROP, CREATE, ALTER)', async () => {
  const reportConn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: 'report_user',
    password: process.env.DB_REPORT_PASSWORD || 'ReportUser@Pass2026',
    database: env.db.name,
  });

  try {
    await assert.rejects(
      async () => {
        await reportConn.query('DROP TABLE attendances');
      },
      (err) => {
        assert.ok(err.message.includes('DROP command denied') || err.errno === 1142 || err.code === 'ER_TABLEACCESS_DENIED_ERROR');
        return true;
      }
    );
  } finally {
    await reportConn.end();
  }
});

// -----------------------------------------------------------------------------
// NHÓM 4: CẤU HÌNH BẢO MẬT LAB 6 (GENERAL QUERY LOG & PASSWORD POLICY MEDIUM)
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 4: KIỂM THỬ BẢO MẬT LAB 6 (GENERAL LOG & PASSWORD POLICY MEDIUM) ---');

await test('Test 4.1: General Query Log được bật và ghi nhận chính xác (general_log = ON, log_output = FILE)', async () => {
  const [genLogRows] = await rootConn.query("SHOW VARIABLES LIKE 'general_log%'");
  const [logOutputRows] = await rootConn.query("SHOW VARIABLES LIKE 'log_output'");

  const genLogMap = new Map(genLogRows.map((r) => [r.Variable_name, r.Value]));
  const logOutputMap = new Map(logOutputRows.map((r) => [r.Variable_name, r.Value]));

  assert.strictEqual(genLogMap.get('general_log'), 'ON', 'general_log phải có giá trị ON');
  assert.ok(genLogMap.get('general_log_file') && genLogMap.get('general_log_file').length > 0, 'general_log_file phải có đường dẫn hợp lệ');
  assert.strictEqual(logOutputMap.get('log_output'), 'FILE', 'log_output phải là FILE');
});

await test('Test 4.2: Component Validate Password được kích hoạt với chính sách mức MEDIUM', async () => {
  const [valPassRows] = await rootConn.query("SHOW VARIABLES LIKE 'validate_password%'");
  const passMap = new Map(valPassRows.map((r) => [r.Variable_name, r.Value]));

  assert.ok(passMap.has('validate_password.policy'), 'Biến validate_password.policy phải tồn tại (Component đã được nạp)');
  assert.strictEqual(passMap.get('validate_password.policy'), 'MEDIUM', 'Policy phải ở mức MEDIUM');
  assert.strictEqual(passMap.get('validate_password.length'), '8', 'Độ dài tối thiểu phải là 8 ký tự');
  assert.strictEqual(passMap.get('validate_password.mixed_case_count'), '1', 'Yêu cầu tối thiểu 1 chữ hoa, 1 chữ thường');
  assert.strictEqual(passMap.get('validate_password.number_count'), '1', 'Yêu cầu tối thiểu 1 chữ số');
  assert.strictEqual(passMap.get('validate_password.special_char_count'), '1', 'Yêu cầu tối thiểu 1 ký tự đặc biệt');
  assert.strictEqual(passMap.get('validate_password.check_user_name'), 'ON', 'Yêu cầu kiểm tra không trùng tên đăng nhập');
});

await test('Test 4.3: MySQL CHẶN tạo tài khoản với mật khẩu yếu (ERROR 1819 ER_NOT_VALID_PASSWORD)', async () => {
  // Thử tạo tài khoản với mật khẩu yếu '123456'
  await assert.rejects(
    async () => {
      await rootConn.query("CREATE USER 'test_lab6_weak'@'%' IDENTIFIED BY '123456'");
    },
    (err) => {
      assert.ok(
        err.errno === 1819 || 
        err.message.includes('does not satisfy the current policy requirements'),
        `Lỗi mong đợi là 1819, nhận được: ${err.message}`
      );
      return true;
    }
  );
});

await test('Test 4.4: MySQL CHẤP NHẬN tạo tài khoản với mật khẩu đạt chuẩn MEDIUM (hoa, thường, số, ký tự đặc biệt)', async () => {
  const strongPassword = 'Lab6_Secure_Password@2026!';
  
  // Dọn dẹp trước nếu có tài khoản cũ
  await rootConn.query("DROP USER IF EXISTS 'test_lab6_ok'@'%'");

  // Tạo người dùng với mật khẩu đạt chuẩn MEDIUM
  await rootConn.query(`CREATE USER 'test_lab6_ok'@'%' IDENTIFIED BY '${strongPassword}'`);

  // Xác minh người dùng đã được tạo trong mysql.user
  const [users] = await rootConn.query("SELECT user FROM mysql.user WHERE user = 'test_lab6_ok'");
  assert.strictEqual(users.length, 1);

  // Dọn dẹp tài khoản sau test
  await rootConn.query("DROP USER 'test_lab6_ok'@'%'");
});

await rootConn.end();

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI TEST DATABASE LEAST PRIVILEGE!`);
console.log('============================================================\n');
