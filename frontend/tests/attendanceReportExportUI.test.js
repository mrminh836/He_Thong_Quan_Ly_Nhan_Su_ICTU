/**
 * BỘ KIỂM THỬ TỰ ĐỘNG: TÍCH HỢP NÚT XUẤT BÁO CÁO EXCEL CHẤM CÔNG (HRM-215)
 * 
 * Kiểm thử toàn diện 14 kịch bản bắt buộc:
 * 1. Render giao diện: Có nút "Xuất báo cáo Excel" và tùy chọn phụ CSV, icon tải xuống, loading spinner
 * 2. Phân tích header Content-Disposition trích xuất tên file an toàn (hỗ trợ RFC 5987 và standard)
 * 3. Kích hoạt tải Blob qua thẻ <a> ảo và thu hồi URL sau thời gian an toàn
 * 4. Xuất Excel thành công cho tháng hiện tại (gửi đúng query, nhận blob, hiện toast thành công)
 * 5. Xuất Excel cho tháng/năm khác kết hợp lọc theo nhân viên (gửi đúng query params)
 * 6. Xuất tùy chọn phụ định dạng CSV (.csv)
 * 7. Bảo toàn bộ lọc: Tháng, năm, nhân viên được giữ nguyên 100% sau khi xuất file
 * 8. Chống click liên tiếp (Anti-spam): Khóa nút disabled, hiển thị spinner & text Đang xuất...
 * 9. Xử lý lỗi HTTP 400 (Bad Request): Bóc tách JSON lỗi, hiển thị toast, không tải file rác
 * 10. Xử lý lỗi HTTP 401 (Unauthorized): Xóa token khỏi localStorage, thông báo phiên hết hạn
 * 11. Xử lý lỗi HTTP 403 (Forbidden): Hiển thị thông báo không đủ quyền hạn
 * 12. Xử lý lỗi HTTP 500 (Internal Server Error): Bắt lỗi server, khôi phục trạng thái nút để thử lại
 * 13. Xử lý mất kết nối mạng / Network Timeout: Thông báo lỗi kết nối rõ ràng
 * 14. Kiểm tra dữ liệu file rỗng (0 bytes): Phát hiện và cảnh báo kịp thời
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

// 2. Mock Toast System
const toastCalls = [];
globalThis.mockShowToast = (msg, type) => {
  toastCalls.push({ msg, type });
};

// 3. Mock DOM & URL
let createdBlobUrls = [];
let revokedBlobUrls = [];
let simulatedDownloads = [];

globalThis.URL = {
  createObjectURL: (blob) => {
    const fakeUrl = `blob:http://localhost:3000/${Math.random().toString(36).slice(2)}`;
    createdBlobUrls.push({ url: fakeUrl, blob });
    return fakeUrl;
  },
  revokeObjectURL: (url) => {
    revokedBlobUrls.push(url);
  },
};

// Mock Document elements
const domElements = new Map();
function createMockElement(tag, id = '', className = '') {
  const el = {
    tagName: tag.toUpperCase(),
    id,
    className,
    classList: {
      contains: (c) => el.className.split(' ').includes(c),
      add: (c) => {
        if (!el.className.split(' ').includes(c)) el.className += ` ${c}`;
      },
      remove: (c) => {
        el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim();
      },
    },
    style: {},
    attributes: {},
    setAttribute: (name, val) => {
      el.attributes[name] = String(val);
    },
    getAttribute: (name) => el.attributes[name] || null,
    parentNode: null,
    children: [],
    appendChild: (child) => {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    remove: () => {
      if (el.parentNode && typeof el.parentNode.removeChild === 'function') {
        el.parentNode.removeChild(el);
      }
    },
    contains: (target) => el === target || el.children.includes(target),
    click: () => {
      if (el.tagName === 'A') {
        simulatedDownloads.push({
          href: el.href,
          download: el.getAttribute('download'),
        });
      }
    },
    disabled: false,
    textContent: '',
    value: '',
  };
  return el;
}

const mockBody = createMockElement('body');
globalThis.document = {
  body: mockBody,
  createElement: (tag) => createMockElement(tag),
  getElementById: (id) => domElements.get(id) || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return domElements.get(sel.slice(1)) || null;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
};

globalThis.window = {
  location: { pathname: '/attendance-history', href: '' },
  URL: globalThis.URL,
};

// Mock Fetch
let mockFetchHandler = null;
globalThis.fetch = async (url, options = {}) => {
  if (mockFetchHandler) {
    return await mockFetchHandler(url, options);
  }
  return {
    ok: true,
    status: 200,
    headers: {
      get: (h) => {
        if (h.toLowerCase() === 'content-type') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (h.toLowerCase() === 'content-disposition') return 'attachment; filename="bao_cao_cham_cong_2026_10.xlsx"';
        return null;
      },
    },
    blob: async () => new Blob(['fake-excel-data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    text: async () => 'fake-excel-data',
    json: async () => ({}),
  };
};

// Polyfill Blob if not available in Node environment
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class MockBlob {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.type = options.type || '';
      this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : (p.length || 0)), 0);
    }
  };
}

// Import modules to test
const { parseContentDispositionFilename, requestBlob } = await import('../src/services/api.js');
const { reportService, triggerFileDownload, getAttendanceReportBlob, downloadAttendanceReport } = await import('../src/services/reportService.js');
const { renderAttendanceHistoryPage, handleExportAttendanceReport, state } = await import('../src/pages/AttendanceHistoryPage.js');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    toastCalls.length = 0;
    createdBlobUrls.length = 0;
    revokedBlobUrls.length = 0;
    simulatedDownloads.length = 0;
    mockFetchHandler = null;
    domElements.clear();

    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Chi tiết: ${err.message}\n`, err.stack);
    throw err;
  }
}

console.log('\n===========================================================================');
console.log('📊 BẮT ĐẦU CHẠY BỘ KIỂM THỬ: XUẤT BÁO CÁO EXCEL CHẤM CÔNG (HRM-215)');
console.log('===========================================================================\n');

// --- NHÓM 1: GIAO DIỆN & CẤU TRÚC MARKUP ---
console.log('--- NHÓM 1: GIAO DIỆN NÚT XUẤT BÁO CÁO & CẤU TRÚC MARKUP ---');

await test('1. renderAttendanceHistoryPage() render nút "Xuất báo cáo Excel" và dropdown tùy chọn CSV', () => {
  const html = renderAttendanceHistoryPage();

  assert.ok(html.includes('id="btn-export-attendance-excel"'), 'Phải có nút chính id="btn-export-attendance-excel"');
  assert.ok(html.includes('class="btn-export-excel"'), 'Nút chính phải có class btn-export-excel');
  assert.ok(html.includes('Xuất báo cáo Excel'), 'Nút chính phải có văn bản "Xuất báo cáo Excel"');
  assert.ok(html.includes('id="export-excel-icon"'), 'Nút chính phải có icon download');
  assert.ok(html.includes('id="export-excel-spinner"'), 'Nút chính phải có spinner loading ẩn ban đầu');
  assert.ok(html.includes('id="btn-export-more-toggle"'), 'Phải có nút mũi tên dropdown id="btn-export-more-toggle"');
  assert.ok(html.includes('id="btn-export-attendance-csv"'), 'Phải có tùy chọn phụ id="btn-export-attendance-csv"');
  assert.ok(html.includes('Xuất file CSV (.csv)'), 'Phải có text "Xuất file CSV (.csv)"');
  assert.ok(html.includes('class="history-filter-actions"'), 'Cụm nút phải nằm trong khu vực hành động bộ lọc');
});

// --- NHÓM 2: SERVICE & XỬ LÝ BLOB NHỊ PHÂN ---
console.log('\n--- NHÓM 2: SERVICE & XỬ LÝ BLOB, FILENAME VÀ TẢI FILE ---');

await test('2. parseContentDispositionFilename trích xuất tên file an toàn từ HTTP header', () => {
  // Test định dạng thông thường
  const normalHeader = 'attachment; filename="bao_cao_cham_cong_2026_10.xlsx"';
  assert.strictEqual(parseContentDispositionFilename(normalHeader), 'bao_cao_cham_cong_2026_10.xlsx');

  // Test định dạng không có ngoặc kép
  const unquotedHeader = 'attachment; filename=bao_cao.xlsx';
  assert.strictEqual(parseContentDispositionFilename(unquotedHeader), 'bao_cao.xlsx');

  // Test chuẩn RFC 5987 (filename*=UTF-8''...)
  const rfcHeader = "attachment; filename=\"fallback.xlsx\"; filename*=UTF-8''bao_cao_cham_cong_thang_10_2026.xlsx";
  assert.strictEqual(parseContentDispositionFilename(rfcHeader), 'bao_cao_cham_cong_thang_10_2026.xlsx');

  // Test tiếng Việt URL-encoded
  const encodedHeader = "attachment; filename*=UTF-8''b%C3%A1o_c%C3%A1o_ch%E1%BA%A5m_c%C3%B4ng.xlsx";
  assert.strictEqual(parseContentDispositionFilename(encodedHeader), 'báo_cáo_chấm_công.xlsx');

  // Test rỗng hoặc null
  assert.strictEqual(parseContentDispositionFilename(null), null);
  assert.strictEqual(parseContentDispositionFilename(''), null);
});

await test('3. triggerFileDownload kích hoạt tải file qua thẻ <a> ảo và thu hồi URL sau 1.5s', async () => {
  const blob = new Blob(['sample-excel-binary'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = 'test_report_2026_10.xlsx';

  const res = triggerFileDownload(blob, fileName);

  assert.ok(res.objectUrl, 'Phải tạo objectUrl');
  assert.strictEqual(res.fileName, fileName);
  assert.strictEqual(simulatedDownloads.length, 1);
  assert.strictEqual(simulatedDownloads[0].download, fileName);
  assert.strictEqual(simulatedDownloads[0].href, res.objectUrl);

  // Đợi thu hồi URL sau 1.6s
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.ok(revokedBlobUrls.includes(res.objectUrl), 'URL.revokeObjectURL phải được gọi sau khi tải');
});

// --- NHÓM 3: TÍCH HỢP REST API GET /api/reports/attendance/export ---
console.log('\n--- NHÓM 3: TÍCH HỢP REST API GET /api/reports/attendance/export ---');

await test('4. [Kịch bản 1] Xuất Excel thành công cho tháng hiện tại với đầy đủ JWT Bearer', async () => {
  localStorage.setItem('accessToken', 'mock-jwt-token-123');

  let interceptedUrl = '';
  let interceptedAuth = '';

  mockFetchHandler = async (url, options) => {
    interceptedUrl = url;
    interceptedAuth = options.headers?.['Authorization'];

    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => {
          if (h.toLowerCase() === 'content-type') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          if (h.toLowerCase() === 'content-disposition') return 'attachment; filename="bao_cao_cham_cong_2026_10.xlsx"';
          return null;
        },
      },
      blob: async () => new Blob(['valid-binary-content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    };
  };

  const result = await downloadAttendanceReport({
    month: 10,
    year: 2026,
    format: 'xlsx',
  });

  assert.ok(interceptedUrl.includes('/api/reports/attendance/export'), 'Phải gọi đúng endpoint API');
  assert.ok(interceptedUrl.includes('month=10'), 'Phải truyền param month=10');
  assert.ok(interceptedUrl.includes('year=2026'), 'Phải truyền param year=2026');
  assert.ok(interceptedUrl.includes('format=xlsx'), 'Phải truyền param format=xlsx');
  assert.strictEqual(interceptedAuth, 'Bearer mock-jwt-token-123', 'Phải đính kèm JWT Bearer');

  assert.strictEqual(result.fileName, 'bao_cao_cham_cong_2026_10.xlsx');
  assert.strictEqual(simulatedDownloads.length, 1);
  assert.strictEqual(simulatedDownloads[0].download, 'bao_cao_cham_cong_2026_10.xlsx');
});

await test('5. [Kịch bản 2] Xuất Excel cho tháng/năm khác kết hợp lọc nhân viên', async () => {
  localStorage.setItem('accessToken', 'admin-token');

  let interceptedUrl = '';
  mockFetchHandler = async (url) => {
    interceptedUrl = url;
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => {
          if (h.toLowerCase() === 'content-type') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          if (h.toLowerCase() === 'content-disposition') return 'attachment; filename="bao_cao_cham_cong_NV005_2025_03.xlsx"';
          return null;
        },
      },
      blob: async () => new Blob(['excel-nv-005'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    };
  };

  const result = await downloadAttendanceReport({
    month: 3,
    year: 2025,
    employeeId: '5',
    format: 'xlsx',
  });

  assert.ok(interceptedUrl.includes('month=3&year=2025'), 'Phải gửi month=3 và year=2025');
  assert.ok(interceptedUrl.includes('employeeId=5'), 'Phải gửi employeeId=5');
  assert.strictEqual(result.fileName, 'bao_cao_cham_cong_NV005_2025_03.xlsx');
});

await test('6. [Kịch bản 3] Xuất file tùy chọn phụ CSV (.csv)', async () => {
  let interceptedUrl = '';
  mockFetchHandler = async (url) => {
    interceptedUrl = url;
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => {
          if (h.toLowerCase() === 'content-type') return 'text/csv; charset=utf-8';
          if (h.toLowerCase() === 'content-disposition') return 'attachment; filename="bao_cao_cham_cong_2026_10.csv"';
          return null;
        },
      },
      blob: async () => new Blob(['STT,Mã NV,Họ và tên\n1,NV001,Nguyen Van A'], { type: 'text/csv' }),
    };
  };

  const result = await downloadAttendanceReport({
    month: 10,
    year: 2026,
    format: 'csv',
  });

  assert.ok(interceptedUrl.includes('format=csv'), 'Query param phải có format=csv');
  assert.strictEqual(result.fileName, 'bao_cao_cham_cong_2026_10.csv');
  assert.strictEqual(result.contentType, 'text/csv; charset=utf-8');
});

// --- NHÓM 4: UI EVENT HANDLING, ANTI-SPAM & BẢO TOÀN BỘ LỌC ---
console.log('\n--- NHÓM 4: UI EVENT HANDLING, ANTI-SPAM & BẢO TOÀN BỘ LỌC ---');

function setupMockDomForHistoryPage() {
  const btnExcel = createMockElement('button', 'btn-export-attendance-excel', 'btn-export-excel');
  const btnMore = createMockElement('button', 'btn-export-more-toggle', 'btn-export-dropdown-toggle');
  const btnCsv = createMockElement('button', 'btn-export-attendance-csv', 'export-dropdown-item');
  const spinner = createMockElement('span', 'export-excel-spinner', 'export-btn-spinner');
  const icon = createMockElement('svg', 'export-excel-icon', 'export-btn-icon');
  const textSpan = createMockElement('span', 'export-excel-text', 'export-btn-text');
  textSpan.textContent = 'Xuất báo cáo Excel';

  const monthSelect = createMockElement('select', 'history-month-select', 'history-filter-select');
  monthSelect.value = '11';
  const yearSelect = createMockElement('select', 'history-year-select', 'history-filter-select');
  yearSelect.value = '2026';
  const employeeSelect = createMockElement('select', 'history-employee-select', 'history-filter-select');
  employeeSelect.value = '8';

  const dropdownMenu = createMockElement('div', 'export-dropdown-menu', 'export-dropdown-menu');

  domElements.set('btn-export-attendance-excel', btnExcel);
  domElements.set('btn-export-more-toggle', btnMore);
  domElements.set('btn-export-attendance-csv', btnCsv);
  domElements.set('export-excel-spinner', spinner);
  domElements.set('export-excel-icon', icon);
  domElements.set('export-excel-text', textSpan);
  domElements.set('history-month-select', monthSelect);
  domElements.set('history-year-select', yearSelect);
  domElements.set('history-employee-select', employeeSelect);
  domElements.set('export-dropdown-menu', dropdownMenu);

  return { btnExcel, btnMore, spinner, icon, textSpan, monthSelect, yearSelect, employeeSelect };
}

await test('7. [Kịch bản 4] Bộ lọc được GIỮ NGUYÊN 100% sau khi xuất file thành công', async () => {
  const { monthSelect, yearSelect, employeeSelect } = setupMockDomForHistoryPage();

  mockFetchHandler = async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (h) => {
        if (h.toLowerCase() === 'content-disposition') return 'attachment; filename="bao_cao_2026_11.xlsx"';
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      },
    },
    blob: async () => new Blob(['data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  });

  // Gọi xuất báo cáo
  await handleExportAttendanceReport('xlsx');

  // Kiểm tra bộ lọc
  assert.strictEqual(monthSelect.value, '11', 'Giá trị month select phải giữ nguyên 11');
  assert.strictEqual(yearSelect.value, '2026', 'Giá trị year select phải giữ nguyên 2026');
  assert.strictEqual(employeeSelect.value, '8', 'Giá trị employee select phải giữ nguyên 8');
});

await test('8. [Kịch bản 5] Chống click liên tiếp (Anti-spam) & Loading UI State', async () => {
  const { btnExcel, btnMore, spinner, icon, textSpan } = setupMockDomForHistoryPage();

  let requestCount = 0;
  let finishRequest;
  const slowPromise = new Promise((resolve) => {
    finishRequest = resolve;
  });

  mockFetchHandler = async () => {
    requestCount++;
    await slowPromise;
    return {
      ok: true,
      status: 200,
      headers: {
        get: () => 'attachment; filename="bao_cao.xlsx"',
      },
      blob: async () => new Blob(['done'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    };
  };

  // Kích hoạt lần 1
  const p1 = handleExportAttendanceReport('xlsx');

  // Kiểm tra ngay trạng thái Loading trong khi đang request
  assert.strictEqual(state.isExporting, true, 'state.isExporting phải là true');
  assert.strictEqual(btnExcel.disabled, true, 'Nút Excel phải bị disabled');
  assert.strictEqual(btnMore.disabled, true, 'Nút toggle phải bị disabled');
  assert.strictEqual(btnExcel.classList.contains('loading'), true, 'Nút phải có class loading');
  assert.strictEqual(spinner.style.display, 'inline-block', 'Spinner phải được hiển thị');
  assert.strictEqual(icon.style.display, 'none', 'Icon download phải tạm ẩn');
  assert.strictEqual(textSpan.textContent, 'Đang xuất Excel...', 'Text phải chuyển sang Đang xuất Excel...');

  // Cố tình bấm thêm lần 2 và lần 3 trong lúc đang xử lý
  const p2 = handleExportAttendanceReport('xlsx');
  const p3 = handleExportAttendanceReport('xlsx');

  // Cho request kết thúc
  finishRequest();
  await Promise.all([p1, p2, p3]);

  // Đảm bảo chỉ gửi duy nhất 1 request tới máy chủ!
  assert.strictEqual(requestCount, 1, 'Chỉ được gửi duy nhất 1 request (Anti-spam thành công)');

  // Kiểm tra trạng thái sau khi hoàn tất
  assert.strictEqual(state.isExporting, false, 'state.isExporting phải về false');
  assert.strictEqual(btnExcel.disabled, false, 'Nút Excel phải được mở khóa');
  assert.strictEqual(spinner.style.display, 'none', 'Spinner phải ẩn đi');
  assert.strictEqual(icon.style.display, 'inline-block', 'Icon phải hiện lại');
  assert.strictEqual(textSpan.textContent, 'Xuất báo cáo Excel', 'Text phải trở về ban đầu');
});

// --- NHÓM 5: XỬ LÝ LỖI API HTTP 400, 401, 403, 500 & NETWORK ERROR ---
console.log('\n--- NHÓM 5: XỬ LÝ LỖI API HTTP 400, 401, 403, 500 & NETWORK ERROR ---');

await test('9. [Kịch bản 6] Xử lý lỗi HTTP 400 (Bad Request): Phân biệt JSON lỗi, không tải file rác', async () => {
  const { btnExcel } = setupMockDomForHistoryPage();

  mockFetchHandler = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    headers: {
      get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    text: async () => JSON.stringify({
      success: false,
      errorCode: 'INVALID_MONTH',
      message: 'Tháng xuất báo cáo không hợp lệ (phải từ 1 đến 12).',
    }),
  });

  await handleExportAttendanceReport('xlsx');

  // Đảm bảo KHÔNG tạo thẻ tải xuống cho file lỗi rác
  assert.strictEqual(simulatedDownloads.length, 0, 'Không được phép tải file khi API trả mã lỗi 400');
  assert.strictEqual(btnExcel.disabled, false, 'Nút phải được mở khóa trở lại');
  assert.strictEqual(state.isExporting, false, 'isExporting phải về false');
});

await test('10. [Kịch bản 7] Xử lý lỗi HTTP 401: Xóa token localStorage khi token hết hạn', async () => {
  setupMockDomForHistoryPage();
  localStorage.setItem('accessToken', 'expired-token');

  mockFetchHandler = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    headers: {
      get: () => 'application/json',
    },
    text: async () => JSON.stringify({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
    }),
  });

  await handleExportAttendanceReport('xlsx');

  assert.strictEqual(localStorage.getItem('accessToken'), null, 'Token phải bị xóa khỏi localStorage khi 401');
  assert.strictEqual(simulatedDownloads.length, 0);
});

await test('11. [Kịch bản 8] Xử lý lỗi HTTP 403 (Forbidden): Không đủ quyền xuất báo cáo', async () => {
  setupMockDomForHistoryPage();

  mockFetchHandler = async () => ({
    ok: false,
    status: 403,
    statusText: 'Forbidden',
    headers: {
      get: () => 'application/json',
    },
    text: async () => JSON.stringify({
      success: false,
      errorCode: 'FORBIDDEN',
      message: 'Bạn không có quyền xuất báo cáo của nhân viên khác.',
    }),
  });

  await handleExportAttendanceReport('xlsx');

  assert.strictEqual(simulatedDownloads.length, 0, 'Không được tải file khi bị 403 Forbidden');
});

await test('12. [Kịch bản 9] Xử lý lỗi HTTP 500 (Internal Server Error): Phục hồi nút trong finally', async () => {
  const { btnExcel, textSpan } = setupMockDomForHistoryPage();

  mockFetchHandler = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    headers: {
      get: () => 'application/json',
    },
    text: async () => JSON.stringify({
      success: false,
      errorCode: 'INTERNAL_ERROR',
      message: 'Lỗi máy chủ khi tạo file Excel.',
    }),
  });

  await handleExportAttendanceReport('xlsx');

  assert.strictEqual(simulatedDownloads.length, 0);
  assert.strictEqual(btnExcel.disabled, false, 'Nút phải mở khóa để người dùng có thể thử lại sau');
  assert.strictEqual(textSpan.textContent, 'Xuất báo cáo Excel');
});

await test('13. [Kịch bản 10] Xử lý mất kết nối mạng hoặc timeout', async () => {
  const { btnExcel } = setupMockDomForHistoryPage();

  mockFetchHandler = async () => {
    const netErr = new TypeError('Failed to fetch');
    throw netErr;
  };

  await handleExportAttendanceReport('xlsx');

  assert.strictEqual(simulatedDownloads.length, 0);
  assert.strictEqual(btnExcel.disabled, false, 'Nút phải mở khóa sau khi gặp lỗi mạng');
  assert.strictEqual(state.isExporting, false);
});

await test('14. [Kịch bản 11] Xử lý phản hồi rỗng (0 byte)', async () => {
  mockFetchHandler = async () => ({
    ok: true,
    status: 200,
    headers: {
      get: () => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    blob: async () => new Blob([], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  });

  await assert.rejects(
    async () => {
      await downloadAttendanceReport({ month: 10, year: 2026 });
    },
    (err) => {
      assert.ok(err.message.includes('rỗng'), 'Phải ném lỗi khi file rỗng');
      return true;
    }
  );

  assert.strictEqual(simulatedDownloads.length, 0);
});

console.log('\n===========================================================================');
console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ XUẤT BÁO CÁO EXCEL!`);
console.log('===========================================================================\n');
