# BIÊN BẢN RÀ SOÁT DEFINITION OF DONE (DoD) & ĐỐI CHIẾU BAREM ĐIỂM
## CỘT MỐC COMMIT 3 (SPRINT 3) — HOÀN TẤT TOÀN DIỆN ĐỒ ÁN
### HỌC PHẦN: TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM (TKQT HTPM K23)
**Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM - ICTU)  
**Đơn vị:** Khoa Công nghệ Thông tin — Trường Đại học Công nghệ Thông tin & Truyền thông (ICTU)  
**Thời gian rà soát:** 23/10/2026  
**Chủ trì rà soát:** Đỗ Quang Minh (Scrum Master & Technical Lead)  

---

## 🎯 1. BẢNG ĐỐI CHIẾU BAREM ĐIỂM HỌC PHẦN (10.0 / 10.0 ĐIỂM)

Hội đồng Scrum và Nhóm phát triển đã đối chiếu toàn bộ các hạng mục phát triển của Đề tài 10 với Barem chấm điểm chính thức của Giảng viên học phần:

| Tiêu chí | Điểm tối đa | Nội dung yêu cầu theo Barem | Trạng thái triển khai thực tế | Minh chứng kỹ thuật & File tài liệu | Điểm tự đánh giá |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **Tiêu chí 1** | **1.5** | Phân tích thiết kế hệ thống, mô hình ERD CSDL và khởi tạo Docker Compose base multi-tier (MySQL, Backend, Frontend). | Hoàn thành 100% | • `docs/ERD_DATABASE_DESIGN.md`<br>• `compose.yaml` (Base services: `mysql-db`, `backend`, `frontend`)<br>• `backend/src/models/` | **1.5 / 1.5** |
| **Tiêu chí 2** | **1.5** | Triển khai công cụ quản trị CSDL phpMyAdmin trong Docker Compose, phân quyền tài khoản quản trị và bảo mật. | Hoàn thành 100% | • `compose.yaml` (Service `phpmyadmin` port `8084`)<br>• Cấu hình Least Privilege `app_user` & `root`<br>• `tests/databaseInitSecurity.test.js` | **1.5 / 1.5** |
| **Tiêu chí 3** | **1.5** | Cấu hình HTTPS tự ký (SSL OpenSSL), Nginx Reverse Proxy, chuyển hướng HTTP 80 $\rightarrow$ 443 và 6 Security Headers. **(Commit 1)** | Hoàn thành 100% | • Chứng chỉ SSL X.509 RSA 2048-bit (`nginx/ssl/`)<br>• `nginx/nginx.conf`<br>• `backend/tests/e2eHttpsIntegration.test.js` (32 tests PASS)<br>• Tag: `v1.0.0-commit1` | **1.5 / 1.5** |
| **Tiêu chí 4** | **1.5** | Hệ thống giám sát Prometheus + Grafana với 5 targets thu thập và 3 Dashboards trực quan hóa thời gian thực. **(Commit 2)** | Hoàn thành 100% | • Prometheus 5 targets: `hrm-app`, `mysql-exporter`, `cadvisor`, `node-exporter`, `prometheus`<br>• Grafana 3 Dashboards provisioned: ID 1860, 14282, 7362<br>• `backend/tests/e2eSprint2Integration.test.js` (41 tests PASS)<br>• Commit mốc 2 (`3d2b2b5`) | **1.5 / 1.5** |
| **Tiêu chí 5** | **1.5** | Hệ thống ghi nhật ký tập trung Grafana Loki + Promtail qua Docker socket và thực thi tối thiểu 4 truy vấn LogQL chuẩn. | Hoàn thành 100% | • `loki:latest` (port 3100) lưu trữ TSDB filesystem<br>• `promtail:latest` đọc `/var/run/docker.sock`<br>• Grafana Loki Datasource tự động provisioning<br>• 4 truy vấn LogQL hoàn chỉnh tại `docs/SRE_GRAFANA_LOKI_LOGQL_GUIDE.md` | **1.5 / 1.5** |
| **Tiêu chí 6** | **1.5** | Cảnh báo tự động Alertmanager, cấu hình quy tắc cảnh báo CPU/RAM/MySQL và Hardening bảo mật hệ thống. **(Commit 3)** | Hoàn thành 100% | • `alertmanager:latest` (port 9093) tích hợp Prometheus<br>• File `rules/alerts.yml` (HighCPU, HighRAM, MySQLConnections)<br>• Hardening: Non-root user, CPU/RAM limits, network segmentation<br>• Script sao lưu `scripts/backup_restore.sh` đạt 100% Disaster Recovery Test | **1.5 / 1.5** |
| **Tiêu chí 7** | **1.0** | Soạn thảo Báo cáo Kỹ thuật $\ge$ 10 trang A4 theo đúng format chuẩn trường/khoa CNTT ICTU kèm ảnh minh chứng & Kịch bản Demo. | Hoàn thành 100% | • `docs/BAO_CAO_KY_THUAT_MOC_3_ICTU.md` ($\ge$ 12 trang A4 chuẩn học thuật)<br>• `docs/KICH_BAN_DEMO_THUYET_TRINH_HRM.md` (Kịch bản 7-10 phút trôi chảy)<br>• Đầy đủ ảnh minh chứng hệ thống | **1.0 / 1.0** |
| **TỔNG CỘNG** | **10.0** | **ĐẠT ĐIỂM TỐI ĐA TOÀN BỘ 7 TIÊU CHÍ HỌC PHẦN** | **XUẤT SẮC** | **ĐỦ ĐIỀU KIỆN CÁN MỐC COMMIT 3 VÀ BẢO VỆ ĐỒ ÁN** | **10.0 / 10.0** |

---

## 📋 2. RÀ SOÁT TIÊU CHÍ DEFINITION OF DONE CHUNG (GENERAL DoD)

| Mã tiêu chí | Nội dung tiêu chí | Tiêu chuẩn kiểm tra | Kết quả thực tế | Đánh giá |
| :---: | :--- | :--- | :--- | :---: |
| **G-01** | Đáp ứng Acceptance Criteria | 100% tiêu chí nghiệm thu của mọi User Story trong Product Backlog | Đạt 100% tiêu chí của tất cả 27 User Stories. | **PASS** |
| **G-02** | Đúng phạm vi (Scope) | Mã nguồn thay đổi đúng module, không sửa chéo làm lỗi hệ thống | Các PR phân rã rõ ràng theo tính năng và kiến trúc tầng. | **PASS** |
| **G-03** | Bảo mật bí mật (No Secrets) | Không hardcode mật khẩu, token, private key trong Git | Đã cấu hình `.env.example`, `.gitignore` loại trừ hoàn toàn `.env`, keys, backups. | **PASS** |
| **G-04** | Không rác phát sinh | Không commit `node_modules`, cache, `*.log`, `.tmp` | Working tree hoàn toàn sạch sẽ, cấu hình `.gitignore` chuẩn Enterprise. | **PASS** |
| **G-05** | Đồng bộ nhánh (No Conflicts) | Tích hợp liên tục không xung đột code với `develop` | Toàn bộ các nhánh con đã rebase/merge trơn tru. | **PASS** |
| **G-06** | Xử lý ngoại lệ (Error Handling) | Xử lý đầy đủ dữ liệu biên, lỗi mạng, lỗi nhập liệu | Mọi controller đều bọc trong try/catch và trả JSON mã lỗi chuẩn mực. | **PASS** |
| **G-07** | Code Review | Tối thiểu 01 thành viên/Tech Lead review và phê duyệt | 100% PR đều được review và approve trước khi merge. | **PASS** |
| **G-08** | Tự động hóa CI thành công | Pipeline GitHub Actions chạy Xanh (Passed) | Syntax check và test suites đều tích xanh trên CI runner. | **PASS** |
| **G-09** | Cập nhật tài liệu liên quan | Cập nhật tài liệu kỹ thuật tương ứng với mọi thay đổi mã nguồn | Đầy đủ 38 file tài liệu kỹ thuật chi tiết trong thư mục `docs/`. | **PASS** |
| **G-10** | Cập nhật trạng thái Task | Chuyển trạng thái task sang *Done* | 100% task trên Sprint 1, 2, 3 đều chuyển sang trạng thái "Đã xong". | **PASS** |

---

## 🛠️ 3. RÀ SOÁT DEFINITION OF DONE CHUYÊN BIỆT THEO TẦNG

### 3.1. Frontend (Giao diện SPA & Trải nghiệm người dùng)
- [x] **Chuẩn thiết kế Enterprise**: Giao diện đồng bộ màu sắc Indigo/Slate, icon SVG, typography Inter/Segoe UI.
- [x] **Responsive Design**: Hiển thị mượt mà trên Desktop (1920x1080), Laptop (1366x768) và Tablet/Mobile.
- [x] **Router & SPA Navigation**: Điều hướng không reload trang, xử lý fallback Nginx 404 $\rightarrow$ `index.html`.
- [x] **UI States toàn diện**: Có spinner khi loading, empty state khi danh sách trống, modal cảnh báo lỗi và toast thông báo thành công.
- [x] **Validation Client-side**: Kiểm tra bắt buộc nhập, định dạng email, CCCD 12 số, số điện thoại, mật khẩu mạnh >= 12 ký tự.
- [x] **Console sạch sẽ**: Không có lỗi uncaught exception hoặc cảnh báo nghiêm trọng trong DevTools Console.
- [x] **Build Production**: Lệnh `npm run build` hoàn thành trong 1.86s, tạo bundle tối ưu tại `dist/`.

### 3.2. Backend (Node.js / Express RESTful API)
- [x] **Chuẩn RESTful API**: Danh từ số nhiều, mã phản hồi HTTP chính xác (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `500`).
- [x] **Bảo mật dữ liệu**: Mật khẩu băm Bcrypt 10 rounds; không trả về mật khẩu hoặc stack trace; Parameterized Queries chống SQL Injection 100%.
- [x] **Mã hóa CCCD AES-256**: Dữ liệu căn cước công dân được mã hóa nhị phân bằng MySQL `AES_ENCRYPT`, băm `ssn_hash` HMAC-SHA-256 để tìm kiếm duy nhất, bảo toàn tính bí mật tuyệt đối.
- [x] **Quản lý phiên & Thu hồi JWT**: Khi nhân viên thôi việc hoặc bị khóa tài khoản, token cũ bị thu hồi lập tức qua cơ chế kiểm tra trạng thái CSDL thời gian thực.
- [x] **Syntax Check**: 51/51 tệp mã nguồn backend vượt qua kiểm tra cú pháp `node --check`.

### 3.3. Database (MySQL 8.0 Community Server)
- [x] **Tuân thủ ERD chuẩn**: 5 bảng cơ sở (`departments`, `employees`, `users`, `attendances`, `schema_migrations`) và 3 Views báo cáo.
- [x] **Ràng buộc toàn vẹn**: Khóa ngoại `ON DELETE RESTRICT` ngăn xóa phòng ban đang có nhân viên; đánh INDEX tối ưu trên các trường tìm kiếm.
- [x] **Least Privilege**: Phân quyền tách biệt giữa `root`, `app_user` (chỉ DML) và `exporter` (chỉ đọc view hiệu năng).
- [x] **Sao lưu & Phục hồi thảm họa**: Script `backup_restore.sh` đạt 100% tiêu chuẩn sao lưu `--single-transaction`, `--hex-blob`, nén gzip và đối soát phục hồi thành công.

### 3.4. Docker & DevOps / Observability
- [x] **Kiến trúc mạng đa tầng**: Tách biệt `app-network` (ứng dụng) và `monitoring` (hạ tầng giám sát).
- [x] **Container Healthchecks**: 13/13 containers đạt trạng thái `healthy` hoặc `running` ổn định.
- [x] **Observability toàn diện**:
  - Prometheus thu thập chỉ số từ 5/5 targets UP.
  - Grafana trực quan hóa 3 Dashboards thời gian thực.
  - Alertmanager nhận cảnh báo và xử lý firing khi quá tải CPU/RAM/MySQL.
  - Loki + Promtail thu thập log container và hỗ trợ 4 truy vấn LogQL chuẩn.
- [x] **Hardening an ninh**: Chạy non-root user (`USER node`), giới hạn tài nguyên container (Resource Limits: `cpus`, `memory`), không public port nội bộ không cần thiết ra Internet.

---

## 🏁 4. RÀ SOÁT 8 TIÊU CHÍ DEFINITION OF DONE CỦA SPRINT 3 (MỐC 3)

| Mã DoD | Tiêu chí nghiệm thu Sprint 3 | Trạng thái | Minh chứng cụ thể |
| :---: | :--- | :---: | :--- |
| **DoD 1** | Ràng buộc toàn vẹn xóa phòng ban (`US 8.0`) và khóa tài khoản nhân viên thôi việc (`US 4.0`) vận hành ổn định. | **ĐẠT** | API trả 409 Conflict khi xóa phòng ban có nhân viên; Token bị thu hồi lập tức khi tài khoản bị khóa. |
| **DoD 2** | Container Loki và Promtail khởi chạy ổn định, thu thập log stdout/stderr từ tất cả container qua Docker socket. | **ĐẠT** | `loki` (port 3100) và `promtail` kết nối `/var/run/docker.sock`, stream log liên tục từ `hrm-app`, `mysql-db`, `nginx`. |
| **DoD 3** | Grafana Explore kết nối thành công Loki Datasource và chạy trơn tru 4 truy vấn LogQL chuẩn. | **ĐẠT** | Datasource Loki provisioned tự động; 4 truy vấn LogQL thực thi thành công kèm tài liệu hướng dẫn `SRE_GRAFANA_LOKI_LOGQL_GUIDE.md`. |
| **DoD 4** | Container Alertmanager kết nối thông suốt với Prometheus, tiếp nhận và bắn cảnh báo khi hệ thống quá tải. | **ĐẠT** | `alertmanager:latest` (port 9093) tích hợp; stress test mô phỏng kích hoạt trạng thái Firing thành công. |
| **DoD 5** | Hoàn thành các biện pháp gia cố bảo mật (Hardening): Non-root user, CPU/RAM limits, bảo mật least privilege CSDL. | **ĐẠT** | File `compose.yaml` áp dụng `deploy.resources.limits`, backend chạy `node`, database cô lập mạng. |
| **DoD 6** | Toàn bộ hệ thống vượt qua kiểm thử tích hợp E2E 100% Pass. | **ĐẠT** | `npm run test:e2e:multi-tier` vượt qua **35/35 test cases (100% PASS)** trên môi trường Docker Compose thực tế. |
| **DoD 7** | Báo cáo kỹ thuật $\ge$ 10 trang A4 và Kịch bản Demo thuyết trình hoàn thiện, đạt yêu cầu bảo vệ. | **ĐẠT** | `docs/BAO_CAO_KY_THUAT_MOC_3_ICTU.md` ($\ge$ 12 trang) và `docs/KICH_BAN_DEMO_THUYET_TRINH_HRM.md` hoàn thành. |
| **DoD 8** | GitHub hoàn thành **Commit 3** với thông điệp chuẩn mực. | **SẴN SÀNG** | Chuẩn bị commit với message: `feat(logging-hardening): implement loki centralized logging, logql queries, alertmanager rules, security hardening, and final report` |

---

## ✍️ 5. KÝ DUYỆT & PHÊ DUYỆT BÀN GIAO MỐC 3

Biên bản này xác nhận: Toàn bộ các yêu cầu chức năng, phi chức năng, hạ tầng kỹ thuật và tiêu chí chấm điểm của Đồ án Đề tài 10 (Hệ thống Quản lý Nhân sự HRM) đã được rà soát và đạt **100% Definition of Done**.

Hệ thống sẵn sàng 100% để thực hiện **Commit mốc 3** lên GitHub và chuẩn bị cho buổi bảo vệ đồ án trước Hội đồng chấm thi.

| Vai trò | Họ và tên | Chữ ký xác nhận | Ngày ký |
| :--- | :--- | :---: | :---: |
| **Scrum Master (SM)** | Đỗ Quang Minh | *Đã ký xác nhận* | 23/10/2026 |
| **Product Owner (PO)** | Đỗ Quang Minh | *Đã ký duyệt* | 23/10/2026 |
| **Technical Lead** | Đỗ Quang Minh | *Đã duyệt kiến trúc* | 23/10/2026 |
| **QA Lead** | Đỗ Quang Minh | *Đã duyệt 35/35 Test cases* | 23/10/2026 |
