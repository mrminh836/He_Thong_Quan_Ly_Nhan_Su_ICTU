/**
 * BỘ KIỂM THỬ THỰC TẾ (INTEGRATION TESTS) CHO API PUT /api/departments/:id
 * Kiểm tra 10 kịch bản tối thiểu theo yêu cầu đặc tả trên môi trường thực tế (MySQL + Express):
 * 1.  Cập nhật thành công với mã phòng ban mới chưa tồn tại -> 200 OK
 * 2.  Cập nhật tên/mô tả nhưng giữ nguyên mã hiện tại -> 200 OK (không bị lỗi trùng mã)
 * 3.  Cập nhật sang mã của phòng ban khác -> 409 Conflict (DUPLICATE_DEPARTMENT_CODE)
 * 4.  Cập nhật ID không tồn tại -> 404 Not Found (DEPARTMENT_NOT_FOUND)
 * 5.  ID sai định dạng (chuỗi ký tự / số âm / số 0) -> 400 Bad Request (INVALID_ID)
 * 6.  Thiếu trường bắt buộc hoặc dữ liệu sai kiểu -> 400 Bad Request (VALIDATION_ERROR)
 * 7.  Không gửi token -> 401 Unauthorized (TOKEN_REQUIRED)
 * 8.  Role không đủ quyền (EMPLOYEE cố cập nhật) -> 403 Forbidden (FORBIDDEN)
 * 9.  Gửi trường không được phép cập nhật (DepartmentID) -> Bỏ qua an toàn hoặc từ chối
 * 10. Gửi request đồng thời dùng cùng một mã -> Database kích hoạt UNIQUE key uk_departments_code
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
          } catch (e) {
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

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('🏢 KIỂM THỬ TÍCH HỢP THỰC TẾ: PUT /api/departments/:id');
  console.log('   Môi trường: Express Backend (3005) + MySQL (3306)');
  console.log('============================================================\n');

  // 1. Đăng nhập để lấy tokens thực tế
  const adminLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123' },
  });
  assert.strictEqual(adminLoginRes.statusCode, 200, 'Đăng nhập admin phải thành công');
  const adminToken = adminLoginRes.body.data.accessToken;

  const hrLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'hr', password: 'Hr@123' },
  });
  assert.strictEqual(hrLoginRes.statusCode, 200, 'Đăng nhập hr phải thành công');
  const hrToken = hrLoginRes.body.data.accessToken;

  const empLoginRes = await request('/auth/login', {
    method: 'POST',
    body: { username: 'emp1', password: 'Emp@123' },
  });
  assert.strictEqual(empLoginRes.statusCode, 200, 'Đăng nhập employee phải thành công');
  const empToken = empLoginRes.body.data.accessToken;

  // Chuẩn bị 2 phòng ban thử nghiệm chuyên dụng
  const testDept1Res = await request('/departments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentCode: 'PB-TEST-A',
      departmentName: 'Phòng Thử Nghiệm Alpha',
      location: 'Tòa nhà Test Alpha',
      phone: '0208-1111-111',
      description: 'Phòng ban phục vụ kiểm thử PUT',
    },
  });
  const dept1Id = testDept1Res.body.data.id || testDept1Res.body.data.departmentId;

  const testDept2Res = await request('/departments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      departmentCode: 'PB-TEST-B',
      departmentName: 'Phòng Thử Nghiệm Beta',
      location: 'Tòa nhà Test Beta',
      phone: '0208-2222-222',
      description: 'Phòng ban phục vụ kiểm thử trùng mã',
    },
  });
  const dept2Id = testDept2Res.body.data.id || testDept2Res.body.data.departmentId;

  try {
    // -------------------------------------------------------------------------
    // KỊCH BẢN 1: Cập nhật thành công với mã phòng ban mới chưa tồn tại -> 200 OK
    // -------------------------------------------------------------------------
    await test('Kịch bản 1: Cập nhật thành công với mã phòng ban mới chưa tồn tại -> 200 OK', async () => {
      const res = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentCode: 'PB-ALPHA-NEW',
          departmentName: 'Phòng Thử Nghiệm Alpha Đổi Tên',
          location: 'Tầng 8 - Tòa nhà Mới',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.departmentCode, 'PB-ALPHA-NEW');
      assert.strictEqual(res.body.data.departmentName, 'Phòng Thử Nghiệm Alpha Đổi Tên');
      assert.strictEqual(res.body.data.location, 'Tầng 8 - Tòa nhà Mới');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 2: Cập nhật tên/mô tả nhưng giữ nguyên mã hiện tại -> 200 OK
    // -------------------------------------------------------------------------
    await test('Kịch bản 2: Cập nhật tên/mô tả nhưng giữ nguyên mã hiện tại của chính phòng ban -> 200 OK', async () => {
      const res = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${hrToken}` },
        body: {
          departmentCode: 'PB-ALPHA-NEW', // Giữ nguyên mã hiện tại của phòng ban này
          description: 'Mô tả cập nhật lần 2 giữ nguyên mã',
          phone: '0208-9999-888',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.departmentCode, 'PB-ALPHA-NEW');
      assert.strictEqual(res.body.data.description, 'Mô tả cập nhật lần 2 giữ nguyên mã');
      assert.strictEqual(res.body.data.phone, '0208-9999-888');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 3: Cập nhật sang mã của phòng ban khác -> 409 Conflict
    // -------------------------------------------------------------------------
    await test('Kịch bản 3: Cập nhật sang mã của phòng ban khác -> 409 Conflict (DUPLICATE_DEPARTMENT_CODE)', async () => {
      // dept1 cố cập nhật sang mã 'PB-TEST-B' của dept2
      const res = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentCode: 'PB-TEST-B',
        },
      });

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'DUPLICATE_DEPARTMENT_CODE');
      assert.ok(res.body.message.includes('PB-TEST-B') || res.body.message.includes('Mã phòng ban'));

      // Kiểm tra trong database: dept1 vẫn giữ nguyên mã cũ 'PB-ALPHA-NEW'
      const checkRes = await request(`/departments/${dept1Id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(checkRes.body.data.departmentCode, 'PB-ALPHA-NEW');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 4: Cập nhật ID không tồn tại -> 404 Not Found
    // -------------------------------------------------------------------------
    await test('Kịch bản 4: Cập nhật ID không tồn tại -> 404 Not Found (DEPARTMENT_NOT_FOUND)', async () => {
      const res = await request('/departments/999999', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentName: 'Phòng Ảo Không Tồn Tại',
        },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'DEPARTMENT_NOT_FOUND');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 5: ID sai định dạng -> 400 Bad Request
    // -------------------------------------------------------------------------
    await test('Kịch bản 5: ID sai định dạng (chuỗi ký tự / số âm / số 0) -> 400 Bad Request', async () => {
      // 5.1 ID là chữ
      const res1 = await request('/departments/invalid-id-str', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentName: 'Tên mới' },
      });
      assert.strictEqual(res1.statusCode, 400);
      assert.strictEqual(res1.body.errorCode, 'INVALID_ID');

      // 5.2 ID là số âm
      const res2 = await request('/departments/-15', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentName: 'Tên mới' },
      });
      assert.strictEqual(res2.statusCode, 400);
      assert.strictEqual(res2.body.errorCode, 'INVALID_ID');

      // 5.3 ID bằng 0
      const res3 = await request('/departments/0', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentName: 'Tên mới' },
      });
      assert.strictEqual(res3.statusCode, 400);
      assert.strictEqual(res3.body.errorCode, 'INVALID_ID');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 6: Thiếu trường bắt buộc hoặc dữ liệu sai kiểu -> 400 Bad Request
    // -------------------------------------------------------------------------
    await test('Kịch bản 6: Thiếu trường bắt buộc hoặc dữ liệu sai kiểu -> 400 Bad Request', async () => {
      // 6.1 Body rỗng {}
      const resEmpty = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {},
      });
      assert.strictEqual(resEmpty.statusCode, 400);
      assert.strictEqual(resEmpty.body.errorCode, 'VALIDATION_ERROR');

      // 6.2 Mã phòng ban quá ngắn (< 2 ký tự)
      const resShort = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentCode: 'X' },
      });
      assert.strictEqual(resShort.statusCode, 400);
      assert.strictEqual(resShort.body.errorCode, 'VALIDATION_ERROR');

      // 6.3 Mã phòng ban chứa ký tự không hợp lệ (@, #, dấu cách)
      const resSpecial = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentCode: 'PB@HACK#99' },
      });
      assert.strictEqual(resSpecial.statusCode, 400);
      assert.strictEqual(resSpecial.body.errorCode, 'VALIDATION_ERROR');

      // 6.4 Tên phòng ban để trống hoặc chỉ có khoảng trắng
      const resBlankName = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentName: '     ' },
      });
      assert.strictEqual(resBlankName.statusCode, 400);
      assert.strictEqual(resBlankName.body.errorCode, 'VALIDATION_ERROR');

      // 6.5 Mã phòng ban sai kiểu dữ liệu (số thay vì chuỗi)
      const resType = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { departmentCode: 98765 },
      });
      assert.strictEqual(resType.statusCode, 400);
      assert.strictEqual(resType.body.errorCode, 'VALIDATION_ERROR');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 7: Không gửi token -> 401 Unauthorized
    // -------------------------------------------------------------------------
    await test('Kịch bản 7: Không gửi token -> 401 Unauthorized (TOKEN_REQUIRED)', async () => {
      const res = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        body: { departmentName: 'Hacker cập nhật' },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'TOKEN_REQUIRED');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 8: Role không đủ quyền -> 403 Forbidden
    // -------------------------------------------------------------------------
    await test('Kịch bản 8: Role EMPLOYEE cố cập nhật phòng ban -> 403 Forbidden', async () => {
      const res = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${empToken}` },
        body: { departmentName: 'Nhân viên cố sửa tên PB' },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.errorCode, 'FORBIDDEN');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 9: Gửi trường không được phép cập nhật (DepartmentID) -> Bỏ qua an toàn hoặc từ chối
    // -------------------------------------------------------------------------
    await test('Kịch bản 9: Gửi trường không được phép cập nhật (DepartmentID) -> Bị bỏ qua, không ghi đè dữ liệu hệ thống', async () => {
      // 9.1 Gửi kèm DepartmentID giả mạo + trường hợp lệ
      const res1 = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentId: 88888,
          department_id: 77777,
          location: 'Tầng 10 - Tòa nhà Kiểm Soát An Toàn',
        },
      });

      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.body.data.id, dept1Id, 'Khóa chính ID tuyệt đối không bị thay đổi');
      assert.strictEqual(res1.body.data.location, 'Tầng 10 - Tòa nhà Kiểm Soát An Toàn');

      // 9.2 Chỉ gửi mỗi trường không được phép cập nhật -> 400 Bad Request
      const res2 = await request(`/departments/${dept1Id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          departmentId: 9999,
          created_at: '2020-01-01',
        },
      });

      assert.strictEqual(res2.statusCode, 400);
      assert.strictEqual(res2.body.errorCode, 'VALIDATION_ERROR');
    });

    // -------------------------------------------------------------------------
    // KỊCH BẢN 10: Gửi request đồng thời dùng cùng một mã -> Database bảo đảm không có mã trùng
    // -------------------------------------------------------------------------
    await test('Kịch bản 10: Gửi 2 request đồng thời dùng cùng một mã mới -> Database bảo đảm không có mã trùng (Race condition)', async () => {
      const targetCode = 'PB-RACE-WIN';

      // Gửi đồng thời 2 request PUT cố đổi dept1 và dept2 thành cùng mã 'PB-RACE-WIN'
      const [p1, p2] = await Promise.all([
        request(`/departments/${dept1Id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { departmentCode: targetCode },
        }),
        request(`/departments/${dept2Id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { departmentCode: targetCode },
        }),
      ]);

      const statusCodes = [p1.statusCode, p2.statusCode].sort();
      // Phải có 1 request thành công 200 và 1 request thất bại 409
      assert.deepStrictEqual(
        statusCodes,
        [200, 409],
        `Một request phải thành công (200) và request còn lại phải bị từ chối (409). Nhận được: ${JSON.stringify(statusCodes)}`
      );

      // Xác minh trong DB chỉ có đúng 1 phòng ban mang mã PB-RACE-WIN
      const listRes = await request('/departments?search=PB-RACE-WIN', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const matches = listRes.body.data.filter((d) => d.departmentCode === targetCode);
      assert.strictEqual(matches.length, 1, 'Database chỉ được phép tồn tại duy nhất 1 phòng ban mang mã này');
    });

  } finally {
    // Dọn dẹp dữ liệu kiểm thử
    await request(`/departments/${dept1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await request(`/departments/${dept2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN KIỂM THỬ THỰC TẾ!`);
  console.log('============================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ BỘ KIỂM THỬ GẶP LỖI:', err);
  process.exit(1);
});
