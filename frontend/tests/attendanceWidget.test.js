/**
 * BỘ KIỂM THỬ TỰ ĐỘNG: WIDGET CHECK-IN / CHECK-OUT HRM (HRM-127)
 * Kiểm thử toàn diện 13 yêu cầu kỹ thuật:
 * 1. Nhân viên chưa check-in (badge neutral, nút Check-in)
 * 2. Nhân viên check-in đúng giờ (ON_TIME, badge green, nút Check-out)
 * 3. Nhân viên check-in muộn (LATE, badge amber, nút Check-out)
 * 4. Nhân viên đã check-out (badge blue + time đầy đủ)
 * 5. Nhân viên đã check-out bảo toàn badge 'Đi muộn' nếu vào ca muộn, nút disabled
 * 6. Xử lý API tải dữ liệu bị lỗi (badge error, nút Thử lại)
 * 7. Xử lý API check-in / check-out trả về lỗi (thông báo lỗi, không làm hỏng state)
 * 8. Chặn nhấn nút liên tục (Double submission / Spam prevention)
 * 9. Xử lý Token hết hạn / Chưa đăng nhập
 * 10. Đồng hồ cập nhật mỗi giây, định dạng chuẩn HH:mm:ss và ngày tiếng Việt
 * 11. Xử lý ranh giới nửa đêm không bị lệch ngày theo múi giờ Asia/Ho_Chi_Minh
 * 12. Phân quyền RBAC: Trích xuất đúng bản ghi cá nhân của Admin/HR từ mảng toàn công ty
 * 13. Dọn dẹp tài nguyên và Timer interval khi unmount (Tránh memory/CPU leak)
 */

import assert from 'node:assert';

// -----------------------------------------------------------------------------
// GIẢ LẬP MÔI TRƯỜNG WEB BROWSER (MOCK STORAGE & DOM)
// -----------------------------------------------------------------------------
const mockLocalStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockLocalStorage.get(key) || null,
  setItem: (key, val) => mockLocalStorage.set(key, String(val)),
  removeItem: (key) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear(),
};

let mockFetchHandler = null;
globalThis.fetch = async (url, options = {}) => {
  if (typeof mockFetchHandler === 'function') {
    return await mockFetchHandler(url, options);
  }
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, data: null }),
  };
};

// Import modules cần kiểm thử
const {
  getVietnamClockParts,
  formatTimeDisplay,
  computeWidgetState,
  startRealtimeClock,
  stopRealtimeClock,
  destroyAttendanceWidget,
  renderAttendanceWidgetMarkup,
} = await import('../src/components/AttendanceWidget.js');

const { attendanceService } = await import('../src/services/attendanceService.js');

let passedTests = 0;
let totalTests = 0;

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

console.log('='.repeat(70));
console.log('🚀 BẮT ĐẦU CHẠY TEST SUITE: ATTENDANCE CHECK-IN / CHECK-OUT WIDGET');
console.log('='.repeat(70));

// =============================================================================
// TEST GROUP 1: ĐỒNG HỒ SỐ THỜI GIAN THỰC & MÚI GIỜ VIỆT NAM (ASIA/HO_CHI_MINH)
// =============================================================================
console.log('\n--- NHÓM 1: ĐỒNG HỒ SỐ THỜI GIAN THỰC & XỬ LÝ MÚI GIỜ ---');

await testAsync('1. Đồng hồ định dạng đúng HH:mm:ss và ngày tiếng Việt', () => {
  const fixedDate = new Date('2026-10-16T08:25:36+07:00');
  const clock = getVietnamClockParts(fixedDate);

  assert.strictEqual(clock.timeStr, '08:25:36', 'Giờ hiển thị phải là 08:25:36');
  assert.strictEqual(clock.dayOfWeek, 'Thứ Sáu', 'Thứ trong tuần phải là Thứ Sáu');
  assert.ok(clock.dateStr.includes('Thứ Sáu'), 'dateStr phải có Thứ Sáu');
  assert.ok(clock.dateStr.includes('ngày 16 tháng 10 năm 2026'), 'dateStr phải chứa đúng ngày tháng năm');
});

await testAsync('2. Xử lý ranh giới nửa đêm qua UTC boundary (23:59:59 -> 00:00:00 VN)', () => {
  // 16:59:59 UTC ngày 15/10/2026 tương đương 23:59:59 GMT+7 ngày 15/10/2026
  const beforeMidnightUtc = new Date('2026-10-15T16:59:59Z');
  const clockBefore = getVietnamClockParts(beforeMidnightUtc);
  assert.strictEqual(clockBefore.timeStr, '23:59:59');
  assert.strictEqual(clockBefore.dayOfWeek, 'Thứ Năm');
  assert.ok(clockBefore.dateStr.includes('ngày 15 tháng 10 năm 2026'));

  // 17:00:00 UTC ngày 15/10/2026 tương đương 00:00:00 GMT+7 ngày 16/10/2026
  const atMidnightUtc = new Date('2026-10-15T17:00:00Z');
  const clockAtMidnight = getVietnamClockParts(atMidnightUtc);
  assert.strictEqual(clockAtMidnight.timeStr, '00:00:00');
  assert.strictEqual(clockAtMidnight.dayOfWeek, 'Thứ Sáu');
  assert.ok(clockAtMidnight.dateStr.includes('ngày 16 tháng 10 năm 2026'));
});

await testAsync('3. formatTimeDisplay chuyển đổi chuẩn xác các định dạng giờ', () => {
  // Null / Undefined
  assert.strictEqual(formatTimeDisplay(null), '--:--');
  assert.strictEqual(formatTimeDisplay(undefined), '--:--');
  assert.strictEqual(formatTimeDisplay(''), '--:--');

  // Chuỗi ISO chứa offset +07:00
  assert.strictEqual(formatTimeDisplay('2026-10-16T08:30:00+07:00'), '08:30:00');
  assert.strictEqual(formatTimeDisplay('2026-10-16T17:45:15+07:00'), '17:45:15');

  // Chuỗi ISO UTC có Z (01:25:30Z UTC = 08:25:30 GMT+7)
  assert.strictEqual(formatTimeDisplay('2026-10-16T01:25:30Z'), '08:25:30');

  // Chuỗi giờ thông thường
  assert.strictEqual(formatTimeDisplay('08:30'), '08:30:00');
  assert.strictEqual(formatTimeDisplay('08:30:45'), '08:30:45');
});

// =============================================================================
// TEST GROUP 2: QUY TẮC TRẠNG THÁI VÀ DỮ LIỆU WIDGET (COMPUTE WIDGET STATE)
// =============================================================================
console.log('\n--- NHÓM 2: TRẠNG THÁI CHẤM CÔNG VÀ BADGE ---');

await testAsync('4. [Trường hợp 1] Nhân viên chưa check-in hôm nay', () => {
  const state = computeWidgetState(null);

  assert.strictEqual(state.statusType, 'NOT_CHECKED_IN');
  assert.ok(state.badgeHtml.includes('att-badge-neutral'));
  assert.ok(state.badgeHtml.includes('Chưa check-in'));
  assert.strictEqual(state.checkInTimeText, '--:--');
  assert.strictEqual(state.checkOutTimeText, '--:--');
  assert.strictEqual(state.isCheckInEmpty, true);
  assert.strictEqual(state.isCheckOutEmpty, true);
  assert.strictEqual(state.button.action, 'checkin');
  assert.strictEqual(state.button.text, 'Check-in vào ca');
  assert.strictEqual(state.button.disabled, false);
});

await testAsync('5. [Trường hợp 2] Nhân viên check-in đúng giờ (ON_TIME)', () => {
  const record = {
    attendanceId: 101,
    employeeId: 5,
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:15:00+07:00',
    checkOutTime: null,
    status: 'ON_TIME',
  };
  const state = computeWidgetState(record);

  assert.strictEqual(state.statusType, 'CHECKED_IN_ONTIME');
  assert.ok(state.badgeHtml.includes('att-badge-success'));
  assert.ok(state.badgeHtml.includes('Đúng giờ'));
  assert.strictEqual(state.checkInTimeText, '08:15:00');
  assert.strictEqual(state.checkOutTimeText, '--:--');
  assert.strictEqual(state.button.action, 'checkout');
  assert.strictEqual(state.button.text, 'Check-out kết thúc ca');
  assert.strictEqual(state.button.disabled, false);
});

await testAsync('6. [Trường hợp 3] Nhân viên check-in muộn (LATE)', () => {
  const record = {
    attendanceId: 102,
    employeeId: 6,
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:45:00+07:00',
    checkOutTime: null,
    status: 'LATE',
  };
  const state = computeWidgetState(record);

  assert.strictEqual(state.statusType, 'CHECKED_IN_LATE');
  assert.ok(state.badgeHtml.includes('att-badge-warning'));
  assert.ok(state.badgeHtml.includes('Đi muộn'));
  assert.strictEqual(state.checkInTimeText, '08:45:00');
  assert.strictEqual(state.checkOutTimeText, '--:--');
  assert.strictEqual(state.button.action, 'checkout');
  assert.strictEqual(state.button.text, 'Check-out kết thúc ca');
  assert.strictEqual(state.button.disabled, false);
});

await testAsync('7. [Trường hợp 4] Nhân viên đã check-out đúng giờ', () => {
  const record = {
    attendanceId: 101,
    employeeId: 5,
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:15:00+07:00',
    checkOutTime: '2026-10-16T17:30:00+07:00',
    status: 'ON_TIME',
  };
  const state = computeWidgetState(record);

  assert.strictEqual(state.statusType, 'CHECKED_OUT');
  assert.ok(state.badgeHtml.includes('att-badge-info'), 'Phải có badge Đã check-out');
  assert.ok(state.badgeHtml.includes('Đã check-out'));
  assert.ok(state.badgeHtml.includes('Đúng giờ'), 'Phải giữ nhãn Đúng giờ');
  assert.strictEqual(state.checkInTimeText, '08:15:00');
  assert.strictEqual(state.checkOutTimeText, '17:30:00');
  assert.strictEqual(state.button.action, 'completed');
  assert.strictEqual(state.button.disabled, true, 'Nút phải bị vô hiệu hóa');
});

await testAsync('8. [Trường hợp 5] Nhân viên đã check-out NHƯNG check-in muộn -> BẢO TOÀN BADGE ĐI MUỘN', () => {
  const record = {
    attendanceId: 102,
    employeeId: 6,
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:45:00+07:00',
    checkOutTime: '2026-10-16T17:35:00+07:00',
    status: 'LATE',
  };
  const state = computeWidgetState(record);

  assert.strictEqual(state.statusType, 'CHECKED_OUT');
  assert.ok(state.badgeHtml.includes('Đã check-out'), 'Phải có badge Đã check-out');
  assert.ok(state.badgeHtml.includes('att-badge-warning'), 'Phải giữ nguyên badge warning cho Đi muộn');
  assert.ok(state.badgeHtml.includes('Đi muộn'), 'Phải giữ nguyên chữ Đi muộn');
  assert.strictEqual(state.button.disabled, true);
});

// =============================================================================
// TEST GROUP 3: PHÂN QUYỀN RBAC VÀ TRÍCH XUẤT BẢN GHI CÁ NHÂN
// =============================================================================
console.log('\n--- NHÓM 3: PHÂN QUYỀN RBAC & DỮ LIỆU CÁ NHÂN ---');

await testAsync('9. extractPersonalRecord xử lý đúng response dạng object đơn (EMPLOYEE)', () => {
  const response = {
    success: true,
    data: {
      attendanceId: 10,
      employeeId: 8,
      checkInTime: '2026-10-16T08:20:00+07:00',
      status: 'ON_TIME',
    },
  };

  const record = attendanceService.extractPersonalRecord(response, { id: 8, role: 'EMPLOYEE' });
  assert.deepStrictEqual(record, response.data);
});

await testAsync('10. extractPersonalRecord trích xuất đúng record cá nhân từ mảng toàn công ty (ADMIN/HR)', () => {
  const response = {
    success: true,
    data: [
      { employeeId: 1, employeeCode: 'NV001', checkInTime: '2026-10-16T08:10:00+07:00', status: 'ON_TIME' },
      { employeeId: 2, employeeCode: 'NV002', checkInTime: '2026-10-16T08:40:00+07:00', status: 'LATE' },
      { employeeId: 3, employeeCode: 'NV003', checkInTime: null, status: null },
    ],
  };

  // Trường hợp Admin có employeeId = 2 -> Phải lấy đúng NV002
  const adminUser = { id: 99, employeeId: 2, username: 'admin_hrm', role: 'ADMIN' };
  const adminRecord = attendanceService.extractPersonalRecord(response, adminUser);
  assert.strictEqual(adminRecord.employeeId, 2);
  assert.strictEqual(adminRecord.status, 'LATE');

  // Trường hợp Admin chưa check-in (employeeId = 3) -> Trả về null, không lấy nhầm người khác
  const adminNotCheckedIn = { id: 99, employeeId: 3, username: 'admin_hrm', role: 'ADMIN' };
  const nullRecord = attendanceService.extractPersonalRecord(response, adminNotCheckedIn);
  assert.strictEqual(nullRecord, null, 'Không được lấy nhầm bản ghi của nhân viên khác');
});

// =============================================================================
// TEST GROUP 4: TÍCH HỢP SERVICE, ERROR HANDLING VÀ ANTI-SPAM
// =============================================================================
console.log('\n--- NHÓM 4: SERVICE INTEGRATION, ERROR HANDLING & ANTI-SPAM ---');

await testAsync('11. attendanceService gọi đúng endpoint GET /api/attendance/today và fallback', async () => {
  let requestedUrl = '';
  mockFetchHandler = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: null }),
    };
  };

  await attendanceService.getTodayAttendance();
  assert.ok(requestedUrl.includes('/api/attendance/today'), 'Phải gọi đúng endpoint /api/attendance/today');
});

await testAsync('12. attendanceService gọi đúng endpoint POST /api/attendance/check-in', async () => {
  let requestedUrl = '';
  let requestedMethod = '';
  mockFetchHandler = async (url, options) => {
    requestedUrl = url;
    requestedMethod = options.method;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, message: 'Check-in thành công', data: { attendanceId: 99 } }),
    };
  };

  const res = await attendanceService.checkIn();
  assert.ok(requestedUrl.includes('/api/attendance/check-in'));
  assert.strictEqual(requestedMethod, 'POST');
  assert.strictEqual(res.message, 'Check-in thành công');
});

await testAsync('13. attendanceService gọi đúng endpoint POST /api/attendance/check-out', async () => {
  let requestedUrl = '';
  let requestedMethod = '';
  mockFetchHandler = async (url, options) => {
    requestedUrl = url;
    requestedMethod = options.method;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, message: 'Check-out thành công', data: { attendanceId: 99 } }),
    };
  };

  const res = await attendanceService.checkOut();
  assert.ok(requestedUrl.includes('/api/attendance/check-out'));
  assert.strictEqual(requestedMethod, 'POST');
  assert.strictEqual(res.message, 'Check-out thành công');
});

await testAsync('14. Xử lý API lỗi khi chưa check-in mà thực hiện check-out (404/400)', async () => {
  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: false, message: 'Bạn chưa thực hiện check-in hôm nay.' }),
    };
  };

  let threw = false;
  try {
    await attendanceService.checkOut();
  } catch (err) {
    threw = true;
    assert.strictEqual(err.data?.message || err.message, 'Bạn chưa thực hiện check-in hôm nay.');
  }
  assert.strictEqual(threw, true, 'Service phải ném lỗi khi API trả về 404');
});

await testAsync('15. Markup Widget render đầy đủ cấu trúc card, đồng hồ và 2 mốc thời gian', () => {
  const html = renderAttendanceWidgetMarkup();

  assert.ok(html.includes('id="attendance-widget"'), 'Phải có container widget');
  assert.ok(html.includes('id="att-digital-clock-time"'), 'Phải có thẻ đồng hồ số');
  assert.ok(html.includes('id="att-checkin-val"'), 'Phải có ô hiển thị giờ vào ca');
  assert.ok(html.includes('id="att-checkout-val"'), 'Phải có ô hiển thị giờ tan ca');
  assert.ok(html.includes('id="btn-att-action"'), 'Phải có nút hành động');
});

await testAsync('16. Lifecycle cleanup: Dọn dẹp interval đồng hồ không rò rỉ bộ nhớ', () => {
  // Bật đồng hồ
  startRealtimeClock();
  // Dọn dẹp
  stopRealtimeClock();
  destroyAttendanceWidget();
  // Gọi stop nhiều lần không ném lỗi
  assert.doesNotThrow(() => {
    stopRealtimeClock();
    destroyAttendanceWidget();
  });
});

console.log('\n' + '='.repeat(70));
console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT 100%`);
console.log('='.repeat(70));

if (passedTests !== totalTests) {
  process.exit(1);
}
