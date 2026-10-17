/**
 * ==============================================================================
 * HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
 * PROMETHEUS METRICS INSTRUMENTATION (prom-client)
 * ==============================================================================
 * Cung cấp:
 * 1. Default Metrics: Node.js runtime (CPU, Memory Heap/RSS, Event Loop lag, GC)
 * 2. HTTP Metrics: http_requests_total, http_request_duration_seconds
 * 3. App Info: hrm_app_info (version, environment)
 * 4. Endpoint: GET /metrics chuẩn định dạng text/plain; version=0.0.4
 * ==============================================================================
 */

import client from 'prom-client';

// 1. Khởi tạo Prometheus Registry riêng biệt
const register = new client.Registry();

// Gắn nhãn mặc định cho toàn bộ metrics xuất bản từ HRM API
register.setDefaultLabels({
  app: 'hrm-backend-api',
});

// 2. Kích hoạt thu thập Default Metrics từ Node.js V8 runtime
client.collectDefaultMetrics({
  register,
  prefix: 'nodejs_',
});

// 3. Định nghĩa Custom Metrics đo lường lưu lượng HTTP
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Tổng số HTTP requests tiếp nhận bởi HRM Backend API',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý HTTP request (giây) của HRM Backend API',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const hrmAppInfo = new client.Gauge({
  name: 'hrm_app_info',
  help: 'Thông tin phiên bản và môi trường hoạt động của ứng dụng HRM',
  labelNames: ['version', 'environment'],
  registers: [register],
});

// Đặt giá trị 1 cho nhãn ứng dụng
hrmAppInfo.set(
  {
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
  },
  1
);

/**
 * Express Middleware tự động ghi nhận request duration và đếm số requests
 */
export const metricsMiddleware = (req, res, next) => {
  // Bỏ qua chính endpoint /metrics để tránh vòng lặp tự đếm khi Prometheus scrape
  if (req.path === '/metrics' || req.path === '/api/metrics') {
    return next();
  }

  const startHrTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNano = process.hrtime.bigint() - startHrTime;
    const durationSec = Number(elapsedNano) / 1e9;

    const route = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    const labels = {
      method: req.method,
      route: route || req.path,
      status_code: res.statusCode.toString(),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
  });

  next();
};

/**
 * Controller phục vụ Prometheus scrape metrics
 */
export const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metricsData = await register.metrics();
    res.end(metricsData);
  } catch (err) {
    res.status(500).end(err.message);
  }
};

export { register };
