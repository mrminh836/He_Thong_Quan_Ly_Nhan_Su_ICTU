import DashboardPage from '../pages/DashboardPage.js';
import DepartmentsPage from '../pages/DepartmentsPage.js';
import EmployeesPage from '../pages/EmployeesPage.js';
import AttendancesPage from '../pages/AttendancesPage.js';
import UsersPage from '../pages/UsersPage.js';
import LoginPage from '../pages/LoginPage.js';
import NotFoundPage from '../pages/NotFoundPage.js';

import { renderAppLayout, initAppLayoutEvents } from '../layouts/AppLayout.js';
import { renderAuthLayout, initAuthLayoutEvents } from '../layouts/AuthLayout.js';

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
  },
  {
    path: '/departments',
    title: 'Quản lý phòng ban - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: DepartmentsPage,
  },
  {
    path: '/employees',
    title: 'Quản lý nhân viên - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: EmployeesPage,
  },
  {
    path: '/attendances',
    title: 'Quản lý chấm công - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: AttendancesPage,
  },
  {
    path: '/users',
    title: 'Quản lý tài khoản - HRM ICTU',
    layout: 'app',
    renderLayout: renderAppLayout,
    initLayoutEvents: initAppLayoutEvents,
    component: UsersPage,
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
