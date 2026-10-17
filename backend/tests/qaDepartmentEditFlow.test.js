/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG QA: LUỒNG CHỈNH SỬA PHÒNG BAN (QA DEPARTMENT EDIT FLOW)
 * ==============================================================================
 * Mục tiêu kiểm thử chuyên sâu theo yêu cầu của QA:
 * 1. Đổi tên phòng ban (hợp lệ, trim khoảng trắng, trùng tên PB khác -> 409, để trống -> 400, > 100 ký tự -> 400, giữ nguyên tên cũ -> 200).
 * 2. Đổi số điện thoại bàn (SĐT) (hợp lệ, đổi sang số khác, xóa trắng/null, vượt quá 20 ký tự -> 400).
 * 3. Kiểm tra các ràng buộc nghiệp vụ (Constraints & Business Rules):
 *    - Ràng buộc mã phòng ban (mã mới -> 200 uppercase, trùng mã khác -> 409, giữ nguyên mã của mình -> 200, sai định dạng -> 400).
 *    - Ràng buộc phân quyền RBAC (ADMIN -> 200, HR_MANAGER -> 200, EMPLOYEE -> 403, Không token -> 401).
 *    - Ràng buộc ID phòng ban (ID không tồn tại -> 404, ID sai định dạng -> 400, ID trong body bất biến).
 *    - Toàn vẹn dữ liệu: Cập nhật đồng hợp tất cả các trường và đối soát 100% với Database qua GET API.
 * ==============================================================================
 */

import assert from 'node:assert';
import http from 'node:http';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3005/api';

async function request(path, options = {}) {
  const url = new URL(`${BASE_URL}${path}`);
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

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`);
    throw err;
  }
}

async function runQaTestSuite() {
  console.log('\n============================================================');
  console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: LUỒNG CHỈNH SỬA PHÒNG BAN');
  console.log('   (Đổi tên, Đổi SĐT, Kiểm tra ràng buộc dữ liệu & RBAC)');
  console.log('============================================================\n');

  // 1. Chuẩn bị Authentication Tokens
  const adminLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123' },
  });
  assert.strictEqual(adminLoginRes.statusCode, 200, 'Admin đăng nhập thành công');
  const adminToken = adminLoginRes.body.data.accessToken;

  const hrLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'hr', password: 'Hr@123' },
  });
  assert.strictEqual(hrLoginRes.statusCode, 200, 'HR đăng nhập thành công');
  const hrToken = hrLoginRes.body.data.accessToken;

  const empLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'emp1', password: 'Emp@123' },
  });
  assert.strictEqual(empLoginRes.statusCode, 200, 'Employee đăng nhập thành công');
  const empToken = empLoginRes.body.data.accessToken;

  // 2. Chuẩn bị phòng ban mẫu để thực thi kiểm thử
  const timestamp = Date.now().toString().slice(-4);
  const deptCodeA = `QA-A-${timestamp}`;
  const deptCodeB = `QA-B-${timestamp}`;

  const createA = await request('/departments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentCode: deptCodeA,
      departmentName: `Phòng QA Thử Nghiệm A ${timestamp}`,
      description: 'Phòng ban phục vụ kiểm thử QA Alpha',
      location: 'Tầng 3 Tòa QA',
      phone: '0208-3111-111',
      isActive: true,
    },
  });
  assert.strictEqual(createA.statusCode, 201, 'Tạo phòng ban A thành công');
  const deptA = createA.body.data;
  const deptAId = deptA.id;

  const createB = await request('/departments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentCode: deptCodeB,
      departmentName: `Phòng QA Thử Nghiệm B ${timestamp}`,
      description: 'Phòng ban phục vụ kiểm thử QA Beta',
      location: 'Tầng 4 Tòa QA',
      phone: '0208-3222-222',
      isActive: true,
    },
  });
  assert.strictEqual(createB.statusCode, 201, 'Tạo phòng ban B thành công');
  const deptB = createB.body.data;
  const deptBId = deptB.id;

  console.log(`ℹ️ [Setup] Đã khởi tạo 2 phòng ban thử nghiệm: ID=${deptAId} (${deptCodeA}) và ID=${deptBId} (${deptCodeB})\n`);

  // ===========================================================================
  // PHẦN 1: KIỂM THỬ LUỒNG ĐỔI TÊN PHÒNG BAN
  // ===========================================================================
  console.log('--- NHÓM 1: KIỂM THỬ LUỒNG ĐỔI TÊN PHÒNG BAN ---');

  await test('TC_DEPT_NAME_01: Đổi tên phòng ban hợp lệ -> Cập nhật thành công (200 OK)', async () => {
    const newName = `Phòng QA Đã Đổi Tên ${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: newName },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.departmentName, newName);

    // Xác minh lại trong DB qua GET API
    const getRes = await request(`/departments/${deptAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getRes.body.data.departmentName, newName);
  });

  await test('TC_DEPT_NAME_02: Đổi tên phòng ban có khoảng trắng thừa -> Tự động trim khoảng trắng (200 OK)', async () => {
    const rawName = `   Phòng QA Trim Tên ${timestamp}   `;
    const trimmedExpected = `Phòng QA Trim Tên ${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: rawName },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.departmentName, trimmedExpected);
  });

  await test('TC_DEPT_NAME_03: Giữ nguyên tên hiện tại của chính phòng ban đó -> Không bị lỗi trùng tên (200 OK)', async () => {
    const currentName = `Phòng QA Trim Tên ${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        departmentName: currentName,
        description: 'Cập nhật lại mô tả nhưng giữ nguyên tên',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.departmentName, currentName);
  });

  await test('TC_DEPT_NAME_04: Đổi tên trùng với tên của một phòng ban khác -> Báo lỗi 409 Conflict (DUPLICATE_DEPARTMENT_NAME)', async () => {
    // Thử đổi tên phòng ban A thành tên của phòng ban B
    const duplicateName = `Phòng QA Thử Nghiệm B ${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: duplicateName },
    });

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.errorCode === 'DUPLICATE_DEPARTMENT_NAME' || res.body.message.includes('tồn tại'),
      'Phải trả về mã lỗi hoặc thông điệp trùng tên phòng ban'
    );
  });

  await test('TC_DEPT_NAME_05: Đổi tên thành chuỗi rỗng hoặc toàn khoảng trắng -> Báo lỗi 400 Bad Request', async () => {
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: '     ' },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  await test('TC_DEPT_NAME_06: Đổi tên vượt quá 100 ký tự -> Báo lỗi 400 Bad Request', async () => {
    const tooLongName = 'Phòng Ban Có Tên Quá Dài '.repeat(6); // > 100 ký tự
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: tooLongName },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  // ===========================================================================
  // PHẦN 2: KIỂM THỬ LUỒNG ĐỔI SỐ ĐIỆN THOẠI BÀN (SĐT)
  // ===========================================================================
  console.log('\n--- NHÓM 2: KIỂM THỬ LUỒNG ĐỔI SỐ ĐIỆN THOẠI BÀN (SĐT) ---');

  await test('TC_DEPT_PHONE_01: Đổi số điện thoại bàn hợp lệ -> Cập nhật thành công (200 OK)', async () => {
    const newPhone = '0208-3846-999';
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { phone: newPhone },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.phone, newPhone);

    // Xác minh lại bằng GET
    const getRes = await request(`/departments/${deptAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getRes.body.data.phone, newPhone);
  });

  await test('TC_DEPT_PHONE_02: Đổi sang một số điện thoại bàn khác (format khác) -> Cập nhật thành công (200 OK)', async () => {
    const otherPhone = '024-3838-8888';
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { phone: otherPhone },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.phone, otherPhone);
  });

  await test('TC_DEPT_PHONE_03: Xóa số điện thoại (gửi null hoặc rỗng) -> Cập nhật thành công, DB lưu null (200 OK)', async () => {
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { phone: null },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.phone, null);

    // Xác minh lại qua GET
    const getRes = await request(`/departments/${deptAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getRes.body.data.phone, null);
  });

  await test('TC_DEPT_PHONE_04: Đổi số điện thoại vượt quá độ dài tối đa 20 ký tự -> Báo lỗi 400 Bad Request', async () => {
    const tooLongPhone = '0208-3846-1234567890123456789'; // 30 ký tự > 20
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { phone: tooLongPhone },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  // ===========================================================================
  // PHẦN 3: KIỂM THỬ CÁC RÀNG BUỘC MÃ PHÒNG BAN (CODE CONSTRAINTS)
  // ===========================================================================
  console.log('\n--- NHÓM 3: KIỂM THỬ RÀNG BUỘC MÃ PHÒNG BAN (CODE CONSTRAINTS) ---');

  await test('TC_DEPT_CODE_01: Đổi sang mã phòng ban mới chưa tồn tại -> Cập nhật thành công & tự động viết hoa (200 OK)', async () => {
    const newCode = `qa-new-${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentCode: newCode },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.departmentCode, newCode.toUpperCase());
  });

  await test('TC_DEPT_CODE_02: Giữ nguyên mã phòng ban hiện tại của chính nó -> Cập nhật thành công không bị lỗi trùng mã (200 OK)', async () => {
    const currentCode = `QA-NEW-${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        departmentCode: currentCode,
        description: 'Cập nhật lại với mã giữ nguyên',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.departmentCode, currentCode);
  });

  await test('TC_DEPT_CODE_03: Đổi sang mã đã tồn tại ở phòng ban khác -> Báo lỗi 409 Conflict (DUPLICATE_DEPARTMENT_CODE)', async () => {
    // Thử lấy mã của Dept B gán cho Dept A
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentCode: deptCodeB },
    });

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.errorCode === 'DUPLICATE_DEPARTMENT_CODE' || res.body.message.includes('Mã phòng ban'),
      'Phải trả về lỗi 409 duplicate code'
    );
  });

  await test('TC_DEPT_CODE_04: Mã phòng ban chứa ký tự đặc biệt không hợp lệ -> Báo lỗi 400 Bad Request', async () => {
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentCode: 'PB@TECH#$' },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  // ===========================================================================
  // PHẦN 4: KIỂM THỬ RÀNG BUỘC PHÂN QUYỀN RBAC & BẢO MẬT PHIÊN
  // ===========================================================================
  console.log('\n--- NHÓM 4: KIỂM THỬ PHÂN QUYỀN RBAC & BẢO MẬT PHIÊN ---');

  await test('TC_DEPT_RBAC_01: Tài khoản Quản lý Nhân sự (HR_MANAGER) có quyền chỉnh sửa phòng ban -> Thành công (200 OK)', async () => {
    const hrUpdatedName = `Phòng QA HR Cập Nhật ${timestamp}`;
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hrToken}` },
      body: { departmentName: hrUpdatedName },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.departmentName, hrUpdatedName);
  });

  await test('TC_DEPT_RBAC_02: Tài khoản Nhân viên (EMPLOYEE) không có quyền chỉnh sửa -> Bị từ chối 403 Forbidden', async () => {
    const res = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${empToken}` },
      body: { departmentName: 'Nhân viên cố tình sửa tên trái phép' },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
  });

  await test('TC_DEPT_RBAC_03: Request không gửi Token hoặc Token không hợp lệ -> Bị từ chối 401 Unauthorized', async () => {
    const resNoToken = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      body: { departmentName: 'Cập nhật không có token' },
    });
    assert.strictEqual(resNoToken.statusCode, 401);

    const resFakeToken = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer TokenGiaMaoKhongHopLe999' },
      body: { departmentName: 'Cập nhật token giả mạo' },
    });
    assert.strictEqual(resFakeToken.statusCode, 401);
  });

  // ===========================================================================
  // PHẦN 5: KIỂM THỬ RÀNG BUỘC ID & TOÀN VẸN DỮ LIỆU
  // ===========================================================================
  console.log('\n--- NHÓM 5: KIỂM THỬ RÀNG BUỘC ID & TOÀN VẸN DỮ LIỆU ---');

  await test('TC_DEPT_INT_01: Cập nhật ID phòng ban không tồn tại trong hệ thống -> Báo lỗi 404 Not Found', async () => {
    const nonExistentId = 999999;
    const res = await request(`/departments/${nonExistentId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: 'Phòng không tồn tại' },
    });

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.success, false);
  });

  await test('TC_DEPT_INT_02: Cập nhật với ID sai định dạng (chuỗi / số âm) -> Báo lỗi 400 Bad Request', async () => {
    const resStr = await request('/departments/abc', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: 'ID chuỗi' },
    });
    assert.strictEqual(resStr.statusCode, 400);

    const resNeg = await request('/departments/-15', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { departmentName: 'ID số âm' },
    });
    assert.strictEqual(resNeg.statusCode, 400);
  });

  await test('TC_DEPT_INT_03: Cập nhật đồng bộ toàn diện tất cả các trường (Tên, SĐT, Địa điểm, Mô tả, Active) -> Thành công và đối soát 100% với DB', async () => {
    const comprehensivePayload = {
      departmentName: `Phòng Kỹ thuật Đảm bảo Chất lượng ${timestamp}`,
      departmentCode: `QA-FULL-${timestamp}`,
      phone: '0208-3999-555',
      location: 'Tầng 6 - Tòa nhà Công nghệ ICTU',
      description: 'Phụ trách toàn bộ hoạt động kiểm thử QA, Automation và Quản lý Lỗi',
      isActive: true,
    };

    const putRes = await request(`/departments/${deptAId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: comprehensivePayload,
    });

    assert.strictEqual(putRes.statusCode, 200);

    // Đối soát 100% với GET API
    const getRes = await request(`/departments/${deptAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const savedData = getRes.body.data;
    assert.strictEqual(savedData.departmentName, comprehensivePayload.departmentName);
    assert.strictEqual(savedData.departmentCode, comprehensivePayload.departmentCode);
    assert.strictEqual(savedData.phone, comprehensivePayload.phone);
    assert.strictEqual(savedData.location, comprehensivePayload.location);
    assert.strictEqual(savedData.description, comprehensivePayload.description);
    assert.strictEqual(Boolean(savedData.isActive), comprehensivePayload.isActive);
  });

  // 3. Dọn dẹp dữ liệu thử nghiệm sau khi test hoàn tất
  console.log('\n--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---');
  try {
    await request(`/departments/${deptAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await request(`/departments/${deptBId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`ℹ️ [Cleanup] Đã dọn dẹp an toàn 2 phòng ban thử nghiệm ID=${deptAId} và ID=${deptBId}`);
  } catch (cleanErr) {
    console.warn('⚠️ [Cleanup] Dọn dẹp dữ liệu thử nghiệm thất bại:', cleanErr.message);
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ QA: ĐÃ VƯỢT QUA ${passed}/${total} TEST CASES! (100% PASS)`);
  console.log('============================================================\n');
}

runQaTestSuite().catch((err) => {
  console.error('\n💥 LỖI KHÔNG MONG MUỐN TRONG TEST SUITE QA:', err);
  process.exit(1);
});
