-- ==============================================================================
-- ROLLBACK MIGRATION 004: XÓA TÀI KHOẢN PROMETHEUS MYSQL EXPORTER
-- ==============================================================================

DROP USER IF EXISTS 'exporter'@'%';
FLUSH PRIVILEGES;
