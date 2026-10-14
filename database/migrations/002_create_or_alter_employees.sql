-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - MIGRATION 002
-- Tên: 002_create_or_alter_employees.sql
-- Mục đích: Khởi tạo bảng employees (nếu chưa có), bổ sung cột ssn_hash (HMAC-SHA-256),
--          cột address, cho phép email có thể null, và thiết lập ràng buộc UNIQUE uk_employees_ssn_hash
-- Chuẩn: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- ==============================================================================

SET NAMES utf8mb4;

-- 1. Tạo bảng employees nếu chưa tồn tại
CREATE TABLE IF NOT EXISTS `employees` (
    `employee_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh nhân sự',
    `employee_code` VARCHAR(20) NOT NULL COMMENT 'Mã định danh nhân viên (vd: NV001, NV002)',
    `full_name` VARCHAR(100) NOT NULL COMMENT 'Họ và tên đầy đủ',
    `email` VARCHAR(100) NULL COMMENT 'Địa chỉ email công vụ/cá nhân',
    `phone` VARCHAR(20) NULL COMMENT 'Số điện thoại liên lạc cá nhân',
    `address` VARCHAR(255) NULL COMMENT 'Địa chỉ liên lạc / thường trú của nhân viên',
    `gender` ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male' COMMENT 'Giới tính',
    `date_of_birth` DATE NULL COMMENT 'Ngày tháng năm sinh',
    `ssn_encrypted` VARBINARY(255) NOT NULL COMMENT 'Số CCCD/CMND được mã hóa bằng AES_ENCRYPT (Tiêu chuẩn Lab 6)',
    `ssn_masked` VARCHAR(20) NULL COMMENT 'Số CCCD che mờ ký tự hiển thị an toàn (vd: 0380******12)',
    `ssn_hash` VARCHAR(64) NULL COMMENT 'Mã băm HMAC-SHA-256 bảo vệ tính duy nhất của số CCCD/CMND',
    `department_id` INT NOT NULL COMMENT 'Khóa ngoại trỏ tới departments(department_id)',
    `position` VARCHAR(50) NOT NULL DEFAULT 'Nhân viên' COMMENT 'Vị trí / Chức danh công tác',
    `base_salary` DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT 'Mức lương cơ bản thỏa thuận (VNĐ)',
    `hire_date` DATE NOT NULL DEFAULT (CURRENT_DATE) COMMENT 'Ngày tiếp nhận nhân sự vào làm việc',
    `employment_status` ENUM('Active', 'OnLeave', 'Resigned') NOT NULL DEFAULT 'Active' COMMENT 'Trạng thái nhân sự: Active, OnLeave, Resigned (Soft-delete)',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm khởi tạo hồ sơ',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật hồ sơ',

    -- Ràng buộc duy nhất
    CONSTRAINT `uk_employees_code` UNIQUE (`employee_code`),
    CONSTRAINT `uk_employees_email` UNIQUE (`email`),
    CONSTRAINT `uk_employees_ssn_hash` UNIQUE (`ssn_hash`),

    -- Ràng buộc kiểm tra tính hợp lệ dữ liệu (CHECK Constraints)
    CONSTRAINT `chk_employees_salary` CHECK (`base_salary` >= 0),

    -- Ràng buộc toàn vẹn khóa ngoại
    CONSTRAINT `fk_employees_department`
        FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    -- Chỉ mục tối ưu truy vấn
    INDEX `idx_employees_dept` (`department_id`),
    INDEX `idx_employees_status` (`employment_status`),
    INDEX `idx_employees_name` (`full_name`),
    INDEX `idx_employees_ssn_hash` (`ssn_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ thông tin hồ sơ nhân sự';

-- 2. Đảm bảo cấu trúc idempotent cho CSDL đã có sẵn bảng employees từ trước
SET @dbname = DATABASE();
SET @tablename = 'employees';

-- 2.1 Thêm cột ssn_hash nếu chưa có
SET @hasSsnHash = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'ssn_hash'
);
SET @sqlAddSsnHash = IF(
    @hasSsnHash > 0, 
    'SELECT 1', 
    'ALTER TABLE `employees` ADD COLUMN `ssn_hash` VARCHAR(64) NULL COMMENT \'Mã băm HMAC-SHA-256 bảo vệ tính duy nhất của số CCCD/CMND\' AFTER `ssn_masked`'
);
PREPARE stmtAddSsnHash FROM @sqlAddSsnHash;
EXECUTE stmtAddSsnHash;
DEALLOCATE PREPARE stmtAddSsnHash;

-- 2.2 Thêm cột address nếu chưa có
SET @hasAddress = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'address'
);
SET @sqlAddAddress = IF(
    @hasAddress > 0, 
    'SELECT 1', 
    'ALTER TABLE `employees` ADD COLUMN `address` VARCHAR(255) NULL COMMENT \'Địa chỉ liên lạc / thường trú của nhân viên\' AFTER `phone`'
);
PREPARE stmtAddAddress FROM @sqlAddAddress;
EXECUTE stmtAddAddress;
DEALLOCATE PREPARE stmtAddAddress;

-- 2.3 Cho phép email có thể NULL
SET @sqlModifyEmail = 'ALTER TABLE `employees` MODIFY COLUMN `email` VARCHAR(100) NULL COMMENT \'Địa chỉ email công vụ/cá nhân\'';
PREPARE stmtModifyEmail FROM @sqlModifyEmail;
EXECUTE stmtModifyEmail;
DEALLOCATE PREPARE stmtModifyEmail;

-- 2.4 Thêm ràng buộc UNIQUE uk_employees_ssn_hash nếu chưa có
SET @hasIndexSsnHash = (
    SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'uk_employees_ssn_hash'
);
SET @sqlAddIndexSsnHash = IF(
    @hasIndexSsnHash > 0, 
    'SELECT 1', 
    'ALTER TABLE `employees` ADD CONSTRAINT `uk_employees_ssn_hash` UNIQUE (`ssn_hash`)'
);
PREPARE stmtAddIndexSsnHash FROM @sqlAddIndexSsnHash;
EXECUTE stmtAddIndexSsnHash;
DEALLOCATE PREPARE stmtAddIndexSsnHash;
