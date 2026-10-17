import { exportAttendanceReport, ReportServiceError } from '../services/reportService.js';
import { errorResponse } from '../utils/response.js';

/**
 * CONTROLLER: REPORT CONTROLLER
 * Tiếp nhận request và trả về file nhị phân (Buffer) cho người dùng tải về
 */

/**
 * Xuất báo cáo chấm công ra file Excel (.xlsx) hoặc CSV (.csv)
 * Endpoint: GET /api/reports/attendance/export
 */
export async function exportAttendance(req, res, next) {
  try {
    // 1. Kiểm tra xác thực token người dùng
    if (!req.user || !req.user.userId) {
      return errorResponse(res, {
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để thực hiện xuất báo cáo chấm công.',
      });
    }

    // 2. Gọi service xử lý nghiệp vụ và tạo file Buffer
    const result = await exportAttendanceReport({
      user: req.user,
      queryParams: req.query,
    });

    const { fileBuffer, fileName, mimeType } = result;

    // 3. Thiết lập HTTP Headers cho file download
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 4. Gửi nội dung file trực tiếp qua HTTP response (HTTP 200 OK)
    return res.status(200).send(fileBuffer);
  } catch (error) {
    if (error instanceof ReportServiceError) {
      return errorResponse(res, {
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        message: error.message,
      });
    }
    next(error);
  }
}

export default {
  exportAttendance,
};
