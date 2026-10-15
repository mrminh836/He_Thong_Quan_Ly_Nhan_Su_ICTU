import DashboardPage from '../pages/DashboardPage.js';
import DepartmentsPage from '../pages/DepartmentsPage.js';
import EmployeesPage from '../pages/EmployeesPage.js';
import AttendancesPage from '../pages/AttendancesPage.js';
import UsersPage from '../pages/UsersPage.js';
import LoginPage from '../pages/LoginPage.js';
import NotFoundPage from '../pages/NotFoundPage.js';

import { renderAppLayout, initAppLayoutEvents } from '../layouts/AppLayout.js';
import { renderAuthLayout, initAuthLayoutEvents } from '../layouts/AuthLayout.js';
import { ROLES } from '../utils/rbac.js';

export const routes = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/dashboard',
    title: 'Tổng quan - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: DashboardPage,
    allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.EMPLOYEE],
  },
  {
    path: '/departments',
    title: 'Quản lý phòng ban - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: DepartmentsPage,
    // Chỉ Admin và Quản lý nhân sự có quyền truy cập
    allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER],
  },
  {
    path: '/employees',
    title: 'Quản lý nhân viên - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: EmployeesPage,
    // Chỉ Admin và Quản lý nhân sự có quyền truy cập
    allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER],
  },
  {
    path: '/attendances',
    title: 'Quản lý chấm công - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: AttendancesPage,
    // Bảng chấm công toàn công ty chỉ dành cho Admin và Quản lý nhân sự
    allowedRoles: [ROLES.ADMIN, ROLES.HR_MANAGER],
  },
  {
    path: '/users',
    title: 'Quản lý tài khoản - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: UsersPage,
    // Chỉ Quản trị viên hệ thống có quyền truy cập
    allowedRoles: [ROLES.ADMIN],
  },

  {
    path: '/login',
    title: 'Đăng nhập - HRM ICTU',
    layout: 'auth',
    renderLayout: renderAuthLayout,
    initLayoutEvents: initAuthLayoutEvents,
    component: LoginPage,
  },
  {
    path: '*',
    title: '404 - Không tìm thấy trang',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: NotFoundPage,
  },
];

export default routes;
