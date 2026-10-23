import dotenv from 'dotenv';

// Tải biến môi trường từ file .env
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Kiểm tra bảo mật JWT Secret khi chạy trên Production
const jwtSecret = process.env.JWT_SECRET || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE';
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('SUPER_SECURE'))) {
  console.warn('⚠️ [CẢNH BÁO BẢO MẬT]: Ứng dụng đang chạy ở chế độ PRODUCTION nhưng chưa cấu hình JWT_SECRET ngẫu nhiên mạnh mẽ trong .env!');
}

export const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT) || 3005,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Database settings
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'hrm_db',
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: Number(process.env.DB_QUEUE_LIMIT) || 0,
  },

  // Security & Authentication
  aesSecretKey: process.env.DB_AES_SECRET_KEY || 'ICTU_HRM_SECRET_KEY_2026_AES256',
  cccdEncryptionKey: process.env.CCCD_ENCRYPTION_KEY || process.env.DB_AES_SECRET_KEY || (isProduction ? '' : 'ICTU_HRM_SECRET_KEY_2026_AES256'),
  cccdHmacSecret: process.env.CCCD_HMAC_SECRET || (isProduction ? '' : 'ICTU_HRM_CCCD_HMAC_SECRET_2026_KEY'),
  jwtSecret,
  JWT_SECRET: jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  isProduction,
};

export default env;
