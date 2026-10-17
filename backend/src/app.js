import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger } from './middlewares/logger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { metricsMiddleware, metricsHandler } from './utils/metrics.js';
import apiRoutes from './routes/index.js';

const app = express();

// Kích hoạt trust proxy khi chạy sau Nginx Reverse Proxy
app.set('trust proxy', true);

// 1. Cấu hình bảo mật CORS theo môi trường
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
);

// 2. Bảo mật HTTP Headers & Vô hiệu hóa X-Powered-By
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// 3. Prometheus Metrics Middleware (Đo lường thời gian phản hồi & số lượng requests)
app.use(metricsMiddleware);

// 4. Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Request Logging
app.use(requestLogger);

// 6. Prometheus Metrics Scrape Endpoint
app.get('/metrics', metricsHandler);

// 7. Khai báo Root redirect & API routes
app.get('/', (req, res) => {
  res.redirect('/api');
});

app.use('/api', apiRoutes);

// 6. Xử lý Route không tồn tại (404)
app.use(notFoundHandler);

// 7. Xử lý lỗi tập trung (Error Handler)
app.use(errorHandler);

export default app;
