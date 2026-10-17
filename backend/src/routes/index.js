import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import rbacDemoRoutes from './rbacDemoRoutes.js';
import departmentRoutes from './departmentRoutes.js';
import employeeRoutes from './employeeRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import reportRoutes from './reportRoutes.js';
import { metricsHandler } from '../utils/metrics.js';

const router = Router();

// Gắn các nhóm routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/rbac', rbacDemoRoutes);
router.use('/departments', departmentRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendances', attendanceRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.get('/metrics', metricsHandler);

// Thông tin API Root
router.get('/', (req, res) => {
  res.json({
    service: 'HRM Backend API Service',
    version: '1.0.0',
    documentation: '/docs',
    endpoints: {
      appHealth: '/api/health',
      dbHealth: '/api/health/db',
      metrics: '/metrics',
      authLogin: '/api/auth/login',
      authProfile: '/api/auth/profile',
      dashboardStats: '/api/dashboard/stats',
      departments: '/api/departments',
      departmentStatistics: '/api/departments/statistics',
      employees: '/api/employees',
      attendanceCheckIn: '/api/attendance/check-in',
      attendanceCheckOut: '/api/attendance/check-out',
      attendanceToday: '/api/attendance/today',
      attendanceHistory: '/api/attendance/history',
      attendanceExport: '/api/reports/attendance/export',
      rbacAdminUsers: '/api/rbac/admin/users',
      rbacHrEmployees: '/api/rbac/hr/employees',
      rbacEmployeeAttendance: '/api/rbac/employees/:id/attendances',
    },
    status: 'ONLINE',
  });
});

export default router;
