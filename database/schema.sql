-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - ĐỀ TÀI 10 (TKQT HTPM K23)
-- KỊCH BẢN DDL CƠ SỞ DỮ LIỆU CHUẨN (database/schema.sql)
-- Hệ quản trị CSDL: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- ==============================================================================

-- 1. KHỞI TẠO CƠ SỞ DỮ LIỆU
CREATE DATABASE IF NOT EXISTS `hrm_db`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `hrm_db`;

-- Tắt kiểm tra khóa ngoại để tạo mới schema sạch sẽ
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `attendances`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `employees`;
DROP TABLE IF EXISTS `departments`;
SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- 2. ĐỊNH NGHĨA 4 BẢNG CỐT LÕI (SCHEMA DDL)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- BẢNG 1: departments (Quản lý Phòng ban)
-- Quan hệ: 1:N với employees
-- ------------------------------------------------------------------------------
CREATE TABLE `departments` (
    `department_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính phòng ban',
    `department_code` VARCHAR(20) NOT NULL COMMENT 'Mã phòng ban duy nhất (vd: PB-TECH, PB-HR)',
    `department_name` VARCHAR(100) NOT NULL COMMENT 'Tên phòng ban',
    `location` VARCHAR(255) NULL COMMENT 'Địa điểm / Tầng làm việc',
    `phone` VARCHAR(20) NULL COMMENT 'Số điện thoại bàn',
    `description` TEXT NULL COMMENT 'Mô tả nhiệm vụ, chức năng',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Trạng thái hoạt động (Soft-delete)',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT `uk_departments_code` UNIQUE (`department_code`),
    INDEX `idx_departments_name` (`department_name`),
    INDEX `idx_departments_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng quản lý cơ cấu phòng ban';

-- ------------------------------------------------------------------------------
-- BẢNG 2: employees (Hồ sơ nhân sự)
-- Quan hệ: N:1 với departments | 1:0..1 với users | 1:N với attendances
-- Bảo mật: Cột ssn_encrypted lưu số CCCD mã hóa AES-256 (Lab 6)
-- ------------------------------------------------------------------------------
CREATE TABLE `employees` (
    `employee_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính nhân viên',
    `employee_code` VARCHAR(20) NOT NULL COMMENT 'Mã nhân viên công ty (vd: NV001, NV002)',
    `full_name` VARCHAR(100) NOT NULL COMMENT 'Họ và tên đầy đủ',
    `email` VARCHAR(100) NOT NULL COMMENT 'Email công vụ/cá nhân',
    `phone` VARCHAR(20) NULL COMMENT 'Số điện thoại di động',
    `gender` ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male' COMMENT 'Giới tính',
    `date_of_birth` DATE NULL COMMENT 'Ngày sinh',
    `ssn_encrypted` VARBINARY(255) NOT NULL COMMENT 'Số CCCD/CMND mã hóa bằng AES_ENCRYPT (Tiêu chuẩn Lab 6)',
    `ssn_masked` VARCHAR(20) NULL COMMENT 'Số CCCD che mờ hiển thị an toàn (vd: 0380******12)',
    `department_id` INT NOT NULL COMMENT 'Khóa ngoại trỏ tới departments',
    `position` VARCHAR(50) NOT NULL DEFAULT 'Nhân viên' COMMENT 'Chức vụ công tác',
    `base_salary` DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT 'Mức lương cơ bản (VNĐ)',
    `hire_date` DATE NOT NULL DEFAULT (CURRENT_DATE) COMMENT 'Ngày vào làm',
    `employment_status` ENUM('Active', 'OnLeave', 'Resigned') NOT NULL DEFAULT 'Active' COMMENT 'Trạng thái nhân sự (Soft-delete)',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT `uk_employees_code` UNIQUE (`employee_code`),
    CONSTRAINT `uk_employees_email` UNIQUE (`email`),
    CONSTRAINT `chk_employees_salary` CHECK (`base_salary` >= 0),
    CONSTRAINT `fk_employees_department`
        FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    INDEX `idx_employees_dept` (`department_id`),
    INDEX `idx_employees_status` (`employment_status`),
    INDEX `idx_employees_name` (`full_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng hồ sơ nhân sự';

-- ------------------------------------------------------------------------------
-- BẢNG 3: users (Tài khoản & Phân quyền RBAC)
-- Quan hệ: 1:0..1 với employees
-- ------------------------------------------------------------------------------
CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính tài khoản',
    `employee_id` INT NULL COMMENT 'Liên kết 1-1 với nhân viên (Admin hệ thống có thể NULL)',
    `username` VARCHAR(50) NOT NULL COMMENT 'Tên đăng nhập hệ thống',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Mật khẩu băm Bcrypt',
    `role` ENUM('Admin', 'HR', 'Employee') NOT NULL DEFAULT 'Employee' COMMENT 'Vai trò phân quyền RBAC',
    `account_status` ENUM('Active', 'Locked', 'Inactive') NOT NULL DEFAULT 'Active' COMMENT 'Trạng thái tài khoản',
    `last_login_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Lần đăng nhập gần nhất',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT `uk_users_username` UNIQUE (`username`),
    CONSTRAINT `uk_users_employee` UNIQUE (`employee_id`),
    CONSTRAINT `fk_users_employee`
        FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_status` (`account_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng tài khoản đăng nhập';

-- ------------------------------------------------------------------------------
-- BẢNG 4: attendances (Chấm công & Điểm danh)
-- Quan hệ: N:1 với employees
-- Chống trùng lặp: UNIQUE (employee_id, attendance_date)
-- ------------------------------------------------------------------------------
CREATE TABLE `attendances` (
    `attendance_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính chấm công',
    `employee_id` INT NOT NULL COMMENT 'Khóa ngoại trỏ tới employees',
    `attendance_date` DATE NOT NULL COMMENT 'Ngày làm việc',
    `check_in` TIME NULL COMMENT 'Giờ vào ca (Server Time)',
    `check_out` TIME NULL COMMENT 'Giờ tan ca (Server Time)',
    `attendance_status` ENUM('OnTime', 'Late', 'EarlyLeave', 'Absent') NOT NULL DEFAULT 'OnTime' COMMENT 'Trạng thái ca làm',
    `note` VARCHAR(255) NULL COMMENT 'Ghi chú giải trình',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT `fk_attendances_employee`
        FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uk_attendances_emp_date` 
        UNIQUE (`employee_id`, `attendance_date`),
    CONSTRAINT `chk_attendances_time` 
        CHECK (`check_out` IS NULL OR `check_in` IS NULL OR `check_out` >= `check_in`),

    INDEX `idx_attendances_date` (`attendance_date`),
    INDEX `idx_attendances_status` (`attendance_status`),
    INDEX `idx_attendances_emp_date` (`employee_id`, `attendance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng theo dõi chấm công';

-- ==============================================================================
-- 3. CƠ CHẾ BẢO MẬT PHÂN QUYỀN LEAST PRIVILEGE (LAB 6 / US-16)
-- ==============================================================================
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'AppUser@Pass2026';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'app_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `hrm_db`.* TO 'app_user'@'%';

CREATE USER IF NOT EXISTS 'report_user'@'%' IDENTIFIED BY 'ReportUser@Pass2026';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'report_user'@'%';
GRANT SELECT ON `hrm_db`.* TO 'report_user'@'%';

FLUSH PRIVILEGES;

-- ==============================================================================
-- 4. DỮ LIỆU KHỞI TẠO BAN ĐẦU (SEED DATA)
-- Khóa AES chuẩn cho đồ án: 'ICTU_HRM_SECRET_KEY_2026_AES256'
-- ==============================================================================
SET @AES_KEY = 'ICTU_HRM_SECRET_KEY_2026_AES256';

-- 4.1 Khởi tạo Phòng ban mẫu
INSERT INTO `departments` (`department_code`, `department_name`, `location`, `phone`, `description`, `is_active`) VALUES
('PB-TECH', 'Phòng Kỹ thuật & Công nghệ', 'Tầng 4 - Tòa nhà A', '0208-3846-001', 'Phụ trách phát triển phần mềm và hạ tầng hệ thống', TRUE),
('PB-HR',   'Phòng Nhân sự & Hành chính', 'Tầng 3 - Tòa nhà A', '0208-3846-002', 'Phụ trách tuyển dụng, đào tạo, chế độ và tiền lương', TRUE),
('PB-BIZ',  'Phòng Kinh doanh & Marketing', 'Tầng 2 - Tòa nhà B', '0208-3846-003', 'Phát triển đối tác, khách hàng và thị trường', TRUE);

-- 4.2 Khởi tạo Nhân viên mẫu (CCCD được mã hóa bằng AES_ENCRYPT)
INSERT INTO `employees` 
(`employee_code`, `full_name`, `email`, `phone`, `gender`, `date_of_birth`, `ssn_encrypted`, `ssn_masked`, `department_id`, `position`, `base_salary`, `hire_date`, `employment_status`) 
VALUES
('NV001', 'Đỗ Quang Minh', 'minh.dq@hrm.local', '0987654321', 'Male', '2004-05-15', 
 AES_ENCRYPT('038204001234', @AES_KEY), '0382******34', 1, 'Trưởng phòng Kỹ thuật', 25000000.00, '2025-01-10', 'Active'),

('NV002', 'Nguyễn Thị Thu Hà', 'ha.ntt@hrm.local', '0976543210', 'Female', '2004-08-20', 
 AES_ENCRYPT('038304005678', @AES_KEY), '0383******78', 2, 'Trưởng phòng Nhân sự', 22000000.00, '2025-02-01', 'Active'),

('NV003', 'Trần Văn Nam', 'nam.tv@hrm.local', '0965432109', 'Male', '2003-11-10', 
 AES_ENCRYPT('038203009012', @AES_KEY), '0382******12', 1, 'Kỹ sư Phần mềm', 18000000.00, '2025-03-15', 'Active'),

('NV004', 'Lê Thị Mai', 'mai.lt@hrm.local', '0954321098', 'Female', '2004-02-28', 
 AES_ENCRYPT('038304003456', @AES_KEY), '0383******56', 3, 'Chuyên viên Kinh doanh', 15000000.00, '2025-04-01', 'Active'),

('NV005', 'Phạm Quốc Hưng', 'hung.pq@hrm.local', '0943210987', 'Male', '2002-09-05', 
 AES_ENCRYPT('038202007890', @AES_KEY), '0382******90', 1, 'DevOps Engineer', 20000000.00, '2025-05-10', 'Active');

-- 4.3 Khởi tạo Tài khoản mẫu (Bcrypt hash: Admin@123, Hr@123, Emp@123)
INSERT INTO `users` (`employee_id`, `username`, `password_hash`, `role`, `account_status`) VALUES
(1, 'admin', '$2a$10$aVwM84IwEcNP29VYXL32g.eVWRcjqIA8vXBB.xsSjg1lQgEj6CVOG', 'Admin',    'Active'),
(2, 'hr',    '$2a$10$hUIaNEqV6dwvmXrkCr.tke78dm3D0nbURY4OL/SoAu7tOvH1Z3NNa', 'HR',       'Active'),
(3, 'emp1',  '$2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK', 'Employee', 'Active');

-- 4.4 Khởi tạo Chấm công mẫu hôm nay
INSERT INTO `attendances` (`employee_id`, `attendance_date`, `check_in`, `check_out`, `attendance_status`, `note`) VALUES
(1, CURRENT_DATE(), '08:15:00', '17:35:00', 'OnTime',     'Check-in đúng ca làm'),
(2, CURRENT_DATE(), '08:25:00', '17:30:00', 'OnTime',     'Check-in đúng giờ'),
(3, CURRENT_DATE(), '08:45:00', '17:40:00', 'Late',       'Đi muộn 15 phút do kẹt xe'),
(4, CURRENT_DATE(), '08:10:00', '16:45:00', 'EarlyLeave', 'Về sớm 45 phút có phép'),
(5, CURRENT_DATE(), '08:05:00', '17:30:00', 'OnTime',     'Đúng giờ ca làm');
