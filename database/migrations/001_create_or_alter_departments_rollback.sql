-- ==============================================================================
-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - MIGRATION 001 ROLLBACK
-- Tên: 001_create_or_alter_departments_rollback.sql
-- Mục đích: Hoàn tác migration 001 an toàn không làm mất bảng hay dữ liệu
-- ==============================================================================

SET NAMES utf8mb4;

-- Gỡ bỏ ràng buộc UNIQUE uk_departments_name một cách an toàn nếu tồn tại
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
    'ALTER TABLE `departments` DROP INDEX `uk_departments_name`',
    'SELECT 1'
));

PREPARE dropIfExists FROM @preparedStatement;
EXECUTE dropIfExists;
DEALLOCATE PREPARE dropIfExists;
