# KỊCH BẢN DEMO BẢO VỆ ĐỒ ÁN VÀ THUYẾT TRÌNH BÁO CÁO KỸ THUẬT
## HỌC PHẦN: TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM (TKQT HTPM K23)
### ĐỀ TÀI SỐ 10: HỆ THỐNG QUẢN LÝ NHÂN SỰ DOANH NGHIỆP (HRM - ICTU)
**Khoa Công nghệ Thông tin — Trường Đại học Công nghệ Thông tin & Truyền thông (ICTU)**  
**Thời lượng chuẩn:** 07 - 10 Phút | **Mục tiêu:** Thuyết phục Hội đồng chấm thi đạt điểm tối đa **10.0 / 10.0 điểm**

---

## 🎬 1. BẢNG PHÂN VAI & CÔNG TÁC CHUẨN BỊ TRƯỚC GIỜ BẢO VỆ

### 1.1. Phân vai thuyết trình:
- **Người trình bày 1 (Scrum Master & Technical Lead - Đỗ Quang Minh):** Mở đầu, giới thiệu tổng quan đề tài, kiến trúc hệ thống, đối chiếu 7 tiêu chí đánh giá và kết luận.
- **Người trình bày 2 (DevOps & SRE Engineer):** Trình diễn hạ tầng Docker Compose 13 containers, HTTPS Nginx, Prometheus 5 Targets, Grafana 3 Dashboards, Loki LogQL và mô phỏng kích hoạt cảnh báo Alertmanager Firing.
- **Người trình bày 3 (Backend & Security Engineer):** Trình diễn bảo mật CSDL (Mã hóa CCCD AES-256 bit nhị phân, băm HMAC-SHA-256, Least Privilege `app_user`), nghiệp vụ chấm công/báo cáo và chạy script Disaster Recovery `backup_restore.sh`.

### 1.2. Checklist chuẩn bị môi trường trước khi bước vào phòng bảo vệ:
- [ ] Khởi chạy 13 containers khỏe mạnh: `docker compose up -d`
- [ ] Kiểm tra trạng thái: `docker compose ps` (Tất cả container đều `healthy` hoặc `running`).
- [ ] Thêm domain `127.0.0.1 hrm.local` vào file hosts (`C:\Windows\System32\drivers\etc\hosts`).
- [ ] Mở sẵn 5 Tabs trình duyệt:
  1. **Tab 1 - HRM Web App:** `https://hrm.local/` (Giao diện đăng nhập HTTPS có ổ khóa xanh/chứng chỉ SSL).
  2. **Tab 2 - phpMyAdmin:** `https://hrm.local/phpmyadmin/` (Đã đăng nhập tài khoản `root`).
  3. **Tab 3 - Grafana Dashboards:** `http://localhost:3001/` (Dashboard Node Exporter & MySQL).
  4. **Tab 4 - Grafana Explore (LogQL):** `http://localhost:3001/explore` (Chọn datasource Loki).
  5. **Tab 5 - Prometheus & Alertmanager:** `http://localhost:9090/targets` và `http://localhost:9093/`.
- [ ] Mở sẵn 1 cửa sổ Terminal tại thư mục `d:\QLNS_QLTKPM`.

---

## ⏱️ 2. KỊCH BẢN CHI TIẾT THEO TỪNG PHÚT (TIMELINE 7 - 10 PHÚT)

### 🎙️ Phút 00:00 – 01:30: Mở đầu, Giới thiệu Kiến trúc & Cổng An ninh HTTPS (Commit 1)
- **Người trình bày 1 (Trưởng nhóm):**
  > *"Kính thưa quý Thầy/Cô trong Hội đồng chấm thi, em xin đại diện nhóm K23 trình bày đồ án Đề tài số 10: Xây dựng, Đóng gói Container hóa và Quản trị toàn diện Hệ thống Quản lý Nhân sự HRM ICTU."*
  > *"Đồ án của nhóm em không chỉ hoàn thành trọn vẹn nghiệp vụ nhân sự mà còn đáp ứng 100% cả 7 tiêu chí khắt khe của học phần, trải qua 3 Sprint với 3 Cột mốc Commit chính thức trên GitHub."*
- **Thao tác màn hình:**
  1. Mở trình duyệt tại địa chỉ `http://hrm.local/` $\rightarrow$ Thầy/Cô quan sát thấy trình duyệt tự động chuyển hướng **HTTP 301 sang HTTPS** `https://hrm.local/` với chứng chỉ SSL X.509 RSA 2048-bit.
  2. Bấm F12 mở tab **Network / Headers** $\rightarrow$ Chỉ rõ 6 Security Headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `CSP`.
  3. Mở tab **phpMyAdmin** tại `https://hrm.local/phpmyadmin/` $\rightarrow$ Đăng nhập thành công, chứng minh hoàn thành **Tiêu chí 1, 2 và Commit 1 (3.0 điểm)**.

---

### 🎙️ Phút 01:30 – 04:00: Nghiệp vụ Nhân sự, Bảo mật CCCD AES-256 & Ràng buộc toàn vẹn
- **Người trình bày 3 (Backend & Security):**
  > *"Em xin trình diễn các điểm sáng về an ninh dữ liệu và nghiệp vụ cốt lõi của hệ thống."*
- **Thao tác màn hình:**
  1. Đăng nhập tài khoản Admin (`admin / Admin@123`).
  2. Vào trang **Quản lý Nhân sự** $\rightarrow$ Thêm mới 1 nhân viên với số CCCD `038202008899`.
  3. Chuyển sang tab **phpMyAdmin**, truy vấn trực tiếp bảng `employees`:
     ```sql
     SELECT employee_id, full_name, ssn_encrypted, ssn_hash, ssn_masked FROM employees WHERE employee_code = 'NV...';
     ```
     $\rightarrow$ Chỉ rõ cho Thầy/Cô thấy cột `ssn_encrypted` là chuỗi nhị phân mã hóa bằng **AES-256 bit**, `ssn_hash` băm **HMAC-SHA-256** phục vụ tìm kiếm duy nhất, và `ssn_masked` hiển thị `0382******99`. Người quản trị DB không thể đọc trộm CCCD gốc nếu không có khóa bí mật!
  4. Sang trang **Quản lý Phòng ban** $\rightarrow$ Bấm nút "Xóa" một phòng ban đang có nhân viên $\rightarrow$ Hệ thống hiển thị Modal cảnh báo màu đỏ và API trả về `409 Conflict`, chặn xóa thành công, bảo vệ toàn vẹn dữ liệu.
  5. Đăng xuất và đăng nhập tài khoản Nhân viên thường (`emp1 / Emp@123`) $\rightarrow$ Thao tác **Check-in** chấm công thời gian thực, xem widget chấm công và chỉ xem được dữ liệu cá nhân (RBAC).

---

### 🎙️ Phút 04:00 – 06:30: Hệ thống Giám sát Prometheus, Grafana & Ghi nhật ký Loki LogQL (Commit 2 & Tiêu chí 5)
- **Người trình bày 2 (DevOps & SRE):**
  > *"Tiếp theo, em xin phép trình diễn hệ thống Giám sát và Nhật ký tập trung (Observability) của dự án."*
- **Thao tác màn hình:**
  1. Mở **Prometheus Targets** (`http://localhost:9090/targets`):
     $\rightarrow$ Trình diễn đủ **5/5 targets đều có trạng thái UP màu xanh lá** (`hrm-app`, `mysql-exporter`, `cadvisor`, `node-exporter`, `prometheus`).
  2. Mở **Grafana Dashboards** (`http://localhost:3001`):
     - Mở Dashboard **Node Exporter Full** $\rightarrow$ Biểu đồ CPU, RAM, Disk I/O chạy thời gian thực.
     - Mở Dashboard **MySQL Overview** $\rightarrow$ Thống kê kết nối CSDL và lưu lượng truy vấn QPS.
     $\rightarrow$ Chứng minh hoàn thành **Tiêu chí 4 và Commit 2**.
  3. Mở **Grafana Explore** (`http://localhost:3001/explore`):
     - Chọn Datasource **Loki**.
     - Nhập và chạy lần lượt 3 câu truy vấn LogQL:
       * `{container="hrm-app"}` $\rightarrow$ Toàn bộ log nghiệp vụ HTTP request hiển thị tức thì dạng Live tail.
       * `{container="hrm-app"} |= "error"` $\rightarrow$ Lọc bắt nhanh các lỗi ứng dụng.
       * `{container="hrm-nginx"}` $\rightarrow$ Nhật ký truy cập của cổng SSL Reverse Proxy.
     $\rightarrow$ Chứng minh hoàn thành xuất sắc **Tiêu chí số 5 (1.5 điểm)**.

---

### 🎙️ Phút 06:30 – 08:30: Kích hoạt Cảnh báo Alertmanager Firing, Hardening & Disaster Recovery (Commit 3)
- **Người trình bày 2 & 1:**
  > *"Đây là cột mốc Commit 3 - tiêu chí chấm điểm nâng cao nhất của đồ án."*
- **Thao tác màn hình:**
  1. Mở trang **Prometheus Alerts** (`http://localhost:9090/alerts`) $\rightarrow$ Cho Thầy/Cô xem 3 quy tắc: `HighCPUUsage`, `HighRAMUsage`, `MySQLTooManyConnections`.
  2. Mở Terminal, kích hoạt script stress test mô phỏng quá tải kết nối CSDL:
     ```bash
     node backend/tests/qaStressMysqlConnections.js
     ```
  3. F5 trang Prometheus Alerts $\rightarrow$ Quan sát rule `MySQLTooManyConnections` chuyển sang màu đỏ **FIRING**!
  4. Mở tab **Alertmanager** (`http://localhost:9093`) $\rightarrow$ Cảnh báo màu đỏ xuất hiện tức thì trên màn hình Alertmanager.
  5. Trình diễn Script sao lưu và phục hồi thảm họa CSDL an toàn:
     ```bash
     ./backup_restore.sh test-recovery
     ```
     $\rightarrow$ Script chạy tự động qua 6 bước: Thu thập baseline $\rightarrow$ Snapshot dump & gzip $\rightarrow$ Xác minh SHA-256 $\rightarrow$ Restore vào môi trường cô lập `hrm_db_restore_test` $\rightarrow$ Đối soát dữ liệu sâu (Deep Data Reconciliation khớp 100%) $\rightarrow$ Dọn dẹp an toàn. CSDL thật hoàn toàn không bị ảnh hưởng!

---

### 🎙️ Phút 08:30 – 10:00: Tổng kết Báo cáo Kỹ thuật, Lịch sử Git & Kết thúc
- **Người trình bày 1 (Trưởng nhóm):**
  > *"Kính thưa Thầy/Cô, toàn bộ quy trình phát triển và kiểm thử của nhóm đã được đúc kết thành Báo cáo Kỹ thuật tổng kết dài hơn 12 trang A4 chuẩn học thuật ICTU (`docs/BAO_CAO_KY_THUAT_MOC_3_ICTU.md`) cùng bộ kiểm thử E2E 35/35 test cases (100% Pass)."*
  > *"Trên GitHub, nhóm đã hoàn thành trọn vẹn cả 3 Cột mốc Commit với Commit 3: `feat(logging-hardening): implement loki centralized logging, logql queries, alertmanager rules, security hardening, and final report`."*
  > *"Nhóm em tự tin hệ thống đạt trọn vẹn 10.0 / 10.0 điểm theo đúng Barem của học phần. Chúng em xin chân thành cảm ơn quý Thầy/Cô và rất mong nhận được câu hỏi phản biện từ Hội đồng!"*

---

## ❓ 3. BỘ CÂU HỎI VẤN ĐÁP TIỀM NĂNG CỦA HỘI ĐỒNG & CÂU TRẢ LỜI MẪU (10/10 ĐIỂM)

### Câu hỏi 1: Tại sao hệ thống lại chia thành 2 Docker Network `app-network` và `monitoring` thay vì dùng 1 mạng chung?
- **Trả lời mẫu:**  
  *Dạ thưa Thầy/Cô, việc phân tách 2 mạng nội bộ nhằm thực thi nguyên tắc "Phân tách đặc quyền và cô lập bề mặt tấn công" (Network Segmentation & Least Privilege) theo chuẩn DevSecOps. Mạng `app-network` chỉ phục vụ các dịch vụ người dùng cuối. Các dịch vụ giám sát trong mạng `monitoring` (như Prometheus, Alertmanager, Exporter) chứa nhiều thông tin nhạy cảm về hệ thống máy chủ và không có lý do gì để các container người dùng truy cập trực tiếp. Nếu một container ứng dụng như Backend bị tấn công, kẻ tấn công cũng không thể trực tiếp xâm nhập hoặc can thiệp vào hạ tầng giám sát.*

### Câu hỏi 2: Làm thế nào hệ thống đảm bảo không bị mất dữ liệu nhị phân khi mã hóa CCCD bằng AES-256 lúc sao lưu CSDL?
- **Trả lời mẫu:**  
  *Dạ thưa Thầy/Cô, cột `ssn_encrypted` được lưu ở kiểu dữ liệu `VARBINARY(255)`. Nếu chạy lệnh `mysqldump` thông thường, dữ liệu nhị phân sẽ bị diễn giải thành ký tự văn bản theo bảng mã, dẫn đến mất bit hoặc lỗi encoding khi restore. Nhóm em đã giải quyết triệt để bằng cách cấu hình tùy chọn `--hex-blob` trong lệnh `mysqldump` của script `backup_restore.sh`. Khi đó, toàn bộ chuỗi nhị phân được xuất thành chuỗi Hexadecimal an toàn (`0x4A6F...`), kết hợp cờ `--default-character-set=utf8mb4` và nén `gzip -9`, đảm bảo dữ liệu phục hồi nguyên vẹn 100% từng bit.*

### Câu hỏi 3: Trong kịch bản khôi phục thảm họa (Disaster Recovery), làm sao để đảm bảo lệnh restore không vô tình ghi đè phá hủy dữ liệu đang chạy thật?
- **Trả lời mẫu:**  
  *Dạ thưa Thầy/Cô, script `backup_restore.sh` của nhóm triển khai cơ chế **Restore Safety Guard** nghiêm ngặt: Mặc định mọi thao tác restore đều được định tuyến vào cơ sở dữ liệu kiểm thử cô lập `hrm_db_restore_test`. Nếu người vận hành muốn restore vào database production `hrm_db`, hệ thống sẽ từ chối ngay lập tức và bắt buộc người dùng phải gõ chính xác cụm từ `YES_RESTORE_PRODUCTION`. Nhấn Enter, để trống hoặc gõ bất kỳ từ nào khác đều bị hủy bỏ ngay lập tức, loại bỏ hoàn toàn rủi ro thao tác nhầm của con người.*

### Câu hỏi 4: Ngôn ngữ truy vấn LogQL trong Grafana Loki khác gì so với PromQL trong Prometheus?
- **Trả lời mẫu:**  
  *Dạ thưa Thầy/Cô, PromQL được thiết kế chuyên biệt để xử lý dữ liệu số chuỗi thời gian (Metrics: Gauge, Counter, Histogram) phục vụ vẽ biểu đồ và đánh giá ngưỡng cảnh báo. Trong khi đó, LogQL của Loki được thiết kế lấy cảm hứng từ cú pháp của PromQL nhưng đối tượng xử lý là các dòng văn bản nhật ký (Log Streams). LogQL sử dụng Stream Selectors (ví dụ `{container="hrm-app"}`) kết hợp với các bộ lọc văn bản (Filter Operators: `|=`, `!~`) hoặc Parser (JSON, Logfmt) để bóc tách thông tin lỗi từ log mà không cần phải index toàn bộ nội dung, giúp tiết kiệm bộ nhớ và đĩa cứng vượt trội.*
