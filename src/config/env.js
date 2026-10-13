import dotenv from 'dotenv';

// Tải biến môi trường từ file .env
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
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

  // Security
  aesSecretKey: process.env.DB_AES_SECRET_KEY || 'ICTU_HRM_SECRET_KEY_2026_AES256',
  jwtSecret: process.env.JWT_SECRET || 'ICTU_HRM_JWT_SECRET_KEY_2026_SUPER_SECURE',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  isProduction: process.env.NODE_ENV === 'production',
};
