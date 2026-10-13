import { testConnection, query } from '../config/database.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Controller kiểm tra trạng thái sức khỏe dịch vụ Backend
 */
export async function getAppHealth(req, res) {
  const uptimeSeconds = Math.floor(process.uptime());

  return successResponse(res, {
    message: 'Hệ thống HRM Backend API đang hoạt động bình thường.',
    statusCode: 200,
    data: {
      status: 'UP',
      uptime: `${uptimeSeconds}s`,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Controller kiểm tra trạng thái kết nối cơ sở dữ liệu MySQL
 */
export async function getDbHealth(req, res) {
  try {
    // 1. Kiểm tra kết nối ping và độ trễ
    const dbInfo = await testConnection();

    // 2. Kiểm tra nhanh sự hiện diện của 4 bảng cốt lõi theo ERD
    let tableStats = [];
    try {
      const tables = await query(`
        SELECT TABLE_NAME, TABLE_ROWS 
        FROM information_schema.tables 
        WHERE TABLE_SCHEMA = ?
      `, [dbInfo.database]);
      tableStats = tables.map(t => ({
        tableName: t.TABLE_NAME,
        approximateRows: t.TABLE_ROWS,
      }));
    } catch {
      // Bỏ qua nếu user không có quyền trên information_schema
    }

    return successResponse(res, {
      message: 'Kết nối cơ sở dữ liệu MySQL 8.0 thành công và ổn định.',
      statusCode: 200,
      data: {
        databaseStatus: 'HEALTHY',
        databaseName: dbInfo.database,
        latencyMs: `${dbInfo.latencyMs}ms`,
        mysqlVersion: dbInfo.version,
        serverTime: dbInfo.serverTime,
        detectedTables: tableStats,
      },
    });
  } catch (error) {
    return errorResponse(res, {
      statusCode: 503, // Service Unavailable
      errorCode: 'DATABASE_UNAVAILABLE',
      message: 'Không thể kết nối hoặc truy vấn cơ sở dữ liệu MySQL.',
      details: process.env.NODE_ENV !== 'production' ? error.message : null,
    });
  }
}

export default {
  getAppHealth,
  getDbHealth,
};
