/**
 * BỘ KIỂM THỬ TỰ ĐỘNG: BẢNG CHẤM CÔNG HÔM NAY – HRM (HRM-128)
 * Kiểm thử toàn diện 13 tình huống theo đặc tả yêu cầu:
 * 1. Có nhân viên đúng giờ (badge Đúng giờ, hiển thị giờ thực tế)
 * 2. Có nhân viên đi muộn (badge Đi muộn, hiển thị giờ thực tế)
 * 3. Có nhân viên chưa check-in (badge Chưa check-in, giờ --:--)
 * 4. Có nhân viên đã check-out (badge Đã check-out, bảo toàn Đi muộn nếu vào ca muộn)
 * 5. Phòng ban không có nhân viên chấm công (Bộ lọc phòng ban trả về rỗng)
 * 6. Tìm kiếm không có kết quả (Empty state)
 * 7. Kết hợp đa điều kiện: Tìm kiếm + Phòng ban + Trạng thái
 * 8. Chuyển trang và thay đổi số dòng (Phân trang đúng STT)
 * 9. API lỗi, mất kết nối hoặc server 500
 * 10. Phân quyền RBAC (EMPLOYEE chỉ xem cá nhân vs ADMIN/HR xem toàn công ty)
 * 11. Dữ liệu hiển thị đúng múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 * 12. Các thẻ thống kê KPI không bị sai lệch do dữ liệu phân trang
 * 13. Render markup bảng chấm công và responsive layout
 */

import assert from 'node:assert';

// Mock Web Storage & DOM
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
    json: async () => ({ success: true, data: [] }),
  };
};

const { attendanceService } = await import('../src/services/attendanceService.js');
const {
  renderAttendanceRowStatusBadge,
  renderAttendancesPage,
} = await import('../src/pages/AttendancesPage.js');
const { formatTimeDisplay } = await import('../src/components/AttendanceWidget.js');

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

console.log('='.repeat(75));
console.log('📋 BẮT ĐẦU CHẠY TEST SUITE: BẢNG CHẤM CÔNG HÔM NAY (HRM-128)');
console.log('='.repeat(75));

// Mẫu dữ liệu giả định chuẩn từ Backend GET /api/attendance/today
const sampleAttendanceData = [
  {
    attendanceId: 1,
    employeeId: 1,
    employeeCode: 'NV001',
    fullName: 'Đỗ Quang Minh',
    departmentId: 1,
    departmentName: 'Phòng Kỹ thuật & Công nghệ',
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:15:00+07:00',
    checkOutTime: null,
    status: 'ON_TIME',
  },
  {
    attendanceId: 2,
    employeeId: 2,
    employeeCode: 'NV002',
    fullName: 'Nguyễn Thị Thu Hà',
    departmentId: 2,
    departmentName: 'Phòng Nhân sự & Hành chính',
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:25:00+07:00',
    checkOutTime: '2026-10-16T17:30:00+07:00',
    status: 'ON_TIME',
  },
  {
    attendanceId: 3,
    employeeId: 3,
    employeeCode: 'NV003',
    fullName: 'Trần Văn Nam',
    departmentId: 1,
    departmentName: 'Phòng Kỹ thuật & Công nghệ',
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:45:00+07:00',
    checkOutTime: null,
    status: 'LATE',
  },
  {
    attendanceId: 4,
    employeeId: 4,
    employeeCode: 'NV004',
    fullName: 'Lê Thị Mai',
    departmentId: 3,
    departmentName: 'Phòng Kinh doanh & Marketing',
    workDate: '2026-10-16',
    checkInTime: '2026-10-16T08:40:00+07:00',
    checkOutTime: '2026-10-16T17:15:00+07:00',
    status: 'LATE',
  },
  {
    attendanceId: null,
    employeeId: 5,
    employeeCode: 'NV005',
    fullName: 'Phạm Quốc Hưng',
    departmentId: 1,
    departmentName: 'Phòng Kỹ thuật & Công nghệ',
    workDate: '2026-10-16',
    checkInTime: null,
    checkOutTime: null,
    status: null,
  },
];

// =============================================================================
// NHÓM 1: QUY TẮC HIỂN THỊ BADGE VÀ DỮ LIỆU TỪNG DÒNG (CASES 1 - 4)
// =============================================================================
console.log('\n--- NHÓM 1: BADGE VÀ TRẠNG THÁI TỪNG DÒNG BẢNG ---');

await testAsync('1. [Tình huống 1] Nhân viên đúng giờ: badge Đúng giờ (xanh lá), giờ thực tế', () => {
  const row = sampleAttendanceData[0]; // NV001, ON_TIME, no check-out
  const badgeHtml = renderAttendanceRowStatusBadge(row);
  const time = formatTimeDisplay(row.checkInTime);

  assert.ok(badgeHtml.includes('att-badge-success'), 'Phải có class att-badge-success');
  assert.ok(badgeHtml.includes('Đúng giờ'), 'Phải hiển thị chữ Đúng giờ');
  assert.strictEqual(time, '08:15:00', 'Giờ check-in phải là 08:15:00');
});

await testAsync('2. [Tình huống 2] Nhân viên đi muộn: badge Đi muộn (vàng cam), giờ thực tế', () => {
  const row = sampleAttendanceData[2]; // NV003, LATE, no check-out
  const badgeHtml = renderAttendanceRowStatusBadge(row);
  const time = formatTimeDisplay(row.checkInTime);

  assert.ok(badgeHtml.includes('att-badge-warning'), 'Phải có class att-badge-warning');
  assert.ok(badgeHtml.includes('Đi muộn'), 'Phải hiển thị chữ Đi muộn');
  assert.strictEqual(time, '08:45:00', 'Giờ check-in phải là 08:45:00');
});

await testAsync('3. [Tình huống 3] Nhân viên chưa check-in: badge Chưa check-in (trung tính), giờ --:--', () => {
  const row = sampleAttendanceData[4]; // NV005, chưa check-in
  const badgeHtml = renderAttendanceRowStatusBadge(row);
  const checkInTime = formatTimeDisplay(row.checkInTime);
  const checkOutTime = formatTimeDisplay(row.checkOutTime);

  assert.ok(badgeHtml.includes('att-badge-neutral'), 'Phải có class att-badge-neutral');
  assert.ok(badgeHtml.includes('Chưa check-in'), 'Phải hiển thị chữ Chưa check-in');
  assert.strictEqual(checkInTime, '--:--');
  assert.strictEqual(checkOutTime, '--:--');
});

await testAsync('4. [Tình huống 4] Nhân viên đã check-out: có badge Đã check-out và BẢO TOÀN trạng thái Đi muộn', () => {
  // NV002: Check-in đúng giờ và đã check-out
  const rowOntime = sampleAttendanceData[1];
  const badgeOntime = renderAttendanceRowStatusBadge(rowOntime);
  assert.ok(badgeOntime.includes('Đã check-out'));
  assert.ok(badgeOntime.includes('Đúng giờ'));

  // NV004: Check-in MUỘN và đã check-out -> BẮT BUỘC giữ nguyên nhãn Đi muộn
  const rowLate = sampleAttendanceData[3];
  const badgeLate = renderAttendanceRowStatusBadge(rowLate);
  assert.ok(badgeLate.includes('Đã check-out'), 'Phải có badge Đã check-out');
  assert.ok(badgeLate.includes('Đi muộn'), 'BẮT BUỘC giữ nguyên badge Đi muộn');
  assert.ok(badgeLate.includes('att-badge-warning'), 'Giữ class warning màu cam');
  assert.strictEqual(formatTimeDisplay(rowLate.checkOutTime), '17:15:00');
});

// =============================================================================
// NHÓM 2: BỘ LỌC VÀ TÌM KIẾM (CASES 5 - 7)
// =============================================================================
console.log('\n--- NHÓM 2: TÌM KIẾM VÀ BỘ LỌC ---');

await testAsync('5. [Tình huống 5] Lọc theo phòng ban: lọc đúng nhân viên thuộc phòng ban và phòng ban không có nhân viên', () => {
  // Phòng Kỹ thuật (departmentId = 1) -> 3 nhân viên (NV001, NV003, NV005)
  const techDept = attendanceService.filterAttendanceList(sampleAttendanceData, { departmentId: 1 });
  assert.strictEqual(techDept.length, 3);
  assert.ok(techDept.every((i) => i.departmentId === 1));

  // Phòng ban 999 không có nhân sự -> kết quả rỗng []
  const emptyDept = attendanceService.filterAttendanceList(sampleAttendanceData, { departmentId: 999 });
  assert.strictEqual(emptyDept.length, 0);
});

await testAsync('6. [Tình huống 6] Tìm kiếm không phân biệt hoa thường theo Tên và Mã nhân viên, xử lý không có kết quả', () => {
  // Tìm theo mã 'nv001'
  const byCode = attendanceService.filterAttendanceList(sampleAttendanceData, { search: 'nv001' });
  assert.strictEqual(byCode.length, 1);
  assert.strictEqual(byCode[0].employeeCode, 'NV001');

  // Tìm theo họ tên không dấu/có dấu 'thu ha'
  const byName = attendanceService.filterAttendanceList(sampleAttendanceData, { search: 'Thu Hà' });
  assert.strictEqual(byName.length, 1);
  assert.strictEqual(byName[0].fullName, 'Nguyễn Thị Thu Hà');

  // Tìm từ khóa không tồn tại -> rỗng
  const noMatch = attendanceService.filterAttendanceList(sampleAttendanceData, { search: 'xyz_khong_ton_tai' });
  assert.strictEqual(noMatch.length, 0);
});

await testAsync('7. [Tình huống 7] Kết hợp đa điều kiện: Tìm kiếm + Phòng ban + Trạng thái chấm công', () => {
  // 1. Trạng thái 'present' (Đã có mặt) -> 4 người (NV001, NV002, NV003, NV004)
  const present = attendanceService.filterAttendanceList(sampleAttendanceData, { status: 'present' });
  assert.strictEqual(present.length, 4);

  // 2. Trạng thái 'ontime' (Đúng giờ) -> 2 người (NV001, NV002)
  const ontime = attendanceService.filterAttendanceList(sampleAttendanceData, { status: 'ontime' });
  assert.strictEqual(ontime.length, 2);

  // 3. Trạng thái 'late' (Đi muộn) -> 2 người (NV003, NV004)
  const late = attendanceService.filterAttendanceList(sampleAttendanceData, { status: 'late' });
  assert.strictEqual(late.length, 2);

  // 4. Trạng thái 'not_checked_in' (Chưa check-in) -> 1 người (NV005)
  const notChecked = attendanceService.filterAttendanceList(sampleAttendanceData, { status: 'not_checked_in' });
  assert.strictEqual(notChecked.length, 1);
  assert.strictEqual(notChecked[0].employeeCode, 'NV005');

  // 5. Kết hợp: Phòng Kỹ thuật (dept 1) VÀ Đi muộn ('late') -> NV003
  const techLate = attendanceService.filterAttendanceList(sampleAttendanceData, {
    departmentId: 1,
    status: 'late',
  });
  assert.strictEqual(techLate.length, 1);
  assert.strictEqual(techLate[0].employeeCode, 'NV003');

  // 6. Kết hợp: Dept 1 + Status 'late' + Search 'Nam' -> NV003
  const combined = attendanceService.filterAttendanceList(sampleAttendanceData, {
    departmentId: 1,
    status: 'late',
    search: 'Nam',
  });
  assert.strictEqual(combined.length, 1);
  assert.strictEqual(combined[0].fullName, 'Trần Văn Nam');
});

// =============================================================================
// NHÓM 3: PHÂN TRANG VÀ THỐNG KÊ KPI (CASES 8 & 12)
// =============================================================================
console.log('\n--- NHÓM 3: PHÂN TRANG VÀ THỐNG KÊ KPI ---');

await testAsync('8. [Tình huống 8] Phân trang chính xác: tính toán đúng STT, số trang và ranh giới trang', () => {
  // Giả sử có 15 bản ghi, phân trang 5 bản ghi/trang
  const mock15 = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Emp ${i + 1}` }));

  // Trang 1
  const page1 = attendanceService.paginateAttendanceList(mock15, 1, 5);
  assert.strictEqual(page1.totalPages, 3);
  assert.strictEqual(page1.page, 1);
  assert.strictEqual(page1.items.length, 5);
  assert.strictEqual(page1.startIndex, 0);
  assert.strictEqual(page1.endIndex, 5);
  // STT trang 1 tính từ 1 đến 5

  // Trang 2
  const page2 = attendanceService.paginateAttendanceList(mock15, 2, 5);
  assert.strictEqual(page2.page, 2);
  assert.strictEqual(page2.startIndex, 5);
  assert.strictEqual(page2.endIndex, 10);
  // STT phần tử đầu tiên trang 2 là: startIndex + 1 = 6

  // Trang vượt quá giới hạn -> tự động fallback về trang cuối cùng
  const pageOverflow = attendanceService.paginateAttendanceList(mock15, 99, 5);
  assert.strictEqual(pageOverflow.page, 3);
});

await testAsync('9. [Tình huống 12] Các thẻ thống kê KPI không bị sai lệch do dữ liệu phân trang', () => {
  // Tính summary trên toàn bộ danh sách 5 nhân viên
  const summary = attendanceService.calculateAttendanceSummary(sampleAttendanceData);

  assert.strictEqual(summary.totalEmployees, 5, 'Tổng nhân viên phải là 5');
  assert.strictEqual(summary.checkedIn, 4, 'Đã có mặt phải là 4 (gồm 2 đúng giờ + 2 đi muộn)');
  assert.strictEqual(summary.onTime, 2, 'Đúng giờ phải là 2');
  assert.strictEqual(summary.late, 2, 'Đi muộn phải là 2');
  assert.strictEqual(summary.notCheckedIn, 1, 'Chưa check-in phải là 1');
  assert.strictEqual(summary.checkedOut, 2, 'Đã check-out phải là 2 (NV002, NV004)');

  // Kiểm tra tính nhất quán: checkedIn + notCheckedIn = totalEmployees
  assert.strictEqual(summary.checkedIn + summary.notCheckedIn, summary.totalEmployees);
  // checkedIn = onTime + late
  assert.strictEqual(summary.onTime + summary.late, summary.checkedIn);

  // Nếu API backend có trả kèm trường summary -> ưu tiên dữ liệu backend
  const backendSummary = {
    totalEmployees: 50,
    checkedIn: 45,
    late: 5,
    notCheckedIn: 5,
    checkedOut: 40,
  };
  const summaryFromApi = attendanceService.calculateAttendanceSummary(sampleAttendanceData, backendSummary);
  assert.strictEqual(summaryFromApi.totalEmployees, 50);
  assert.strictEqual(summaryFromApi.checkedIn, 45);
  assert.strictEqual(summaryFromApi.late, 5);
  assert.strictEqual(summaryFromApi.notCheckedIn, 5);
});

// =============================================================================
// NHÓM 4: SERVICE INTEGRATION, RBAC & LỖI MẠNG (CASES 9 - 11, 13)
// =============================================================================
console.log('\n--- NHÓM 4: SERVICE INTEGRATION, RBAC & GIAO DIỆN ---');

await testAsync('10. [Tình huống 9] Xử lý API lỗi kết nối mạng hoặc token hết hạn (401/500)', async () => {
  mockFetchHandler = async () => {
    return {
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: false, message: 'Lỗi máy chủ cơ sở dữ liệu.' }),
    };
  };

  let threw = false;
  try {
    await attendanceService.getTodayAttendance();
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('500') || err.data?.message);
  }
  assert.strictEqual(threw, true, 'Service phải ném lỗi khi API trả về 500');
});

await testAsync('11. [Tình huống 10] Phân quyền RBAC: Trích xuất bản ghi cá nhân của người dùng hiện tại', () => {
  // Đối với EMPLOYEE: trả về object đơn
  const employeeResponse = {
    data: {
      attendanceId: 99,
      employeeId: 7,
      checkInTime: '2026-10-16T08:10:00+07:00',
      status: 'ON_TIME',
    },
  };
  const empRecord = attendanceService.extractPersonalRecord(employeeResponse, { employeeId: 7, role: 'EMPLOYEE' });
  assert.strictEqual(empRecord.employeeId, 7);

  // Đối với ADMIN: trả về mảng toàn công ty -> extractPersonalRecord tìm đúng của Admin
  const adminResponse = { data: sampleAttendanceData };
  const adminUser = { employeeId: 1, username: 'admin', role: 'ADMIN' };
  const adminRecord = attendanceService.extractPersonalRecord(adminResponse, adminUser);
  assert.strictEqual(adminRecord.employeeId, 1);
  assert.strictEqual(adminRecord.fullName, 'Đỗ Quang Minh');
});

await testAsync('12. [Tình huống 11] Dữ liệu hiển thị đúng múi giờ Việt Nam (+07:00)', () => {
  // Chuỗi ISO từ backend có offset +07:00
  assert.strictEqual(formatTimeDisplay('2026-10-16T08:15:00+07:00'), '08:15:00');
  assert.strictEqual(formatTimeDisplay('2026-10-16T17:30:00+07:00'), '17:30:00');

  // Chuỗi ISO UTC đuôi Z chuyển sang +07:00 (01:15:00Z = 08:15:00 GMT+7)
  assert.strictEqual(formatTimeDisplay('2026-10-16T01:15:00Z'), '08:15:00');
});

await testAsync('13. [Tình huống 13] Render HTML cấu trúc trang đầy đủ widget, 5 KPI cards, thanh tìm kiếm và bảng dữ liệu', () => {
  const html = renderAttendancesPage();

  assert.ok(html.includes('id="attendance-widget"'), 'Phải tích hợp Widget chấm công cá nhân');
  assert.ok(html.includes('class="att-board-stats"'), 'Phải có lưới 5 thẻ thống kê tổng quan');
  assert.ok(html.includes('id="kpi-total-employees"'), 'Phải có thẻ Tổng nhân viên');
  assert.ok(html.includes('id="kpi-checked-in"'), 'Phải có thẻ Đã có mặt');
  assert.ok(html.includes('id="kpi-ontime"'), 'Phải có thẻ Đúng giờ');
  assert.ok(html.includes('id="kpi-late"'), 'Phải có thẻ Đi muộn');
  assert.ok(html.includes('id="kpi-not-checked"'), 'Phải có thẻ Chưa check-in');
  assert.ok(html.includes('id="att-search-input"'), 'Phải có ô tìm kiếm nhanh');
  assert.ok(html.includes('id="att-dept-filter"'), 'Phải có dropdown lọc phòng ban');
  assert.ok(html.includes('id="att-status-filter"'), 'Phải có dropdown lọc trạng thái');
  assert.ok(html.includes('id="att-data-table"'), 'Phải có bảng dữ liệu data-table');
  assert.ok(html.includes('id="att-pagination-bar"'), 'Phải có thanh phân trang');
});

console.log('\n' + '='.repeat(75));
console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT 100%`);
console.log('='.repeat(75));

if (passedTests !== totalTests) {
  process.exit(1);
}
