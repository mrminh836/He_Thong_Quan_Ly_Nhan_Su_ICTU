/**
 * Model Department (Facade xuất phát từ Repository theo quy ước dự án)
 */
import departmentRepository from '../repositories/departmentRepository.js';

export const findAll = departmentRepository.findAll;
export const findById = departmentRepository.findById;
export const findByName = departmentRepository.findByName;
export const findByCode = departmentRepository.findByCode;
export const create = departmentRepository.create;
export const update = departmentRepository.update;
export const deleteById = departmentRepository.deleteById;
export const softDeleteById = departmentRepository.softDeleteById;
export const countEmployeesByDepartmentId = departmentRepository.countEmployeesByDepartmentId;
export const getDepartmentEmployeeStats = departmentRepository.getDepartmentEmployeeStats;

export default departmentRepository;
