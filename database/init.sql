-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - ĐỀ TÀI 10 (TKQT HTPM K23)
-- KỊCH BẢN KHỞI TẠO CƠ SỞ DỮ LIỆU CHUẨN DOANH NGHIỆP (ENTERPRISE DDL)
-- Hệ quản trị CSDL: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- Phiên bản: 2.0.0 | Ngày thiết kế: 13/10/2026
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. KHỞI TẠO DATABASE
-- ------------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `hrm_db`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `hrm_db`;

-- Tắt kiểm tra khóa ngoại để tái thiết lập schema an toàn (idempotent execution)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `attendances`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `employees`;
DROP TABLE IF EXISTS `departments`;
SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------------------------
-- 2. ĐỊNH NGHĨA CÁC BẢNG (TABLE DEFINITIONS & CONSTRAINTS)
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- BẢNG 1: departments (Quản lý Phòng ban)
-- Quan hệ: 1 Phòng ban có Nhiều (1:N) Nhân viên
-- Ràng buộc: ON DELETE RESTRICT (Ngăn xóa phòng ban khi còn nhân viên trực thuộc)
-- ==============================================================================
CREATE TABLE `departments` (
    `department_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh phòng ban',
    `department_code` VARCHAR(20) NOT NULL COMMENT 'Mã phòng ban duy nhất (vd: PB-TECH, PB-HR)',
    `department_name` VARCHAR(100) NOT NULL COMMENT 'Tên hiển thị phòng ban',
    `location` VARCHAR(255) NULL COMMENT 'Địa điểm văn phòng / Số phòng / Tòa nhà',
    `phone` VARCHAR(20) NULL COMMENT 'Số điện thoại liên lạc nội bộ',
    `description` TEXT NULL COMMENT 'Mô tả cơ cấu và chức năng phòng ban',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Trạng thái hoạt động: TRUE = Đang mở, FALSE = Ngừng hoạt động (Soft-delete)',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo bản ghi',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật bản ghi',

    -- Ràng buộc toàn vẹn duy nhất
    CONSTRAINT `uk_departments_code` UNIQUE (`department_code`),

    -- Chỉ mục tối ưu truy vấn
    INDEX `idx_departments_name` (`department_name`),
    INDEX `idx_departments_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng quản lý cơ cấu tổ chức và phòng ban';

-- ==============================================================================
-- BẢNG 2: employees (Quản lý Hồ sơ nhân sự)
-- Quan hệ:
--   - N:1 với departments (Nhân viên thuộc 1 phòng ban)
--   - 1:0..1 với users (Nhân viên có tối đa 1 tài khoản đăng nhập)
--   - 1:N với attendances (Nhân viên có nhiều bản ghi chấm công)
-- An toàn thông tin:
--   - Cột ssn_encrypted lưu số CCCD/CMND mã hóa AES-256 (Lab 6)
--   - Cột ssn_masked lưu định dạng che mờ phục vụ hiển thị công khai
-- ==============================================================================
CREATE TABLE `employees` (
    `employee_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh nhân sự',
    `employee_code` VARCHAR(20) NOT NULL COMMENT 'Mã định danh nhân viên (vd: NV001, NV002)',
    `full_name` VARCHAR(100) NOT NULL COMMENT 'Họ và tên đầy đủ',
    `email` VARCHAR(100) NOT NULL COMMENT 'Địa chỉ email công vụ/cá nhân',
    `phone` VARCHAR(20) NULL COMMENT 'Số điện thoại liên lạc cá nhân',
    `gender` ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male' COMMENT 'Giới tính',
    `date_of_birth` DATE NULL COMMENT 'Ngày tháng năm sinh',
    `ssn_encrypted` VARBINARY(255) NOT NULL COMMENT 'Số CCCD/CMND được mã hóa bằng AES_ENCRYPT (Tiêu chuẩn Lab 6)',
    `ssn_masked` VARCHAR(20) NULL COMMENT 'Số CCCD che mờ ký tự hiển thị an toàn (vd: 0380******12)',
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

    -- Ràng buộc kiểm tra tính hợp lệ dữ liệu (CHECK Constraints)
    CONSTRAINT `chk_employees_salary` CHECK (`base_salary` >= 0),

    -- Ràng buộc toàn vẹn khóa ngoại
    CONSTRAINT `fk_employees_department`
        FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    -- Chỉ mục tối ưu truy vấn
    INDEX `idx_employees_dept` (`department_id`),
    INDEX `idx_employees_status` (`employment_status`),
    INDEX `idx_employees_name` (`full_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu trữ thông tin hồ sơ nhân sự';

-- ==============================================================================
-- BẢNG 3: users (Quản lý Tài khoản & Xác thực RBAC)
-- Quan hệ: 0..1:1 với employees (Một nhân viên có tối đa 1 tài khoản)
-- Phân quyền: Role gồm 'Admin', 'HR', 'Employee'
-- ==============================================================================
CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh tài khoản',
    `employee_id` INT NULL COMMENT 'Liên kết 1-1 với hồ sơ nhân viên (Tài khoản Admin kỹ thuật có thể để NULL)',
    `username` VARCHAR(50) NOT NULL COMMENT 'Tên đăng nhập hệ thống duy nhất',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã được băm an toàn bằng thuật toán Bcrypt',
    `role` ENUM('Admin', 'HR', 'Employee') NOT NULL DEFAULT 'Employee' COMMENT 'Vai trò phân quyền hệ thống (RBAC)',
    `account_status` ENUM('Active', 'Locked', 'Inactive') NOT NULL DEFAULT 'Active' COMMENT 'Trạng thái tài khoản người dùng',
    `last_login_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Thời điểm đăng nhập thành công gần nhất',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo tài khoản',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật tài khoản',

    -- Ràng buộc duy nhất
    CONSTRAINT `uk_users_username` UNIQUE (`username`),
    CONSTRAINT `uk_users_employee` UNIQUE (`employee_id`),

    -- Ràng buộc khóa ngoại
    CONSTRAINT `fk_users_employee`
        FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
        ON DELETE SET NULL ON UPDATE CASCADE,

    -- Chỉ mục tối ưu đăng nhập và kiểm tra quyền
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_status` (`account_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng tài khoản người dùng và xác thực đăng nhập';

-- ==============================================================================
-- BẢNG 4: attendances (Quản lý Chấm công & Điểm danh)
-- Quan hệ: N:1 với employees (Nhân viên có nhiều bản ghi công theo ngày)
-- Chống trùng lặp: UNIQUE (employee_id, attendance_date)
-- ==============================================================================
CREATE TABLE `attendances` (
    `attendance_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh bản ghi chấm công',
    `employee_id` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới employees(employee_id)',
    `attendance_date` DATE NOT NULL COMMENT 'Ngày làm việc phát sinh công',
    `check_in` TIME NULL COMMENT 'Giờ vào ca (Server Time, vd: 08:15:00)',
    `check_out` TIME NULL COMMENT 'Giờ tan ca (Server Time, vd: 17:30:00)',
    `attendance_status` ENUM('OnTime', 'Late', 'EarlyLeave', 'Absent') NOT NULL DEFAULT 'OnTime' COMMENT 'Phân loại trạng thái chấm công',
    `note` VARCHAR(255) NULL COMMENT 'Ghi chú lý do đi muộn, về sớm hoặc công tác',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm ghi nhận chấm công',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật chấm công',

    -- Ràng buộc khóa ngoại
    CONSTRAINT `fk_attendances_employee`
        FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- RÀNG BUỘC NGHIỆP VỤ CỐT LÕI: Chống chấm công trùng lặp của cùng 1 nhân viên trong 1 ngày
    CONSTRAINT `uk_attendances_emp_date` UNIQUE (`employee_id`, `attendance_date`),

    -- Ràng buộc kiểm tra tính hợp lý thời gian (Giờ ra phải sau giờ vào nếu cả 2 cùng có mặt)
    CONSTRAINT `chk_attendances_time` CHECK (
        `check_out` IS NULL OR `check_in` IS NULL OR `check_out` >= `check_in`
    ),

    -- Chỉ mục tối ưu lọc báo cáo hàng ngày và thống kê theo tháng
    INDEX `idx_attendances_date` (`attendance_date`),
    INDEX `idx_attendances_status` (`attendance_status`),
    INDEX `idx_attendances_emp_date` (`employee_id`, `attendance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng theo dõi chấm công hàng ngày của nhân viên';

-- ==============================================================================
-- 3. CƠ CHẾ BẢO MẬT PHÂN QUYỀN LEAST PRIVILEGE (DBA SECURITY - LAB 6 / US-16)
-- Tạo 2 người dùng chuyên biệt:
--   - app_user: Chỉ thao tác dữ liệu (DML), KHÔNG CÓ quyền xóa/sửa cấu trúc bảng (DDL)
--   - report_user: Chỉ có quyền đọc (SELECT) phục vụ báo cáo / exporter
-- ==============================================================================

-- 3.1 Cấp quyền cho app_user (Dùng cho ứng dụng Node.js Express API)
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'AppUser@Pass2026';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'app_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `hrm_db`.* TO 'app_user'@'%';

-- 3.2 Cấp quyền cho report_user (Dùng cho Exporter, Prometheus, phpMyAdmin xem báo cáo)
CREATE USER IF NOT EXISTS 'report_user'@'%' IDENTIFIED BY 'ReportUser@Pass2026';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'report_user'@'%';
GRANT SELECT ON `hrm_db`.* TO 'report_user'@'%';

-- Áp dụng thay đổi quyền ngay lập tức
FLUSH PRIVILEGES;

-- ==============================================================================
-- 4. DỮ LIỆU KHỞI TẠO MẪU (SEED DATA KIỂM THỬ NGHIỆP VỤ)
-- Khóa mã hóa bí mật AES-256 (Môn học ICTU): 'ICTU_HRM_SECRET_KEY_2026_AES256'
-- ==============================================================================
SET @AES_KEY = 'ICTU_HRM_SECRET_KEY_2026_AES256';

-- 4.1 Khởi tạo 3 Phòng ban mẫu
INSERT INTO `departments` 
(`department_code`, `department_name`, `location`, `phone`, `description`, `is_active`) 
VALUES
('PB-TECH', 'Phòng Kỹ thuật & Công nghệ', 'Tầng 4 - Tòa nhà A', '0208-3846-001', 'Nghiên cứu, phát triển ứng dụng và vận hành hạ tầng công nghệ thông tin', TRUE),
('PB-HR',   'Phòng Nhân sự & Hành chính', 'Tầng 3 - Tòa nhà A', '0208-3846-002', 'Quản lý tuyển dụng, hồ sơ nhân sự, tiền lương và chế độ phúc lợi nhân viên', TRUE),
('PB-BIZ',  'Phòng Kinh doanh & Marketing', 'Tầng 2 - Tòa nhà B', '0208-3846-003', 'Phát triển khách hàng doanh nghiệp, đối tác và tiếp thị thương hiệu', TRUE);

-- 4.2 Khởi tạo 5 Nhân sự mẫu (Số CCCD được mã hóa bằng AES_ENCRYPT)
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

-- 4.3 Khởi tạo 3 Tài khoản người dùng mẫu (Phân quyền 3 vai trò Admin, HR, Employee)
-- Mật khẩu mặc định băm bằng Bcrypt (Work factor = 10):
--   - admin / Admin@123 -> $2a$10$aVwM84IwEcNP29VYXL32g.eVWRcjqIA8vXBB.xsSjg1lQgEj6CVOG
--   - hr    / Hr@123    -> $2a$10$hUIaNEqV6dwvmXrkCr.tke78dm3D0nbURY4OL/SoAu7tOvH1Z3NNa
--   - emp1  / Emp@123   -> $2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK
INSERT INTO `users` 
(`employee_id`, `username`, `password_hash`, `role`, `account_status`) 
VALUES
(1, 'admin', '$2a$10$aVwM84IwEcNP29VYXL32g.eVWRcjqIA8vXBB.xsSjg1lQgEj6CVOG', 'Admin',    'Active'),
(2, 'hr',    '$2a$10$hUIaNEqV6dwvmXrkCr.tke78dm3D0nbURY4OL/SoAu7tOvH1Z3NNa', 'HR',       'Active'),
(3, 'emp1',  '$2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK', 'Employee', 'Active');

-- 4.4 Khởi tạo dữ liệu Chấm công mẫu trong ngày hiện tại
INSERT INTO `attendances` 
(`employee_id`, `attendance_date`, `check_in`, `check_out`, `attendance_status`, `note`) 
VALUES
(1, CURRENT_DATE(), '08:15:00', '17:35:00', 'OnTime',     'Check-in đúng giờ tiêu chuẩn'),
(2, CURRENT_DATE(), '08:25:00', '17:30:00', 'OnTime',     'Check-in đúng giờ'),
(3, CURRENT_DATE(), '08:45:00', '17:40:00', 'Late',       'Đi muộn 15 phút do sự cố giao thông'),
(4, CURRENT_DATE(), '08:10:00', '16:45:00', 'EarlyLeave', 'Về sớm 45 phút có xin phép quản lý'),
(5, CURRENT_DATE(), '08:05:00', '17:30:00', 'OnTime',     'Đúng giờ ca làm');

-- ==============================================================================
-- HOÀN TẤT KỊCH BẢN KHỞI TẠO CSDL
-- ==============================================================================
