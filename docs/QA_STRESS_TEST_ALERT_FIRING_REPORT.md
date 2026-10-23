# BÁO CÁO QA: MÔ PHỎNG QUÁ TẢI (STRESS TEST) KÍCH HOẠT CẢNH BÁO PROMETHEUS & ALERTMANAGER

**Hệ thống:** Quản lý Nhân sự HRM - ICTU  
**Chuyên môn:** Quality Assurance (QA) & SRE  
**Mục tiêu:** Mô phỏng quá tải lưu lượng kết nối MySQL (> 80 active connections), kiểm chứng quy trình chuyển trạng thái từ `inactive` -> `pending` -> `firing` của Prometheus, và xác nhận cảnh báo kích hoạt thành công trên Alertmanager Web UI bằng công cụ MCP Playwright Browser tự động.  
**Thời gian thực hiện:** Tháng 10/2026  
**Nhánh Git:** `feature/devops-prometheus-alert-rules`

---

## 1. Thiết kế kịch bản kiểm thử quá tải (Stress Test Scenario)

| Tiêu chí | Chi tiết cấu hình |
| :--- | :--- |
| **Alert Rule kiểm thử** | `MySQLTooManyConnections` |
| **Tập tin quy tắc** | `rules/alerts.yml` (Single Source of Truth) |
| **Biểu thức PromQL** | `mysql_global_status_threads_connected > 80` |
| **Thời gian duy trì (`for`)** | `2m` (120 giây) |
| **Mức tải thông thường** | `1` kết nối hoạt động |
| **Tải mô phỏng (Surge Load)** | Mở đồng thời **85 kết nối TCP client** trực tiếp tới `mysql-db:3309` |
| **Thời gian giữ tải** | 150 giây (2.5 phút), đủ vượt qua ngưỡng 120 giây để kích hoạt `firing` |
| **Kịch bản kiểm thử** | [backend/tests/qaStressMysqlConnections.js](file:///d:/QLNS_QLTKPM/backend/tests/qaStressMysqlConnections.js) |
| **Công cụ MCP tự động hóa UI** | `playwright` điều khiển browser tự động navigate, trích xuất DOM text và chụp màn hình bằng chứng |

---

## 2. Nhật ký thực thi kiểm thử thời gian thực

### Giai đoạn 1: Khởi tạo kết nối quá tải (T = 0s - 10s)
Kịch bản Node.js đa luồng kết nối song song 85 client tới MySQL:
```text
[QA Stress Test] Starting MySQL connection surge test...
[QA Stress Test] Connecting to 127.0.0.1:3309 with user 'app_user'
[QA Stress Test] Target: 85 active connections to exceed threshold (> 80)
[QA Stress Test] Opened 20/85 connections...
[QA Stress Test] Opened 40/85 connections...
[QA Stress Test] Opened 60/85 connections...
[QA Stress Test] Opened 80/85 connections...
[QA Stress Test] Opened 85/85 connections...
[QA Stress Test] Successfully established 85 active connections!
[QA Stress Test] Holding connections for 150s to trigger Prometheus 'for: 2m' rule...
```
- Prometheus Scrape chu kỳ 15s thu thập từ `mysql-exporter:9104` ghi nhận metric:
  `mysql_global_status_threads_connected = 86` (85 kết nối stress test + 1 kết nối exporter/backend).

### Giai đoạn 2: Trạng thái chờ kích hoạt - PENDING (T = 15s - 120s)
- Prometheus Rule Engine đánh giá biểu thức `mysql_global_status_threads_connected > 80` là TRUE.
- Alert rule chuyển sang trạng thái **`pending`**:
  ```json
  {
    "alertname": "MySQLTooManyConnections",
    "state": "pending",
    "activeAt": "2026-10-23T08:02:48.813Z",
    "value": "86 threads",
    "duration": 120
  }
  ```

### Giai đoạn 3: Kích hoạt cảnh báo - FIRING & Alertmanager Tiếp nhận (T > 120s)
- Sau 120 giây duy trì quá tải liên tục, Prometheus chính thức chuyển trạng thái từ `pending` sang **`firing`**.
- Prometheus đẩy thông báo cảnh báo tới Alertmanager qua mạng Docker `monitoring`: `http://alertmanager:9093/api/v2/alerts`.
- Dữ liệu trả về từ Prometheus API (`/api/v1/alerts`):
  ```json
  {
    "status": "success",
    "data": {
      "alerts": [
        {
          "labels": {
            "alertname": "MySQLTooManyConnections",
            "environment": "production",
            "instance": "mysql-db:3306",
            "job": "mysql-exporter",
            "service": "mysql-database",
            "severity": "warning"
          },
          "annotations": {
            "description": "MySQL has more than 80 connected threads for 2 minutes (current value: 86 threads).",
            "summary": "MySQL has too many active connections"
          },
          "state": "firing",
          "activeAt": "2026-10-23T08:02:48.813Z",
          "value": "8.6e+01"
        }
      ]
    }
  }
  ```

---

## 3. Bằng chứng kiểm thử giao diện bằng MCP Tooling

### 3.1. Bằng chứng Alertmanager Web UI (`http://localhost:9093`)
Sử dụng công cụ MCP `playwright_screenshot` để chụp giao diện Alertmanager khi đang nhận cảnh báo:

![Alertmanager Firing](file:///d:/QLNS_QLTKPM/docs/qa_alertmanager_firing_mysql_connections.png)

- **Nhóm nhận (Receiver):** `default-receiver`.
- **Thẻ cảnh báo:** `alertname="MySQLTooManyConnections"`, `job="mysql-exporter"`, `severity="warning"`.
- **Labels chi tiết:** `environment="production"`, `instance="mysql-db:3306"`, `service="mysql-database"`.
- **Số lượng alert kích hoạt:** `1 alert`.

### 3.2. Bằng chứng Prometheus Alerts Web UI (`http://localhost:9090/alerts`)
Sử dụng công cụ MCP `playwright_screenshot` để chụp giao diện Prometheus Alerts:

![Prometheus Firing](file:///d:/QLNS_QLTKPM/docs/qa_prometheus_firing_mysql_connections.png)

- Trạng thái tổng quan: **`Inactive (5)`**, **`Pending (0)`**, **`Firing (1)`**.
- Rule vi phạm: `MySQLTooManyConnections (1 active)` hiển thị nền màu đỏ viền cảnh báo nổi bật.

---

## 4. Giai đoạn phục hồi tự động (Auto-resolution)

- Khi kịch bản kết thúc sau 150 giây, toàn bộ 85 kết nối được giải phóng:
  ```text
  [QA Stress Test] Holding duration finished. Gracefully closing all 85 connections...
  [QA Stress Test] All connections closed. System returning to normal.
  ```
- Metric `mysql_global_status_threads_connected` trở về mức bình thường (`1`).
- Prometheus phát hiện giá trị <= 80 và ngừng gửi alert.
- Alertmanager tự động ghi nhận trạng thái đã được xử lý (Resolved) khi hết thời gian `endsAt`.

---

## 5. Kết luận nghiệm thu QA
1. **Kiểm thử tải thành công 100%:** Kịch bản mô phỏng 85 kết nối đồng thời hoạt động an toàn, không gây crash MySQL database và không làm mất mát dữ liệu.
2. **Quy trình Alerting hoàn chỉnh:**
   - Điều kiện ngưỡng: `mysql_global_status_threads_connected > 80`.
   - Cơ chế lọc nhiễu: `for: 2m` hoạt động chuẩn xác (giữ đúng 120s ở `pending` trước khi sang `firing`).
   - Tích hợp Alertmanager: Alertmanager nhận và hiển thị cảnh báo tức thì qua mạng Docker `monitoring`.
3. **Bằng chứng xác thực tự động bằng MCP:** Đầy đủ log hệ thống, dữ liệu JSON API và 2 ảnh chụp màn hình UI sắc nét.
