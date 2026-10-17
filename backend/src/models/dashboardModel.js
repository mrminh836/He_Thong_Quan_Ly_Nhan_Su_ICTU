/**
 * Model Dashboard (Facade xuất phát từ Repository theo quy ước kiến trúc dự án HRM)
 */
import dashboardRepository from '../repositories/dashboardRepository.js';

export const countActiveEmployees = dashboardRepository.countActiveEmployees;
export const countActiveDepartments = dashboardRepository.countActiveDepartments;
export const countPresentEmployees = dashboardRepository.countPresentEmployees;
export const getDashboardStats = dashboardRepository.getDashboardStats;

export default dashboardRepository;
