-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - MIGRATION 003
-- Tên: 003_create_or_alter_attendances.sql
-- Mục đích: Khởi tạo bảng attendances (nếu chưa có), thiết lập ràng buộc duy nhất
--          uk_attendances_emp_date(employee_id, attendance_date) ngăn check-in trùng ngày,
--          khóa ngoại liên kết tới bảng employees và các chỉ mục tối ưu truy vấn chấm công.
-- Chuẩn: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- ==============================================================================

SET NAMES utf8mb4;

-- 1. Tạo bảng attendances nếu chưa tồn tại
CREATE TABLE IF NOT EXISTS `attendances` (
    `attendance_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh bản ghi chấm công',
    `employee_id` INT NOT NULL COMMENT 'Khóa ngoại tham chiếu tới employees(employee_id)',
    `attendance_date` DATE NOT NULL COMMENT 'Ngày làm việc phát sinh công',
    `check_in` TIME NULL COMMENT 'Giờ vào ca (Server Time, vd: 08:15:00)',
    `check_out` TIME NULL COMMENT 'Giờ tan ca (Server Time, vd: 17:30:00)',
    `attendance_status` ENUM('OnTime', 'Late', 'EarlyLeave', 'Absent') NOT NULL DEFAULT 'OnTime' COMMENT 'Phân loại trạng thái chấm công: OnTime, Late, EarlyLeave, Absent',
    `note` VARCHAR(255) NULL COMMENT 'Ghi chú giải trình lý do đi muộn, về sớm hoặc công tác',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm ghi nhận chấm công',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật chấm công',

    -- Ràng buộc toàn vẹn khóa ngoại
    CONSTRAINT `fk_attendances_employee`
        FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- Ràng buộc duy nhất ngăn 1 nhân viên check-in nhiều lần trong 1 ngày làm việc
    CONSTRAINT `uk_attendances_emp_date` 
        UNIQUE (`employee_id`, `attendance_date`),

    -- Ràng buộc kiểm tra giờ vào - giờ ra hợp lệ
    CONSTRAINT `chk_attendances_time` 
        CHECK (`check_out` IS NULL OR `check_in` IS NULL OR `check_out` >= `check_in`),

    -- Chỉ mục tối ưu truy vấn
    INDEX `idx_attendances_date` (`attendance_date`),
    INDEX `idx_attendances_status` (`attendance_status`),
    INDEX `idx_attendances_emp_date` (`employee_id`, `attendance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng theo dõi chấm công hàng ngày của nhân viên';

-- 2. Đảm bảo cấu trúc idempotent cho CSDL đã có sẵn bảng attendances từ trước
SET @dbname = DATABASE();
SET @tablename = 'attendances';

-- 2.1 Kiểm tra và bổ sung ràng buộc UNIQUE (employee_id, attendance_date) nếu chưa có
SET @hasUniqueConstraint = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
    WHERE table_schema = @dbname 
      AND table_name = @tablename 
      AND constraint_type = 'UNIQUE' 
      AND constraint_name = 'uk_attendances_emp_date'
);

SET @sqlAddUnique = IF(
    @hasUniqueConstraint = 0,
    'ALTER TABLE `attendances` ADD CONSTRAINT `uk_attendances_emp_date` UNIQUE (`employee_id`, `attendance_date`);',
    'SELECT "Constraint uk_attendances_emp_date already exists" AS info;'
);

PREPARE stmtUnique FROM @sqlAddUnique;
EXECUTE stmtUnique;
DEALLOCATE PREPARE stmtUnique;
