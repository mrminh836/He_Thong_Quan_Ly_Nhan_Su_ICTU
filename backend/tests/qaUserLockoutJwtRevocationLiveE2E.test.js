/**
 * ==============================================================================
 * BỘ KIỂM THỬ LIVE E2E & DATABASE QA: CHẶN ĐĂNG NHẬP VÀ THU HỒI JWT TÀI KHOẢN BỊ KHÓA
 * ==============================================================================
 * Môi trường: Live Backend API (http://127.0.0.1:3005) & MySQL Database (127.0.0.1:3309)
 * 
 * Kiểm tra 12 kịch bản QA thực tế trên hệ thống đang chạy (Docker Container):
 * 1.  [CA 1] Đăng nhập tài khoản đang hoạt động (Active): Trả về 200 OK và JWT Token hợp lệ.
 * 2.  [CA 2] Truy cập API yêu cầu xác thực bằng JWT Token của tài khoản Active: Thành công 200 OK.
 * 3.  [CA 3] Quản trị viên (Admin) gọi PATCH /api/users/:id/status khóa tài khoản: Trả về 200 OK, status='Locked'.
 * 4.  [CA 4] THU HỒI JWT NGAY LẬP TỨC: JWT Token cũ của tài khoản vừa bị khóa bị từ chối NGAY LẬP TỨC (403 ACCOUNT_LOCKED).
 * 5.  [CA 5] CHẶN ĐĂNG NHẬP MỚI: Thử đăng nhập lại với tài khoản bị khóa -> Bị từ chối 403 ACCOUNT_LOCKED.
 * 6.  [CA 6] Bảo vệ đặc quyền Admin: Người dùng không phải Admin (HR / Employee) cố gọi API đổi trạng thái -> 403 Forbidden.
 * 7.  [CA 7] Chống Admin tự khóa chính mình: Admin cố tình gửi status='Locked' cho ID của chính mình -> 400 CANNOT_LOCK_SELF.
 * 8.  [CA 8] Độc lập phiên người dùng khác: Trong khi emp1 bị khóa, các tài khoản Active khác (Admin, HR) vẫn hoạt động 100%.
 * 9.  [CA 9] Quản trị viên mở khóa tài khoản: PATCH /api/users/:id/status với status='Active' -> Thành công 200 OK.
 * 10. [CA 10] Khôi phục quyền đăng nhập: Sau khi mở khóa, người dùng có thể đăng nhập thành công qua POST /api/auth/login.
 * 11. [CA 11] Cấp Token mới: Phiên làm việc mới được cấp token hợp lệ và hoạt động đầy đủ quyền hạn.
 * 12. [CA 12] Toàn vẹn CSDL: Kiểm tra trạng thái người dùng trong MySQL trước, trong và sau toàn bộ chuỗi kiểm thử.
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

let passed = 0;
let total = 0;

async function runTestCase(name, fn) {
  total++;
  try {
    console.log(`\n▶ [TEST ${total}] ${name}`);
    await fn();
    console.log(`  ✅ [PASS] Hoàn thành đạt chuẩn 100%`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] Thất bại: ${err.message}`);
    throw err;
  }
}

async function login(username, password) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function runLiveQASuite() {
  console.log('==============================================================================');
  console.log('🔒 BẮT ĐẦU KIỂM THỬ LIVE QA: CHẶN ĐĂNG NHẬP & THU HỒI JWT TÀI KHOẢN BỊ KHÓA');
  console.log(`   Backend API: ${BACKEND_URL}`);
  console.log(`   MySQL Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('==============================================================================');

  const db = await mysql.createConnection(DB_CONFIG);

  try {
    // 0. Chuẩn bị: Đảm bảo các tài khoản emp1, admin, hr đang ở trạng thái Active trong DB
    await db.execute("UPDATE `users` SET account_status = 'Active' WHERE username IN ('emp1', 'admin', 'hr')");

    const [users] = await db.execute("SELECT user_id AS id, username, role, account_status AS status FROM `users` WHERE username IN ('admin', 'hr', 'emp1') ORDER BY user_id ASC");
    const adminUser = users.find((u) => u.username === 'admin');
    const hrUser = users.find((u) => u.username === 'hr');
    const empUser = users.find((u) => u.username === 'emp1');

    assert.ok(adminUser, 'Tài khoản admin phải tồn tại trong CSDL');
    assert.ok(hrUser, 'Tài khoản hr phải tồn tại trong CSDL');
    assert.ok(empUser, 'Tài khoản emp1 phải tồn tại trong CSDL');

    let empTokenInitial = null;
    let adminToken = null;
    let hrToken = null;

    // --------------------------------------------------------------------------
    // KỊCH BẢN 1: Đăng nhập tài khoản đang hoạt động (Active)
    // --------------------------------------------------------------------------
    await runTestCase('Đăng nhập tài khoản emp1 (Active): Trả về HTTP 200 OK và JWT Token hợp lệ', async () => {
      const res = await login('emp1', 'Emp@123');
      assert.strictEqual(res.status, 200, 'Đăng nhập phải trả về HTTP 200');
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data?.accessToken, 'Phải có accessToken');
      empTokenInitial = res.data.data.accessToken;
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 2: Dùng JWT Token truy cập API khi tài khoản còn Active
    // --------------------------------------------------------------------------
    await runTestCase('Tài khoản Active dùng JWT gọi API xác thực: Trả về HTTP 200 OK', async () => {
      const res = await fetch(`${BACKEND_URL}/api/attendance/today`, {
        headers: { Authorization: `Bearer ${empTokenInitial}` },
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, 'API xác thực phải trả về HTTP 200 khi tài khoản Active');
      assert.strictEqual(data.success, true);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 3: Admin gọi PATCH /api/users/:id/status để khóa tài khoản emp1
    // --------------------------------------------------------------------------
    await runTestCase('Admin đăng nhập và gửi request khóa tài khoản emp1: Trả về 200 OK, status="Locked"', async () => {
      const adminLogin = await login('admin', 'Admin@123');
      assert.strictEqual(adminLogin.status, 200);
      adminToken = adminLogin.data.data.accessToken;

      const res = await fetch(`${BACKEND_URL}/api/users/${empUser.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'Locked' }),
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200, 'API cập nhật trạng thái phải trả về HTTP 200');
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.status, 'Locked', 'Trạng thái trả về phải là Locked');

      // Đối soát trực tiếp trong CSDL MySQL
      const [rows] = await db.execute('SELECT account_status FROM `users` WHERE user_id = ?', [empUser.id]);
      assert.strictEqual(rows[0].account_status, 'Locked', 'CSDL MySQL phải lưu trạng thái Locked');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 4: THU HỒI JWT NGAY LẬP TỨC Ở REQUEST TIẾP THEO
    // --------------------------------------------------------------------------
    await runTestCase('THU HỒI JWT LẬP TỨC: empToken cũ bị từ chối NGAY LẬP TỨC (403 ACCOUNT_LOCKED)', async () => {
      // Dùng lại chính empTokenInitial vừa gọi thành công ở CA 2 (Token vẫn còn hạn thời gian!)
      const res = await fetch(`${BACKEND_URL}/api/attendance/today`, {
        headers: { Authorization: `Bearer ${empTokenInitial}` },
      });
      const data = await res.json();

      assert.strictEqual(res.status, 403, 'Request với token của tài khoản bị khóa phải bị từ chối HTTP 403');
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.errorCode, 'ACCOUNT_LOCKED', 'Mã lỗi nghiệp vụ phải là ACCOUNT_LOCKED');
      assert.ok(data.message.includes('khóa'), 'Thông báo phải giải thích tài khoản đã bị khóa');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 5: CHẶN ĐĂNG NHẬP MỚI VỚI TÀI KHOẢN BỊ KHÓA
    // --------------------------------------------------------------------------
    await runTestCase('CHẶN ĐĂNG NHẬP: Tài khoản emp1 bị khóa không thể đăng nhập mới (403 ACCOUNT_LOCKED)', async () => {
      const res = await login('emp1', 'Emp@123');

      assert.strictEqual(res.status, 403, 'Đăng nhập tài khoản bị khóa phải bị từ chối HTTP 403');
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.errorCode, 'ACCOUNT_LOCKED', 'Mã lỗi phải là ACCOUNT_LOCKED');
      assert.ok(res.data.message.includes('khóa'), 'Thông báo phải nêu rõ tài khoản đã bị khóa');
      assert.strictEqual(res.data.data, undefined, 'Tuyệt đối không cấp accessToken mới');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 6: Phân quyền RBAC: HR_MANAGER không thể gọi PATCH /api/users/:id/status
    // --------------------------------------------------------------------------
    await runTestCase('Phân quyền RBAC: HR Manager cố gọi API cập nhật trạng thái người dùng -> 403 Forbidden', async () => {
      const hrLogin = await login('hr', 'Hr@123');
      assert.strictEqual(hrLogin.status, 200);
      hrToken = hrLogin.data.data.accessToken;

      const res = await fetch(`${BACKEND_URL}/api/users/${empUser.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hrToken}`,
        },
        body: JSON.stringify({ status: 'Active' }),
      });

      const data = await res.json();
      assert.strictEqual(res.status, 403, 'HR Manager gọi đổi status phải bị từ chối 403 Forbidden');
      assert.strictEqual(data.success, false);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 7: Chống Admin tự khóa chính mình (Self-Lock Protection)
    // --------------------------------------------------------------------------
    await runTestCase('Chính sách an toàn: Admin cố tình tự khóa tài khoản của chính mình -> 400 CANNOT_LOCK_SELF', async () => {
      const res = await fetch(`${BACKEND_URL}/api/users/${adminUser.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'Locked' }),
      });

      const data = await res.json();
      assert.strictEqual(res.status, 400, 'Tự khóa chính mình phải bị từ chối 400 Bad Request');
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.errorCode, 'CANNOT_LOCK_SELF');

      // Kiểm tra CSDL đảm bảo Admin vẫn là Active
      const [rows] = await db.execute('SELECT account_status FROM `users` WHERE user_id = ?', [adminUser.id]);
      assert.strictEqual(rows[0].account_status, 'Active', 'Tài khoản Admin trong CSDL vẫn phải giữ nguyên Active');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 8: Độc lập phiên làm việc của các người dùng Active khác
    // --------------------------------------------------------------------------
    await runTestCase('Phiên làm việc độc lập: Tài khoản hr và admin vẫn gọi API bình thường 100%', async () => {
      const resHr = await fetch(`${BACKEND_URL}/api/departments`, {
        headers: { Authorization: `Bearer ${hrToken}` },
      });
      assert.strictEqual(resHr.status, 200, 'HR vẫn truy cập bình thường');

      const resAdmin = await fetch(`${BACKEND_URL}/api/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(resAdmin.status, 200, 'Admin vẫn truy cập bình thường');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 9: Admin mở khóa tài khoản emp1
    // --------------------------------------------------------------------------
    await runTestCase('Admin mở khóa tài khoản emp1: Gửi status="Active" -> Trả về 200 OK', async () => {
      const res = await fetch(`${BACKEND_URL}/api/users/${empUser.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'Active' }),
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Mở khóa phải trả về 200 OK');
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.status, 'Active', 'Status mới phải là Active');

      // Kiểm tra CSDL
      const [rows] = await db.execute('SELECT account_status FROM `users` WHERE user_id = ?', [empUser.id]);
      assert.strictEqual(rows[0].account_status, 'Active', 'CSDL MySQL phải ghi nhận Active');
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 10: Đăng nhập mới thành công sau khi mở khóa
    // --------------------------------------------------------------------------
    let empTokenNew = null;
    await runTestCase('Khôi phục quyền đăng nhập: POST /api/auth/login thành công sau khi tài khoản mở khóa', async () => {
      const res = await login('emp1', 'Emp@123');
      assert.strictEqual(res.status, 200, 'Đăng nhập sau khi mở khóa phải thành công 200 OK');
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data?.accessToken, 'Phải cấp accessToken mới');
      empTokenNew = res.data.data.accessToken;
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 11: Token mới hoạt động đầy đủ quyền hạn
    // --------------------------------------------------------------------------
    await runTestCase('Token mới hoạt động đầy đủ quyền hạn và khôi phục quyền truy cập hệ thống', async () => {
      const res = await fetch(`${BACKEND_URL}/api/attendance/today`, {
        headers: { Authorization: `Bearer ${empTokenNew}` },
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Token mới phải truy cập thành công 200 OK');
      assert.strictEqual(data.success, true);
    });

    // --------------------------------------------------------------------------
    // KỊCH BẢN 12: Kiểm tra toàn vẹn CSDL MySQL
    // --------------------------------------------------------------------------
    await runTestCase('Toàn vẹn CSDL MySQL: Trạng thái và vai trò của 3 tài khoản nguyên vẹn và an toàn', async () => {
      const [finalUsers] = await db.execute(
        "SELECT user_id, username, role, account_status FROM `users` WHERE username IN ('admin', 'hr', 'emp1') ORDER BY user_id ASC"
      );
      assert.strictEqual(finalUsers.length, 3);
      assert.strictEqual(finalUsers.find((u) => u.username === 'admin').account_status, 'Active');
      assert.strictEqual(finalUsers.find((u) => u.username === 'hr').account_status, 'Active');
      assert.strictEqual(finalUsers.find((u) => u.username === 'emp1').account_status, 'Active');
    });

    console.log('\n==============================================================================');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN!`);
    console.log('   Hệ thống kiểm soát khóa tài khoản, chặn đăng nhập & thu hồi JWT đạt chuẩn 100%.');
    console.log('==============================================================================\n');
  } finally {
    // Luôn khôi phục tài khoản emp1 về Active
    await db.execute("UPDATE `users` SET account_status = 'Active' WHERE username = 'emp1'");
    await db.end();
  }
}

runLiveQASuite().catch((err) => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
