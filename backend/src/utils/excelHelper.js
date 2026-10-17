import ExcelJS from 'exceljs';

/**
 * TIỆN ÍCH TẠO WORKBOOK EXCEL CHO BÁO CÁO CHẤM CÔNG (EXCELJS)
 * Thiết kế giao diện báo cáo chuyên nghiệp theo phong cách Enterprise:
 * - Font chữ Segoe UI / Arial dễ nhìn.
 * - Header banner phân cấp rõ ràng.
 * - Bảng tóm tắt chỉ số nghiệp vụ (Summary metrics).
 * - Bảng dữ liệu có auto-filter, độ rộng cột tối ưu và zebra striping.
 * - Xuất trực tiếp sang Buffer trong bộ nhớ, không tạo file rác trên ổ đĩa.
 */

/**
 * Tạo Buffer file Excel (.xlsx) từ dữ liệu chấm công
 * 
 * @param {object} params
 * @param {string} params.periodTitle - Tiêu đề kỳ báo cáo (ví dụ: "Tháng 10/2026" hoặc "Từ 01/10/2026 đến 31/10/2026")
 * @param {string} params.exportTimeStr - Thời điểm xuất báo cáo
 * @param {object} params.summary - Các chỉ số thống kê { totalRecords, totalWorkDays, onTimeCount, lateCount, earlyLeaveCount }
 * @param {Array<object>} params.records - Danh sách các bản ghi chấm công chi tiết
 * @returns {Promise<Buffer>}
 */
export async function buildAttendanceExcelBuffer({
  periodTitle,
  exportTimeStr,
  summary,
  records = [],
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HRM Enterprise System';
  workbook.lastModifiedBy = 'HRM Backend Service';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('BaoCaoChamCong', {
    views: [{ showGridLines: true }],
  });

  // 1. Cấu hình độ rộng các cột
  worksheet.columns = [
    { key: 'stt', width: 8 },
    { key: 'empCode', width: 16 },
    { key: 'empName', width: 28 },
    { key: 'deptName', width: 24 },
    { key: 'position', width: 22 },
    { key: 'workDate', width: 16 },
    { key: 'checkIn', width: 14 },
    { key: 'checkOut', width: 14 },
    { key: 'status', width: 22 },
    { key: 'note', width: 32 },
  ];

  // 2. Banner tiêu đề báo cáo
  // Hàng 1: Tiêu đề chính
  const titleRow = worksheet.addRow(['BÁO CÁO BẢNG TỔNG HỢP CHẤM CÔNG']);
  worksheet.mergeCells('A1:J1');
  titleRow.height = 32;
  titleRow.getCell(1).font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Hàng 2: Kỳ báo cáo
  const periodRow = worksheet.addRow([`Kỳ báo cáo: ${periodTitle}`]);
  worksheet.mergeCells('A2:J2');
  periodRow.height = 20;
  periodRow.getCell(1).font = { name: 'Segoe UI', size: 11, italic: true, bold: true, color: { argb: 'FF334155' } };
  periodRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Hàng 3: Thời điểm xuất
  const timeRow = worksheet.addRow([`Thời điểm xuất: ${exportTimeStr} (Múi giờ Asia/Ho_Chi_Minh)`]);
  worksheet.mergeCells('A3:J3');
  timeRow.height = 18;
  timeRow.getCell(1).font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };
  timeRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Hàng 4: Trống
  worksheet.addRow([]);

  // Hàng 5: Khối thống kê tóm tắt chỉ số (Summary Box)
  const summaryText = `📊 THỐNG KÊ KỲ BÁO CÁO:  Tổng bản ghi: ${summary.totalRecords}   |   Tổng ngày công thực tế: ${summary.totalWorkDays}   |   Đúng giờ: ${summary.onTimeCount}   |   Đi muộn: ${summary.lateCount}   |   Về sớm: ${summary.earlyLeaveCount}`;
  const summaryRow = worksheet.addRow([summaryText]);
  worksheet.mergeCells('A5:J5');
  summaryRow.height = 24;
  const summaryCell = summaryRow.getCell(1);
  summaryCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  summaryCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  summaryCell.alignment = { vertical: 'middle', horizontal: 'center' };
  summaryCell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // Hàng 6: Trống
  worksheet.addRow([]);

  // Hàng 7: Tiêu đề các cột dữ liệu (Table Header)
  const headerValues = [
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
  const headerRow = worksheet.addRow(headerValues);
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E40AF' }, // Màu xanh Royal đậm chuẩn SaaS
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF93C5FD' } },
      left: { style: 'thin', color: { argb: 'FF93C5FD' } },
      bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
      right: { style: 'thin', color: { argb: 'FF93C5FD' } },
    };
  });

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // 3. Đổ dữ liệu các dòng
  if (records.length === 0) {
    const emptyRow = worksheet.addRow(['', '', 'Không có bản ghi chấm công nào trong kỳ báo cáo đã chọn.', '', '', '', '', '', '', '']);
    worksheet.mergeCells(`C8:H8`);
    emptyRow.height = 28;
    const emptyCell = emptyRow.getCell(3);
    emptyCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
  } else {
    records.forEach((rec, index) => {
      const isEven = index % 2 === 1;
      const dataRow = worksheet.addRow([
        index + 1,
        rec.employeeCode || '',
        rec.employeeName || '',
        rec.departmentName || 'Chưa phân phòng ban',
        rec.position || '',
        rec.attendanceDate || '',
        rec.checkIn || '--:--',
        rec.checkOut || '--:--',
        rec.statusText || 'Đúng giờ',
        rec.note || '',
      ]);

      dataRow.height = 22;

      // Căn lề từng cột
      dataRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; // STT
      dataRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }; // Mã NV
      dataRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };   // Họ tên
      dataRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' };   // Phòng ban
      dataRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'left' };   // Chức vụ
      dataRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' }; // Ngày
      dataRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' }; // Giờ vào
      dataRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' }; // Giờ ra
      dataRow.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' }; // Trạng thái
      dataRow.getCell(10).alignment = { vertical: 'middle', horizontal: 'left' };  // Ghi chú

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9.5 };
        cell.border = thinBorder;
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' }, // Zebra striping nhẹ
          };
        }

        // Tô màu nhẹ cho cột trạng thái
        if (colNumber === 9) {
          if (rec.statusText === 'Đi muộn') {
            cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFD97706' } }; // Màu cam hổ phách
          } else if (rec.statusText === 'Về sớm' || rec.statusText === 'Đi muộn & Về sớm') {
            cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } }; // Màu đỏ
          } else if (rec.statusText === 'Đúng giờ') {
            cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF059669' } }; // Màu xanh lá
          }
        }
      });
    });

    // Kích hoạt autoFilter cho vùng dữ liệu
    const lastRowIndex = 7 + records.length;
    worksheet.autoFilter = {
      from: 'A7',
      to: `J${lastRowIndex}`,
    };
  }

  // 4. Xuất Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export default {
  buildAttendanceExcelBuffer,
};
