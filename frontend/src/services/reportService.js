/**
 * SERVICE: REPORT SERVICE (Dịch vụ xuất báo cáo)
 * Kết nối API xuất báo cáo chấm công GET /api/reports/attendance/export
 * Xử lý tải file mượt mà qua Blob, phân tích tên file từ Content-Disposition, thu hồi URL an toàn
 */

import { requestBlob, parseContentDispositionFilename } from './api.js';

/**
 * Trình kích hoạt tải file xuống trình duyệt thông qua thẻ <a> ảo và dọn dẹp an toàn
 * @param {Blob} blob - Dữ liệu file nhị phân
 * @param {string} fileName - Tên file tải xuống
 * @returns {{ objectUrl: string, fileName: string }}
 */
export function triggerFileDownload(blob, fileName) {
  if (!blob) {
    throw new Error('Không thể tải file: Dữ liệu Blob không tồn tại.');
  }

  const urlCreator =
    (typeof window !== 'undefined' && (window.URL || window.webkitURL)) ||
    (typeof globalThis !== 'undefined' && (globalThis.URL || globalThis.webkitURL)) ||
    null;

  if (!urlCreator || typeof urlCreator.createObjectURL !== 'function') {
    throw new Error('Môi trường hiện tại không hỗ trợ API URL.createObjectURL.');
  }

  const objectUrl = urlCreator.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', fileName || 'bao_cao_cham_cong.xlsx');
  link.style.display = 'none';

  if (document.body && typeof document.body.appendChild === 'function') {
    document.body.appendChild(link);
  }

  if (typeof link.click === 'function') {
    link.click();
  }

  // Dọn dẹp DOM ngay và thu hồi Object URL sau khoảng thời gian an toàn (1.5 giây)
  // để bảo đảm luồng download của trình duyệt đã nhận file mà không gây rò rỉ bộ nhớ
  setTimeout(() => {
    if (link.parentNode && typeof link.parentNode.removeChild === 'function') {
      link.parentNode.removeChild(link);
    }
    if (typeof urlCreator.revokeObjectURL === 'function') {
      urlCreator.revokeObjectURL(objectUrl);
    }
  }, 1500);

  return { objectUrl, fileName };
}

/**
 * Gọi API lấy dữ liệu file báo cáo chấm công (dạng Blob)
 * @param {object} params
 * @param {number|string} params.month - Tháng cần xuất (1 - 12)
 * @param {number|string} params.year - Năm cần xuất (1900 - 2100)
 * @param {string|number} [params.departmentId] - ID phòng ban lọc (tùy chọn)
 * @param {string|number} [params.employeeId] - ID nhân viên lọc (tùy chọn)
 * @param {string} [params.fromDate] - Ngày bắt đầu YYYY-MM-DD
 * @param {string} [params.toDate] - Ngày kết thúc YYYY-MM-DD
 * @param {'xlsx'|'csv'} [params.format='xlsx'] - Định dạng file ('xlsx' hoặc 'csv')
 * @returns {Promise<{ blob: Blob, fileName: string, contentType: string, size: number }>}
 */
export async function getAttendanceReportBlob(params = {}) {
  const {
    month,
    year,
    departmentId,
    employeeId,
    fromDate,
    toDate,
    format = 'xlsx',
  } = params;

  const queryParams = new URLSearchParams();

  if (month !== undefined && month !== null && month !== '') {
    queryParams.set('month', String(month));
  }
  if (year !== undefined && year !== null && year !== '') {
    queryParams.set('year', String(year));
  }
  if (departmentId && departmentId !== 'all') {
    queryParams.set('departmentId', String(departmentId));
  }
  if (employeeId && employeeId !== 'all') {
    queryParams.set('employeeId', String(employeeId));
  }
  if (fromDate) {
    queryParams.set('fromDate', String(fromDate));
  }
  if (toDate) {
    queryParams.set('toDate', String(toDate));
  }

  const normalizedFormat = format === 'csv' ? 'csv' : 'xlsx';
  queryParams.set('format', normalizedFormat);

  const endpoint = `/reports/attendance/export?${queryParams.toString()}`;
  const result = await requestBlob(endpoint, { method: 'GET' });

  // Xác định tên file dự phòng nếu Header Content-Disposition không trả về tên file
  const ext = normalizedFormat;
  const fallbackMonth = month ? String(month).padStart(2, '0') : '';
  const fallbackYear = year ? String(year) : '';
  const fallbackName =
    fallbackYear && fallbackMonth
      ? `bao_cao_cham_cong_${fallbackYear}_${fallbackMonth}.${ext}`
      : `bao_cao_cham_cong.${ext}`;

  const fileName = result.fileName || fallbackName;

  return {
    blob: result.blob,
    fileName,
    contentType: result.contentType,
    size: result.blob.size || 0,
  };
}

/**
 * Tải xuống báo cáo chấm công (gọi API + kích hoạt download + dọn dẹp bộ nhớ)
 * @param {object} params
 * @returns {Promise<{ blob: Blob, fileName: string, size: number, contentType: string }>}
 */
export async function downloadAttendanceReport(params = {}) {
  const fileData = await getAttendanceReportBlob(params);
  triggerFileDownload(fileData.blob, fileData.fileName);
  return fileData;
}

export const reportService = {
  getAttendanceReportBlob,
  downloadAttendanceReport,
  triggerFileDownload,
  parseContentDispositionFilename,
};

export default reportService;
