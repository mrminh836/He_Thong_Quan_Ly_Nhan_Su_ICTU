# 🚀 SPRINT 3 BACKLOG & KẾ HOẠCH TRIỂN KHAI CHI TIẾT
**Học phần:** Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM K23)  
**Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM)  
**Mục tiêu Sprint 3:** Hoàn thiện Nhật ký tập trung Loki/Promtail, Truy vấn LogQL, Cảnh báo Alertmanager, Gia cố an ninh (Hardening), Kiểm thử toàn diện & Báo cáo kỹ thuật $\ge$ 10 trang $\rightarrow$ **Cán mốc Commit 3 trên GitHub & Hoàn tất nghiệm thu Đồ án (10/10 điểm)**  
**Thời lượng Sprint:** Tuần 3  
**Quy mô:** 7 Nhóm User Story / Hạng mục | 23 Technical Tasks (~37 Giờ phát triển)  
**Phiên bản:** 1.0.0 | **Ngày lập:** 20/10/2026  

---

## 🎯 1. MỤC TIÊU CỐT LÕI CỦA SPRINT 3 (SPRINT GOAL)

Sprint 3 là Sprint về đích, tập trung hoàn thiện các tiêu chí chấm điểm khắt khe nhất của học phần:
1. **Nghiệp vụ Hoàn thiện & Ràng buộc toàn vẹn dữ liệu (Integrity & Security):**
   - Ràng buộc an toàn xóa phòng ban (`US 8.0`): Chặn xóa phòng ban khi vẫn còn nhân sự trực thuộc.
   - Quản lý trạng thái khóa/mở khóa tài khoản nhân sự (`US 4.0`): Thu hồi phiên làm việc và chặn token lập tức.
   - Biểu đồ phân tích cơ cấu nhân sự chuyên sâu (`US 21.0`): Thống kê trực quan cơ cấu phòng ban và tỷ lệ chấm công.
2. **Hệ thống Ghi nhật ký tập trung Loki + Promtail & LogQL (Tiêu chí số 5 - 1.5 điểm):**
   - Triển khai `loki:latest` (cổng 3100) và `promtail:latest` đọc trực tiếp log từ Docker socket `/var/run/docker.sock`.
   - Tự động nạp Datasource Loki vào Grafana qua Provisioning YAML.
   - Xây dựng và thực thi thành công tối thiểu 4 truy vấn LogQL chuẩn:
     * `{container="hrm-app"}`: Log nghiệp vụ thời gian thực của container HRM App.
     * `{container="hrm-app"} |= "error"`: Lọc bắt lỗi ứng dụng Backend.
     * `{container="mysql-db"} |= "error"`: Giám sát lỗi CSDL MySQL.
     * `{container="hrm-nginx"}`: Nhật ký truy cập Web Server và SSL Gateway.
3. **Cảnh báo Tự động Alertmanager & Gia cố An ninh Hardening (Tiêu chí số 6 - 1.5 điểm):**
   - Triển khai `alertmanager:latest` (cổng 9093) tích hợp cùng Prometheus.
   - Thiết lập các quy tắc cảnh báo hệ thống (`High CPU > 80%`, `High Memory > 85%`, `MySQL Too Many Connections > 80`).
   - Hardening toàn diện hệ thống: Chạy user non-root (`USER node`), giới hạn tài nguyên container (Resource Limits: `cpus`, `memory`), cô lập mạng nội bộ không expose port nhạy cảm.
4. **Kiểm thử Toàn diện & Sao lưu CSDL:**
   - Bộ kịch bản End-to-End (E2E) kiểm tra toàn bộ luồng nghiệp vụ từ Login $\rightarrow$ CRUD $\rightarrow$ Chấm công $\rightarrow$ Báo cáo $\rightarrow$ Monitoring $\rightarrow$ Logging.
   - Viết và kiểm thử script sao lưu/phục hồi tự động MySQL (`backup_restore.sh`).
5. **Báo cáo Kỹ thuật $\ge$ 10 trang & Kịch bản Demo Thuyết trình (Tiêu chí số 7 - 1.0 điểm):**
   - Soạn thảo báo cáo kỹ thuật hoàn chỉnh $\ge$ 10 trang A4 theo đúng format chuẩn trường/khoa CNTT ICTU với đầy đủ minh chứng ảnh chụp.
   - Xây dựng kịch bản demo bảo vệ đồ án (7-10 phút) trôi chảy, sẵn sàng bảo vệ đạt điểm tối đa (10/10).
6. **Cột mốc GitHub:** Thực hiện thành công **Commit 3** với commit message chuẩn mực.

---

## 📋 2. BẢNG PHÂN RÃ NHIỆM VỤ SPRINT 3 (SPRINT 3 BACKLOG)

| User Story | Task (Phân rã User Story thành các nhiệm vụ nhỏ) | Priority | Estimate (SP/h) | Assignee | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **US 8.0: Ràng buộc xóa phòng ban** | **BE:** Xây dựng ràng buộc kiểm tra khóa ngoại trước khi xóa phòng ban (trả lỗi HTTP 400/409 nếu có nhân sự) | Cao | 1.5 | Đỗ Quang Minh | Đã xong | 
| | **FE:** Dựng cảnh báo lỗi chi tiết khi xóa phòng ban đang có nhân viên trên giao diện quản trị | Cao | 1.0 | Đỗ Quang Minh | Đã xong |
| | **QA:** Kiểm thử các ca xóa phòng ban có nhân viên và phòng ban rỗng (xóa thành công) | Cao | 1.0 | Đỗ Quang Minh | Đã xong |
| **US 4.0: Khóa/Mở tài khoản nhân viên thôi việc** | **BE:** Xây dựng API PATCH `/api/users/:id/status` cập nhật trạng thái Active/Locked & thu hồi token lập tức | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| | **FE:** Dựng Switch/Toggle khóa và mở khóa tài khoản trực tiếp trên bảng quản trị người dùng | Cao | 1.0 | Đỗ Quang Minh | Đã xong |
| | **QA:** Kiểm thử chặn đăng nhập và thu hồi quyền truy cập đối với tài khoản bị khóa | Cao | 1.0 | Đỗ Quang Minh | Đã xong |
| **US 21.0: Biểu đồ nhân sự phòng ban chuyên sâu** | **BE:** Xây dựng API GET `/api/departments/statistics` tổng hợp cơ cấu nhân sự theo phòng ban | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| | **FE:** Tích hợp biểu đồ tròn (Pie Chart) và biểu đồ cột tỷ lệ chấm công đúng giờ theo từng phòng ban | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| | **QA:** Kiểm thử đối soát tỷ lệ phần trăm trên biểu đồ với số liệu CSDL thực tế | Cao | 1.0 | Đỗ Quang Minh | Đã xong |
| **US 30.0: Nhật ký tập trung Loki + Promtail & LogQL (Commit 3)** | **DevOps:** Triển khai container `grafana/loki:latest` (port 3100) và cấu hình lưu trữ log filesystem / boltdb-shipper | Cao | 2.0 | Đỗ Quang Minh | Đã xong |
| | **DevOps:** Triển khai container `grafana/promtail:latest` cấu hình đọc log từ Docker socket `/var/run/docker.sock` | Cao | 2.0 | Đỗ Quang Minh | Đã xong |
| | **SRE:** Cấu hình Grafana tự động nạp Loki Datasource qua cơ chế provisioning yaml | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| | **SRE:** Soạn thảo và thực thi 4 truy vấn LogQL chuẩn trên Grafana Explore (`{container="hrm-app"}`, `\|= "error"`, ...) | Cao | 2.0 | Đỗ Quang Minh | Đã xong |
| | **QA:** Kiểm tra xác nhận luồng đẩy log từ `hrm-app`, `mysql-db`, `nginx` lên Loki hiển thị tức thì trên Grafana | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| **US 31.0: Cảnh báo Alertmanager & Hardening bảo mật (Commit 3)** | **DevOps:** Triển khai container `alertmanager:latest` (port 9093) tích hợp vào mạng monitoring | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| | **DevOps:** Thiết lập file `rules/alerts.yml` (High CPU > 80%, High RAM > 85%, MySQL Too Many Connections > 80) | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| | **DevSecOps:** Áp dụng Hardening Docker Compose: CPU/RAM resource limits, non-root user, cô lập port nội bộ | Cao | 2.0 | Đỗ Quang Minh | Đã xong |
| | **QA:** Mô phỏng quá tải (stress test) kích hoạt cảnh báo, xác nhận trạng thái Firing trên Alertmanager | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| **Kiểm thử tích hợp E2E & Sao lưu CSDL** | **QA:** Kiểm thử tích hợp E2E toàn bộ luồng nghiệp vụ trên môi trường Docker Compose đa tầng | Cao | 2.0 | Đỗ Quang Minh | Đã xong |
| | **DevOps:** Viết script tự động sao lưu và phục hồi CSDL MySQL (`backup_restore.sh`) và kiểm thử an toàn dữ liệu | Cao | 1.5 | Đỗ Quang Minh | Đã xong |
| **Soạn thảo Báo cáo Kỹ thuật & Kịch bản Demo** | **SM:** Soạn thảo Báo cáo kỹ thuật tổng kết $\ge$ 10 trang A4 chuẩn format ICTU kèm đầy đủ ảnh minh chứng | Cao | 3.0 | Đỗ Quang Minh | Đã xong |
| | **SM:** Xây dựng Kịch bản demo thuyết trình đồ án (7-10 phút) phân vai và slide báo cáo tổng kết | Cao | 2.0 | Đỗ Quang Minh | Đã xong |
| | **SM:** Rà soát Definition of Done 100%, kiểm tra barem điểm và thực hiện Commit mốc 3 lên GitHub | Cao | 1.5 | Đỗ Quang Minh | Đã xong |

---

## 🏁 3. DEFINITION OF DONE CHO SPRINT 3 (DOD)
- [x] **DoD 1:** Ràng buộc toàn vẹn xóa phòng ban (`US 8.0`) và khóa tài khoản nhân viên thôi việc (`US 4.0`) vận hành ổn định.
- [x] **DoD 2:** Container Loki và Promtail khởi chạy ổn định, thu thập log stdout/stderr từ tất cả container qua Docker socket.
- [x] **DoD 3:** Grafana Explore kết nối thành công Loki Datasource và chạy trơn tru 4 truy vấn LogQL chuẩn.
- [x] **DoD 4:** Container Alertmanager kết nối thông suốt với Prometheus, tiếp nhận và bắn cảnh báo khi hệ thống quá tải.
- [x] **DoD 5:** Hoàn thành các biện pháp gia cố bảo mật (Hardening): Non-root user, CPU/RAM limits, bảo mật least privilege CSDL.
- [x] **DoD 6:** Toàn bộ hệ thống vượt qua kiểm thử tích hợp E2E 100% Pass.
- [x] **DoD 7:** Báo cáo kỹ thuật $\ge$ 10 trang A4 và Kịch bản Demo thuyết trình hoàn thiện, đạt yêu cầu bảo vệ.
- [x] **DoD 8:** GitHub hoàn thành **Commit 3** với thông điệp:  
  `feat(logging-hardening): implement loki centralized logging, logql queries, alertmanager rules, security hardening, and final report`

---

## 📊 4. BÁO CÁO NGHIỆM THU E2E SPRINT 3 (QA SIGN-OFF)

| Phân hệ / User Story | Số test cases | Kết quả | Trạng thái |
| :--- | :---: | :---: | :---: |
| **Suite 1:** Hạ tầng Docker Compose Đa tầng (9 endpoints) | 9 | 9/9 PASS (100%) | **HOÀN THÀNH** |
| **Suite 2:** Phân quyền RBAC, Khóa tài khoản & Thu hồi JWT tức thì (US 4.0) | 5 | 5/5 PASS (100%) | **HOÀN THÀNH** |
| **Suite 3:** Ràng buộc an toàn xóa phòng ban & Thống kê cơ cấu (US 8.0 & 21.0) | 5 | 5/5 PASS (100%) | **HOÀN THÀNH** |
| **Suite 4:** Vòng đời nhân sự, mã hóa CCCD AES-256 & Thôi việc (US 13.0 & 14.0) | 4 | 4/4 PASS (100%) | **HOÀN THÀNH** |
| **Suite 5:** Chấm công thời gian thực & Xuất báo cáo Excel/CSV (US 19.0 & 22.0) | 6 | 6/6 PASS (100%) | **HOÀN THÀNH** |
| **Suite 6:** Dashboard KPI & Đối soát số liệu CSDL thời gian thực | 2 | 2/2 PASS (100%) | **HOÀN THÀNH** |
| **Suite 7:** Observability, Alertmanager 3 Rules & Loki Log Streams (US 30.0 & 31.0) | 4 | 4/4 PASS (100%) | **HOÀN THÀNH** |
| **TỔNG CỘNG E2E INTEGRATION SPRINT 3** | **35** | **35/35 PASS (100%)** | **ĐẠT CHUẨN ĐÓNG SPRINT 3 & COMMIT 3** |

### 📑 Tài liệu bàn giao & Minh chứng nghiệm thu:
- [Biên bản Rà soát Definition of Done & Barem Điểm](file:///d:/QLNS_QLTKPM/docs/DEFINITION_OF_DONE_MILESTONE_3_SIGN_OFF.md)
- [Báo cáo Kỹ thuật Tổng kết Mốc 3 ($\ge$ 12 trang A4)](file:///d:/QLNS_QLTKPM/docs/BAO_CAO_KY_THUAT_MOC_3_ICTU.md)
- [Kịch bản Demo Thuyết trình Bảo vệ Đồ án (7-10 phút)](file:///d:/QLNS_QLTKPM/docs/KICH_BAN_DEMO_THUYET_TRINH_HRM.md)
- [Báo cáo Kiểm thử Tích hợp E2E Đa tầng](file:///d:/QLNS_QLTKPM/docs/QA_E2E_MULTI_TIER_BUSINESS_WORKFLOWS_REPORT.md)
- [Báo cáo Mô phỏng Quá tải Kích hoạt Cảnh báo Firing](file:///d:/QLNS_QLTKPM/docs/QA_STRESS_TEST_ALERT_FIRING_REPORT.md)
- [Hướng dẫn Sao lưu & Phục hồi CSDL MySQL](file:///d:/QLNS_QLTKPM/docs/BACKUP_RESTORE_GUIDE.md)

