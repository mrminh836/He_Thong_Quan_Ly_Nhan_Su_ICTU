import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import rbacDemoRoutes from './rbacDemoRoutes.js';
import departmentRoutes from './departmentRoutes.js';
import employeeRoutes from './employeeRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';

const router = Router();

// Gắn các nhóm routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/rbac', rbacDemoRoutes);
router.use('/departments', departmentRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendances', attendanceRoutes);

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
      departments: '/api/departments',
      departmentStatistics: '/api/departments/statistics',
      employees: '/api/employees',
      attendancesCheckIn: '/api/attendances/check-in',
      rbacAdminUsers: '/api/rbac/admin/users',
      rbacHrEmployees: '/api/rbac/hr/employees',
      rbacEmployeeAttendance: '/api/rbac/employees/:id/attendances',
    },
    status: 'ONLINE',
  });
});

export default router;
