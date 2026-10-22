/**
 * BỘ KIỂM THỬ TỔNG THỂ: PIE CHART CƠ CẤU NHÂN SỰ & BAR CHART TỶ LỆ CHẤM CÔNG ĐÚNG GIỜ (SECTION 8)
 * 
 * Kiểm tra 12 tiêu chí bắt buộc theo đặc tả yêu cầu:
 * 1. Pie Chart hiển thị đúng số nhân viên của từng phòng ban.
 * 2. Tỷ trọng các phòng ban nhất quán với tổng số nhân viên.
 * 3. Phòng ban có 0 nhân viên không làm biểu đồ bị lỗi.
 * 4. Tổng số nhân viên bằng 0: hiển thị empty state.
 * 5. Bar Chart tính hoặc hiển thị đúng tỷ lệ chấm công theo định nghĩa nghiệp vụ.
 * 6. Phòng ban không có lượt check-in hợp lệ: không hiển thị tỷ lệ gây hiểu nhầm (hiển thị "Chưa có DL", không hiển thị 0%).
 * 7. Bộ lọc thời gian: Cập nhật biểu đồ khi chọn Hôm nay, thông báo giới hạn API khi chọn khoảng thời gian dài hơn.
 * 8. Loading, empty, error và retry hoạt động độc lập cho từng biểu đồ.
 * 9. Request lỗi không làm xuất hiện dữ liệu giả.
 * 10. Tên phòng ban dài và số lượng lớn không làm vỡ layout (X-axis rotated labels & tooltips).
 * 11. Dashboard tích hợp liền mạch 2 biểu đồ dạng 2 cột, không làm mất KPI hay các widget khác.
 * 12. Phân quyền RBAC: Admin & HR thấy cả 2 biểu đồ, Employee không thấy biểu đồ quản trị.
 */

import assert from 'node:assert';

// 1. Mock LocalStorage & SessionStorage
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// 2. Mock DOM environment
globalThis.document = {
  title: '',
  body: { style: {} },
  getElementById: (id) => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    querySelector: () => null,
    addEventListener: () => {},
  }),
};
globalThis.window = {
  location: { pathname: '/dashboard' },
  addEventListener: () => {},
};

// 3. Mock fetch toàn cục có headers.get()
let mockFetchHandler = null;
globalThis.fetch = async (url, options = {}) => {
  if (mockFetchHandler) {
    const res = await mockFetchHandler(url, options);
    return {
      headers: { get: () => 'application/json' },
      ...res,
    };
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, data: {} }),
  };
};

// Import các modules sau khi đã chuẩn bị môi trường mock
const { setCurrentUser } = await import('../src/services/authService.js');
const { dashboardService } = await import('../src/services/dashboardService.js');
const {
  renderDepartmentDistributionChartMarkup,
  generateDoughnutSvg,
  generateLegendHtml,
  updateDepartmentDistributionChart,
  renderDepartmentDistributionError,
} = await import('../src/components/DepartmentDistributionChart.js');
const {
  renderDepartmentOnTimeBarChartMarkup,
  generateBarChartSvg,
  updateDepartmentOnTimeBarChart,
  renderDepartmentOnTimeBarChartApiNotice,
  renderDepartmentOnTimeBarChartError,
} = await import('../src/components/DepartmentOnTimeBarChart.js');
const {
  renderDashboardPage,
  loadDashboardKpiAndDistribution,
  loadDashboardDepartmentOnTimeChart,
} = await import('../src/pages/DashboardPage.js');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('\n===========================================================================');
console.log('📊 BẮT ĐẦU CHẠY TEST SUITE: 2 BIỂU ĐỒ DASHBOARD CƠ CẤU NHÂN SỰ & CHẤM CÔNG');
console.log('===========================================================================\n');

// -----------------------------------------------------------------------------
// NHÓM 1: PIE CHART CƠ CẤU NHÂN SỰ THEO PHÒNG BAN (MỤC 2 & KIỂM THỬ 1-4)
// -----------------------------------------------------------------------------
console.log('--- NHÓM 1: PIE CHART CƠ CẤU NHÂN SỰ THEO PHÒNG BAN ---');

await runTest('1. Pie Chart hiển thị đúng số nhân viên của từng phòng ban từ API GET /api/departments/statistics', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng Công nghệ thông tin', departmentCode: 'IT', employeeCount: 35, percentage: 50 },
            { departmentId: 2, departmentName: 'Phòng Nhân sự', departmentCode: 'HR', employeeCount: 20, percentage: 28.57 },
            { departmentId: 3, departmentName: 'Phòng Kế toán', departmentCode: 'ACC', employeeCount: 15, percentage: 21.43 },
          ],
          meta: { totalDepartments: 3, totalEmployees: 70 },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  const dist = await dashboardService.getDepartmentDistribution();

  assert.strictEqual(dist.totalCount, 70, 'Tổng nhân sự phải là 70');
  assert.strictEqual(dist.items.length, 3, 'Có 3 phòng ban');
  assert.strictEqual(dist.items[0].count, 35, 'IT có 35 nhân sự');
  assert.strictEqual(dist.items[1].count, 20, 'HR có 20 nhân sự');
  assert.strictEqual(dist.items[2].count, 15, 'ACC có 15 nhân sự');
});

await runTest('2. Tỷ trọng các phòng ban nhất quán với tổng số nhân viên (tổng tỷ trọng = 100%)', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng IT', employeeCount: 50 },
            { departmentId: 2, departmentName: 'Phòng HR', employeeCount: 30 },
            { departmentId: 3, departmentName: 'Phòng Sale', employeeCount: 20 },
          ],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  const dist = await dashboardService.getDepartmentDistribution(100);

  const sumPercentage = dist.items.reduce((acc, curr) => acc + curr.percentage, 0);
  assert.strictEqual(Math.round(sumPercentage), 100, 'Tổng tỷ trọng phải đạt 100%');
  assert.strictEqual(dist.items[0].percentage, 50, 'IT chiếm 50%');
  assert.strictEqual(dist.items[1].percentage, 30, 'HR chiếm 30%');
  assert.strictEqual(dist.items[2].percentage, 20, 'Sale chiếm 20%');
});

await runTest('3. Phòng ban có 0 nhân viên không làm biểu đồ bị lỗi và vẫn hiển thị trên Legend với 0 NV (0%)', () => {
  const items = [
    { id: 1, name: 'Phòng IT', code: 'IT', count: 10, percentage: 100, color: '#2563eb' },
    { id: 2, name: 'Phòng Rỗng', code: 'EMPTY', count: 0, percentage: 0, color: '#94a3b8' },
  ];

  const svg = generateDoughnutSvg(items, 10);
  assert.ok(svg.includes('Phòng IT'), 'Có segment của Phòng IT');
  assert.ok(!svg.includes('data-name="Phòng Rỗng"'), 'Phòng Rỗng không tạo slice giả có count=0');

  const legend = generateLegendHtml(items);
  assert.ok(legend.includes('Phòng Rỗng'), 'Legend vẫn liệt kê đầy đủ Phòng Rỗng');
  assert.ok(legend.includes('0 NV'), 'Legend hiển thị 0 NV');
  assert.ok(legend.includes('0%'), 'Legend hiển thị 0%');
});

await runTest('4. Tổng số nhân viên bằng 0: hiển thị empty state, không gây lỗi chia cho 0', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng Mới', employeeCount: 0, percentage: 0 },
          ],
          meta: { totalDepartments: 1, totalEmployees: 0 },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  const dist = await dashboardService.getDepartmentDistribution(0);
  assert.strictEqual(dist.totalCount, 0, 'Tổng nhân sự là 0');
  assert.strictEqual(dist.items[0].percentage, 0, 'Tỷ trọng là 0, không phải NaN');

  const mockBody = { innerHTML: '' };
  updateDepartmentDistributionChart(mockBody, dist);
  assert.ok(mockBody.innerHTML.includes('Chưa có dữ liệu phân bổ nhân sự') || mockBody.innerHTML.includes('Chưa có dữ liệu'), 'Hiển thị empty state rõ ràng');
});

// -----------------------------------------------------------------------------
// NHÓM 2: BAR CHART TỶ LỆ CHẤM CÔNG ĐÚNG GIỜ THEO PHÒNG BAN (MỤC 3 & KIỂM THỬ 5-7)
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 2: BAR CHART TỶ LỆ CHẤM CÔNG ĐÚNG GIỜ THEO PHÒNG BAN ---');

await runTest('5. Bar Chart tính đúng tỷ lệ chấm công: (onTime / totalCheckIns) * 100', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng IT', employeeCount: 10 },
            { departmentId: 2, departmentName: 'Phòng HR', employeeCount: 5 },
          ],
        }),
      };
    }
    if (url.includes('/attendance/today')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            // IT: 4 người check-in, 3 đúng giờ, 1 đi muộn -> 3/4 = 75.0%
            { departmentId: 1, checkInTime: '2026-10-23T08:15:00Z', status: 'ON_TIME' },
            { departmentId: 1, checkInTime: '2026-10-23T08:20:00Z', status: 'ON_TIME' },
            { departmentId: 1, checkInTime: '2026-10-23T08:25:00Z', status: 'ON_TIME' },
            { departmentId: 1, checkInTime: '2026-10-23T08:45:00Z', status: 'LATE' },
            // HR: 2 người check-in, cả 2 đúng giờ -> 2/2 = 100.0%
            { departmentId: 2, checkInTime: '2026-10-23T08:10:00Z', status: 'ON_TIME' },
            { departmentId: 2, checkInTime: '2026-10-23T08:12:00Z', status: 'ON_TIME' },
          ],
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  const rates = await dashboardService.getDepartmentOnTimeRates('today');

  assert.strictEqual(rates.isSupported, true, 'Hỗ trợ tính toán hôm nay');
  assert.strictEqual(rates.totalCheckIns, 6, 'Tổng cộng 6 lượt check-in');
  assert.strictEqual(rates.totalOnTime, 5, 'Tổng cộng 5 lượt đúng giờ');
  assert.strictEqual(rates.averageRate, 83.3, 'Tỷ lệ trung bình toàn công ty: 5/6 = 83.3%');

  const itDept = rates.items.find((i) => i.departmentId === 1);
  assert.strictEqual(itDept.totalCheckIns, 4, 'IT có 4 check-in');
  assert.strictEqual(itDept.onTimeCount, 3, 'IT có 3 đúng giờ');
  assert.strictEqual(itDept.lateCount, 1, 'IT có 1 muộn');
  assert.strictEqual(itDept.onTimeRate, 75, 'IT đạt tỷ lệ 75%');

  const hrDept = rates.items.find((i) => i.departmentId === 2);
  assert.strictEqual(hrDept.totalCheckIns, 2, 'HR có 2 check-in');
  assert.strictEqual(hrDept.onTimeRate, 100, 'HR đạt tỷ lệ 100%');
});

await runTest('6. Phòng ban không có lượt check-in: onTimeRate là null, SVG hiển thị "Chưa có DL", không hiển thị 0%', async () => {
  const items = [
    { departmentId: 1, departmentName: 'Phòng IT', onTimeRate: 100, onTimeCount: 2, totalCheckIns: 2, hasData: true },
    { departmentId: 2, departmentName: 'Phòng Kế toán', onTimeRate: null, onTimeCount: 0, totalCheckIns: 0, hasData: false },
  ];

  const svg = generateBarChartSvg(items);

  assert.ok(svg.includes('100%'), 'Phòng IT hiển thị nhãn 100%');
  assert.ok(svg.includes('Chưa có DL'), 'Phòng Kế toán hiển thị nhãn Chưa có DL');
  assert.ok(svg.includes('dept-bar-empty-rect'), 'Phòng Kế toán có vạch chỉ báo rỗng');
});

await runTest('7. Bộ lọc thời gian: Báo rõ giới hạn API khi người dùng chọn 7 ngày qua hoặc Tháng này', async () => {
  const result7Days = await dashboardService.getDepartmentOnTimeRates('7days');
  assert.strictEqual(result7Days.isSupported, false, 'Không giả mạo dữ liệu 7 ngày khi Backend chưa hỗ trợ');
  assert.ok(result7Days.message.includes('API GET /api/attendance/today'), 'Nêu rõ giới hạn API hiện tại');

  const mockBody = { innerHTML: '', querySelector: () => null };
  renderDepartmentOnTimeBarChartApiNotice(mockBody, result7Days.message);
  assert.ok(mockBody.innerHTML.includes('Giới hạn dữ liệu thời gian'), 'Hiển thị banner giới hạn dữ liệu');
  assert.ok(mockBody.innerHTML.includes('btn-back-to-today'), 'Có nút Quay lại dữ liệu Hôm nay');
});

// -----------------------------------------------------------------------------
// NHÓM 3: TRẠNG THÁI UI, LỖI & LAYOUT (MỤC 5, 6, 7 & KIỂM THỬ 8-11)
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 3: TRẠNG THÁI UI, LỖI, LAYOUT & KHÔNG DỮ LIỆU GIẢ ---');

await runTest('8. Loading, empty, error và retry hoạt động độc lập cho Bar Chart', () => {
  let retryTriggered = false;
  const mockBody = {
    innerHTML: '',
    querySelector: (sel) => {
      if (sel === '#btn-retry-ontime-chart') {
        return { addEventListener: (evt, cb) => { if (evt === 'click') cb(); } };
      }
      return null;
    },
  };

  renderDepartmentOnTimeBarChartError(mockBody, 'Mất kết nối máy chủ', () => {
    retryTriggered = true;
  });

  assert.ok(mockBody.innerHTML.includes('Không thể tải biểu đồ chấm công đúng giờ'), 'Có thông báo lỗi');
  assert.ok(mockBody.innerHTML.includes('Mất kết nối máy chủ'), 'Trích xuất đúng chi tiết lỗi');
  assert.strictEqual(retryTriggered, true, 'Nút thử lại kích hoạt callback chính xác');
});

await runTest('9. Khi API thất bại, không hiển thị dữ liệu giả hoặc số liệu hardcode', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/attendance/today')) {
      return { ok: false, status: 500, json: async () => ({ success: false, message: 'Database error' }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
  };

  await assert.rejects(
    async () => {
      await dashboardService.getDepartmentOnTimeRates('today');
    },
    (err) => err.message.includes('500') || err.message.includes('Database error'),
    'Không fallback về dữ liệu giả'
  );
});

await runTest('10. Tên phòng ban dài được xử lý góc xoay và text-anchor end trên SVG để không chồng lấn', () => {
  const items = [
    { departmentId: 1, departmentName: 'Phòng Nghiên cứu và Phát triển Công nghệ Cao', onTimeRate: 90, onTimeCount: 9, totalCheckIns: 10, hasData: true },
  ];

  const svg = generateBarChartSvg(items);
  assert.ok(svg.includes('transform="rotate(-30'), 'Nhãn trục X có góc xoay chống chồng lấn');
  assert.ok(svg.includes('text-anchor="end"'), 'Căn lề end chuẩn xác');
});

await runTest('11. Giao diện Dashboard tích hợp 2 biểu đồ dạng 2 cột (dashboard-charts-grid)', () => {
  setCurrentUser({ role: 'ADMIN', username: 'admin' });
  const html = renderDashboardPage();

  assert.ok(html.includes('dashboard-charts-grid'), 'Có grid chứa 2 biểu đồ');
  assert.ok(html.includes('department-distribution-card'), 'Có thẻ biểu đồ tròn cơ cấu nhân sự');
  assert.ok(html.includes('department-ontime-card'), 'Có thẻ biểu đồ cột chấm công đúng giờ');
  assert.ok(html.includes('dash-kpi-grid'), 'Vẫn giữ nguyên 3 thẻ KPI');
  assert.ok(html.includes('dash-activity-list'), 'Vẫn giữ nguyên nhật ký chấm công');
});

// -----------------------------------------------------------------------------
// NHÓM 4: PHÂN QUYỀN RBAC (KIỂM THỬ 12)
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 4: PHÂN QUYỀN RBAC CHO 2 BIỂU ĐỒ ---');

await runTest('12. Quản trị viên (ADMIN/HR) thấy 2 biểu đồ, Nhân viên (EMPLOYEE) không thấy', () => {
  // Test với ADMIN
  setCurrentUser({ role: 'ADMIN', username: 'admin' });
  const adminHtml = renderDashboardPage();
  assert.ok(adminHtml.includes('dashboard-charts-grid'), 'Admin thấy 2 biểu đồ');
  assert.ok(adminHtml.includes('department-ontime-card'), 'Admin thấy Bar Chart');

  // Test với HR_MANAGER
  setCurrentUser({ role: 'HR_MANAGER', username: 'hrmanager' });
  const hrHtml = renderDashboardPage();
  assert.ok(hrHtml.includes('dashboard-charts-grid'), 'HR Manager thấy 2 biểu đồ');

  // Test với EMPLOYEE
  setCurrentUser({ role: 'EMPLOYEE', username: 'nv001', employeeId: 10 });
  const empHtml = renderDashboardPage();
  assert.ok(!empHtml.includes('dashboard-charts-grid'), 'Employee KHÔNG thấy grid 2 biểu đồ');
  assert.ok(!empHtml.includes('department-distribution-card'), 'Employee KHÔNG thấy Pie Chart');
  assert.ok(!empHtml.includes('department-ontime-card'), 'Employee KHÔNG thấy Bar Chart');
  assert.ok(empHtml.includes('personal-profile-card'), 'Employee thấy thẻ hồ sơ cá nhân');
});

console.log('\n===========================================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ 2 BIỂU ĐỒ DASHBOARD!`);
console.log('===========================================================================\n');
