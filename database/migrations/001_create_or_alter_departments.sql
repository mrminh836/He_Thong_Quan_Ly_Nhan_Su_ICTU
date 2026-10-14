-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - MIGRATION 001
-- Tên: 001_create_or_alter_departments.sql
-- Mục đích: Khởi tạo bảng departments (nếu chưa có) và đảm bảo ràng buộc UNIQUE department_name
-- Chuẩn: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- ==============================================================================

SET NAMES utf8mb4;

-- 1. Tạo bảng departments nếu chưa tồn tại
CREATE TABLE IF NOT EXISTS `departments` (
    `department_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh phòng ban',
    `department_code` VARCHAR(20) NOT NULL COMMENT 'Mã phòng ban duy nhất (vd: PB-TECH, PB-HR)',
    `department_name` VARCHAR(100) NOT NULL COMMENT 'Tên hiển thị phòng ban',
    `location` VARCHAR(255) NULL COMMENT 'Địa điểm văn phòng / Số phòng / Tòa nhà',
    `phone` VARCHAR(20) NULL COMMENT 'Số điện thoại liên lạc nội bộ',
    `description` TEXT NULL COMMENT 'Mô tả cơ cấu và chức năng phòng ban',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Trạng thái hoạt động: TRUE = Đang mở, FALSE = Ngừng hoạt động (Soft-delete)',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo bản ghi',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật bản ghi',

    CONSTRAINT `uk_departments_code` UNIQUE (`department_code`),
    INDEX `idx_departments_name` (`department_name`),
    INDEX `idx_departments_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng quản lý cơ cấu tổ chức và phòng ban';

-- 2. Thêm ràng buộc UNIQUE cho department_name nếu chưa tồn tại (Idempotent ALTER)
SET @dbname = DATABASE();
SET @tablename = 'departments';
SET @indexname = 'uk_departments_name';

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE table_schema = @dbname
        AND table_name = @tablename
        AND index_name = @indexname
    ) > 0,
    'SELECT 1',
    'ALTER TABLE `departments` ADD CONSTRAINT `uk_departments_name` UNIQUE (`department_name`)'
));

PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
