import { Router } from 'express';
import { getAppHealth, getDbHealth } from '../controllers/healthController.js';

const router = Router();

// Endpoint kiểm tra máy chủ ứng dụng: GET /api/health
router.get('/', getAppHealth);

// Endpoint kiểm tra kết nối CSDL MySQL: GET /api/health/db
router.get('/db', getDbHealth);

export default router;
