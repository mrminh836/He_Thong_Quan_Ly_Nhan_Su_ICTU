/**
 * Model Employee (Facade xuất phát từ Repository theo quy ước dự án)
 */
import employeeRepository from '../repositories/employeeRepository.js';

export const findByCode = employeeRepository.findByCode;
export const findBySsnHash = employeeRepository.findBySsnHash;
export const findByEmail = employeeRepository.findByEmail;
export const findById = employeeRepository.findById;
export const findByIdWithDecryptedCccd = employeeRepository.findByIdWithDecryptedCccd;
export const generateNextEmployeeCode = employeeRepository.generateNextEmployeeCode;
export const create = employeeRepository.create;
export const deleteById = employeeRepository.deleteById;
export const findAll = employeeRepository.findAll;
export const countAll = employeeRepository.countAll;

export default employeeRepository;

