# MySQL Backup & Restore Documentation

Vui lòng tham khảo tài liệu hướng dẫn vận hành chi tiết tại:
👉 [BACKUP_RESTORE_GUIDE.md](file:///d:/QLNS_QLTKPM/docs/BACKUP_RESTORE_GUIDE.md)

### Tóm tắt các lệnh nhanh:
```bash
# 1. Sao lưu tự động:
./backup_restore.sh backup

# 2. Liệt kê bản sao lưu:
./backup_restore.sh list

# 3. Kiểm chứng toàn vẹn:
./backup_restore.sh verify backups/<file>.sql.gz

# 4. Phục hồi an toàn (vào DB test):
./backup_restore.sh restore backups/<file>.sql.gz hrm_db_restore_test

# 5. Kiểm thử Disaster Recovery tự động cô lập:
./backup_restore.sh test-recovery
```
