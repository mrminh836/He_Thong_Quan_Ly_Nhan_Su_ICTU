import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool = null;

/**
 * Khởi tạo hoặc lấy MySQL Connection Pool hiện hành (Singleton)
 * @returns {mysql.Pool}
 */
export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.name,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      queueLimit: env.db.queueLimit,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      timezone: '+07:00', // Đảm bảo khớp múi giờ Việt Nam (ICT)
      charset: 'utf8mb4',
    });

    pool.on('error', (err) => {
      console.error('[MySQL Pool Error]: Sự cố kết nối ngoài ý muốn:', err.message);
    });
  }
  return pool;
}

/**
 * Kiểm tra kết nối tới CSDL MySQL (Healthcheck & Latency measurement)
 * Không in mật khẩu hoặc thông tin nhạy cảm vào log
 * @returns {Promise<{ ok: boolean, latencyMs: number, database: string, host: string, serverTime: string, version: string }>}
 */
export async function testConnection() {
  const currentPool = getPool();
  const startTime = Date.now();

  let connection;
  try {
    connection = await currentPool.getConnection();
    const [rows] = await connection.query(`
      SELECT 
        1 AS ping, 
        CURRENT_TIMESTAMP() AS server_time, 
        VERSION() AS mysql_version,
        DATABASE() AS current_database
    `);

    const latencyMs = Date.now() - startTime;
    const info = rows[0] || {};

    return {
      ok: true,
      latencyMs,
      database: info.current_database || env.db.name,
      host: env.db.host,
      port: env.db.port,
      serverTime: info.server_time,
      version: info.mysql_version,
    };
  } catch (error) {
    // Chỉ ghi lại mã lỗi và thông điệp chung, không log connection string hoặc password
    console.error(`[MySQL Connect Error] [${error.code || 'UNKNOWN'}]: ${error.message}`);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Thực thi câu lệnh SQL có tham số (Parameterized Query) chống SQL Injection
 * @param {string} sql - Câu lệnh SQL
 * @param {Array} params - Mảng tham số truyền vào
 * @returns {Promise<any>}
 */
export async function query(sql, params = []) {
  const currentPool = getPool();
  const [results] = await currentPool.execute(sql, params);
  return results;
}

/**
 * Đóng an toàn Connection Pool khi dừng ứng dụng (Graceful Shutdown)
 */
export async function closePool() {
  if (pool) {
    console.log('[MySQL Pool] Đang đóng toàn bộ kết nối cơ sở dữ liệu...');
    await pool.end();
    pool = null;
    console.log('[MySQL Pool] Đã đóng kết nối thành công.');
  }
}

export default {
  getPool,
  testConnection,
  query,
  closePool,
};
