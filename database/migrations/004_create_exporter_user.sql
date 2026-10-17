-- ==============================================================================
-- MIGRATION 004: KHỞI TẠO TÀI KHOẢN PROMETHEUS MYSQL EXPORTER (LEAST PRIVILEGE)
-- Chuẩn bảo mật Sprint 2 (US-21 / US-29.0):
-- - Chỉ cấp quyền PROCESS, REPLICATION CLIENT và SELECT trên performance_schema
-- - Tuyệt đối không cấp quyền truy cập dữ liệu nhân sự, lương hay bảng ứng dụng
-- - Giới hạn tối đa 3 kết nối đồng thời (MAX_USER_CONNECTIONS 3)
-- ==============================================================================

CREATE USER IF NOT EXISTS 'exporter'@'%' 
IDENTIFIED BY 'Pr0m3th3us@M0n2026!' 
WITH MAX_USER_CONNECTIONS 3;

REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'exporter'@'%';

GRANT PROCESS, REPLICATION CLIENT ON *.* TO 'exporter'@'%';
GRANT SELECT ON `performance_schema`.* TO 'exporter'@'%';

FLUSH PRIVILEGES;
