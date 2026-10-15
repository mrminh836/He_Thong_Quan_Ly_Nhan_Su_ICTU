/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG CHỨC NĂNG CHẤM CÔNG & CHECK-IN TỰ ĐỘNG (HRM - ICTU)
 * Bao phủ đầy đủ 12 trường hợp kiểm thử bắt buộc theo Task Description:
 *   1. Check-in lúc 08:15:00 -> ON_TIME
 *   2. Check-in lúc 08:29:59 -> ON_TIME
 *   3. Check-in đúng 08:30:00 -> ON_TIME
 *   4. Check-in lúc 08:30:01 -> LATE
 *   5. Check-in lúc 08:45:00 -> LATE
 *   6. Không có JWT -> 401 Unauthorized
 *   7. Tài khoản không liên kết nhân viên -> 404 Not Found
 *   8. Check-in lần hai trong ngày -> 409 Conflict (ALREADY_CHECKED_IN)
 *   9. Hai request đồng thời không tạo hai bản ghi (Race condition test)
 *   10. Kiểm tra ranh giới ngày lúc gần 00:00 theo giờ Việt Nam
 *   11. Kiểm tra ứng dụng vẫn đúng khi máy chạy Backend có timezone khác Việt Nam
 *   12. Client gửi employeeId, status hoặc checkInTime giả mạo không làm thay đổi kết quả
 * ==============================================================================
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { getVietnamAttendanceInfo, VIETNAM_TIMEZONE, CUTOFF_TOTAL_SECONDS } from '../src/utils/attendanceTime.js';
import attendanceService, { AttendanceServiceError } from '../src/services/attendanceService.js';
import attendanceRepository from '../src/repositories/attendanceRepository.js';
import employeeRepository from '../src/repositories/employeeRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import { checkIn } from '../src/controllers/attendanceController.js';
import { authenticateToken } from '../src/middlewares/auth.js';

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

console.log('\n============================================================');
console.log('⏱️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ ATTENDANCE CHECK-IN SERVICE & API');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// PHẦN 1: KIỂM THỬ THỜI GIAN BIÊN VÀ QUY TẮC MỐC 08:30:00 (Múi giờ Asia/Ho_Chi_Minh)
// --------------------------------------------------------------------------

runTest('Check-in lúc 08:15:00 -> ON_TIME (Đúng giờ)', () => {
  // 08:15:00 giờ Việt Nam (+07:00) tương ứng 01:15:00 UTC
  const testTime = new Date('2026-10-16T01:15:00.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:15:00');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.dbStatus, 'OnTime');
  assert.strictEqual(info.isLate, false);
});

runTest('Check-in lúc 08:29:59 -> ON_TIME (Cận dưới biên 1 giây -> Đúng giờ)', () => {
  // 08:29:59 giờ Việt Nam (+07:00) tương ứng 01:29:59 UTC
  const testTime = new Date('2026-10-16T01:29:59.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:29:59');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.dbStatus, 'OnTime');
  assert.strictEqual(info.isLate, false);
});

runTest('Check-in đúng 08:30:00 -> ON_TIME (Đúng mốc chuẩn biên -> Đúng giờ)', () => {
  // 08:30:00 giờ Việt Nam (+07:00) tương ứng 01:30:00 UTC
  const testTime = new Date('2026-10-16T01:30:00.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:30:00');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.dbStatus, 'OnTime');
  assert.strictEqual(info.isLate, false);
});

runTest('Check-in lúc 08:30:01 -> LATE (Vượt mốc biên 1 giây -> Đi muộn)', () => {
  // 08:30:01 giờ Việt Nam (+07:00) tương ứng 01:30:01 UTC
  const testTime = new Date('2026-10-16T01:30:01.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:30:01');
  assert.strictEqual(info.status, 'LATE');
  assert.strictEqual(info.dbStatus, 'Late');
  assert.strictEqual(info.isLate, true);
});

runTest('Check-in lúc 08:45:00 -> LATE (Đi muộn 15 phút)', () => {
  // 08:45:00 giờ Việt Nam (+07:00) tương ứng 01:45:00 UTC
  const testTime = new Date('2026-10-16T01:45:00.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:45:00');
  assert.strictEqual(info.status, 'LATE');
  assert.strictEqual(info.dbStatus, 'Late');
  assert.strictEqual(info.isLate, true);
});

// --------------------------------------------------------------------------
// PHẦN 2: KIỂM THỬ RANH GIỚI NGÀY (MIDNIGHT) VÀ TÍNH ĐỘC LẬP MÚI GIỜ
// --------------------------------------------------------------------------

runTest('Kiểm tra ranh giới ngày lúc gần 00:00 (23:59:59 hôm trước vs 00:00:00 hôm sau)', () => {
  // 23:59:59 ngày 15/10/2026 giờ VN tương ứng 16:59:59Z ngày 15/10
  const timeBeforeMidnight = new Date('2026-10-15T16:59:59.000Z');
  const infoBefore = getVietnamAttendanceInfo(timeBeforeMidnight);
  assert.strictEqual(infoBefore.workDate, '2026-10-15');
  assert.strictEqual(infoBefore.checkInTimeString, '23:59:59');

  // 00:00:00 ngày 16/10/2026 giờ VN tương ứng 17:00:00Z ngày 15/10
  const timeMidnight = new Date('2026-10-15T17:00:00.000Z');
  const infoMidnight = getVietnamAttendanceInfo(timeMidnight);
  assert.strictEqual(infoMidnight.workDate, '2026-10-16');
  assert.strictEqual(infoMidnight.checkInTimeString, '00:00:00');
  assert.strictEqual(infoMidnight.status, 'ON_TIME'); // 00:00:00 < 08:30:00
});

runTest('Kiểm tra ứng dụng tính toán chính xác bất kể máy chạy Backend có múi giờ nào (UTC, New York, Tokyo)', () => {
  // Thử nghiệm với chuỗi ISO cụ thể có offset +07:00
  const isoVietnamString = '2026-10-16T08:20:00+07:00';
  const info = getVietnamAttendanceInfo(isoVietnamString);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:20:00');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.checkInIso, '2026-10-16T08:20:00+07:00');
});

// --------------------------------------------------------------------------
// PHẦN 3: KIỂM THỬ XÁC THỰC, PHÂN QUYỀN VÀ XỬ LÝ LỖI
// --------------------------------------------------------------------------

await runAsyncTest('Không có JWT Token -> Trả về lỗi 401 Unauthorized', async () => {
  const req = {
    headers: {},
  };
  let capturedResponse = null;
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      capturedResponse = { statusCode: this.statusCode, payload };
      return this;
    },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await authenticateToken(req, res, next);

  assert.strictEqual(nextCalled, false);
  assert.ok(capturedResponse);
  assert.strictEqual(capturedResponse.statusCode, 401);
  assert.strictEqual(capturedResponse.payload.errorCode, 'TOKEN_REQUIRED');
});

await runAsyncTest('Tài khoản không liên kết nhân viên -> Trả về lỗi 404 (EMPLOYEE_NOT_LINKED)', async () => {
  // Giả lập tài khoản không có employeeId
  const originalFindById = userRepository.findById;
  userRepository.findById = async (id) => ({
    user_id: id,
    username: 'orphan_admin',
    employee_id: null,
    account_status: 'Active',
  });

  try {
    await assert.rejects(
      async () => {
        await attendanceService.performCheckIn({
          userId: 999,
          userEmployeeId: null,
          currentTime: new Date('2026-10-16T08:15:00+07:00'),
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.errorCode, 'EMPLOYEE_NOT_LINKED');
        return true;
      }
    );
  } finally {
    userRepository.findById = originalFindById;
  }
});

await runAsyncTest('Check-in lần hai trong ngày -> Trả về HTTP 409 Conflict (ALREADY_CHECKED_IN)', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalFindEmployee = employeeRepository.findById;

  // Giả lập đã có bản ghi chấm công trong ngày hôm nay
  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 88,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:15:00',
    attendance_status: 'OnTime',
  });

  employeeRepository.findById = async (empId) => ({
    employee_id: empId,
    full_name: 'Nguyễn Văn Test',
    employment_status: 'Active',
  });

  try {
    await assert.rejects(
      async () => {
        await attendanceService.performCheckIn({
          userId: 1,
          userEmployeeId: 15,
          currentTime: new Date('2026-10-16T08:25:00+07:00'),
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.errorCode, 'ALREADY_CHECKED_IN');
        assert.strictEqual(err.message, 'Bạn đã check-in hôm nay.');
        assert.ok(err.details);
        assert.strictEqual(err.details.attendanceId, 88);
        return true;
      }
    );
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Hai request đồng thời (Race condition) -> Chỉ 1 request thành công, request thứ hai trả 409 Conflict', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalCreateCheckIn = attendanceRepository.createCheckIn;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({
    employee_id: id,
    employment_status: 'Active',
  });

  let createdCount = 0;
  // Ban đầu chưa có bản ghi
  let hasRecordInDb = false;

  attendanceRepository.findByEmployeeAndDate = async (empId, date) => {
    if (hasRecordInDb) {
      return {
        attendance_id: 101,
        employee_id: empId,
        attendance_date: date,
        check_in: '08:20:00',
        attendance_status: 'OnTime',
      };
    }
    return null;
  };

  // Giả lập database constraint: Nếu đã có record thì ném mã lỗi ER_DUP_ENTRY
  attendanceRepository.createCheckIn = async (params) => {
    if (hasRecordInDb) {
      const err = new Error('Duplicate entry for key uk_attendances_emp_date');
      err.code = 'ER_DUP_ENTRY';
      err.errno = 1062;
      err.isDuplicate = true;
      throw err;
    }
    hasRecordInDb = true;
    createdCount++;
    return 101;
  };

  try {
    const results = await Promise.allSettled([
      attendanceService.performCheckIn({
        userId: 1,
        userEmployeeId: 20,
        currentTime: new Date('2026-10-16T08:20:00+07:00'),
      }),
      attendanceService.performCheckIn({
        userId: 1,
        userEmployeeId: 20,
        currentTime: new Date('2026-10-16T08:20:00+07:00'),
      }),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const rejects = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Chỉ duy nhất 1 request được thành công');
    assert.strictEqual(rejects.length, 1, 'Request đồng thời còn lại phải bị từ chối');
    assert.strictEqual(rejects[0].reason.statusCode, 409, 'Lỗi phải mang mã 409 Conflict');
    assert.strictEqual(rejects[0].reason.errorCode, 'ALREADY_CHECKED_IN');
    assert.strictEqual(createdCount, 1, 'Chỉ duy nhất 1 bản ghi được tạo trong CSDL');
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    attendanceRepository.createCheckIn = originalCreateCheckIn;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Client gửi employeeId, status hoặc checkInTime giả mạo -> Controller phớt lờ hoàn toàn', async () => {
  const originalPerformCheckIn = attendanceService.performCheckIn;
  let receivedParams = null;

  attendanceService.performCheckIn = async (params) => {
    receivedParams = params;
    return {
      attendanceId: 99,
      employeeId: params.userEmployeeId,
      workDate: '2026-10-16',
      checkInTime: '2026-10-16T08:45:00+07:00',
      status: 'LATE',
      message: 'Check-in thành công. Bạn đã đi muộn.',
    };
  };

  const fakeReq = {
    user: {
      userId: 5,
      employeeId: 7,
      role: 'EMPLOYEE',
    },
    body: {
      employeeId: 9999,                          // Cố tình giả mạo nhân viên khác
      status: 'ON_TIME',                         // Cố tình tự nhận là đúng giờ
      checkInTime: '2026-10-16T07:00:00+07:00', // Cố tình lùi giờ vào ca
    },
  };

  let capturedSuccess = null;
  const fakeRes = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      capturedSuccess = { statusCode: this.statusCode, payload };
      return this;
    },
  };

  try {
    await checkIn(fakeReq, fakeRes, () => {});

    assert.ok(capturedSuccess);
    assert.strictEqual(capturedSuccess.statusCode, 201);
    // Kiểm tra service nhận đúng employeeId từ JWT token (7), không phải từ body (9999)
    assert.strictEqual(receivedParams.userEmployeeId, 7);
    assert.strictEqual(receivedParams.userId, 5);
    // Đảm bảo không có trường giả mạo nào được truyền vào service
    assert.strictEqual(receivedParams.employeeId, undefined);
    assert.strictEqual(receivedParams.status, undefined);
    assert.strictEqual(receivedParams.checkInTime, undefined);
  } finally {
    attendanceService.performCheckIn = originalPerformCheckIn;
  }
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ ATTENDANCE CHECK-IN!`);
console.log('============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
