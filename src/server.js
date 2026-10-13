import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { testConnection, closePool } from './config/database.js';

const server = http.createServer(app);

/**
 * Khởi động máy chủ và kiểm tra kết nối CSDL
 */
async function startServer() {
  server.listen(env.PORT, () => {
    console.log('====================================================');
    console.log(`🚀 HRM Backend Service đã khởi chạy thành công!`);
    console.log(`📡 Môi trường (NODE_ENV) : ${env.NODE_ENV}`);
    console.log(`🌐 Cổng lắng nghe (PORT) : ${env.PORT}`);
    console.log(`🔗 API Base URL          : http://localhost:${env.PORT}/api`);
    console.log(`🩺 Healthcheck App       : http://localhost:${env.PORT}/api/health`);
    console.log(`🩺 Healthcheck MySQL     : http://localhost:${env.PORT}/api/health/db`);
    console.log('====================================================');
  });

  // Kiểm tra kết nối CSDL khi khởi động
  try {
    const dbInfo = await testConnection();
    console.log(`✅ [Database] Đã kết nối MySQL thành công tới schema [${dbInfo.database}] tại [${dbInfo.host}:${dbInfo.port}] (Độ trễ: ${dbInfo.latencyMs}ms)`);
  } catch (error) {
    console.warn(`⚠️ [Database] Chưa thể kết nối MySQL tại [${env.db.host}:${env.db.port}]: ${error.message}`);
    console.warn('   (Ứng dụng vẫn đang chạy; khi MySQL sẵn sàng, các endpoint API sẽ tự động kết nối lại)');
  }
}

/**
 * Xử lý dừng máy chủ an toàn (Graceful Shutdown)
 */
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang tiến hành dừng hệ thống an toàn...`);

  server.close(async () => {
    console.log('🚪 Đã dừng tiếp nhận các yêu cầu HTTP mới.');
    try {
      await closePool();
    } catch (err) {
      console.error('Lỗi khi đóng database pool:', err.message);
    }
    console.log('👋 Hệ thống đã dừng hoàn toàn.');
    process.exit(0);
  });

  // Cưỡng chế dừng nếu quá 10 giây
  setTimeout(() => {
    console.error('⏰ Quá thời gian chờ dừng (10s). Buộc dừng ứng dụng.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
