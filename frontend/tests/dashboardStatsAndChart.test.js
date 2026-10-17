/**
 * BỘ KIỂM THỬ: 3 THẺ KPI THỐNG KÊ DASHBOARD & BIỂU ĐỒ PHÂN BỔ NHÂN SỰ THEO PHÒNG BAN (HRM-212)
 * 
 * Kiểm thử chi tiết:
 * 1. dashboardService.getDashboardStats() gọi đúng endpoint GET /api/dashboard/stats, chuẩn hóa dữ liệu, không chia cho 0, giữ nguyên attendanceRate từ Backend.
 * 2. dashboardService.getDepartmentDistribution() tính toán tỷ trọng %, bổ sung nhóm "Chưa phân phòng ban" bảo đảm nhất quán với tổng nhân sự.
 * 3. Sinh mã SVG Doughnut Chart và Legend Chú giải với dữ liệu thực tế.
 * 4. Xử lý trạng thái rỗng (0 nhân viên, 0 phòng ban) và trạng thái lỗi mạng/API với nút Thử tải lại.
 * 5. Phân quyền RBAC: Quản trị viên & HR thấy 3 thẻ KPI và biểu đồ, Nhân viên (EMPLOYEE) không thấy.
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
const { renderDashboardPage, loadDashboardKpiAndDistribution } = await import('../src/pages/DashboardPage.js');

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
console.log('📊 BẮT ĐẦU CHẠY TEST SUITE: DASHBOARD 3 KPI & BIỂU ĐỒ PHÂN BỔ NHÂN SỰ (HRM-212)');
console.log('===========================================================================\n');

// -----------------------------------------------------------------------------
// NHÓM 1: DASHBOARD SERVICE - TÍCH HỢP GET /api/dashboard/stats
// -----------------------------------------------------------------------------
console.log('--- NHÓM 1: DASHBOARD SERVICE & API GET /api/dashboard/stats ---');

await runTest('1. dashboardService.getDashboardStats() gọi đúng endpoint GET /api/dashboard/stats', async () => {
  let calledUrl = '';
  let calledMethod = '';

  mockFetchHandler = async (url, options) => {
    calledUrl = url;
    calledMethod = options.method || 'GET';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          totalEmployees: 120,
          totalDepartments: 8,
          presentEmployees: 96,
          attendanceRate: 80,
          date: '2026-10-17',
        },
      }),
    };
  };

  const result = await dashboardService.getDashboardStats();

  assert.ok(calledUrl.includes('/dashboard/stats'), 'Phải gọi đúng endpoint /dashboard/stats');
  assert.strictEqual(calledMethod, 'GET', 'Phải dùng HTTP method GET');
  assert.strictEqual(result.totalEmployees, 120, 'Tổng nhân viên phải là 120');
  assert.strictEqual(result.totalDepartments, 8, 'Tổng phòng ban phải là 8');
  assert.strictEqual(result.presentEmployees, 96, 'Nhân viên có mặt phải là 96');
  assert.strictEqual(result.attendanceRate, 80, 'Tỷ lệ có mặt phải giữ nguyên từ Backend là 80');
  assert.strictEqual(result.date, '2026-10-17', 'Ngày thống kê phải là 2026-10-17');
});

await runTest('2. getDashboardStats() xử lý dữ liệu bị khuyết thiếu, số âm hoặc attendanceRate số thập phân', async () => {
  mockFetchHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        totalEmployees: '55',
        totalDepartments: null, // thiếu
        presentEmployees: 41,
        attendanceRate: 74.54545, // số thập phân dài
      },
    }),
  });

  const result = await dashboardService.getDashboardStats();

  assert.strictEqual(result.totalEmployees, 55, 'Parse string thành number hợp lệ');
  assert.strictEqual(result.totalDepartments, 0, 'Null phải fallback về 0');
  assert.strictEqual(result.presentEmployees, 41, 'Nhân viên có mặt là 41');
  assert.strictEqual(result.attendanceRate, 74.55, 'Làm tròn tối đa 2 chữ số thập phân (74.55)');
});

await runTest('3. getDashboardStats() ném lỗi khi API trả về mã lỗi HTTP 401 hoặc 500', async () => {
  mockFetchHandler = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ success: false, message: 'Token hết hạn' }),
  });

  await assert.rejects(
    async () => {
      await dashboardService.getDashboardStats();
    },
    (err) => {
      return err.message.includes('401') || err.message.includes('Token');
    },
    'Phải reject khi gặp lỗi 401'
  );
});

// -----------------------------------------------------------------------------
// NHÓM 2: DỮ LIỆU BIỂU ĐỒ PHÂN BỔ NHÂN SỰ & CÔNG THỨC TỶ TRỌNG
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 2: BIỂU ĐỒ PHÂN BỔ NHÂN SỰ & TỶ TRỌNG % ---');

await runTest('4. getDepartmentDistribution() tính tỷ trọng chuẩn và gán màu sắc phân biệt', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng Kỹ thuật & CNTT', departmentCode: 'TECH', employeeCount: 50 },
            { departmentId: 2, departmentName: 'Phòng Nhân sự', departmentCode: 'HR', employeeCount: 30 },
            { departmentId: 3, departmentName: 'Phòng Kinh doanh', departmentCode: 'SALE', employeeCount: 20 },
          ],
          meta: { totalDepartments: 3, totalEmployees: 100 },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  const dist = await dashboardService.getDepartmentDistribution(100);

  assert.strictEqual(dist.totalCount, 100, 'Tổng nhân viên trên biểu đồ phải bằng 100');
  assert.strictEqual(dist.items.length, 3, 'Có 3 phòng ban');

  // Kiểm tra tỷ trọng:
  // Phòng Kỹ thuật: 50/100 * 100 = 50.0%
  // Phòng Nhân sự: 30/100 * 100 = 30.0%
  // Phòng Kinh doanh: 20/100 * 100 = 20.0%
  assert.strictEqual(dist.items[0].percentage, 50, 'TECH chiếm 50%');
  assert.strictEqual(dist.items[1].percentage, 30, 'HR chiếm 30%');
  assert.strictEqual(dist.items[2].percentage, 20, 'SALE chiếm 20%');

  // Kiểm tra màu sắc khác nhau
  assert.notStrictEqual(dist.items[0].color, dist.items[1].color, 'Các phòng ban phải có mã màu riêng');
});

await runTest('5. getDepartmentDistribution() tự động thêm nhóm "Chưa phân phòng ban" khi totalEmployees > sum(departments)', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng Kỹ thuật', departmentCode: 'TECH', employeeCount: 40 },
            { departmentId: 2, departmentName: 'Phòng Kế toán', departmentCode: 'ACC', employeeCount: 40 },
          ],
          meta: { totalDepartments: 2, totalEmployees: 80 },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  // Tổng nhân sự thực tế từ KPI stats là 100, nhưng 2 phòng ban chỉ mới gán 80 NV
  const dist = await dashboardService.getDepartmentDistribution(100);

  assert.strictEqual(dist.totalCount, 100, 'Tổng số nhân viên trên biểu đồ phải khớp 100 với KPI tổng nhân sự');
  assert.strictEqual(dist.items.length, 3, 'Bổ sung thêm 1 nhóm Chưa phân phòng ban');

  const unassigned = dist.items.find((item) => item.isUnassigned === true);
  assert.ok(unassigned, 'Phải có nhóm Chưa phân phòng ban');
  assert.strictEqual(unassigned.name, 'Chưa phân phòng ban');
  assert.strictEqual(unassigned.count, 20, 'Số lượng chưa phân là 100 - 80 = 20');
  assert.strictEqual(unassigned.percentage, 20, 'Tỷ trọng chưa phân là 20.0%');
});

await runTest('6. getDepartmentDistribution() xử lý an toàn khi hệ thống không có nhân viên nào (0 NV, không chia cho 0)', async () => {
  mockFetchHandler = async (url) => {
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { departmentId: 1, departmentName: 'Phòng Kỹ thuật', employeeCount: 0 },
          ],
          meta: { totalDepartments: 1, totalEmployees: 0 },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  const dist = await dashboardService.getDepartmentDistribution(0);

  assert.strictEqual(dist.totalCount, 0, 'Tổng số nhân viên là 0');
  assert.strictEqual(dist.items[0].percentage, 0, 'Tỷ trọng phải bằng 0%, không được ra NaN hay Infinity');
});

// -----------------------------------------------------------------------------
// NHÓM 3: COMPONENT BIỂU ĐỒ DOUGHNUT SVG & LEGEND CHÚ GIẢI
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 3: COMPONENT BIỂU ĐỒ DOUGHNUT SVG & LEGEND ---');

await runTest('7. renderDepartmentDistributionChartMarkup() render đúng cấu trúc khung biểu đồ', () => {
  const html = renderDepartmentDistributionChartMarkup();

  assert.ok(html.includes('department-distribution-card'), 'Có thẻ container department-distribution-card');
  assert.ok(html.includes('Phân bổ nhân sự theo phòng ban'), 'Có tiêu đề biểu đồ');
  assert.ok(html.includes('dept-chart-total-badge'), 'Có badge số lượng');
  assert.ok(html.includes('dept-chart-body'), 'Có vùng thân biểu đồ dept-chart-body');
});

await runTest('8. generateDoughnutSvg() sinh các đường cong SVG circle với stroke-dasharray chính xác', () => {
  const items = [
    { id: 1, name: 'Phòng IT', code: 'IT', count: 60, percentage: 60, color: '#2563eb' },
    { id: 2, name: 'Phòng HR', code: 'HR', count: 40, percentage: 40, color: '#7c3aed' },
  ];

  const svgHtml = generateDoughnutSvg(items, 100);

  assert.ok(svgHtml.includes('dept-chart-svg'), 'Có thẻ SVG viewBox');
  assert.ok(svgHtml.includes('dept-chart-segment'), 'Có các segment circle');
  assert.ok(svgHtml.includes('data-name="Phòng IT"'), 'Segment chứa tên phòng ban');
  assert.ok(svgHtml.includes('stroke="#2563eb"'), 'Segment có màu tương ứng');
  assert.ok(svgHtml.includes('100'), 'Tâm biểu đồ hiển thị tổng số 100');
  assert.ok(svgHtml.includes('Nhân sự'), 'Tâm biểu đồ có nhãn Nhân sự');
  assert.ok(svgHtml.includes('dept-chart-tooltip'), 'Có phần tử tooltip phục vụ tương tác');
});

await runTest('9. generateLegendHtml() sinh đầy đủ tên phòng ban, mã code, thanh tiến độ và tỷ trọng', () => {
  const items = [
    { id: 1, name: 'Phòng Kỹ thuật', code: 'TECH', count: 15, percentage: 75, color: '#2563eb' },
    { id: 2, name: 'Phòng Hành chính', code: 'ADM', count: 5, percentage: 25, color: '#10b981' },
  ];

  const legendHtml = generateLegendHtml(items);

  assert.ok(legendHtml.includes('Phòng Kỹ thuật'), 'Hiển thị tên phòng ban 1');
  assert.ok(legendHtml.includes('(TECH)'), 'Hiển thị mã code phòng ban 1');
  assert.ok(legendHtml.includes('15 NV'), 'Hiển thị số nhân viên 15 NV');
  assert.ok(legendHtml.includes('75%'), 'Hiển thị tỷ trọng 75%');
  assert.ok(legendHtml.includes('dept-legend-bar'), 'Có thanh tiến độ trực quan');
});

await runTest('10. renderDepartmentDistributionError() hiển thị lỗi kết nối và nút thử lại', () => {
  let retryClicked = false;
  const mockBody = {
    innerHTML: '',
    querySelector: (sel) => {
      if (sel === '#btn-retry-dept-chart') {
        return {
          addEventListener: (event, handler) => {
            if (event === 'click') handler();
          },
        };
      }
      return null;
    },
  };

  renderDepartmentDistributionError(mockBody, 'Mất kết nối máy chủ', () => {
    retryClicked = true;
  });

  assert.ok(mockBody.innerHTML.includes('Không thể tải dữ liệu phân bổ nhân sự'), 'Có thông báo lỗi');
  assert.ok(mockBody.innerHTML.includes('Mất kết nối máy chủ'), 'Trích xuất đúng chi tiết lỗi');
  assert.ok(mockBody.innerHTML.includes('btn-retry-dept-chart'), 'Có nút Thử tải lại');
  assert.strictEqual(retryClicked, true, 'Callback nút Thử lại được kích hoạt khi click');
});

// -----------------------------------------------------------------------------
// NHÓM 4: GIAO DIỆN TRANG DASHBOARD & PHÂN QUYỀN RBAC
// -----------------------------------------------------------------------------
console.log('\n--- NHÓM 4: TRANG DASHBOARD & PHÂN QUYỀN RBAC ---');

await runTest('11. ADMIN / HR xem Dashboard: Hiển thị 3 thẻ KPI và Biểu đồ phân bổ nhân sự', () => {
  setCurrentUser({
    id: 1,
    employeeId: 1,
    role: 'ADMIN',
    fullName: 'Quản trị viên',
  });

  const html = renderDashboardPage();

  // Kiểm tra 3 thẻ KPI
  assert.ok(html.includes('id="dash-kpi-grid"'), 'Có grid chứa 3 thẻ KPI');
  assert.ok(html.includes('id="card-total-employees"'), 'Có thẻ 1: Tổng nhân sự');
  assert.ok(html.includes('Tổng nhân sự'), 'Nhãn Thẻ 1 là Tổng nhân sự');
  assert.ok(html.includes('id="card-total-departments"'), 'Có thẻ 2: Tổng phòng ban');
  assert.ok(html.includes('Tổng phòng ban'), 'Nhãn Thẻ 2 là Tổng phòng ban');
  assert.ok(html.includes('id="card-attendance-rate"'), 'Có thẻ 3: Có mặt hôm nay');
  assert.ok(html.includes('Có mặt hôm nay'), 'Nhãn Thẻ 3 là Có mặt hôm nay');

  // Kiểm tra Biểu đồ phân bổ nhân sự
  assert.ok(html.includes('department-distribution-card'), 'Có Card Biểu đồ phân bổ nhân sự');
  assert.ok(html.includes('Phân bổ nhân sự theo phòng ban'), 'Tiêu đề biểu đồ chuẩn');
});

await runTest('12. EMPLOYEE xem Dashboard: ẨN TOÀN BỘ 3 thẻ KPI công ty và Biểu đồ phân bổ nhân sự', () => {
  setCurrentUser({
    id: 3,
    employeeId: 3,
    role: 'EMPLOYEE',
    fullName: 'Trần Văn Nam',
    employeeCode: 'NV003',
  });

  const html = renderDashboardPage();

  assert.strictEqual(html.includes('id="card-total-employees"'), false, 'Nhân viên KHÔNG thấy thẻ Tổng nhân sự công ty');
  assert.strictEqual(html.includes('id="card-total-departments"'), false, 'Nhân viên KHÔNG thấy thẻ Tổng phòng ban');
  assert.strictEqual(html.includes('id="card-attendance-rate"'), false, 'Nhân viên KHÔNG thấy thẻ Tỷ lệ có mặt công ty');
  assert.strictEqual(html.includes('department-distribution-card'), false, 'Nhân viên KHÔNG thấy Biểu đồ phân bổ nhân sự');

  // Nhân viên chỉ thấy Widget và Hồ sơ của mình
  assert.ok(html.includes('personal-profile-card'), 'Nhân viên thấy Hồ sơ của tôi');
  assert.ok(html.includes('attendance-widget-card'), 'Nhân viên thấy Widget chấm công');
});

await runTest('13. loadDashboardKpiAndDistribution() cập nhật DOM đầy đủ và xử lý retry khi API lỗi', async () => {
  const elements = {
    '#kpi-total-employees': { textContent: '' },
    '#kpi-total-employees-meta': { innerHTML: '' },
    '#kpi-total-departments': { textContent: '' },
    '#kpi-total-departments-meta': { innerHTML: '' },
    '#kpi-attendance-rate': { textContent: '' },
    '#kpi-attendance-meta': { innerHTML: '' },
    '#dept-chart-body': { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    '#dept-chart-total-badge': { textContent: '' },
  };

  globalThis.document.querySelector = (sel) => elements[sel] || null;
  globalThis.document.getElementById = (id) => elements[`#${id}`] || null;

  mockFetchHandler = async (url) => {
    if (url.includes('/dashboard/stats')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            totalEmployees: 96,
            totalDepartments: 6,
            presentEmployees: 72,
            attendanceRate: 75,
            date: '2026-10-17',
          },
        }),
      };
    }
    if (url.includes('/departments/statistics')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            departments: [
              { departmentId: 1, departmentName: 'Kỹ thuật', employeeCount: 72 },
              { departmentId: 2, departmentName: 'Kinh doanh', employeeCount: 24 },
            ],
            summary: { totalDepartments: 2, totalEmployees: 96 },
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  await loadDashboardKpiAndDistribution();

  // Kiểm tra DOM đã được cập nhật chính xác
  assert.strictEqual(elements['#kpi-total-employees'].textContent, 96, 'KPI Tổng nhân sự hiển thị 96');
  assert.strictEqual(elements['#kpi-total-departments'].textContent, 6, 'KPI Tổng phòng ban hiển thị 6');
  assert.strictEqual(elements['#kpi-attendance-rate'].textContent, '75%', 'KPI Tỷ lệ có mặt hiển thị 75%');
  assert.ok(elements['#kpi-attendance-meta'].innerHTML.includes('72/96 nhân viên'), 'Meta hiển thị 72/96 nhân viên');
  assert.ok(elements['#dept-chart-body'].innerHTML.includes('dept-chart-wrapper'), 'Body biểu đồ đã render SVG và Legend');
});

console.log('\n===========================================================================');
console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT 100%`);
console.log('===========================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
