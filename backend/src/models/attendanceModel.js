/**
 * Model Attendance (Facade xuất phát từ Repository theo quy ước dự án)
 */
import attendanceRepository from '../repositories/attendanceRepository.js';

export const findByEmployeeAndDate = attendanceRepository.findByEmployeeAndDate;
export const createCheckIn = attendanceRepository.createCheckIn;
export const findById = attendanceRepository.findById;
export const deleteById = attendanceRepository.deleteById;

export default attendanceRepository;
