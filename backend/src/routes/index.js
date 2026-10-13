import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';

const router = Router();

// Gắn các nhóm routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Thông tin API Root
router.get('/', (req, res) => {
  res.json({
    service: 'HRM Backend API Service',
    version: '1.0.0',
    documentation: '/docs',
    endpoints: {
      appHealth: '/api/health',
      dbHealth: '/api/health/db',
      authLogin: '/api/auth/login',
      authProfile: '/api/auth/profile',
    },
    status: 'ONLINE',
  });
});

export default router;
