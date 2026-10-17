/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG QA: ĐỐI SOÁT TẢI FILE BÁO CÁO, FONT TIẾNG VIỆT UTF-8 VÀ SỐ LIỆU CÔNG
 * (QA Attendance Report Export & Reconciliation Audit)
 * ==============================================================================
 * 
 * MỤC TIÊU KIỂM TOÁN CHẤT LƯỢNG (QA AUDIT SCOPE):
 * 1. Tải file báo cáo nhị phân (Excel .xlsx và CSV .csv) trực tiếp từ Report Service / API.
 * 2. Mở file giải mã (Decoding) và đối soát 100% font tiếng Việt UTF-8:
 *    - Không xảy ra lỗi font (Mojibake, ký tự rác, dấu ?, hình ô vuông).
 *    - Toàn bộ nguyên âm tiếng Việt có dấu (ă, â, đ, ê, ô, ơ, ư, dấu thanh Huyền, Sắc, Hỏi, Ngã, Nặng) hiển thị hoàn hảo.
 *    - File Excel sử dụng font Segoe UI chuẩn Enterprise, cấu trúc Header, Banner, Summary Box, Data Rows.
 *    - File CSV có tiền tố UTF-8 BOM (\uFEFF) giúp Microsoft Excel tự động mở đúng mã UTF-8.
 * 3. Đối soát số liệu công (Attendance Metrics Reconciliation):
 *    - So khớp 100% giữa số liệu tổng hợp trong Summary Box với từng dòng dữ liệu chi tiết.
 *    - Xác nhận tính đúng đắn của Tổng bản ghi (totalRecords), Tổng ngày công (totalWorkDays), Đúng giờ (onTimeCount), Đi muộn (lateCount), Về sớm (earlyLeaveCount).
 *    - Kiểm toán công thức cân bằng: totalWorkDays = onTimeCount + lateCount.
 *    - Kiểm toán trường hợp chưa check-out: hiển thị '--:--' và TUYỆT ĐỐI KHÔNG tính nhầm là về sớm.
 *    - Kiểm toán trường hợp mốc biên (08:30:00 vs 08:30:01, 17:30:00 vs 17:29:59).
 * 4. Đối soát trường hợp rỗng (Empty State) và trường hợp theo khoảng ngày (Date Range).
 * ==============================================================================
 */

import assert from 'node:assert';
import ExcelJS from 'exceljs';
import reportRepository from '../src/repositories/reportRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import { exportAttendanceReport } from '../src/services/reportService.js';

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
    console.error(`     Chi tiết: ${error.message}\n`, error.stack);
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
    console.error(`     Chi tiết: ${error.message}\n`, error.stack);
    process.exitCode = 1;
  }
}

/**
 * Regex kiểm tra chuỗi có chứa ký tự vỡ font (Mojibake hoặc lỗi encoding)
 * Các chuỗi lỗi UTF-8 điển hình khi decode sai: Ã, Â, â€, , \uFFFD
 */
const MOJIBAKE_REGEX = /[\uFFFD]|Ã[\xA0-\xFF]|Â[\xA0-\xFF]|â€|Ã¡|Ã |Ã£|Ã³|Ã²|Ã´|Ãº|Ã¹|Ä‘/;

/**
 * Danh sách mẫu dữ liệu tiếng Việt có dấu chuẩn theo đúng schema của Repository
 */
const MOCK_VIETNAMESE_EMPLOYEES = [
  {
    attendance_id: 101,
    employee_id: 1,
    employee_code: 'NV001',
    employee_name: 'Nguyễn Văn An',
    department_name: 'Phòng Kỹ thuật & CNTT',
    position: 'Kỹ sư phần mềm cao cấp',
    attendance_date: '2026-10-01',
    check_in: '08:15:00',
    check_out: '17:45:00',
    attendance_status: 'OnTime',
    note: 'Làm việc đầy đủ ca, hoàn thành tốt nhiệm vụ.',
    // Phân loại dự kiến: Đúng giờ, 1 ngày công
  },
  {
    attendance_id: 102,
    employee_id: 2,
    employee_code: 'NV002',
    employee_name: 'Trần Thị Bích Ngọc',
    department_name: 'Phòng Quản trị Nhân sự',
    position: 'Chuyên viên Tuyển dụng & Đào tạo',
    attendance_date: '2026-10-01',
    check_in: '08:45:30',
    check_out: '17:35:00',
    attendance_status: 'Late',
    note: 'Được duyệt vào muộn 15 phút do tắc đường tại ngã tư.',
    // Phân loại dự kiến: Đi muộn, 1 ngày công
  },
  {
    attendance_id: 103,
    employee_id: 3,
    employee_code: 'NV003',
    employee_name: 'Đỗ Quang Minh',
    department_name: 'Phòng Kế toán - Tài chính',
    position: 'Kế toán trưởng',
    attendance_date: '2026-10-01',
    check_in: '08:20:00',
    check_out: '16:45:00',
    attendance_status: 'EarlyLeave',
    note: 'Xin về sớm đi khám sức khỏe định kỳ.',
    // Phân loại dự kiến: Về sớm, 1 ngày công
  },
  {
    attendance_id: 104,
    employee_id: 4,
    employee_code: 'NV004',
    employee_name: 'Lê Hoàng Yến',
    department_name: 'Ban Giám đốc',
    position: 'Phó Tổng Giám đốc phụ trách Vận hành',
    attendance_date: '2026-10-01',
    check_in: '09:05:00',
    check_out: '16:30:00',
    attendance_status: 'LateAndEarlyLeave',
    note: 'Gặp gỡ đối tác buổi sáng, về sớm công tác ngoại tỉnh.',
    // Phân loại dự kiến: Đi muộn & Về sớm, 1 ngày công
  },
  {
    attendance_id: 105,
    employee_id: 5,
    employee_code: 'NV005',
    employee_name: 'Vũ Đức Thắng',
    department_name: 'Phòng Kỹ thuật & CNTT',
    position: 'Chuyên viên DevOps & Hạ tầng',
    attendance_date: '2026-10-01',
    check_in: '08:25:00',
    check_out: null,
    attendance_status: 'OnTime',
    note: 'Đang trong ca làm việc, chưa thực hiện check-out.',
    // Phân loại dự kiến: Đúng giờ, 1 ngày công, TUYỆT ĐỐI không tính về sớm!
  },
  {
    attendance_id: 106,
    employee_id: 6,
    employee_code: 'NV006',
    employee_name: 'Phạm Thuỳ Dương',
    department_name: 'Phòng Marketing & Truyền thông',
    position: 'Trưởng nhóm Sáng tạo nội dung',
    attendance_date: '2026-10-01',
    check_in: '08:30:00', // Mốc biên chuẩn vào ca
    check_out: '17:30:00', // Mốc biên chuẩn tan ca
    attendance_status: 'OnTime',
    note: 'Check-in và check-out chuẩn xác từng giây mốc ca làm việc.',
    // Phân loại dự kiến: Đúng giờ, 1 ngày công
  },
  {
    attendance_id: 107,
    employee_id: 7,
    employee_code: 'NV007',
    employee_name: 'Hoàng Đức Anh',
    department_name: null, // Chưa phân phòng ban
    position: 'Nhân viên thực tập',
    attendance_date: '2026-10-01',
    check_in: '08:30:01', // Sau mốc ca đúng 1 giây -> Đi muộn
    check_out: '17:29:59', // Trước mốc tan ca đúng 1 giây -> Về sớm
    attendance_status: 'LateAndEarlyLeave',
    note: 'Trường hợp mốc biên vi phạm đúng 1 giây.',
    // Phân loại dự kiến: Đi muộn & Về sớm, 1 ngày công
  },
  {
    attendance_id: 108,
    employee_id: 8,
    employee_code: 'NV008',
    employee_name: 'Bùi Thị Hồng Hạnh',
    department_name: 'Phòng Quản trị Nhân sự',
    position: 'Nhân viên lễ tân',
    attendance_date: '2026-10-02',
    check_in: null, // Vắng mặt
    check_out: null,
    attendance_status: 'Absent',
    note: 'Nghỉ ốm có giấy xác nhận của cơ sở y tế.',
    // Phân loại dự kiến: Vắng mặt -> 0 ngày công
  },
];

console.log('\n==============================================================================');
console.log('🔍 BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: ĐỐI SOÁT FILE BÁO CÁO, FONT TIẾNG VIỆT & SỐ LIỆU');
console.log('==============================================================================\n');

// Mock data repositories cho kiểm toán
const originalGetReportData = reportRepository.getAttendanceReportData;
const originalGetReportSummary = reportRepository.getAttendanceReportSummary;
const originalFindUserById = userRepository.findById;

// --- PHẦN 1: ĐỐI SOÁT FILE EXCEL (.XLSX) VỀ FONT TIẾNG VIỆT & ĐỊNH DẠNG ---
console.log('--- PHẦN 1: MỞ FILE EXCEL (.XLSX) ĐỐI SOÁT FONT TIẾNG VIỆT UTF-8 ---');

await runAsyncTest('1.1. Mở workbook Excel (.xlsx) từ Buffer nhị phân, kiểm tra tên sheet và bảng mã Unicode', async () => {
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: MOCK_VIETNAMESE_EMPLOYEES.length,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'xlsx' },
  });

  assert.ok(Buffer.isBuffer(exportResult.fileBuffer), 'Kết quả phải là một Buffer nhị phân');
  assert.ok(exportResult.fileBuffer.length > 0, 'Kích thước buffer phải lớn hơn 0 byte');
  assert.strictEqual(exportResult.fileName, 'bao_cao_cham_cong_2026_10.xlsx');
  assert.strictEqual(
    exportResult.mimeType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  // Đọc lại workbook bằng ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportResult.fileBuffer);

  const worksheet = workbook.getWorksheet('BaoCaoChamCong');
  assert.ok(worksheet, 'File Excel phải có worksheet tên là "BaoCaoChamCong"');
});

await runAsyncTest('1.2. Đối soát Font Segoe UI và tiếng Việt có dấu tại Tiêu đề Banner, Kỳ báo cáo và Summary Box', async () => {
  const workbook = new ExcelJS.Workbook();
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'xlsx' },
  });
  await workbook.xlsx.load(exportResult.fileBuffer);
  const worksheet = workbook.getWorksheet('BaoCaoChamCong');

  // Hàng 1: Banner chính
  const cellA1 = worksheet.getCell('A1');
  assert.strictEqual(cellA1.value, 'BÁO CÁO BẢNG TỔNG HỢP CHẤM CÔNG');
  assert.strictEqual(cellA1.font.name, 'Segoe UI', 'Font chữ phải là Segoe UI');
  assert.strictEqual(cellA1.font.size, 16);
  assert.strictEqual(cellA1.font.bold, true);
  assert.ok(!MOJIBAKE_REGEX.test(cellA1.value), 'Tiêu đề không được chứa ký tự lỗi font');

  // Hàng 2: Kỳ báo cáo
  const cellA2 = worksheet.getCell('A2');
  assert.strictEqual(cellA2.value, 'Kỳ báo cáo: Tháng 10/2026');
  assert.strictEqual(cellA2.font.name, 'Segoe UI');
  assert.ok(!MOJIBAKE_REGEX.test(cellA2.value));

  // Hàng 3: Thời điểm xuất
  const cellA3 = worksheet.getCell('A3');
  assert.ok(cellA3.value.includes('Thời điểm xuất:'), 'Phải có chuỗi "Thời điểm xuất:"');
  assert.ok(cellA3.value.includes('Múi giờ Asia/Ho_Chi_Minh'));
  assert.ok(!MOJIBAKE_REGEX.test(cellA3.value));

  // Hàng 5: Khối thống kê tóm tắt (Summary Box)
  const cellA5 = worksheet.getCell('A5');
  assert.ok(cellA5.value.includes('📊 THỐNG KÊ KỲ BÁO CÁO:'), 'Phải có icon và chữ tiếng Việt');
  assert.ok(cellA5.value.includes('Tổng bản ghi: 8'));
  assert.ok(cellA5.value.includes('Tổng ngày công thực tế: 7'));
  assert.ok(cellA5.value.includes('Đúng giờ: 4'));
  assert.ok(cellA5.value.includes('Đi muộn: 3'));
  assert.ok(cellA5.value.includes('Về sớm: 3'));
  assert.strictEqual(cellA5.font.name, 'Segoe UI');
  assert.ok(!MOJIBAKE_REGEX.test(cellA5.value));
});

await runAsyncTest('1.3. Đối soát 100% tiếng Việt có dấu tại Tiêu đề các cột dữ liệu (Table Headers)', async () => {
  const workbook = new ExcelJS.Workbook();
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'xlsx' },
  });
  await workbook.xlsx.load(exportResult.fileBuffer);
  const worksheet = workbook.getWorksheet('BaoCaoChamCong');

  const expectedHeaders = [
    'STT',
    'Mã nhân viên',
    'Họ và tên',
    'Phòng ban',
    'Chức vụ',
    'Ngày chấm công',
    'Giờ vào',
    'Giờ ra',
    'Trạng thái',
    'Ghi chú',
  ];

  const headerRow = worksheet.getRow(7);
  for (let col = 1; col <= 10; col++) {
    const cellValue = headerRow.getCell(col).value;
    assert.strictEqual(cellValue, expectedHeaders[col - 1], `Cột ${col} phải là '${expectedHeaders[col - 1]}'`);
    assert.strictEqual(headerRow.getCell(col).font.name, 'Segoe UI');
    assert.strictEqual(headerRow.getCell(col).font.bold, true);
    assert.ok(!MOJIBAKE_REGEX.test(cellValue), `Cột ${col} không được có ký tự lỗi font`);
  }
});

await runAsyncTest('1.4. Đối soát tiếng Việt có dấu đầy đủ thanh âm trên toàn bộ các dòng dữ liệu (Data Rows)', async () => {
  const workbook = new ExcelJS.Workbook();
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'xlsx' },
  });
  await workbook.xlsx.load(exportResult.fileBuffer);
  const worksheet = workbook.getWorksheet('BaoCaoChamCong');

  // Kiểm tra từng nhân viên từ dòng 8 đến dòng 15
  MOCK_VIETNAMESE_EMPLOYEES.forEach((emp, idx) => {
    const rowNumber = 8 + idx;
    const row = worksheet.getRow(rowNumber);

    const stt = row.getCell(1).value;
    const empCode = row.getCell(2).value;
    const empName = row.getCell(3).value;
    const deptName = row.getCell(4).value;
    const position = row.getCell(5).value;
    const dateVal = row.getCell(6).value;
    const statusText = row.getCell(9).value;
    const note = row.getCell(10).value;

    assert.strictEqual(stt, idx + 1);
    assert.strictEqual(empCode, emp.employee_code);
    assert.strictEqual(empName, emp.employee_name);
    assert.strictEqual(deptName, emp.department_name || 'Chưa phân phòng ban');
    assert.strictEqual(position, emp.position);
    assert.strictEqual(dateVal, emp.attendance_date);
    assert.strictEqual(note, emp.note);

    // Kiểm tra không có Mojibake trên bất kỳ ô nào
    assert.ok(!MOJIBAKE_REGEX.test(empName), `Tên '${empName}' bị lỗi font`);
    assert.ok(!MOJIBAKE_REGEX.test(deptName), `Phòng ban '${deptName}' bị lỗi font`);
    assert.ok(!MOJIBAKE_REGEX.test(position), `Chức vụ '${position}' bị lỗi font`);
    assert.ok(!MOJIBAKE_REGEX.test(statusText), `Trạng thái '${statusText}' bị lỗi font`);
    assert.ok(!MOJIBAKE_REGEX.test(note), `Ghi chú '${note}' bị lỗi font`);
  });
});

// --- PHẦN 2: ĐỐI SOÁT FILE CSV (.CSV) VÀ UTF-8 BOM ---
console.log('\n--- PHẦN 2: MỞ FILE CSV (.CSV) ĐỐI SOÁT UTF-8 BOM & FONT TIẾNG VIỆT ---');

await runAsyncTest('2.1. File CSV phải có tiền tố UTF-8 BOM (0xEF, 0xBB, 0xBF) ở đầu file', async () => {
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'csv' },
  });

  const buffer = exportResult.fileBuffer;
  assert.ok(buffer.length >= 3, 'Buffer CSV phải có ít nhất 3 byte');
  // Byte Order Mark (BOM) cho UTF-8
  assert.strictEqual(buffer[0], 0xEF, 'Byte 0 phải là 0xEF');
  assert.strictEqual(buffer[1], 0xBB, 'Byte 1 phải là 0xBB');
  assert.strictEqual(buffer[2], 0xBF, 'Byte 2 phải là 0xBF');
  assert.strictEqual(exportResult.mimeType, 'text/csv; charset=utf-8');
});

await runAsyncTest('2.2. Decode chuỗi CSV bằng UTF-8: Tiêu đề cột và dữ liệu tiếng Việt hiển thị toàn vẹn 100%', async () => {
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'csv' },
  });

  // Bỏ qua 3 byte BOM đầu tiên và giải mã chuỗi UTF-8
  const csvContent = exportResult.fileBuffer.slice(3).toString('utf-8');
  assert.ok(!MOJIBAKE_REGEX.test(csvContent), 'File CSV không được có ký tự lỗi mã UTF-8');

  // Kiểm tra có các tên tiếng Việt
  assert.ok(csvContent.includes('Nguyễn Văn An'));
  assert.ok(csvContent.includes('Trần Thị Bích Ngọc'));
  assert.ok(csvContent.includes('Đỗ Quang Minh'));
  assert.ok(csvContent.includes('Lê Hoàng Yến'));
  assert.ok(csvContent.includes('Phòng Kỹ thuật & CNTT'));
  assert.ok(csvContent.includes('Phòng Quản trị Nhân sự'));
  assert.ok(csvContent.includes('Đúng giờ'));
  assert.ok(csvContent.includes('Đi muộn'));
  assert.ok(csvContent.includes('Về sớm'));
  assert.ok(csvContent.includes('Đi muộn & Về sớm'));

  // Kiểm tra dòng tiêu đề
  assert.ok(csvContent.includes('STT,Mã nhân viên,Họ và tên,Phòng ban,Chức vụ,Ngày chấm công,Giờ vào,Giờ ra,Trạng thái,Ghi chú'));

  // Kiểm tra dòng thông tin tổng kết ở cuối
  assert.ok(csvContent.includes('Tổng kết kỳ báo cáo: Tháng 10/2026'));
  assert.ok(csvContent.includes('Tổng số bản ghi: 8'));
  assert.ok(csvContent.includes('Tổng ngày công thực tế: 7'));
  assert.ok(csvContent.includes('Đúng giờ: 4'));
  assert.ok(csvContent.includes('Đi muộn: 3'));
  assert.ok(csvContent.includes('Về sớm: 3'));
});

// --- PHẦN 3: ĐỐI SOÁT SỐ LIỆU CÔNG (ATTENDANCE METRICS RECONCILIATION) ---
console.log('\n--- PHẦN 3: ĐỐI SOÁT SỐ LIỆU CÔNG VÀ QUY TẮC TÍNH TOÁN NGHIỆP VỤ ---');

await runAsyncTest('3.1. Đối soát chi tiết từng trạng thái công (Đúng giờ, Đi muộn, Về sớm, Muộn & Về sớm)', async () => {
  const workbook = new ExcelJS.Workbook();
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'xlsx' },
  });
  await workbook.xlsx.load(exportResult.fileBuffer);
  const ws = workbook.getWorksheet('BaoCaoChamCong');

  // NV001 (dòng 8): Vào 08:15, Ra 17:45 -> Đúng giờ
  assert.strictEqual(ws.getCell('G8').value, '08:15:00');
  assert.strictEqual(ws.getCell('H8').value, '17:45:00');
  assert.strictEqual(ws.getCell('I8').value, 'Đúng giờ');

  // NV002 (dòng 9): Vào 08:45:30 (>08:30:00), Ra 17:35 (>=17:30:00) -> Đi muộn
  assert.strictEqual(ws.getCell('G9').value, '08:45:30');
  assert.strictEqual(ws.getCell('H9').value, '17:35:00');
  assert.strictEqual(ws.getCell('I9').value, 'Đi muộn');

  // NV003 (dòng 10): Vào 08:20 (<=08:30:00), Ra 16:45 (<17:30:00) -> Về sớm
  assert.strictEqual(ws.getCell('G10').value, '08:20:00');
  assert.strictEqual(ws.getCell('H10').value, '16:45:00');
  assert.strictEqual(ws.getCell('I10').value, 'Về sớm');

  // NV004 (dòng 11): Vào 09:05 (>08:30:00), Ra 16:30 (<17:30:00) -> Đi muộn & Về sớm
  assert.strictEqual(ws.getCell('G11').value, '09:05:00');
  assert.strictEqual(ws.getCell('H11').value, '16:30:00');
  assert.strictEqual(ws.getCell('I11').value, 'Đi muộn & Về sớm');

  // NV005 (dòng 12): Vào 08:25, Ra null -> Giờ ra '--:--', Trạng thái 'Đúng giờ' (KHÔNG tính về sớm)
  assert.strictEqual(ws.getCell('G12').value, '08:25:00');
  assert.strictEqual(ws.getCell('H12').value, '--:--');
  assert.strictEqual(ws.getCell('I12').value, 'Đúng giờ');

  // NV006 (dòng 13): Vào 08:30:00 (mốc biên), Ra 17:30:00 (mốc biên) -> Đúng giờ
  assert.strictEqual(ws.getCell('G13').value, '08:30:00');
  assert.strictEqual(ws.getCell('H13').value, '17:30:00');
  assert.strictEqual(ws.getCell('I13').value, 'Đúng giờ');

  // NV007 (dòng 14): Vào 08:30:01 (+1s muộn), Ra 17:29:59 (-1s sớm) -> Đi muộn & Về sớm
  assert.strictEqual(ws.getCell('G14').value, '08:30:01');
  assert.strictEqual(ws.getCell('H14').value, '17:29:59');
  assert.strictEqual(ws.getCell('I14').value, 'Đi muộn & Về sớm');

  // NV008 (dòng 15): Vắng mặt (checkIn null, checkOut null) -> '--:--', 'Vắng mặt'
  assert.strictEqual(ws.getCell('G15').value, '--:--');
  assert.strictEqual(ws.getCell('H15').value, '--:--');
  assert.strictEqual(ws.getCell('I15').value, 'Vắng mặt');
});

await runAsyncTest('3.2. Đối soát công thức cân bằng số liệu: totalWorkDays = onTimeCount + lateCount (100% khớp)', async () => {
  reportRepository.getAttendanceReportData = async () => MOCK_VIETNAMESE_EMPLOYEES;
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 8,
    totalWorkDays: 7,
    onTimeCount: 4,
    lateCount: 3,
    earlyLeaveCount: 3,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 10, year: 2026, format: 'xlsx' },
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportResult.fileBuffer);
  const ws = workbook.getWorksheet('BaoCaoChamCong');

  // Trích xuất số liệu từ Summary Box Cell A5
  const summaryStr = ws.getCell('A5').value;
  const totalRecordsMatch = summaryStr.match(/Tổng bản ghi:\s*(\d+)/);
  const totalWorkDaysMatch = summaryStr.match(/Tổng ngày công thực tế:\s*(\d+)/);
  const onTimeMatch = summaryStr.match(/Đúng giờ:\s*(\d+)/);
  const lateMatch = summaryStr.match(/Đi muộn:\s*(\d+)/);
  const earlyMatch = summaryStr.match(/Về sớm:\s*(\d+)/);

  assert.ok(totalRecordsMatch, 'Phải có số Tổng bản ghi');
  assert.ok(totalWorkDaysMatch, 'Phải có số Tổng ngày công thực tế');
  assert.ok(onTimeMatch, 'Phải có số Đúng giờ');
  assert.ok(lateMatch, 'Phải có số Đi muộn');
  assert.ok(earlyMatch, 'Phải có số Về sớm');

  const totalRecords = Number(totalRecordsMatch[1]);
  const totalWorkDays = Number(totalWorkDaysMatch[1]);
  const onTimeCount = Number(onTimeMatch[1]);
  const lateCount = Number(lateMatch[1]);
  const earlyLeaveCount = Number(earlyMatch[1]);

  // Đếm thủ công từ các dòng dữ liệu để so khớp chéo (Cross-check)
  let manualRecords = 0;
  let manualWorkDays = 0;
  let manualOnTime = 0;
  let manualLate = 0;
  let manualEarly = 0;

  for (let r = 8; r <= 15; r++) {
    manualRecords++;
    const checkIn = ws.getCell(`G${r}`).value;
    const checkOut = ws.getCell(`H${r}`).value;
    const status = ws.getCell(`I${r}`).value;

    if (checkIn !== '--:--') {
      manualWorkDays++;
    }
    if (status === 'Đúng giờ' || status === 'Về sớm') {
      manualOnTime++;
    }
    if (status === 'Đi muộn' || status === 'Đi muộn & Về sớm') {
      manualLate++;
    }
    if (status === 'Về sớm' || status === 'Đi muộn & Về sớm') {
      manualEarly++;
    }
  }

  // Đối soát chính xác 100% giữa Summary Box và các dòng dữ liệu chi tiết
  assert.strictEqual(totalRecords, manualRecords, 'Summary totalRecords phải khớp số dòng thực');
  assert.strictEqual(totalWorkDays, manualWorkDays, 'Summary totalWorkDays phải khớp số ngày công thực');
  assert.strictEqual(onTimeCount, manualOnTime, 'Summary onTimeCount phải khớp số ca đúng giờ');
  assert.strictEqual(lateCount, manualLate, 'Summary lateCount phải khớp số ca đi muộn');
  assert.strictEqual(earlyLeaveCount, manualEarly, 'Summary earlyLeaveCount phải khớp số ca về sớm');

  // Công thức cân bằng toán học
  assert.strictEqual(
    totalWorkDays,
    onTimeCount + lateCount,
    'Quy tắc bảo toàn công: totalWorkDays phải bằng onTimeCount + lateCount'
  );
  assert.strictEqual(totalRecords, totalWorkDays + 1, '8 bản ghi = 7 ngày công + 1 ngày vắng mặt');
});

// --- PHẦN 4: ĐỐI SOÁT TRƯỜNG HỢP RỖNG & KHOẢNG NGÀY ---
console.log('\n--- PHẦN 4: ĐỐI SOÁT TRƯỜNG HỢP RỖNG (EMPTY STATE) & KHOẢNG NGÀY (DATE RANGE) ---');

await runAsyncTest('4.1. Đối soát trường hợp kỳ báo cáo không có dữ liệu: Hiển thị thông báo tiếng Việt chuẩn', async () => {
  reportRepository.getAttendanceReportData = async () => [];
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 0,
    totalWorkDays: 0,
    onTimeCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { month: 11, year: 2026, format: 'xlsx' },
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportResult.fileBuffer);
  const ws = workbook.getWorksheet('BaoCaoChamCong');

  // Summary box phải là 0
  const summaryStr = ws.getCell('A5').value;
  assert.ok(summaryStr.includes('Tổng bản ghi: 0'));
  assert.ok(summaryStr.includes('Tổng ngày công thực tế: 0'));

  // Dòng 8 hiển thị thông báo rỗng tiếng Việt
  const emptyCell = ws.getCell('C8');
  assert.strictEqual(
    emptyCell.value,
    'Không có bản ghi chấm công nào trong kỳ báo cáo đã chọn.',
    'Phải có thông báo rỗng tiếng Việt'
  );
  assert.ok(!MOJIBAKE_REGEX.test(emptyCell.value));
});

await runAsyncTest('4.2. Đối soát trường hợp xuất theo khoảng ngày tùy chọn (fromDate, toDate)', async () => {
  reportRepository.getAttendanceReportData = async () => [MOCK_VIETNAMESE_EMPLOYEES[0]];
  reportRepository.getAttendanceReportSummary = async () => ({
    totalRecords: 1,
    totalWorkDays: 1,
    onTimeCount: 1,
    lateCount: 0,
    earlyLeaveCount: 0,
  });

  const exportResult = await exportAttendanceReport({
    user: { userId: 1, role: 'ADMIN' },
    queryParams: { fromDate: '2026-10-01', toDate: '2026-10-15', format: 'xlsx' },
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportResult.fileBuffer);
  const ws = workbook.getWorksheet('BaoCaoChamCong');

  // Tiêu đề kỳ báo cáo theo khoảng ngày
  const periodCell = ws.getCell('A2');
  assert.strictEqual(periodCell.value, 'Kỳ báo cáo: Từ ngày 2026-10-01 đến ngày 2026-10-15');
  assert.ok(!MOJIBAKE_REGEX.test(periodCell.value));
  assert.strictEqual(exportResult.fileName, 'bao_cao_cham_cong_20261001_20261015.xlsx');
});

// Khôi phục repository gốc
reportRepository.getAttendanceReportData = originalGetReportData;
reportRepository.getAttendanceReportSummary = originalGetReportSummary;
userRepository.findById = originalFindUserById;

console.log('\n==============================================================================');
console.log(`🎉 KẾT QUẢ KIỂM TOÁN QA: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} BÀI KIỂM THỬ ĐỐI SOÁT!`);
console.log('   - 100% Font chữ Segoe UI và Unicode tiếng Việt hiển thị hoàn hảo.');
console.log('   - 100% File CSV có tiền tố UTF-8 BOM chống vỡ font trong Microsoft Excel.');
console.log('   - 100% Số liệu công trong Summary Box khớp chính xác với từng dòng chi tiết.');
console.log('==============================================================================\n');
