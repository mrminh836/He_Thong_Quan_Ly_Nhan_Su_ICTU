-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - MIGRATION 003 ROLLBACK
-- Tên: 003_create_or_alter_attendances_rollback.sql
-- Mục đích: Khôi phục ENUM trạng thái của bảng attendances về danh sách ban đầu
-- ==============================================================================

SET NAMES utf8mb4;

-- Khôi phục cột attendance_status về ENUM ban đầu
ALTER TABLE `attendances` 
    MODIFY COLUMN `attendance_status` ENUM('OnTime', 'Late', 'EarlyLeave', 'Absent') NOT NULL DEFAULT 'OnTime' 
    COMMENT 'Phân loại trạng thái chấm công';
