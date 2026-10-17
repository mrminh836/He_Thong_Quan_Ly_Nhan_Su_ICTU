-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - ĐỀ TÀI 10 (TKQT HTPM K23)
-- KỊCH BẢN KHỞI TẠO CƠ SỞ DỮ LIỆU & PHÂN QUYỀN LEAST PRIVILEGE (database/init.sql)
-- Hệ quản trị CSDL: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- Phiên bản: 3.0.0 (Idempotent DDL, Least Privilege RBAC & Reporting Views)
-- ==============================================================================

-- Thiết lập chuẩn bộ mã UTF-8 Client Connection chống lỗi Mojibake
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ------------------------------------------------------------------------------
-- 1. CẤU HÌNH KHỞI TẠO VÀ DATABASE
-- ------------------------------------------------------------------------------
-- Khởi tạo Database nếu chưa có (Idempotent - không xóa hoặc can thiệp dữ liệu cũ)
CREATE DATABASE IF NOT EXISTS `hrm_db`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `hrm_db`;

-- Giữ nguyên FOREIGN_KEY_CHECKS để bảo vệ tính toàn vẹn dữ liệu
SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------------------------
-- 1.1 CẤU HÌNH BẢO MẬT LAB 6 (GENERAL QUERY LOG & PASSWORD POLICY MEDIUM)
-- ------------------------------------------------------------------------------
-- A. Kích hoạt Component Validate Password trên MySQL 8.0+ (Idempotent)
USE mysql;
DROP PROCEDURE IF EXISTS `sys_setup_security_lab6`;
DELIMITER //
CREATE PROCEDURE `sys_setup_security_lab6`()
BEGIN
    DECLARE comp_count INT DEFAULT 0;
    SELECT COUNT(*) INTO comp_count FROM mysql.component WHERE component_urn = 'file://component_validate_password';
    IF comp_count = 0 THEN
        INSTALL COMPONENT 'file://component_validate_password';
    END IF;
END //
DELIMITER ;
CALL `sys_setup_security_lab6`();
DROP PROCEDURE IF EXISTS `sys_setup_security_lab6`;

-- Quay lại schema hrm_db
USE `hrm_db`;

-- B. Bật General Query Log (Ghi nhận toàn bộ thao tác SQL phục vụ kiểm toán bảo mật)
SET GLOBAL general_log = 1;
SET GLOBAL general_log_file = '/var/lib/mysql/mysql_general.log';
SET GLOBAL log_output = 'FILE';

-- C. Cấu hình chính sách mật khẩu mức MEDIUM (Độ dài >= 8, hoa, thường, số, ký tự đặc biệt)
SET GLOBAL validate_password.policy = 'MEDIUM';
SET GLOBAL validate_password.length = 8;
SET GLOBAL validate_password.mixed_case_count = 1;
SET GLOBAL validate_password.number_count = 1;
SET GLOBAL validate_password.special_char_count = 1;
SET GLOBAL validate_password.check_user_name = ON;

-- ------------------------------------------------------------------------------
-- 2. TẠO SCHEMA VÀ CÁC BẢNG (TABLE DEFINITIONS & CONSTRAINTS)
-- Tuân thủ 100% nguyên tắc an toàn: Dùng CREATE TABLE IF NOT EXISTS,
-- tuyệt đối KHÔNG DÙNG DROP TABLE hay DROP DATABASE.
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- BẢNG 1: departments (Quản lý Phòng ban)
-- Quan hệ: 1 Phòng ban có Nhiều (1:N) Nhân viên
-- Ràng buộc: ON DELETE RESTRICT (Ngăn xóa phòng ban khi còn nhân viên trực thuộc)
-- ==============================================================================
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

    -- Ràng buộc toàn vẹn duy nhất
    CONSTRAINT `uk_departments_code` UNIQUE (`department_code`),
    CONSTRAINT `uk_departments_name` UNIQUE (`department_name`),

    -- Chỉ mục tối ưu truy vấn nghiệp vụ
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
--   - Cột ssn_encrypted lưu số CCCD/CMND mã hóa AES-256 (Tiêu chuẩn Lab 6)
--   - Cột ssn_masked lưu định dạng che mờ phục vụ hiển thị công khai
--   - Cột ssn_hash lưu mã băm HMAC-SHA-256 chống trùng lặp mà không cần giải mã
-- ==============================================================================
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

-- ==============================================================================
-- BẢNG 3: users (Quản lý Tài khoản & Xác thực RBAC)
-- Quan hệ: 0..1:1 với employees (Một nhân viên có tối đa 1 tài khoản)
-- Phân quyền: Role gồm 'Admin', 'HR', 'Employee'
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `users` (
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
CREATE TABLE IF NOT EXISTS `attendances` (
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
-- BẢNG 5: schema_migrations (Lịch sử thực thi Migration)
-- Đồng bộ hoàn toàn với kịch bản migrate.js của backend
-- ==============================================================================
CREATE TABLE IF NOT EXISTS `schema_migrations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `migration_name` VARCHAR(255) NOT NULL UNIQUE,
    `batch` INT NOT NULL,
    `executed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng theo dõi các migration đã áp dụng vào CSDL';

-- ------------------------------------------------------------------------------
-- 3. CÁC VIEW BÁO CÁO BẢO MẬT (REPORTING & ANALYTICS VIEWS)
-- Phục vụ truy vấn báo cáo và phân quyền an toàn cho report_user:
--   - Tuyệt đối KHÔNG chứa số CCCD nhị phân (ssn_encrypted)
--   - Tuyệt đối KHÔNG chứa chuỗi băm mật khẩu (password_hash)
--   - Cung cấp dữ liệu thống kê tổng hợp tối ưu cho Dashboard / BI
-- ------------------------------------------------------------------------------

-- VIEW 1: Thống kê tổng quan cơ cấu nhân sự theo từng phòng ban
CREATE OR REPLACE VIEW `v_report_department_stats` AS
SELECT 
    d.department_id,
    d.department_code,
    d.department_name,
    d.location,
    d.is_active,
    COUNT(e.employee_id) AS total_employees,
    SUM(CASE WHEN e.employment_status = 'Active' THEN 1 ELSE 0 END) AS active_employees,
    SUM(CASE WHEN e.employment_status = 'OnLeave' THEN 1 ELSE 0 END) AS onleave_employees,
    SUM(CASE WHEN e.employment_status = 'Resigned' THEN 1 ELSE 0 END) AS resigned_employees,
    COALESCE(ROUND(AVG(CASE WHEN e.employment_status = 'Active' THEN e.base_salary ELSE NULL END), 2), 0.00) AS avg_base_salary
FROM `departments` d
LEFT JOIN `employees` e ON d.department_id = e.department_id
GROUP BY d.department_id, d.department_code, d.department_name, d.location, d.is_active;

-- VIEW 2: Thống kê chỉ số chấm công hàng ngày (Đúng giờ, Đi muộn, Về sớm)
CREATE OR REPLACE VIEW `v_report_daily_attendance_summary` AS
SELECT 
    a.attendance_date,
    COUNT(a.attendance_id) AS total_recorded,
    SUM(CASE WHEN a.attendance_status = 'OnTime' THEN 1 ELSE 0 END) AS on_time_count,
    SUM(CASE WHEN a.attendance_status = 'Late' THEN 1 ELSE 0 END) AS late_count,
    SUM(CASE WHEN a.attendance_status = 'EarlyLeave' THEN 1 ELSE 0 END) AS early_leave_count,
    SUM(CASE WHEN a.attendance_status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
    CASE 
        WHEN COUNT(a.attendance_id) > 0 THEN 
            ROUND((SUM(CASE WHEN a.attendance_status = 'OnTime' THEN 1 ELSE 0 END) / COUNT(a.attendance_id)) * 100, 1)
        ELSE 0.0 
    END AS ontime_percentage
FROM `attendances` a
GROUP BY a.attendance_date;

-- VIEW 3: Bảng danh sách nhân sự an toàn (Loại bỏ 100% trường nhạy cảm CCCD & Mật khẩu)
CREATE OR REPLACE VIEW `v_report_employee_public` AS
SELECT 
    e.employee_id,
    e.employee_code,
    e.full_name,
    e.email,
    e.phone,
    e.gender,
    e.position,
    d.department_name,
    e.hire_date,
    e.employment_status,
    u.username,
    u.role AS user_role,
    u.account_status,
    u.last_login_at
FROM `employees` e
LEFT JOIN `departments` d ON e.department_id = d.department_id
LEFT JOIN `users` u ON e.employee_id = u.employee_id;

-- ------------------------------------------------------------------------------
-- 4. PHÂN QUYỀN TRUY CẬP THEO NGUYÊN TẮC LEAST PRIVILEGE
-- Phân định rạch ròi 2 tài khoản cơ sở dữ liệu:
--   1. app_user: Tài khoản Runtime dành riêng cho Backend Node.js Express.
--      Chỉ cấp quyền DML (SELECT, INSERT, UPDATE, DELETE) trên `hrm_db`.*.
--      KHÔNG CẤP bất kỳ quyền DDL nào (DROP, ALTER, CREATE TABLE) để chống phá hủy cấu trúc.
--   2. report_user: Tài khoản chỉ đọc (Read-only) phục vụ báo cáo / BI / Exporter.
--      Chỉ cấp quyền SELECT trên các View báo cáo và bảng phi nhạy cảm.
-- ------------------------------------------------------------------------------

-- 4.1 Khởi tạo và cấp quyền cho app_user (Backend API Runtime)
-- Hỗ trợ tương thích cả MySQL 8.0 caching_sha2_password và mysql_native_password
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'AppUser@Pass2026';
-- Thu hồi mọi quyền thừa ngoài ý muốn trước khi cấp quyền tối thiểu
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'app_user'@'%';
-- Cấp đúng 4 quyền thao tác dữ liệu (DML) cần thiết cho nghiệp vụ backend
GRANT SELECT, INSERT, UPDATE, DELETE ON `hrm_db`.* TO 'app_user'@'%';

-- 4.2 Khởi tạo và cấp quyền cho report_user (Báo cáo & Thống kê)
CREATE USER IF NOT EXISTS 'report_user'@'%' IDENTIFIED BY 'ReportUser@Pass2026';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'report_user'@'%';
-- Cấp quyền chỉ đọc (SELECT) trên các bảng và Views báo cáo
GRANT SELECT ON `hrm_db`.* TO 'report_user'@'%';

-- 4.3 Khởi tạo và cấp quyền cho exporter (Prometheus MySQL Exporter)
CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY 'Pr0m3th3us@M0n2026!' WITH MAX_USER_CONNECTIONS 3;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'exporter'@'%';
GRANT PROCESS, REPLICATION CLIENT ON *.* TO 'exporter'@'%';
GRANT SELECT ON `performance_schema`.* TO 'exporter'@'%';

-- Áp dụng thay đổi quyền ngay lập tức
FLUSH PRIVILEGES;

-- ------------------------------------------------------------------------------
-- 5. DỮ LIỆU KHỞI TẠO MẪU (IDEMPOTENT SEED DATA)
-- Sử dụng INSERT IGNORE để đảm bảo an toàn tuyệt đối khi chạy lại kịch bản,
-- không ghi đè hoặc gây lỗi Duplicate Entry nếu dữ liệu đã tồn tại.
-- ------------------------------------------------------------------------------
SET @AES_KEY = 'ICTU_HRM_SECRET_KEY_2026_AES256';
SET @HMAC_KEY = 'ICTU_HRM_CCCD_HMAC_SECRET_2026_KEY';

-- 5.1 Khởi tạo 3 Phòng ban mẫu (Nếu chưa có)
INSERT IGNORE INTO `departments` 
(`department_id`, `department_code`, `department_name`, `location`, `phone`, `description`, `is_active`) 
VALUES
(1, 'PB-TECH', 'Phòng Kỹ thuật & Công nghệ', 'Tầng 4 - Tòa nhà A', '0208-3846-001', 'Nghiên cứu, phát triển ứng dụng và vận hành hạ tầng công nghệ thông tin', TRUE),
(2, 'PB-HR',   'Phòng Nhân sự & Hành chính', 'Tầng 3 - Tòa nhà A', '0208-3846-002', 'Quản lý tuyển dụng, hồ sơ nhân sự, tiền lương và chế độ phúc lợi nhân viên', TRUE),
(3, 'PB-BIZ',  'Phòng Kinh doanh & Marketing', 'Tầng 2 - Tòa nhà B', '0208-3846-003', 'Phát triển khách hàng doanh nghiệp, đối tác và tiếp thị thương hiệu', TRUE);

-- 5.2 Khởi tạo 5 Nhân sự mẫu (Số CCCD được mã hóa bằng AES_ENCRYPT chuẩn Lab 6)
INSERT IGNORE INTO `employees` 
(`employee_id`, `employee_code`, `full_name`, `email`, `phone`, `gender`, `date_of_birth`, `ssn_encrypted`, `ssn_masked`, `department_id`, `position`, `base_salary`, `hire_date`, `employment_status`) 
VALUES
(1, 'NV001', 'Đỗ Quang Minh', 'minh.dq@hrm.local', '0987654321', 'Male', '2004-05-15', 
 AES_ENCRYPT('038204001234', @AES_KEY), '0382******34', 1, 'Trưởng phòng Kỹ thuật', 25000000.00, '2025-01-10', 'Active'),

(2, 'NV002', 'Nguyễn Thị Thu Hà', 'ha.ntt@hrm.local', '0976543210', 'Female', '2004-08-20', 
 AES_ENCRYPT('038304005678', @AES_KEY), '0383******78', 2, 'Trưởng phòng Nhân sự', 22000000.00, '2025-02-01', 'Active'),

(3, 'NV003', 'Trần Văn Nam', 'nam.tv@hrm.local', '0965432109', 'Male', '2003-11-10', 
 AES_ENCRYPT('038203009012', @AES_KEY), '0382******12', 1, 'Kỹ sư Phần mềm', 18000000.00, '2025-03-15', 'Active'),

(4, 'NV004', 'Lê Thị Mai', 'mai.lt@hrm.local', '0954321098', 'Female', '2004-02-28', 
 AES_ENCRYPT('038304003456', @AES_KEY), '0383******56', 3, 'Chuyên viên Kinh doanh', 15000000.00, '2025-04-01', 'Active'),

(5, 'NV005', 'Phạm Quốc Hưng', 'hung.pq@hrm.local', '0943210987', 'Male', '2002-09-05', 
 AES_ENCRYPT('038202007890', @AES_KEY), '0382******90', 1, 'DevOps Engineer', 20000000.00, '2025-05-10', 'Active');

-- 5.3 Khởi tạo 3 Tài khoản người dùng mẫu (Phân quyền 3 vai trò Admin, HR, Employee)
-- Mật khẩu mặc định băm bằng Bcrypt tiêu chuẩn (Salt Rounds = 10):
--   - admin / Admin@123 -> $2a$10$aVwM84IwEcNP29VYXL32g.eVWRcjqIA8vXBB.xsSjg1lQgEj6CVOG
--   - hr    / Hr@123    -> $2a$10$hUIaNEqV6dwvmXrkCr.tke78dm3D0nbURY4OL/SoAu7tOvH1Z3NNa
--   - emp1  / Emp@123   -> $2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK
INSERT IGNORE INTO `users` 
(`user_id`, `employee_id`, `username`, `password_hash`, `role`, `account_status`) 
VALUES
(1, 1, 'admin', '$2a$10$aVwM84IwEcNP29VYXL32g.eVWRcjqIA8vXBB.xsSjg1lQgEj6CVOG', 'Admin',    'Active'),
(2, 2, 'hr',    '$2a$10$hUIaNEqV6dwvmXrkCr.tke78dm3D0nbURY4OL/SoAu7tOvH1Z3NNa', 'HR',       'Active'),
(3, 3, 'emp1',  '$2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK', 'Employee', 'Active');

-- 5.4 Khởi tạo dữ liệu Chấm công mẫu trong ngày hiện tại
INSERT IGNORE INTO `attendances` 
(`attendance_id`, `employee_id`, `attendance_date`, `check_in`, `check_out`, `attendance_status`, `note`) 
VALUES
(1, 1, CURRENT_DATE(), '08:15:00', '17:35:00', 'OnTime',     'Check-in đúng giờ tiêu chuẩn'),
(2, 2, CURRENT_DATE(), '08:25:00', '17:30:00', 'OnTime',     'Check-in đúng giờ'),
(3, 3, CURRENT_DATE(), '08:45:00', '17:40:00', 'Late',       'Đi muộn 15 phút do sự cố giao thông'),
(4, 4, CURRENT_DATE(), '08:10:00', '16:45:00', 'EarlyLeave', 'Về sớm 45 phút có xin phép quản lý'),
(5, 5, CURRENT_DATE(), '08:05:00', '17:30:00', 'OnTime',     'Đúng giờ ca làm');

-- 5.5 Ghi nhận migration hoàn tất vào bảng schema_migrations
INSERT IGNORE INTO `schema_migrations` (`migration_name`, `batch`) VALUES
('001_create_or_alter_departments.sql', 1),
('002_create_or_alter_employees.sql', 1),
('003_create_or_alter_attendances.sql', 2);

-- ==============================================================================
-- 6. HƯỚNG DẪN KIỂM TRA VÀ XÁC MINH QUYỀN (DBA VERIFICATION GUIDE)
-- ==============================================================================
-- 1. Kiểm tra danh sách người dùng và cơ chế xác thực:
--    SELECT user, host, plugin FROM mysql.user WHERE user IN ('app_user', 'report_user');
--
-- 2. Kiểm tra chi tiết quyền hạn của app_user:
--    SHOW GRANTS FOR 'app_user'@'%';
--    -> Kỳ vọng: GRANT SELECT, INSERT, UPDATE, DELETE ON `hrm_db`.* TO `app_user`@`%`
--
-- 3. Kiểm tra chi tiết quyền hạn của report_user:
--    SHOW GRANTS FOR 'report_user'@'%';
--    -> Kỳ vọng: GRANT SELECT ON `hrm_db`.* TO `report_user`@`%`
--
-- 4. Thử nghiệm vi phạm quyền Least Privilege (phải bị MySQL từ chối mã 1142):
--    - app_user cố ý xóa bảng (DDL):
--      DROP TABLE hrm_db.users; -> ERROR 1142 (42000): DROP command denied to user 'app_user'@'%'
--    - report_user cố ý chèn dữ liệu (DML):
--      INSERT INTO hrm_db.departments (department_code, department_name) VALUES ('X', 'Y');
--      -> ERROR 1142 (42000): INSERT command denied to user 'report_user'@'%'
--
-- 5. Xác minh MySQL General Query Log (Lab 6):
--    SHOW VARIABLES LIKE 'general_log%';
--    SHOW VARIABLES LIKE 'log_output%';
--    -- Kiểm tra 20 dòng log mới nhất trong file log:
--    -- tail -n 20 /var/lib/mysql/mysql_general.log
--
-- 6. Xác minh Password Policy MEDIUM (Lab 6):
--    SHOW VARIABLES LIKE 'validate_password%';
--    -- Thử nghiệm mật khẩu yếu (phải nhận lỗi ERROR 1819):
--    CREATE USER 'test_weak'@'%' IDENTIFIED BY '123456';
--    -- Thử nghiệm mật khẩu đạt chuẩn MEDIUM (thành công):
--    CREATE USER 'test_ok'@'%' IDENTIFIED BY 'SecurePass@2026!';
--    DROP USER 'test_ok'@'%';
-- ==============================================================================
