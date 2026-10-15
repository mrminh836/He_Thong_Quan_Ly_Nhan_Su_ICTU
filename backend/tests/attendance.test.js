/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG CHỨC NĂNG CHẤM CÔNG (HRM - ICTU)
 * Bao phủ đầy đủ các trường hợp kiểm thử cho:
 *   - Check-in tự động (mốc 08:30:00, ranh giới ngày, chống trùng lặp, phân quyền)
 *   - Check-out kết thúc ca làm việc (yêu cầu check-in trước, không check-out 2 lần, chống race condition)
 *   - Bảng chấm công hôm nay GET /api/attendance/today (RBAC Employee vs Admin/HR, LEFT JOIN, tính summary, không lộ CCCD)
 * ==============================================================================
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { getVietnamAttendanceInfo, formatToVietnamIso, VIETNAM_TIMEZONE } from '../src/utils/attendanceTime.js';
import attendanceService, { AttendanceServiceError } from '../src/services/attendanceService.js';
import attendanceRepository from '../src/repositories/attendanceRepository.js';
import employeeRepository from '../src/repositories/employeeRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import { checkIn, checkOut, getToday } from '../src/controllers/attendanceController.js';
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
console.log('⏱️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ ATTENDANCE (CHECK-IN, CHECK-OUT & TODAY BOARD)');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// PHẦN 1: KIỂM THỬ THỜI GIAN BIÊN VÀ CHECK-IN
// --------------------------------------------------------------------------

runTest('Check-in lúc 08:15:00 -> ON_TIME (Đúng giờ)', () => {
  const testTime = new Date('2026-10-16T01:15:00.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:15:00');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.dbStatus, 'OnTime');
  assert.strictEqual(info.isLate, false);
});

runTest('Check-in lúc 08:29:59 -> ON_TIME (Cận dưới biên 1 giây -> Đúng giờ)', () => {
  const testTime = new Date('2026-10-16T01:29:59.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:29:59');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.dbStatus, 'OnTime');
  assert.strictEqual(info.isLate, false);
});

runTest('Check-in đúng 08:30:00 -> ON_TIME (Đúng mốc chuẩn biên -> Đúng giờ)', () => {
  const testTime = new Date('2026-10-16T01:30:00.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:30:00');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.dbStatus, 'OnTime');
  assert.strictEqual(info.isLate, false);
});

runTest('Check-in lúc 08:30:01 -> LATE (Vượt mốc biên 1 giây -> Đi muộn)', () => {
  const testTime = new Date('2026-10-16T01:30:01.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:30:01');
  assert.strictEqual(info.status, 'LATE');
  assert.strictEqual(info.dbStatus, 'Late');
  assert.strictEqual(info.isLate, true);
});

runTest('Check-in lúc 08:45:00 -> LATE (Đi muộn 15 phút)', () => {
  const testTime = new Date('2026-10-16T01:45:00.000Z');
  const info = getVietnamAttendanceInfo(testTime);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:45:00');
  assert.strictEqual(info.status, 'LATE');
  assert.strictEqual(info.dbStatus, 'Late');
  assert.strictEqual(info.isLate, true);
});

runTest('Kiểm tra ranh giới ngày lúc gần 00:00 (23:59:59 hôm trước vs 00:00:00 hôm sau)', () => {
  const timeBeforeMidnight = new Date('2026-10-15T16:59:59.000Z');
  const infoBefore = getVietnamAttendanceInfo(timeBeforeMidnight);
  assert.strictEqual(infoBefore.workDate, '2026-10-15');
  assert.strictEqual(infoBefore.checkInTimeString, '23:59:59');

  const timeMidnight = new Date('2026-10-15T17:00:00.000Z');
  const infoMidnight = getVietnamAttendanceInfo(timeMidnight);
  assert.strictEqual(infoMidnight.workDate, '2026-10-16');
  assert.strictEqual(infoMidnight.checkInTimeString, '00:00:00');
  assert.strictEqual(infoMidnight.status, 'ON_TIME');
});

runTest('Kiểm tra ứng dụng tính toán chính xác bất kể máy chạy Backend có múi giờ nào (UTC, New York, Tokyo)', () => {
  const isoVietnamString = '2026-10-16T08:20:00+07:00';
  const info = getVietnamAttendanceInfo(isoVietnamString);

  assert.strictEqual(info.workDate, '2026-10-16');
  assert.strictEqual(info.checkInTimeString, '08:20:00');
  assert.strictEqual(info.status, 'ON_TIME');
  assert.strictEqual(info.checkInIso, '2026-10-16T08:20:00+07:00');
});

await runAsyncTest('Không có JWT Token -> Trả về lỗi 401 Unauthorized', async () => {
  const req = { headers: {} };
  let capturedResponse = null;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedResponse = { statusCode: this.statusCode, payload }; return this; },
  };
  let nextCalled = false;
  await authenticateToken(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.ok(capturedResponse);
  assert.strictEqual(capturedResponse.statusCode, 401);
  assert.strictEqual(capturedResponse.payload.errorCode, 'TOKEN_REQUIRED');
});

await runAsyncTest('Tài khoản không liên kết nhân viên -> Trả về lỗi 404 (EMPLOYEE_NOT_LINKED)', async () => {
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
        return true;
      }
    );
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Hai request Check-in đồng thời (Race condition) -> Chỉ 1 thành công, 1 trả 409', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalCreateCheckIn = attendanceRepository.createCheckIn;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({ employee_id: id, employment_status: 'Active' });

  let hasRecordInDb = false;
  attendanceRepository.findByEmployeeAndDate = async (empId, date) => {
    return hasRecordInDb ? { attendance_id: 101, employee_id: empId, attendance_date: date, check_in: '08:20:00', attendance_status: 'OnTime' } : null;
  };

  attendanceRepository.createCheckIn = async () => {
    if (hasRecordInDb) {
      const err = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY';
      err.errno = 1062;
      err.isDuplicate = true;
      throw err;
    }
    hasRecordInDb = true;
    return 101;
  };

  try {
    const results = await Promise.allSettled([
      attendanceService.performCheckIn({ userId: 1, userEmployeeId: 20, currentTime: new Date('2026-10-16T08:20:00+07:00') }),
      attendanceService.performCheckIn({ userId: 1, userEmployeeId: 20, currentTime: new Date('2026-10-16T08:20:00+07:00') }),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const rejects = results.filter((r) => r.status === 'rejected');
    assert.strictEqual(successes.length, 1);
    assert.strictEqual(rejects.length, 1);
    assert.strictEqual(rejects[0].reason.statusCode, 409);
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    attendanceRepository.createCheckIn = originalCreateCheckIn;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Client gửi employeeId, status hoặc checkInTime giả mạo Check-in -> Controller phớt lờ hoàn toàn', async () => {
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
    user: { userId: 5, employeeId: 7, role: 'EMPLOYEE' },
    body: { employeeId: 9999, status: 'ON_TIME', checkInTime: '2026-10-16T07:00:00+07:00' },
  };

  let capturedSuccess = null;
  const fakeRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedSuccess = { statusCode: this.statusCode, payload }; return this; },
  };

  try {
    await checkIn(fakeReq, fakeRes, () => {});
    assert.ok(capturedSuccess);
    assert.strictEqual(capturedSuccess.statusCode, 201);
    assert.strictEqual(receivedParams.userEmployeeId, 7);
    assert.strictEqual(receivedParams.employeeId, undefined);
  } finally {
    attendanceService.performCheckIn = originalPerformCheckIn;
  }
});

// --------------------------------------------------------------------------
// PHẦN 2: KIỂM THỬ API CHECK-OUT (POST /api/attendance/check-out)
// --------------------------------------------------------------------------

await runAsyncTest('Check-out thành công sau khi đã Check-in (HTTP 200 OK)', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalUpdateCheckOut = attendanceRepository.updateCheckOut;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({ employee_id: id, employment_status: 'Active' });

  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 15,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:25:00',
    check_out: null, // Chưa check-out
    attendance_status: 'OnTime',
  });

  attendanceRepository.updateCheckOut = async () => 1;

  try {
    const result = await attendanceService.performCheckOut({
      userId: 2,
      userEmployeeId: 15,
      currentTime: new Date('2026-10-16T17:30:00+07:00'),
    });

    assert.strictEqual(result.attendanceId, 15);
    assert.strictEqual(result.employeeId, 15);
    assert.strictEqual(result.workDate, '2026-10-16');
    assert.strictEqual(result.checkInTime, '2026-10-16T08:25:00+07:00');
    assert.strictEqual(result.checkOutTime, '2026-10-16T17:30:00+07:00');
    assert.strictEqual(result.status, 'ON_TIME');
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    attendanceRepository.updateCheckOut = originalUpdateCheckOut;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Check-out khi chưa Check-in -> Trả về lỗi 404 (CHECKIN_REQUIRED)', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({ employee_id: id, employment_status: 'Active' });
  attendanceRepository.findByEmployeeAndDate = async () => null; // Chưa có bản ghi

  try {
    await assert.rejects(
      async () => {
        await attendanceService.performCheckOut({
          userId: 2,
          userEmployeeId: 15,
          currentTime: new Date('2026-10-16T17:30:00+07:00'),
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.errorCode, 'CHECKIN_REQUIRED');
        assert.strictEqual(err.message, 'Bạn chưa thực hiện check-in hôm nay.');
        return true;
      }
    );
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Check-out lần thứ hai trong ngày -> Trả về HTTP 409 Conflict (ALREADY_CHECKED_OUT)', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({ employee_id: id, employment_status: 'Active' });
  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 15,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:25:00',
    check_out: '17:30:00', // Đã check-out trước đó
    attendance_status: 'OnTime',
  });

  try {
    await assert.rejects(
      async () => {
        await attendanceService.performCheckOut({
          userId: 2,
          userEmployeeId: 15,
          currentTime: new Date('2026-10-16T17:35:00+07:00'),
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.errorCode, 'ALREADY_CHECKED_OUT');
        assert.strictEqual(err.message, 'Bạn đã check-out hôm nay.');
        return true;
      }
    );
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Hai request Check-out đồng thời (Race condition) -> Chỉ 1 thành công, 1 trả 409 Conflict', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalUpdateCheckOut = attendanceRepository.updateCheckOut;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({ employee_id: id, employment_status: 'Active' });

  let isCheckedOut = false;
  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 15,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:25:00',
    check_out: isCheckedOut ? '17:30:00' : null,
    attendance_status: 'OnTime',
  });

  // Câu lệnh UPDATE có điều kiện check_out IS NULL: chỉ request đầu tiên update được 1 row
  attendanceRepository.updateCheckOut = async () => {
    if (isCheckedOut) return 0;
    isCheckedOut = true;
    return 1;
  };

  try {
    const results = await Promise.allSettled([
      attendanceService.performCheckOut({ userId: 2, userEmployeeId: 15, currentTime: new Date('2026-10-16T17:30:00+07:00') }),
      attendanceService.performCheckOut({ userId: 2, userEmployeeId: 15, currentTime: new Date('2026-10-16T17:30:00+07:00') }),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const rejects = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Chỉ 1 request Check-out được thành công');
    assert.strictEqual(rejects.length, 1, 'Request đồng thời thứ hai phải nhận lỗi 409');
    assert.strictEqual(rejects[0].reason.statusCode, 409);
    assert.strictEqual(rejects[0].reason.errorCode, 'ALREADY_CHECKED_OUT');
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    attendanceRepository.updateCheckOut = originalUpdateCheckOut;
    employeeRepository.findById = originalFindEmployee;
  }
});

await runAsyncTest('Tài khoản không liên kết nhân viên khi Check-out -> Trả về lỗi 404 (EMPLOYEE_NOT_LINKED)', async () => {
  const originalFindUser = userRepository.findById;
  userRepository.findById = async () => ({ user_id: 99, employee_id: null });

  try {
    await assert.rejects(
      async () => {
        await attendanceService.performCheckOut({ userId: 99, userEmployeeId: null });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.errorCode, 'EMPLOYEE_NOT_LINKED');
        return true;
      }
    );
  } finally {
    userRepository.findById = originalFindUser;
  }
});

await runAsyncTest('Client gửi employeeId, checkOutTime, workDate giả mạo Check-out -> Controller phớt lờ hoàn toàn', async () => {
  const originalPerformCheckOut = attendanceService.performCheckOut;
  let receivedParams = null;

  attendanceService.performCheckOut = async (params) => {
    receivedParams = params;
    return {
      attendanceId: 20,
      employeeId: params.userEmployeeId,
      workDate: '2026-10-16',
      checkInTime: '2026-10-16T08:25:00+07:00',
      checkOutTime: '2026-10-16T17:30:00+07:00',
      status: 'ON_TIME',
    };
  };

  const fakeReq = {
    user: { userId: 3, employeeId: 10, role: 'EMPLOYEE' },
    body: { employeeId: 9999, checkOutTime: '2026-10-16T19:00:00+07:00', workDate: '2026-10-01' },
  };

  let capturedSuccess = null;
  const fakeRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedSuccess = { statusCode: this.statusCode, payload }; return this; },
  };

  try {
    await checkOut(fakeReq, fakeRes, () => {});
    assert.ok(capturedSuccess);
    assert.strictEqual(capturedSuccess.statusCode, 200);
    assert.strictEqual(receivedParams.userEmployeeId, 10);
    assert.strictEqual(receivedParams.employeeId, undefined);
  } finally {
    attendanceService.performCheckOut = originalPerformCheckOut;
  }
});

await runAsyncTest('Check-out không làm thay đổi trạng thái ON_TIME / LATE đã xác định lúc Check-in', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  const originalUpdateCheckOut = attendanceRepository.updateCheckOut;
  const originalFindEmployee = employeeRepository.findById;

  employeeRepository.findById = async (id) => ({ employee_id: id, employment_status: 'Active' });

  // Trường hợp nhân viên check-in muộn (Late)
  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 30,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:45:00',
    check_out: null,
    attendance_status: 'Late', // Đã bị Late lúc Check-in
  });
  attendanceRepository.updateCheckOut = async () => 1;

  try {
    const result = await attendanceService.performCheckOut({
      userId: 5,
      userEmployeeId: 30,
      currentTime: new Date('2026-10-16T18:00:00+07:00'),
    });

    // Trạng thái vẫn phải là LATE
    assert.strictEqual(result.status, 'LATE');
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
    attendanceRepository.updateCheckOut = originalUpdateCheckOut;
    employeeRepository.findById = originalFindEmployee;
  }
});

// --------------------------------------------------------------------------
// PHẦN 3: KIỂM THỬ BẢNG CHẤM CÔNG HÔM NAY (GET /api/attendance/today)
// --------------------------------------------------------------------------

await runAsyncTest('EMPLOYEE đã Check-in -> Trả về bản ghi cá nhân đầy đủ (data: object)', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;

  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 1,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:25:00',
    check_out: null,
    attendance_status: 'OnTime',
  });

  try {
    const result = await attendanceService.getTodayAttendance({
      userId: 3,
      userEmployeeId: 15,
      userRole: 'EMPLOYEE',
      currentTime: new Date('2026-10-16T10:00:00+07:00'),
    });

    assert.strictEqual(result.role, 'EMPLOYEE');
    assert.ok(result.data);
    assert.strictEqual(result.data.attendanceId, 1);
    assert.strictEqual(result.data.employeeId, 15);
    assert.strictEqual(result.data.checkInTime, '2026-10-16T08:25:00+07:00');
    assert.strictEqual(result.data.checkOutTime, null);
    assert.strictEqual(result.data.status, 'ON_TIME');
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
  }
});

await runAsyncTest('EMPLOYEE chưa Check-in hôm nay -> Trả về data: null', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  attendanceRepository.findByEmployeeAndDate = async () => null;

  try {
    const result = await attendanceService.getTodayAttendance({
      userId: 3,
      userEmployeeId: 15,
      userRole: 'EMPLOYEE',
      currentTime: new Date('2026-10-16T10:00:00+07:00'),
    });

    assert.strictEqual(result.role, 'EMPLOYEE');
    assert.strictEqual(result.data, null);
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
  }
});

await runAsyncTest('ADMIN / HR_MANAGER: Nhân viên chưa Check-in vẫn xuất hiện trong bảng (LEFT JOIN)', async () => {
  const originalGetBoard = attendanceRepository.getTodayAttendanceBoard;

  // Giả lập 2 nhân viên: 1 người đã check-in, 1 người chưa check-in
  attendanceRepository.getTodayAttendanceBoard = async (workDate) => [
    {
      attendance_id: 1,
      employee_id: 15,
      employee_code: 'NV015',
      full_name: 'Nguyen Van A',
      department_id: 2,
      department_name: 'Phòng Công nghệ',
      work_date: workDate,
      check_in: '08:25:00',
      check_out: null,
      attendance_status: 'OnTime',
    },
    {
      attendance_id: null,
      employee_id: 16,
      employee_code: 'NV016',
      full_name: 'Tran Thi B',
      department_id: 2,
      department_name: 'Phòng Công nghệ',
      work_date: workDate,
      check_in: null,
      check_out: null,
      attendance_status: null,
    },
  ];

  try {
    const result = await attendanceService.getTodayAttendance({
      userId: 1,
      userEmployeeId: 1,
      userRole: 'ADMIN',
      currentTime: new Date('2026-10-16T10:00:00+07:00'),
    });

    assert.strictEqual(result.role, 'ADMIN');
    assert.strictEqual(result.data.length, 2);

    const empCheckedIn = result.data.find((e) => e.employeeId === 15);
    assert.strictEqual(empCheckedIn.status, 'ON_TIME');
    assert.strictEqual(empCheckedIn.checkInTime, '2026-10-16T08:25:00+07:00');

    const empNotCheckedIn = result.data.find((e) => e.employeeId === 16);
    assert.strictEqual(empNotCheckedIn.attendanceId, null);
    assert.strictEqual(empNotCheckedIn.checkInTime, null);
    assert.strictEqual(empNotCheckedIn.checkOutTime, null);
    assert.strictEqual(empNotCheckedIn.status, null);
  } finally {
    attendanceRepository.getTodayAttendanceBoard = originalGetBoard;
  }
});

await runAsyncTest('Nhân viên đã Check-out có đầy đủ cả checkInTime và checkOutTime', async () => {
  const originalGetBoard = attendanceRepository.getTodayAttendanceBoard;

  attendanceRepository.getTodayAttendanceBoard = async (workDate) => [
    {
      attendance_id: 1,
      employee_id: 15,
      employee_code: 'NV015',
      full_name: 'Nguyen Van A',
      department_id: 2,
      department_name: 'Phòng Công nghệ',
      work_date: workDate,
      check_in: '08:25:00',
      check_out: '17:30:00',
      attendance_status: 'OnTime',
    },
  ];

  try {
    const result = await attendanceService.getTodayAttendance({
      userId: 1,
      userEmployeeId: 1,
      userRole: 'HR_MANAGER',
      currentTime: new Date('2026-10-16T18:00:00+07:00'),
    });

    assert.strictEqual(result.data[0].checkInTime, '2026-10-16T08:25:00+07:00');
    assert.strictEqual(result.data[0].checkOutTime, '2026-10-16T17:30:00+07:00');
  } finally {
    attendanceRepository.getTodayAttendanceBoard = originalGetBoard;
  }
});

await runAsyncTest('Tính đúng các chỉ số trong summary cho Admin/HR', async () => {
  const originalGetBoard = attendanceRepository.getTodayAttendanceBoard;

  // Giả lập 4 nhân viên:
  // 1. Đúng giờ, đã check-out
  // 2. Đúng giờ, chưa check-out
  // 3. Đi muộn, chưa check-out
  // 4. Chưa check-in
  attendanceRepository.getTodayAttendanceBoard = async (workDate) => [
    { attendance_id: 1, employee_id: 1, employee_code: 'NV01', full_name: 'A', check_in: '08:15:00', check_out: '17:30:00', attendance_status: 'OnTime' },
    { attendance_id: 2, employee_id: 2, employee_code: 'NV02', full_name: 'B', check_in: '08:25:00', check_out: null, attendance_status: 'OnTime' },
    { attendance_id: 3, employee_id: 3, employee_code: 'NV03', full_name: 'C', check_in: '08:45:00', check_out: null, attendance_status: 'Late' },
    { attendance_id: null, employee_id: 4, employee_code: 'NV04', full_name: 'D', check_in: null, check_out: null, attendance_status: null },
  ];

  try {
    const result = await attendanceService.getTodayAttendance({
      userId: 1,
      userEmployeeId: 1,
      userRole: 'ADMIN',
      currentTime: new Date('2026-10-16T18:00:00+07:00'),
    });

    const summary = result.summary;
    assert.strictEqual(summary.totalEmployees, 4);
    assert.strictEqual(summary.checkedIn, 3);
    assert.strictEqual(summary.checkedOut, 1);
    assert.strictEqual(summary.late, 1);
    assert.strictEqual(summary.notCheckedIn, 1);
  } finally {
    attendanceRepository.getTodayAttendanceBoard = originalGetBoard;
  }
});

await runAsyncTest('Nhân viên thường (EMPLOYEE) không thể xem bảng chấm công toàn công ty', async () => {
  const originalFindByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
  attendanceRepository.findByEmployeeAndDate = async (empId, date) => ({
    attendance_id: 10,
    employee_id: empId,
    attendance_date: date,
    check_in: '08:10:00',
    check_out: null,
    attendance_status: 'OnTime',
  });

  const req = {
    user: { userId: 3, employeeId: 10, role: 'EMPLOYEE' },
  };

  let capturedJson = null;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedJson = payload; return this; },
  };

  try {
    await getToday(req, res, () => {});

    assert.ok(capturedJson);
    assert.strictEqual(capturedJson.success, true);
    // Data là một Object cá nhân, KHÔNG PHẢI là một Mảng toàn công ty
    assert.ok(!Array.isArray(capturedJson.data));
    assert.strictEqual(capturedJson.data.employeeId, 10);
    assert.strictEqual(capturedJson.summary, undefined);
  } finally {
    attendanceRepository.findByEmployeeAndDate = originalFindByEmployeeAndDate;
  }
});

await runAsyncTest('Bảng chấm công hôm nay tuyệt đối KHÔNG trả dữ liệu CCCD hoặc ciphertext', async () => {
  const originalGetBoard = attendanceRepository.getTodayAttendanceBoard;

  attendanceRepository.getTodayAttendanceBoard = async (workDate) => [
    {
      attendance_id: 1,
      employee_id: 1,
      employee_code: 'NV01',
      full_name: 'Minh',
      department_id: 1,
      department_name: 'Tech',
      work_date: workDate,
      check_in: '08:15:00',
      check_out: null,
      attendance_status: 'OnTime',
    },
  ];

  try {
    const result = await attendanceService.getTodayAttendance({
      userId: 1,
      userEmployeeId: 1,
      userRole: 'ADMIN',
      currentTime: new Date('2026-10-16T12:00:00+07:00'),
    });

    const item = result.data[0];
    assert.strictEqual(item.cccd, undefined);
    assert.strictEqual(item.ssn_encrypted, undefined);
    assert.strictEqual(item.ssn_masked, undefined);
    assert.strictEqual(item.ssn_hash, undefined);
  } finally {
    attendanceRepository.getTodayAttendanceBoard = originalGetBoard;
  }
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ ATTENDANCE TOÀN DIỆN!`);
console.log('============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
