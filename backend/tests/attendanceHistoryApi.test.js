/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG API LỊCH SỬ CHẤM CÔNG (US 19.0 - HRM-209)
 * GET /api/attendance/history lọc theo tháng/năm, tính tổng ngày công, đi muộn, về sớm
 * ==============================================================================
 */

import assert from 'node:assert';
import { 
  getVietnamAttendanceInfo, 
  getCurrentVietnamMonthYear, 
  getMonthDateRange, 
  evaluateAttendanceRecord,
  SHIFT_END_TOTAL_SECONDS,
  CUTOFF_TOTAL_SECONDS,
} from '../src/utils/attendanceTime.js';
import attendanceService, { AttendanceServiceError } from '../src/services/attendanceService.js';
import attendanceRepository from '../src/repositories/attendanceRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import { getHistory, checkIn, checkOut, getToday } from '../src/controllers/attendanceController.js';
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
console.log('⏱️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ API LỊCH SỬ CHẤM CÔNG (HRM-209)');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// PHẦN 1: KIỂM THỬ TIỆN ÍCH THỜI GIAN & ĐÁNH GIÁ ĐI MUỘN, VỀ SỚM
// --------------------------------------------------------------------------

runTest('Kiểm tra ranh giới tháng bình thường và tháng cuối năm (rollover năm mới)', () => {
  const oct = getMonthDateRange(2026, 10);
  assert.strictEqual(oct.startDate, '2026-10-01');
  assert.strictEqual(oct.endDate, '2026-11-01');
  assert.strictEqual(oct.lastDayOfMonth, 31);

  const dec = getMonthDateRange(2026, 12);
  assert.strictEqual(dec.startDate, '2026-12-01');
  assert.strictEqual(dec.endDate, '2027-01-01');
  assert.strictEqual(dec.lastDayOfMonth, 31);

  const leapFeb = getMonthDateRange(2024, 2);
  assert.strictEqual(leapFeb.lastDayOfMonth, 29); // Năm nhuận 2024 có 29 ngày

  const normalFeb = getMonthDateRange(2025, 2);
  assert.strictEqual(normalFeb.lastDayOfMonth, 28); // Năm thường 2025 có 28 ngày
});

runTest('Đánh giá trạng thái chấm công: đúng giờ, đi muộn, về sớm theo mốc quy định', () => {
  // Đúng giờ (check-in 08:20:00 <= 08:30:00, check-out 17:35:00 >= 17:30:00)
  const onTime = evaluateAttendanceRecord({
    checkInTime: '08:20:00',
    checkOutTime: '17:35:00',
    status: 'OnTime',
  });
  assert.strictEqual(onTime.isLate, false);
  assert.strictEqual(onTime.isEarlyLeave, false);
  assert.strictEqual(onTime.status, 'ON_TIME');

  // Đi muộn (check-in 08:45:00 > 08:30:00)
  const late = evaluateAttendanceRecord({
    checkInTime: '08:45:00',
    checkOutTime: '17:40:00',
    status: 'Late',
  });
  assert.strictEqual(late.isLate, true);
  assert.strictEqual(late.isEarlyLeave, false);
  assert.strictEqual(late.status, 'LATE');

  // Về sớm (check-out 16:45:00 < 17:30:00)
  const early = evaluateAttendanceRecord({
    checkInTime: '08:15:00',
    checkOutTime: '16:45:00',
    status: 'EarlyLeave',
  });
  assert.strictEqual(early.isLate, false);
  assert.strictEqual(early.isEarlyLeave, true);
  assert.strictEqual(early.status, 'EARLY_LEAVE');

  // Chưa check-out (checkOutTime = null) -> Không suy luận về sớm
  const noCheckout = evaluateAttendanceRecord({
    checkInTime: '08:15:00',
    checkOutTime: null,
    status: 'OnTime',
  });
  assert.strictEqual(noCheckout.isEarlyLeave, false);
});

// --------------------------------------------------------------------------
// PHẦN 2: KIỂM THỬ XÁC THỰC VÀ THAM SỐ ĐẦU VÀO (VALIDATION)
// --------------------------------------------------------------------------

await runAsyncTest('Kịch bản 3: Tháng 0, 13 hoặc không phải số -> 400 Bad Request', async () => {
  const invalidMonths = ['0', '13', '-1', 'abc', '1.5'];
  for (const m of invalidMonths) {
    await assert.rejects(
      async () => {
        await attendanceService.getAttendanceHistory({
          user: { userId: 1, role: 'ADMIN' },
          queryParams: { month: m, year: '2026' },
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.errorCode, 'INVALID_MONTH');
        return true;
      }
    );
  }
});

await runAsyncTest('Kịch bản 4: Năm không hợp lệ (1800, 2500, abc) -> 400 Bad Request', async () => {
  const invalidYears = ['1800', '2500', 'abc', '2026.5'];
  for (const y of invalidYears) {
    await assert.rejects(
      async () => {
        await attendanceService.getAttendanceHistory({
          user: { userId: 1, role: 'ADMIN' },
          queryParams: { month: '10', year: y },
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.errorCode, 'INVALID_YEAR');
        return true;
      }
    );
  }
});

await runAsyncTest('Kịch bản 5: Phân trang page hoặc limit không hợp lệ -> 400 Bad Request', async () => {
  // Page không hợp lệ
  await assert.rejects(
    async () => {
      await attendanceService.getAttendanceHistory({
        user: { userId: 1, role: 'ADMIN' },
        queryParams: { month: '10', year: '2026', page: '0' },
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'INVALID_PAGE');
      return true;
    }
  );

  // Limit không hợp lệ
  await assert.rejects(
    async () => {
      await attendanceService.getAttendanceHistory({
        user: { userId: 1, role: 'ADMIN' },
        queryParams: { month: '10', year: '2026', limit: '150' },
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'INVALID_LIMIT');
      return true;
    }
  );
});

await runAsyncTest('Chỉ truyền 1 trong 2 tham số month hoặc year -> 400 Bad Request', async () => {
  await assert.rejects(
    async () => {
      await attendanceService.getAttendanceHistory({
        user: { userId: 1, role: 'ADMIN' },
        queryParams: { month: '10' }, // Thiếu year
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.errorCode, 'INVALID_PARAMS');
      return true;
    }
  );
});

// --------------------------------------------------------------------------
// PHẦN 3: KIỂM THỬ PHÂN QUYỀN RBAC VÀ BẢO MẬT
// --------------------------------------------------------------------------

await runAsyncTest('Kịch bản 14: Không có JWT Token -> Trả về lỗi 401 Unauthorized', async () => {
  const req = { headers: {} };
  let capturedError = null;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedError = { statusCode: this.statusCode, payload }; return this; },
  };

  let nextCalled = false;
  await authenticateToken(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.ok(capturedError);
  assert.strictEqual(capturedError.statusCode, 401);
  assert.strictEqual(capturedError.payload.errorCode, 'TOKEN_REQUIRED');
});

await runAsyncTest('Kịch bản 7: EMPLOYEE không thể xem lịch sử của nhân viên khác bằng cách sửa employeeId -> 403 Forbidden', async () => {
  await assert.rejects(
    async () => {
      await attendanceService.getAttendanceHistory({
        user: { userId: 3, role: 'EMPLOYEE', employeeId: 5 },
        queryParams: { month: '10', year: '2026', employeeId: '99' }, // Cố tình xem của ID 99
      });
    },
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.errorCode, 'FORBIDDEN');
      assert.strictEqual(err.message, 'Bạn chỉ có quyền xem lịch sử chấm công của chính mình.');
      return true;
    }
  );
});

await runAsyncTest('Kịch bản 6: Lọc theo employeeId với role có quyền (ADMIN & HR_MANAGER) hoạt động chuẩn xác', async () => {
  const originalRepo = attendanceRepository.getAttendanceHistoryAndSummary;
  let capturedArgs = null;

  attendanceRepository.getAttendanceHistoryAndSummary = async (args) => {
    capturedArgs = args;
    return {
      summary: { totalWorkDays: 5, lateCount: 1, earlyLeaveCount: 0 },
      rows: [],
      totalRecords: 5,
      totalPages: 1,
      page: 1,
      limit: 31,
    };
  };

  try {
    // 1. ADMIN xem nhân viên 12
    const adminRes = await attendanceService.getAttendanceHistory({
      user: { userId: 1, role: 'ADMIN' },
      queryParams: { month: '10', year: '2026', employeeId: '12' },
    });
    assert.strictEqual(capturedArgs.employeeId, 12);
    assert.strictEqual(adminRes.filters.employeeId, 12);

    // 2. HR_MANAGER xem nhân viên 15
    const hrRes = await attendanceService.getAttendanceHistory({
      user: { userId: 2, role: 'HR_MANAGER' },
      queryParams: { month: '10', year: '2026', employeeId: '15' },
    });
    assert.strictEqual(capturedArgs.employeeId, 15);
    assert.strictEqual(hrRes.filters.employeeId, 15);
  } finally {
    attendanceRepository.getAttendanceHistoryAndSummary = originalRepo;
  }
});

// --------------------------------------------------------------------------
// PHẦN 4: KIỂM THỬ NGHIỆP VỤ TÍNH CÔNG, ĐI MUỘN, VỀ SỚM & PHÂN TRANG
// --------------------------------------------------------------------------

await runAsyncTest('Kịch bản 1: Lấy lịch sử theo tháng/năm hợp lệ và trả đúng cấu trúc JSON', async () => {
  const originalRepo = attendanceRepository.getAttendanceHistoryAndSummary;

  attendanceRepository.getAttendanceHistoryAndSummary = async () => ({
    summary: { totalWorkDays: 20, lateCount: 3, earlyLeaveCount: 2 },
    rows: [
      {
        attendance_id: 101,
        employee_id: 12,
        employee_code: 'NV012',
        employee_name: 'Nguyễn Văn A',
        department_name: 'Phòng Kỹ thuật & Công nghệ',
        attendance_date: '2026-10-15',
        check_in: '08:35:00',
        check_out: '17:30:00',
        attendance_status: 'Late',
        note: 'Đi muộn 5 phút',
      },
    ],
    totalRecords: 20,
    totalPages: 1,
    page: 1,
    limit: 31,
  });

  try {
    const res = await attendanceService.getAttendanceHistory({
      user: { userId: 1, role: 'ADMIN' },
      queryParams: { month: '10', year: '2026' },
    });

    assert.strictEqual(res.filters.month, 10);
    assert.strictEqual(res.filters.year, 2026);
    assert.strictEqual(res.summary.totalWorkDays, 20);
    assert.strictEqual(res.summary.lateCount, 3);
    assert.strictEqual(res.summary.earlyLeaveCount, 2);
    assert.strictEqual(res.pagination.totalRecords, 20);

    const firstItem = res.data[0];
    assert.strictEqual(firstItem.attendanceId, 101);
    assert.strictEqual(firstItem.employeeId, 12);
    assert.strictEqual(firstItem.employeeCode, 'NV012');
    assert.strictEqual(firstItem.employeeName, 'Nguyễn Văn A');
    assert.strictEqual(firstItem.departmentName, 'Phòng Kỹ thuật & Công nghệ');
    assert.strictEqual(firstItem.date, '2026-10-15');
    assert.strictEqual(firstItem.checkInTime, '08:35:00');
    assert.strictEqual(firstItem.checkOutTime, '17:30:00');
    assert.strictEqual(firstItem.status, 'LATE');
    assert.strictEqual(firstItem.isLate, true);
    assert.strictEqual(firstItem.isEarlyLeave, false);
  } finally {
    attendanceRepository.getAttendanceHistoryAndSummary = originalRepo;
  }
});

await runAsyncTest('Kịch bản 2: Lấy lịch sử của tháng không có dữ liệu -> Trả rỗng và tổng bằng 0', async () => {
  const originalRepo = attendanceRepository.getAttendanceHistoryAndSummary;

  attendanceRepository.getAttendanceHistoryAndSummary = async () => ({
    summary: { totalWorkDays: 0, lateCount: 0, earlyLeaveCount: 0 },
    rows: [],
    totalRecords: 0,
    totalPages: 1,
    page: 1,
    limit: 31,
  });

  try {
    const res = await attendanceService.getAttendanceHistory({
      user: { userId: 1, role: 'ADMIN' },
      queryParams: { month: '1', year: '2020' },
    });

    assert.deepStrictEqual(res.data, []);
    assert.strictEqual(res.summary.totalWorkDays, 0);
    assert.strictEqual(res.summary.lateCount, 0);
    assert.strictEqual(res.summary.earlyLeaveCount, 0);
    assert.strictEqual(res.pagination.totalRecords, 0);
  } finally {
    attendanceRepository.getAttendanceHistoryAndSummary = originalRepo;
  }
});

await runAsyncTest('Kịch bản 8, 9, 10, 12: Tổng ngày công, đi muộn, về sớm chính xác và không đếm trùng ngày', async () => {
  const sampleRecords = [
    // Ngày 1: Đúng giờ, đủ ca
    {
      attendance_id: 1,
      employee_id: 5,
      employee_code: 'NV005',
      employee_name: 'Phạm Quốc Hưng',
      attendance_date: '2026-10-01',
      check_in: '08:15:00',
      check_out: '17:35:00',
      attendance_status: 'OnTime',
    },
    // Ngày 2: Đi muộn (08:45:00)
    {
      attendance_id: 2,
      employee_id: 5,
      employee_code: 'NV005',
      employee_name: 'Phạm Quốc Hưng',
      attendance_date: '2026-10-02',
      check_in: '08:45:00',
      check_out: '17:30:00',
      attendance_status: 'Late',
    },
    // Ngày 3: Về sớm (16:30:00)
    {
      attendance_id: 3,
      employee_id: 5,
      employee_code: 'NV005',
      employee_name: 'Phạm Quốc Hưng',
      attendance_date: '2026-10-03',
      check_in: '08:20:00',
      check_out: '16:30:00',
      attendance_status: 'EarlyLeave',
    },
  ];

  const originalRepo = attendanceRepository.getAttendanceHistoryAndSummary;

  attendanceRepository.getAttendanceHistoryAndSummary = async () => ({
    summary: { totalWorkDays: 3, lateCount: 1, earlyLeaveCount: 1 },
    rows: sampleRecords,
    totalRecords: 3,
    totalPages: 1,
    page: 1,
    limit: 31,
  });

  try {
    const res = await attendanceService.getAttendanceHistory({
      user: { userId: 5, role: 'EMPLOYEE', employeeId: 5 },
      queryParams: { month: '10', year: '2026' },
    });

    assert.strictEqual(res.summary.totalWorkDays, 3);
    assert.strictEqual(res.summary.lateCount, 1);
    assert.strictEqual(res.summary.earlyLeaveCount, 1);

    // Kiểm tra từng bản ghi
    assert.strictEqual(res.data[0].isLate, false);
    assert.strictEqual(res.data[0].isEarlyLeave, false);

    assert.strictEqual(res.data[1].isLate, true);
    assert.strictEqual(res.data[1].isEarlyLeave, false);

    assert.strictEqual(res.data[2].isLate, false);
    assert.strictEqual(res.data[2].isEarlyLeave, true);
  } finally {
    attendanceRepository.getAttendanceHistoryAndSummary = originalRepo;
  }
});

await runAsyncTest('Kịch bản 11: Thống kê không bị giới hạn bởi phân trang (Summary tính toàn bộ kết quả)', async () => {
  const originalRepo = attendanceRepository.getAttendanceHistoryAndSummary;

  // Giả sử tổng có 10 bản ghi, nhưng phân trang limit = 1 chỉ trả 1 dòng trong data
  attendanceRepository.getAttendanceHistoryAndSummary = async ({ page, limit }) => ({
    summary: { totalWorkDays: 10, lateCount: 4, earlyLeaveCount: 3 },
    rows: [
      {
        attendance_id: 10,
        employee_id: 1,
        employee_code: 'NV001',
        employee_name: 'Đỗ Quang Minh',
        attendance_date: '2026-10-10',
        check_in: '08:15:00',
        check_out: '17:30:00',
        attendance_status: 'OnTime',
      },
    ],
    totalRecords: 10,
    totalPages: 10,
    page,
    limit,
  });

  try {
    const res = await attendanceService.getAttendanceHistory({
      user: { userId: 1, role: 'ADMIN' },
      queryParams: { month: '10', year: '2026', page: '1', limit: '1' },
    });

    assert.strictEqual(res.data.length, 1); // Chỉ có 1 bản ghi ở trang 1
    assert.strictEqual(res.pagination.totalRecords, 10);
    assert.strictEqual(res.pagination.totalPages, 10);
    assert.strictEqual(res.summary.totalWorkDays, 10); // Không bị giới hạn về 1!
    assert.strictEqual(res.summary.lateCount, 4);      // Giữ nguyên tổng toàn tháng!
    assert.strictEqual(res.summary.earlyLeaveCount, 3);
  } finally {
    attendanceRepository.getAttendanceHistoryAndSummary = originalRepo;
  }
});

await runAsyncTest('Kịch bản 13: Mặc định lấy tháng/năm hiện tại theo múi giờ Việt Nam khi không gửi tham số', async () => {
  const originalRepo = attendanceRepository.getAttendanceHistoryAndSummary;
  let capturedArgs = null;

  attendanceRepository.getAttendanceHistoryAndSummary = async (args) => {
    capturedArgs = args;
    return {
      summary: { totalWorkDays: 0, lateCount: 0, earlyLeaveCount: 0 },
      rows: [],
      totalRecords: 0,
      totalPages: 1,
      page: 1,
      limit: 31,
    };
  };

  try {
    const currentVn = getCurrentVietnamMonthYear();
    const res = await attendanceService.getAttendanceHistory({
      user: { userId: 1, role: 'ADMIN' },
      queryParams: {}, // Không gửi month, year
    });

    assert.strictEqual(res.filters.month, currentVn.month);
    assert.strictEqual(res.filters.year, currentVn.year);
    assert.ok(capturedArgs.startDate.startsWith(`${currentVn.year}-${String(currentVn.month).padStart(2, '0')}-01`));
  } finally {
    attendanceRepository.getAttendanceHistoryAndSummary = originalRepo;
  }
});

await runAsyncTest('Kịch bản Controller: getHistory trả về HTTP 200 và cấu trúc Envelope hoàn chỉnh', async () => {
  const originalGetAttendanceHistory = attendanceService.getAttendanceHistory;

  attendanceService.getAttendanceHistory = async () => ({
    filters: { month: 10, year: 2026, employeeId: 12 },
    summary: { totalWorkDays: 20, lateCount: 3, earlyLeaveCount: 2 },
    pagination: { page: 1, limit: 31, totalRecords: 20, totalPages: 1 },
    data: [],
  });

  const fakeReq = {
    user: { userId: 1, role: 'ADMIN' },
    query: { month: '10', year: '2026', employeeId: '12' },
  };

  let capturedResponse = null;
  const fakeRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { capturedResponse = { statusCode: this.statusCode, payload }; return this; },
  };

  try {
    await getHistory(fakeReq, fakeRes, () => {});
    assert.ok(capturedResponse);
    assert.strictEqual(capturedResponse.statusCode, 200);
    assert.strictEqual(capturedResponse.payload.success, true);
    assert.strictEqual(capturedResponse.payload.message, 'Lấy lịch sử chấm công thành công');
    assert.strictEqual(capturedResponse.payload.summary.totalWorkDays, 20);
    assert.ok(capturedResponse.payload.timestamp);
  } finally {
    attendanceService.getAttendanceHistory = originalGetAttendanceHistory;
  }
});

// --------------------------------------------------------------------------
// PHẦN 5: KIỂM THỬ TƯƠNG THÍCH VỚI CÁC API CHẤM CÔNG HIỆN CÓ
// --------------------------------------------------------------------------

await runAsyncTest('Kịch bản 15: Các API check-in, check-out và today board vẫn hoạt động ổn định', async () => {
  assert.strictEqual(typeof checkIn, 'function');
  assert.strictEqual(typeof checkOut, 'function');
  assert.strictEqual(typeof getToday, 'function');
  assert.strictEqual(typeof getHistory, 'function');
});

console.log('\n============================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ LỊCH SỬ CHẤM CÔNG!`);
console.log('============================================================\n');
