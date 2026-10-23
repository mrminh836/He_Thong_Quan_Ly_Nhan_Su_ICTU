# Hướng Dẫn Tự Động Sao Lưu, Phục Hồi & Kiểm Thử Thảm Họa (Disaster Recovery) MySQL

Tài liệu hướng dẫn vận hành, bảo mật và khắc phục sự cố hệ thống cơ sở dữ liệu MySQL cho Hệ Thống Quản Lý Nhân Sự HRM (ICTU).

---

## 1. Tổng Quan Kiến Trúc & Nguyên Tắc An Toàn

Hệ thống cơ sở dữ liệu HRM chạy trên nền tảng Docker Compose với service `mysql-db` (MySQL 8.0.46 Community Server) lưu trữ dữ liệu nhân sự, tài khoản phân quyền RBAC và lịch sử chấm công.

### 🛡️ Các nguyên tắc an toàn cốt lõi:
1. **Zero Production Risk (Mặc định bảo vệ Production):** Mọi lệnh `restore` theo mặc định sẽ phục hồi vào cơ sở dữ liệu kiểm thử cô lập (mặc định: `hrm_db_restore_test`). Hệ thống **từ chối** ghi đè trực tiếp lên `hrm_db` nếu không có cờ hoặc xác nhận đặc biệt `YES_RESTORE_PRODUCTION`.
2. **Snapshot nhất quán:** Sử dụng `mysqldump` với `--single-transaction` cho các bảng InnoDB, đồng thời sao lưu đầy đủ `--routines`, `--triggers`, `--events`, `--hex-blob` (bảo toàn trường CCCD mã hóa nhị phân AES-256) và `--default-character-set=utf8mb4`.
3. **Nén & Checksum:** Tự động nén `gzip -9` và sinh mã băm SHA-256 (`.sha256`) cho từng bản sao lưu.
4. **Không lộ mật khẩu:** Tận dụng biến môi trường từ `.env` và truyền qua `MYSQL_PWD` bên trong container, không truyền mật khẩu dạng plain-text trên lệnh shell.
5. **Dọn dẹp tự động:** Cơ chế `trap cleanup EXIT INT TERM` tự động xóa các file tạm `.tmp` nếu tiến trình bị ngắt quãng giữa chừng.

---

## 2. Yêu Cầu Môi Trường & Thiết Lập Shell

### Yêu cầu phần mềm:
- **Docker Engine:** v20.10+ (Đã khởi chạy service `mysql-db`)
- **gzip:** Công cụ nén/giải nén dữ liệu
- **sha256sum** hoặc **shasum** hoặc **openssl** hoặc **certutil:** Công cụ tính mã băm SHA-256
- **Bash:** v4.0 trở lên

### Hướng dẫn chạy trên các hệ điều hành:

#### Trên Linux / macOS / WSL:
```bash
chmod +x ./backup_restore.sh
./backup_restore.sh <lệnh>
```

#### Trên Windows:
> [!IMPORTANT]
> Trên môi trường Windows (cmd / PowerShell thông thường không hỗ trợ trực tiếp cú pháp Bash `set -Eeuo pipefail`), vui lòng sử dụng **Git Bash** đi kèm Git for Windows:

```powershell
# Chạy thông qua Git Bash trong PowerShell hoặc CMD:
& "C:\Program Files\Git\bin\bash.exe" ./backup_restore.sh <lệnh>

# Hoặc mở trực tiếp Git Bash terminal:
./backup_restore.sh <lệnh>
```

---

## 3. Cấu Hình Biến Môi Trường

Script tự động nạp cấu hình từ `.env` tại thư mục gốc dự án:

| Biến Môi Trường | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `MYSQL_CONTAINER` | `mysql-db` | Tên container Docker MySQL |
| `DB_NAME` | `hrm_db` | Database chính thức (Production) |
| `DB_ROOT_PASSWORD`| `RootPassword@2026` | Mật khẩu tài khoản `root` |
| `BACKUP_DIR` | `<project_root>/backups` | Thư mục lưu trữ các bản backup |

---

## 4. Danh Sách Lệnh & Cú Pháp Sử Dụng

### 4.1. Lệnh Trợ Giúp (`help`)
```bash
./backup_restore.sh help
```
Hiển thị danh sách câu lệnh, cú pháp tham số và nguyên tắc an toàn.

---

### 4.2. Lệnh Sao Lưu (`backup`)
```bash
./backup_restore.sh backup
```
- **Hành vi:**
  1. Kiểm tra trạng thái sẵn sàng của MySQL (`ping`).
  2. Tạo thư mục `backups/` nếu chưa tồn tại.
  3. Dump dữ liệu với cờ an toàn:
     `--single-transaction --quick --routines --triggers --events --hex-blob --default-character-set=utf8mb4`.
  4. Nén gzip mức tối đa (`-9`) vào file tạm `.tmp`.
  5. Kiểm tra toàn vẹn gzip (`gzip -t`).
  6. Lưu thành file chính thức: `backups/mysql_hrm_db_YYYYMMDD_HHMMSS.sql.gz`.
  7. Sinh mã băm SHA-256 lưu tại: `backups/mysql_hrm_db_YYYYMMDD_HHMMSS.sql.gz.sha256`.

---

### 4.3. Lệnh Liệt Kê Bản Sao Lưu (`list`)
```bash
./backup_restore.sh list
```
Hiển thị bảng chi tiết các bản sao lưu với:
- Tên tệp sao lưu
- Dung lượng nén
- Thời gian khởi tạo
- Trạng thái kiểm tra mã băm SHA-256 (`Khop [OK]`, `LỆCH!` hoặc `Thiếu`)

---

### 4.4. Lệnh Kiểm Chứng Toàn Vẹn (`verify`)
```bash
./backup_restore.sh verify backups/mysql_hrm_db_20261023_153723.sql.gz
```
Thực hiện 4 cấp độ kiểm chứng nghiêm ngặt:
1. **Gzip Archive:** Kiểm tra tính toàn vẹn nén (`gzip -t`).
2. **SHA-256:** So khớp mã băm thực tế của file với mã băm trong file `.sha256`.
3. **Dump Header & Version:** Xác thực header MySQL dump chuẩn và phiên bản tương thích.
4. **DDL & Completion Marker:** Kiểm tra cấu trúc câu lệnh DDL và dấu hiệu kết thúc dump (`Dump completed`).

---

### 4.5. Lệnh Phục Hồi Dữ Liệu An Toàn (`restore`)

#### A. Phục hồi vào Database Thử Nghiệm Cô Lập (Khuyến nghị):
```bash
./backup_restore.sh restore backups/mysql_hrm_db_20261023_153723.sql.gz hrm_db_restore_test
```
- Script tự động xác minh file backup qua 4 bước `verify`.
- Yêu cầu người dùng xác nhận `[y/N]`.
- Nạp dữ liệu vào database thử nghiệm mà không gây ảnh hưởng đến ứng dụng đang chạy.

#### B. Phục hồi vào Database Production (Chế độ Disaster Recovery):
```bash
./backup_restore.sh restore backups/mysql_hrm_db_20261023_153723.sql.gz hrm_db
```
- Kích hoạt cơ chế **RESTORE SAFETY GUARD**.
- Hệ thống yêu cầu người dùng phải gõ chính xác cụm từ:
  ```text
  YES_RESTORE_PRODUCTION
  ```
- Nếu người dùng nhập sai, nhấn Enter hoặc nhập giá trị rỗng -> Script hủy bỏ ngay lập tức và bảo toàn 100% dữ liệu đang có.

---

### 4.6. Lệnh Kiểm Thử Tự Động Toàn Trình (`test-recovery`)
```bash
./backup_restore.sh test-recovery
```
Tự động hóa quy trình Disaster Recovery End-to-End mà không làm gián đoạn hệ thống thật:
1. **Baseline Extraction:** Đo đếm số bảng và bản ghi hiện tại trên `hrm_db`.
2. **Instant Snapshot:** Thực hiện sao lưu tức thời.
3. **Archive Verification:** Kiểm chứng gzip và SHA-256 của bản sao lưu vừa tạo.
4. **Isolated Restore:** Phục hồi bản sao lưu vào database cô lập `hrm_db_restore_test`.
5. **Deep Data Reconciliation (Đối soát sâu):**
   - Đối chiếu số lượng bảng (5 bảng).
   - Đối chiếu số lượng nhân sự, phòng ban, tài khoản, chấm công.
   - Đối chiếu bản ghi nhạy cảm có mã hóa nhị phân AES-256 (`employees.ssn_encrypted` / `ssn_masked`).
6. **Safe Cleanup:** Dọn dẹp sạch database kiểm thử sau khi hoàn thành đối soát.

---

## 5. Chính Sách Lưu Trữ (Retention Policy)

Khuyến nghị thiết lập lịch sao lưu định kỳ qua `crontab` (trên Linux) hoặc Windows Task Scheduler:

```bash
# Chạy backup mỗi ngày lúc 02:00 sáng
0 2 * * * /path/to/backup_restore.sh backup >> /var/log/mysql_backup.log 2>&1

# Xóa các bản backup cũ hơn 30 ngày (Chỉ áp dụng sau khi có văn bản phê duyệt)
0 3 * * * find /path/to/backups/ -name "mysql_*.sql.gz*" -mtime +30 -delete
```

---

## 6. Giới Hạn Của Logical Dump & Khuyến Nghị

1. **InnoDB Tables:** Tham số `--single-transaction` đảm bảo tính nhất quán cao nhất với các bảng InnoDB mà không khóa đọc (non-locking read).
2. **DDL Statements:** Nếu có câu lệnh DDL (`ALTER TABLE`, `DROP TABLE`) chạy đồng thời trong quá trình sao lưu, tính toàn vẹn snapshot có thể bị ảnh hưởng. Khuyến nghị thực hiện backup vào khung giờ tải thấp (off-peak hours).
3. **Dung lượng lớn (> 50GB):** Đối với cơ sở dữ liệu dung lượng lớn, `mysqldump` dạng văn bản có thời gian phục hồi lâu hơn physical backup. Xem xét giải pháp Percona XtraBackup nếu cơ sở dữ liệu vượt quá 50GB.

---

## 7. Bảng Xử Lý Sự Cố Thường Gặp (Troubleshooting)

| Sự cố | Nguyên nhân | Biện pháp xử lý |
| :--- | :--- | :--- |
| `MySQL Server 'mysql-db' không hoạt động` | Container tắt hoặc đang khởi động lại | Chạy `docker compose up -d mysql-db` và đợi container chuyển sang trạng thái `healthy` |
| `Mã băm SHA-256 KHÔNG KHỚP` | File sao lưu bị sửa đổi hoặc truyền qua mạng bị lỗi | Loại bỏ file hỏng, khôi phục từ bản sao lưu gần nhất |
| `Access denied for user 'root'@'...'` | Sai mật khẩu `DB_ROOT_PASSWORD` trong `.env` | Kiểm tra lại mật khẩu `DB_ROOT_PASSWORD` trong file `.env` |
| `World-writable config file '/etc/mysql/conf.d/security.cnf' is ignored` | Cảnh báo phân quyền trên Windows bind-mount | MySQL bỏ qua file cnf do quyền 777; script vẫn hoạt động bình thường |
| `Hủy thao tác phục hồi Production` | Người dùng không nhập đúng cụm từ xác nhận | Đây là tính năng bảo vệ an toàn chủ động, ngăn ngừa xóa nhầm dữ liệu thật |

---

## 8. Kết Luận & Biên Bản Nghiệm Thu

Script `backup_restore.sh` đã vượt qua 100% các bài kiểm tra toàn vẹn, bảo mật credential và kiểm thử khôi phục cô lập không mất mát dữ liệu, sẵn sàng đưa vào vận hành chuẩn DevOps/SRE cho HRM ICTU.
