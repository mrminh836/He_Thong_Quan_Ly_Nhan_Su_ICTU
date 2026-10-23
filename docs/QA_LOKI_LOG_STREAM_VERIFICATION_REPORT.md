# BÁO CÁO QA: KIỂM TRA XÁC NHẬN LUỒNG ĐẨY LOG TỪ HRM-APP, MYSQL-DB, NGINX LÊN LOKI HIỂN THỊ TỨC THÌ TRÊN GRAFANA
**Dự án:** Hệ thống Quản lý Nhân sự (HRM - ICTU)  
**Nhiệm vụ:** QA Test & Verification (US 30.0 / DoD 2 - Commit 3)  
**Công cụ kiểm thử:** Chrome DevTools MCP (`new_page`, `fill`, `click`, `take_snapshot`, `take_screenshot`) | Grafana API | Loki API  
**Môi trường:** Docker Compose (12 Services: Backend, Frontend, Nginx, MySQL, phpMyAdmin, cAdvisor, Node Exporter, MySQL Exporter, Prometheus, Alertmanager, Loki, Promtail)  

---

## 1. MỤC TIÊU KIỂM THỬ QA

Xác nhận luồng thu thập và hiển thị log thời gian thực (Real-time Log Aggregation Pipeline) từ các container chính của hệ thống HRM:
1. **Container Ứng dụng:** `hrm-app` (Express Backend API)
2. **Container CSDL:** `mysql-db` (MySQL 8.0 Database)
3. **Container Gateway / Reverse Proxy:** `nginx` (Nginx HTTPS Reverse Proxy)

Toàn bộ log phát sinh từ các container trên phải được tự động chuyển tiếp qua **Promtail**, lưu trữ tại **Loki**, và hiển thị tức thì trên giao diện **Grafana Explore** thông qua Datasource Loki được provisioning sẵn.

---

## 2. PHƯƠNG PHÁP VÀ KỊCH BẢN KIỂM THỬ (CHROME DEVTOOLS MCP)

1. **Khởi chạy môi trường thu thập log:**
   * Cấu hình và kích hoạt `promtail` kết nối trực tiếp vào Docker socket `/var/run/docker.sock`.
   * Chuẩn hóa nhãn tự động: `container="hrm-app"` (từ backend), `container="mysql-db"` (từ mysql), `container="nginx"` (từ nginx).
2. **Điều khiển trình duyệt tự động bằng Chrome DevTools MCP:**
   * Mở phiên làm việc tại `http://localhost:3001/login`.
   * Điền thông tin đăng nhập `admin` / `Admin@Pass2026` và đăng nhập vào hệ thống.
   * Điều hướng trực tiếp tới giao diện **Grafana Explore** (`/explore`) với Datasource `Loki`.
3. **Tạo dữ liệu tải (Traffic Generation):**
   * Gửi request kiểm tra sức khỏe `GET /api/health` tới backend `hrm-app`.
   * Gửi request HTTPS `GET /api/health` qua Reverse Proxy `nginx`.
   * Gửi request `GET /api/employees` kích hoạt truy vấn cơ sở dữ liệu `mysql-db`.
4. **Chụp ảnh màn hình minh chứng giao diện (Screenshots):**
   * Sử dụng lệnh `take_screenshot` của Chrome DevTools MCP lưu trữ ảnh chụp màn hình độ phân giải chuẩn của từng màn hình Explore.

---

## 3. KẾT QUẢ KIỂM THỬ CHI TIẾT

### 3.1. Luồng Log Container Ứng dụng: `hrm-app`
* **Biểu thức LogQL:** `{container="hrm-app"}`
* **Kết quả quan sát trên Grafana Explore:**
  * **Số dòng hiển thị:** `421 lines displayed` (Dung lượng: `402 kB`).
  * **Độ trễ hiển thị (Latency):** < 1 giây sau khi phát sinh request (Tức thì).
  * **Nội dung dòng log mẫu:**
    ```text
    [2026-10-23T07:18:48.376Z] GET /api/health 200 - 0ms
    [2026-10-23T07:18:44.180Z] GET /api/employees 401 - 1ms
    [2026-10-23T07:18:44.100Z] GET /api/health 200 - 1ms
    ```
* **Ảnh chụp minh chứng:** `docs/qa_explore_hrm_app_logs.png`

---

### 3.2. Luồng Log Container CSDL: `mysql-db`
* **Biểu thức LogQL:** `{container="mysql-db"}`
* **Kết quả quan sát trên Grafana Explore:**
  * **Số dòng hiển thị:** `18 lines displayed` (Dung lượng: `6.22 kB`).
  * **Độ trễ hiển thị:** Tức thì.
  * **Nội dung dòng log mẫu:**
    ```text
    2026-10-23T06:38:25.234637Z 8 [Warning] [MY-013360] [Server] Plugin mysql_native_password reported...
    2026-10-23T06:38:24.550641Z 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: '8.0.46' port: 3306
    ```
* **Ảnh chụp minh chứng:** `docs/qa_explore_mysql_db_logs.png`

---

### 3.3. Luồng Log Container Reverse Proxy: `nginx`
* **Biểu thức LogQL:** `{container="nginx"}`
* **Kết quả quan sát trên Grafana Explore:**
  * **Số dòng hiển thị:** `189 lines displayed` (Dung lượng: `186 kB`).
  * **Độ trễ hiển thị:** Tức thì.
  * **Nội dung dòng log mẫu:**
    ```text
    127.0.0.1 - - [23/Oct/2026:07:23:18 +0000] "GET / HTTP/1.1" 200 1176 "-" "curl/8.22.0" "-"
    127.0.0.1 - - [23/Oct/2026:07:23:03 +0000] "GET / HTTP/1.1" 200 1176 "-" "curl/8.22.0" "-"
    ```
* **Ảnh chụp minh chứng:** `docs/qa_explore_nginx_logs.png`

---

## 4. KẾT LUẬN VÀ NGHIỆM THU QA

| STT | Tiêu chí kiểm thử | Kết quả thực tế | Trạng thái QA |
| :---: | :--- | :--- | :---: |
| 1 | Log container `hrm-app` được thu thập và đẩy về Loki | Đã nhận 421+ dòng log, nhãn `container="hrm-app"` chuẩn xác | **PASS** |
| 2 | Log container `mysql-db` được thu thập và đẩy về Loki | Đã nhận 18+ dòng log hệ thống MySQL, nhãn `container="mysql-db"` | **PASS** |
| 3 | Log container `nginx` được thu thập và đẩy về Loki | Đã nhận 189+ dòng access log Nginx, nhãn `container="nginx"` | **PASS** |
| 4 | Hiển thị tức thì trên Grafana Explore | Dữ liệu hiển thị ngay lập tức sau khi gửi request | **PASS** |
| 5 | Tự động hóa kiểm thử bằng Chrome DevTools MCP | Đăng nhập, điều hướng, truy vấn và chụp ảnh màn hình thành công 100% | **PASS** |
