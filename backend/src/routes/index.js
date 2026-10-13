import { Router } from 'express';
import healthRoutes from './healthRoutes.js';

const router = Router();

// Gắn các nhóm routes
router.use('/health', healthRoutes);

// Thông tin API Root
router.get('/', (req, res) => {
  res.json({
    service: 'HRM Backend API Service',
    version: '1.0.0',
    documentation: '/docs',
    endpoints: {
      appHealth: '/api/health',
      dbHealth: '/api/health/db',
    },
    status: 'ONLINE',
  });
});

export default router;
