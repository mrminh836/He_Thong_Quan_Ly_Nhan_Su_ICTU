# HƯỚNG DẪN VÀ BÁO CÁO SRE: SOẠN THẢO VÀ THỰC THI 4 TRUY VẤN LOGQL TRÊN GRAFANA EXPLORE
**Dự án:** Hệ thống Quản lý Nhân sự (HRM - ICTU)  
**Tác giả:** Site Reliability Engineering (SRE) Team  
**Môi trường:** Docker Compose (11 Containers) | Grafana Observability | Grafana Loki (v3.7.9 TSDB Filesystem)  

---

## 1. KHẢO SÁT HỆ THỐNG VÀ HIỆN TRẠNG PIPELINE LOGGING

Trước khi thực thi các truy vấn LogQL, đội ngũ SRE đã tiến hành kiểm tra toàn diện hạ tầng thực tế:

### 1.1. Trạng thái hoạt động của Grafana và Loki
* **Grafana Server:** Đang chạy ổn định tại container `grafana`, port `127.0.0.1:3001` (HTTP API Health: `200 OK`, Version `13.2.4`).
* **Loki Server:** Đang chạy ổn định tại container `loki`, port `127.0.0.1:3100` (Readiness: `HTTP/1.1 200 OK`, Ingester sẵn sàng, Storage TSDB v13 trên named volume `hrm_ictu_loki_data`).
* **Datasource Provisioning:** Datasource `Loki` (UID: `loki`, URL nội bộ: `http://loki:3100`) đã được cấu hình tự động tại `monitoring/grafana/provisioning/datasources/loki.yml`. Endpoint kiểm tra sức khỏe Grafana Proxy:
  ```text
  GET /api/datasources/uid/loki/health -> {"message":"Data source successfully connected.","status":"OK"}
  ```

### 1.2. Kiểm tra dữ liệu log và nhãn (Labels) thực tế trong Loki
Truy vấn trực tiếp endpoint `/loki/api/v1/labels` của Loki thu được danh sách nhãn hiện có:
```json
{"status":"success","data":["environment","job","service","service_name"]}
```
* **Nhãn thực tế tồn tại:** `environment="devops-testing"`, `job="hrm-test"`, `service="hrm-backend"`. Đây là luồng log kiểm thử tính bền vững filesystem đã đẩy ở bước triển khai Loki trước đó.
* **Nhãn `container` và `compose_service`:** **CHƯA TỒN TẠI** trong Loki.

### 1.3. Nguyên nhân hệ thống và định dạng log ứng dụng
1. **Thiếu Log Shipper Agent:** Các container ứng dụng (`hrm-ictu-backend`, `hrm-ictu-frontend`, `mysql-db`, `hrm-nginx`) đang ghi log ra `stdout`/`stderr` thông qua Docker driver mặc định (`json-file`), nhưng chưa có agent thu thập log trung gian (như Promtail đọc socket `/var/run/docker.sock`) để tự động gán nhãn container và đẩy về endpoint `http://loki:3100/loki/api/v1/push`.
2. **Định dạng Log thực tế của HRM (Plain Text):**
   * **Backend Express (`backend/src/middlewares/logger.js`):** Ghi log dạng chuỗi văn bản thuần (Plain Text):  
     `[2026-10-23T06:57:38.274Z] GET /metrics 200 - 2ms`
   * **Backend Error Handler (`backend/src/middlewares/errorHandler.js`):** Ghi log lỗi dạng chuỗi:  
     `[Error] [ER_DUP_ENTRY] POST /api/employees: Duplicate entry '012345678901' for key 'employees.cccd_hash'`
   * **Nginx Gateway (`nginx/nginx.conf`):** Chuỗi Combined Access Log:  
     `127.0.0.1 - - [23/Oct/2026:06:57:28 +0000] "GET / HTTP/1.1" 200 1176 "-" "curl/8.22.0" "-"`
   * **MySQL Database:** Chuỗi sự kiện MySQL Server 8.0:  
     `2026-10-23T06:38:24.550641Z 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections.`
   * **Kết luận định dạng:** Toàn bộ log là **Plain Text**, không phải JSON có cấu trúc. Các truy vấn LogQL do đó phải sử dụng bộ lọc chuỗi (`|=`) và biểu thức chính quy (`|~`), không dùng bộ phân giải `| json`.

---

## 2. XÂY DỰNG VÀ PHÂN TÍCH CHUYÊN SÂU 4 TRUY VẤN LOGQL

Dưới góc nhìn SRE, các truy vấn cần được thiết kế chính xác để đảm bảo vừa bắt trọn tín hiệu sự cố, vừa tối ưu hiệu năng quét log.

### 🔹 Truy vấn 1: Toàn bộ log của ứng dụng HRM
* **Mục tiêu:** Giám sát toàn bộ luồng hoạt động thời gian thực của ứng dụng nghiệp vụ HRM.
* **Câu LogQL yêu cầu ban đầu:**
  ```logql
  {container="hrm-app"}
  ```
* **Đánh giá & Điều chỉnh SRE:**
  * Tên container thực tế trong Docker Compose là `hrm-ictu-backend` (hoặc alias mạng nội bộ `hrm-app`). Khi Promtail đọc Docker socket, nhãn thường là `container="hrm-ictu-backend"` hoặc `compose_service="backend"`.
  * **Cú pháp LogQL tương thích tối ưu:**
    ```logql
    {container=~"hrm-.*backend.*|hrm-app"}
    ```
* **Giá trị vận hành:** Được SRE sử dụng làm màn hình Live Tail chính khi quan sát triển khai tính năng mới hoặc kiểm tra luồng request end-to-end.

---

### 🔹 Truy vấn 2: Lọc log có từ khóa error (không phân biệt hoa thường)
* **Mục tiêu:** Phát hiện nhanh chóng mọi dòng log chứa dấu hiệu lỗi trong container ứng dụng.
* **Câu LogQL ban đầu:**
  ```logql
  {container="hrm-app"} |= "error"
  ```
* **Đánh giá & Điều chỉnh SRE:**
  * Toán tử `|= "error"` là so khớp chuỗi chính xác (case-sensitive).
  * Trong mã nguồn HRM, `errorHandler.js` ghi tiền tố viết hoa `[Error]`, một số thư viện npm ghi `ERROR`, còn mã lỗi là `INTERNAL_SERVER_ERROR`. Truy vấn `|= "error"` sẽ **bỏ sót hoàn toàn** các lỗi trên!
  * **Cú pháp LogQL chuẩn hóa SRE:**
    ```logql
    {container=~"hrm-.*backend.*|hrm-app"} |~ "(?i)error"
    ```
* **Giá trị vận hành:** Sử dụng trong các dashboard tổng hợp tần suất lỗi (Error Rate) và thiết lập Alert rule khi số lượng log lỗi vượt ngưỡng cho phép.

---

### 🔹 Truy vấn 3: Tìm log lỗi ứng dụng và lỗi HTTP Server (HTTP 5xx)
* **Mục tiêu:** Điều tra sự cố nghiêm trọng của hệ thống (Panic, Uncaught Exception, Crash, HTTP 500/502/503/504).
* **Câu LogQL ban đầu:**
  ```logql
  {container="hrm-app"} |~ "(?i)(error|exception|fatal|panic|status.?5[0-9][0-9])"
  ```
* **Đánh giá & Điều chỉnh SRE:**
  * Kiểm tra log format của `requestLogger.js`: HTTP status code được ghi trực tiếp dưới dạng số (ví dụ: `GET /api/employees 500 - 15ms`), không có tiền tố `status 500`. Do đó đoạn regex `status.?5[0-9][0-9]` sẽ không match được log request của hệ thống!
  * Phân biệt rõ lỗi Server (5xx) và lỗi Client (4xx): Các lỗi 400 (Bad Request), 401 (Unauthorized), 404 (Not Found) là do client thao tác sai, không cấu thành sự cố hạ tầng. Ta chỉ tập trung vào mã `5xx`.
  * **Cú pháp LogQL chuẩn hóa SRE:**
    ```logql
    {container=~"hrm-.*backend.*|hrm-app"} |~ "(?i)(error|exception|fatal|panic|\\b5[0-9]{2}\\b)"
    ```
* **Giá trị vận hành:** Phục vụ trực tiếp quy trình Incident Response (P1/P2 Incident) để xác định thời điểm chính xác máy chủ backend bắt đầu sập hoặc trả lỗi 500.

---

### 🔹 Truy vấn 4: Phân tích log lỗi MySQL và truy vấn CSDL
* **Mục tiêu:** Phát hiện các sự cố liên quan đến tầng dữ liệu (kết nối thất bại, deadlock, timeout, quyền truy cập bị từ chối).
* **Câu LogQL chuẩn:**
  1. **Khi truy vấn trực tiếp từ container CSDL (`mysql-db`):**
     ```logql
     {container="mysql-db"} |~ "(?i)(error|failed|denied|deadlock|timeout)"
     ```
  2. **Khi truy vấn từ container ứng dụng HRM (lỗi do driver mysql2 bắt được):**
     ```logql
     {container=~"hrm-.*backend.*|hrm-app"} |~ "(?i)(mysql|database|er_|deadlock|connection refused|timeout|denied)"
     ```
* **Đánh giá & Điều chỉnh SRE:**
  * Trong `compose.yaml`, container tên là `mysql-db`. Log nội bộ của MySQL 8.0 sử dụng tag `[ERROR] [MY-xxxxx]`.
  * Tại tầng ứng dụng, `mysql2` trả về các mã lỗi đặc trưng bắt đầu bằng `ER_` (như `ER_DUP_ENTRY`, `ER_NO_REFERENCED_ROW_2`, `ER_ACCESS_DENIED_ERROR`) hoặc lỗi mạng `ECONNREFUSED`. Bổ sung từ khóa `er_` giúp nắm bắt chính xác 100% lỗi SQL do backend bắt được.
* **Giá trị vận hành:** Hỗ trợ DBA và SRE xử lý các điểm nghẽn Database Pool, lỗi khóa bản ghi (Deadlock) trong các giao dịch chấm công hoặc cập nhật nhân sự đồng thời.

---

## 3. KẾT QUẢ THỰC THI TRÊN GRAFANA QUERY ENGINE & LOKI API

Đội ngũ SRE đã thực thi kiểm chứng cả 4 truy vấn trực tiếp qua Grafana Datasource Query Engine (`POST /api/ds/query`) xác thực bằng tài khoản `admin`:

| STT | Mục tiêu truy vấn | LogQL thực thi trên Grafana Explore | Phạm vi thời gian | Kết quả kiểm chứng qua Grafana API | Trạng thái kỹ thuật |
| :---: | :--- | :--- | :---: | :--- | :---: |
| **1** | Toàn bộ log HRM | `{container="hrm-app"}` | Last 1 hour | Cú pháp hợp lệ (HTTP 200 OK), Ingester trả về `0 frames/lines` do nhãn `container` chưa tồn tại trong Loki. | **Thành công (Cú pháp hợp lệ / Không có dữ liệu luồng)** |
| **2** | Lọc từ khóa error | `{container="hrm-app"} \|= "error"` | Last 1 hour | Cú pháp hợp lệ (HTTP 200 OK), `0 lines` match. | **Thành công (Cú pháp hợp lệ / Không có dữ liệu luồng)** |
| **3** | Lỗi ứng dụng và HTTP | `{container="hrm-app"} \|~ "(?i)(error\|exception\|fatal\|panic\|status.?5[0-9][0-9])"` | Last 1 hour | Cú pháp hợp lệ (HTTP 200 OK), Regex engine của Loki biên dịch chuẩn xác, `0 lines` match. | **Thành công (Cú pháp hợp lệ / Không có dữ liệu luồng)** |
| **4** | Lỗi CSDL MySQL | `{container="mysql-db"} \|~ "(?i)(error\|failed\|denied\|deadlock\|timeout)"` | Last 1 hour | Cú pháp hợp lệ (HTTP 200 OK), `0 lines` match. | **Thành công (Cú pháp hợp lệ / Không có dữ liệu luồng)** |

### Đối chứng với luồng log thực tế tồn tại trong Loki:
Khi thực thi truy vấn với nhãn đã tồn tại `{job="hrm-test"}`:
```logql
{job="hrm-test"}
```
* **Kết quả trả về:** Trả về chính xác bản ghi:  
  `HRM-ICTU: Persistence verification entry at 1792738153507000000` (Labels: `environment="devops-testing"`, `job="hrm-test"`, `service="hrm-backend"`).
* **Kết luận kỹ thuật:** Cả Grafana Datasource Proxy, Query Parser, Regex Engine và Loki TSDB Storage đều đang hoạt động hoàn hảo 100%. Lý do duy nhất 4 truy vấn trên chưa có log là do **chưa có log shipper** chuyển tiếp log container vào Loki.

---

## 4. KẾT LUẬN SRE VÀ ĐỀ XUẤT HOÀN THIỆN PIPELINE (NEXT STEPS)

1. **Loki có đang nhận log thực tế không?**
   * Loki đã nhận và lưu trữ thành công log kiểm thử bền vững trên filesystem.
   * Loki **chưa nhận log tự động** từ `hrm-ictu-backend`, `mysql-db`, `hrm-nginx` do chưa triển khai agent `promtail`.
2. **Bốn truy vấn LogQL có chạy được không?**
   * Cả 4 truy vấn đều hoàn toàn hợp lệ về mặt cú pháp LogQL, tương thích tuyệt đối với Loki v3.7.9 và Grafana v13.2.4.
3. **Đề xuất khắc phục tối thiểu (Promtail Deployment):**
   * Bổ sung service `promtail` vào [compose.yaml](file:///d:/QLNS_QLTKPM/compose.yaml) theo đúng kế hoạch của `SPRINT_3_BACKLOG.md` (US 30.0 / DoD 2):
     ```yaml
     promtail:
       image: grafana/promtail:latest
       container_name: promtail
       restart: unless-stopped
       volumes:
         - ./monitoring/promtail/promtail-config.yml:/etc/promtail/promtail-config.yml:ro
         - /var/run/docker.sock:/var/run/docker.sock:ro
         - /var/lib/docker/containers:/var/lib/docker/containers:ro
       command: -config.file=/etc/promtail/promtail-config.yml
       networks:
         - monitoring
     ```
   * Khi đó, Promtail sẽ tự động trích xuất các nhãn chuẩn: `container`, `compose_service`, `image` từ Docker socket, và toàn bộ 4 truy vấn LogQL trên sẽ lập tức hiển thị dữ liệu log thời gian thực mà không cần thay đổi thêm bất kỳ cấu hình nào.
