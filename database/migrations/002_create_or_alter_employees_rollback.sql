-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - ROLLBACK MIGRATION 002
-- Tên: 002_create_or_alter_employees_rollback.sql
-- Mục đích: Rollback các thay đổi của migration 002 trên bảng employees
-- ==============================================================================

SET NAMES utf8mb4;

SET @dbname = DATABASE();
SET @tablename = 'employees';

-- 1. Xóa ràng buộc UNIQUE uk_employees_ssn_hash nếu tồn tại
SET @hasIndexSsnHash = (
    SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'uk_employees_ssn_hash'
);
SET @sqlDropIndex = IF(
    @hasIndexSsnHash > 0, 
    'ALTER TABLE `employees` DROP INDEX `uk_employees_ssn_hash`', 
    'SELECT 1'
);
PREPARE stmtDropIndex FROM @sqlDropIndex;
EXECUTE stmtDropIndex;
DEALLOCATE PREPARE stmtDropIndex;

-- 2. Xóa cột ssn_hash nếu tồn tại
SET @hasSsnHash = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'ssn_hash'
);
SET @sqlDropSsnHash = IF(
    @hasSsnHash > 0, 
    'ALTER TABLE `employees` DROP COLUMN `ssn_hash`', 
    'SELECT 1'
);
PREPARE stmtDropSsnHash FROM @sqlDropSsnHash;
EXECUTE stmtDropSsnHash;
DEALLOCATE PREPARE stmtDropSsnHash;

-- 3. Xóa cột address nếu tồn tại
SET @hasAddress = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'address'
);
SET @sqlDropAddress = IF(
    @hasAddress > 0, 
    'ALTER TABLE `employees` DROP COLUMN `address`', 
    'SELECT 1'
);
PREPARE stmtDropAddress FROM @sqlDropAddress;
EXECUTE stmtDropAddress;
DEALLOCATE PREPARE stmtDropAddress;
