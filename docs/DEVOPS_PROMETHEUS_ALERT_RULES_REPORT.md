# BÁO CÁO DEVOPS / SRE: THIẾT LẬP PROMETHEUS ALERT RULES (CPU, RAM, MYSQL CONNECTIONS)
**Hệ thống:** Quản trị Nhân sự HRM - ICTU  
**Thời gian thực hiện:** Tháng 10/2026  
**Môi trường:** Docker Compose (Docker Engine v27+, Prometheus v2.51.0, Alertmanager v0.34.1, Node Exporter, cAdvisor, MySQL Exporter)  
**Nhánh Git:** `feature/devops-prometheus-alert-rules`

---

## 1. Danh sách file được tạo và chỉnh sửa

| STT | File / Đường dẫn | Hành động | Mục đích |
| :--- | :--- | :--- | :--- |
| 1 | `rules/alerts.yml` | **Chuẩn hóa duy nhất** | Nguồn chân lý duy nhất (Single Source of Truth) lưu trữ toàn bộ 6 alert rules chuẩn hóa của hệ thống HRM (HighCPUUsage, HighRAMUsage, MySQLTooManyConnections, InstanceDown, HRMApplicationDown, MySQLExporterDown). |
| 2 | `prometheus/prometheus.yml` | **Cập nhật** | Chỉnh sửa `rule_files` trỏ chính xác về `/etc/prometheus/rules/alerts.yml`. |
| 3 | `compose.yaml` | **Cập nhật** | Mount bind volume `./rules/alerts.yml:/etc/prometheus/rules/alerts.yml:ro` vào container `hrm-prometheus`. |
| 4 | `docs/DEVOPS_PROMETHEUS_ALERT_RULES_REPORT.md` | **Tạo mới** | Báo cáo chi tiết khảo sát, cú pháp PromQL, kết quả `promtool` và kiểm thử API. |

---

## 2. Nội dung cấu hình `alerts.yml` hoàn chỉnh

```yaml
# ==============================================================================
# PROMETHEUS ALERT RULES - HRM ICTU MONITORING
# Cảnh báo CPU, RAM, MySQL Connections và dịch vụ hạ tầng (Sprint 3 - US 31.0)
# ==============================================================================
groups:
  - name: hrm-infrastructure-alerts
    rules:
      # ------------------------------------------------------------------------
      # RULE 1: Quá tải CPU máy chủ (> 80% trong 5 phút)
      # ------------------------------------------------------------------------
      - alert: HighCPUUsage
        expr: 100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 80
        for: 5m
        labels:
          severity: warning
          component: host-node
          environment: production
        annotations:
          summary: "CPU usage is above 80%"
          description: "CPU usage on {{ $labels.instance }} has exceeded 80% for 5 minutes (current value: {{ $value | printf \"%.2f\" }}%)."

      # ------------------------------------------------------------------------
      # RULE 2: Cạn kiệt bộ nhớ RAM máy chủ (> 85% trong 5 phút)
      # ------------------------------------------------------------------------
      - alert: HighRAMUsage
        expr: 100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 85
        for: 5m
        labels:
          severity: warning
          component: host-node
          environment: production
        annotations:
          summary: "RAM usage is above 85%"
          description: "RAM usage on {{ $labels.instance }} has exceeded 85% for 5 minutes (current value: {{ $value | printf \"%.2f\" }}%)."

      # ------------------------------------------------------------------------
      # RULE 3: Quá tải số lượng kết nối MySQL (> 80 active connections trong 2 phút)
      # ------------------------------------------------------------------------
      - alert: MySQLTooManyConnections
        expr: mysql_global_status_threads_connected > 80
        for: 2m
        labels:
          severity: warning
          service: mysql-database
          environment: production
        annotations:
          summary: "MySQL has too many active connections"
          description: "MySQL has more than 80 connected threads for 2 minutes (current value: {{ $value }} threads)."

      # ------------------------------------------------------------------------
      # RULE 4: Target giám sát bị gián đoạn (Instance Down)
      # ------------------------------------------------------------------------
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
          environment: production
        annotations:
          summary: "Target {{ $labels.instance }} is down"
          description: "Target {{ $labels.instance }} of job {{ $labels.job }} has been unavailable for more than 1 minute."

      # ------------------------------------------------------------------------
      # RULE 5: Dịch vụ HRM Backend API ngưng hoạt động
      # ------------------------------------------------------------------------
      - alert: HRMApplicationDown
        expr: up{job="hrm-app"} == 0
        for: 30s
        labels:
          severity: critical
          service: hrm-backend
          environment: production
        annotations:
          summary: "HRM Application Backend is down"
          description: "HRM Backend API container at {{ $labels.instance }} is not responding on /metrics."

      # ------------------------------------------------------------------------
      # RULE 6: MySQL Exporter bị gián đoạn kết nối DB
      # ------------------------------------------------------------------------
      - alert: MySQLExporterDown
        expr: up{job="mysql-exporter"} == 0
        for: 1m
        labels:
          severity: critical
          service: mysql-database
          environment: production
        annotations:
          summary: "MySQL Exporter is down"
          description: "MySQL Exporter at {{ $labels.instance }} failed to scrape MySQL Database."
```

---

## 3. Các metric và biểu thức PromQL thực tế đã chọn

### 3.1. Cảnh báo High CPU Usage
- **Metric thực tế:** `node_cpu_seconds_total{mode="idle"}` do service `node-exporter` (port 9100) cung cấp.
- **Biểu thức PromQL:**
  ```promql
  100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 80
  ```
- **Ý nghĩa & Rationale:**
  - `rate(node_cpu_seconds_total{mode="idle"}[5m])`: Tính tỷ lệ thời gian CPU ở trạng thái rỗi (idle) trong cửa sổ trượt 5 phút trên từng instance.
  - `1 - ...`: Tỷ lệ CPU đang xử lý tác vụ (user, system, iowait, irq,...).
  - Nhân với `100` để quy đổi ra phần trăm CPU utilization (`0 - 100%`).
  - `for: 5m`: Đảm bảo chỉ cảnh báo khi tải cao kéo dài liên tục 5 phút, loại bỏ các đợt spike nhất thời khi khởi động dịch vụ.
  - **Giá trị đo thực tế:** `~2.20%` (mức tải bình thường, rule ở trạng thái `inactive`).

### 3.2. Cảnh báo High RAM Usage
- **Metric thực tế:** `node_memory_MemAvailable_bytes` và `node_memory_MemTotal_bytes` từ Node Exporter.
- **Biểu thức PromQL:**
  ```promql
  100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 85
  ```
- **Ý nghĩa & Rationale:**
  - Sử dụng `MemAvailable` thay vì `MemFree` vì kernel Linux phân bổ bộ nhớ cho buffers/page cache nhưng có thể thu hồi ngay lập tức cho tiến trình khi cần. Do đó `MemAvailable` phản ánh chính xác nhất lượng RAM khả dụng thực tế của máy chủ.
  - Nhân với `100` để tính % RAM đã sử dụng. Ngưỡng cảnh báo `> 85`.
  - `for: 5m`: Lọc nhiễu khi hệ thống thực hiện thao tác quét hoặc nạp dữ liệu tạm.
  - **Giá trị đo thực tế:** `~30.20%` (rule ở trạng thái `inactive`).

### 3.3. Cảnh báo MySQL Too Many Connections
- **Metric thực tế:** `mysql_global_status_threads_connected` thu thập qua `mysqld-exporter` (port 9104).
- **Biểu thức PromQL (Ngưỡng kết nối tuyệt đối theo yêu cầu):**
  ```promql
  mysql_global_status_threads_connected > 80
  ```
- **Ý nghĩa & Rationale:**
  - Đếm trực tiếp số thread/client connections đang mở đồng thời tới MySQL instance (`mysql-db:3306`).
  - Ngưỡng cố định `> 80` kết nối hoạt động liên tục trong `for: 2m`.
  - **Giá trị đo thực tế:** `1` kết nối (rule ở trạng thái `inactive`).
- **Tùy chọn cảnh báo theo tỷ lệ % giới hạn (Max Connections):**
  - Khảo sát thực tế trong DB: `mysql_global_variables_max_connections = 151`.
  - Nếu muốn cảnh báo khi số kết nối vượt 80% giới hạn tối đa của server, biểu thức chuẩn là:
    ```promql
    100 * mysql_global_status_threads_connected / mysql_global_variables_max_connections > 80
    ```
  - Hiện tại, biểu thức ngưỡng tuyệt đối `> 80` được giữ làm mặc định theo đúng đặc tả kỹ thuật, không tự ý thay đổi.

---

## 4. Kết quả kiểm tra bằng `promtool`

### 4.1. Kiểm tra cú pháp rule: `promtool check rules`
Lệnh thực thi:
```bash
docker exec hrm-prometheus /bin/promtool check rules /etc/prometheus/rules/alerts.yml
```
Kết quả trả về:
```
Checking /etc/prometheus/rules/alerts.yml
  SUCCESS: 6 rules found
```

### 4.2. Kiểm tra cấu hình tổng thể: `promtool check config`
Lệnh thực thi:
```bash
docker exec hrm-prometheus /bin/promtool check config /etc/prometheus/prometheus.yml
```
Kết quả trả về:
```
Checking /etc/prometheus/prometheus.yml
  SUCCESS: 1 rule files found
 SUCCESS: /etc/prometheus/prometheus.yml is valid prometheus config file syntax

Checking /etc/prometheus/rules/alerts.yml
  SUCCESS: 6 rules found
```

---

## 5. Kết quả xác minh trên Prometheus và Alertmanager

### 5.1. Prometheus Rules API (`/api/v1/rules`)
Truy vấn: `GET http://localhost:9090/api/v1/rules`
- Nhóm: `hrm-infrastructure-alerts`
- Đường dẫn file nạp: `/etc/prometheus/rules/alerts.yml`
- Trạng thái các rules:
  1. `HighCPUUsage`: `state: "inactive"`, `health: "ok"`, `duration: 300s`
  2. `HighRAMUsage`: `state: "inactive"`, `health: "ok"`, `duration: 300s`
  3. `MySQLTooManyConnections`: `state: "inactive"`, `health: "ok"`, `duration: 120s`
  4. `InstanceDown`: `state: "inactive"`, `health: "ok"`, `duration: 60s`
  5. `HRMApplicationDown`: `state: "inactive"`, `health: "ok"`, `duration: 30s`
  6. `MySQLExporterDown`: `state: "inactive"`, `health: "ok"`, `duration: 60s`

### 5.2. Prometheus Alertmanager Discovery API (`/api/v1/alertmanagers`)
Truy vấn: `GET http://localhost:9090/api/v1/alertmanagers`
- Kết quả:
  ```json
  {
    "status": "success",
    "data": {
      "activeAlertmanagers": [
        {
          "url": "http://alertmanager:9093/api/v2/alerts"
        }
      ],
      "droppedAlertmanagers": []
    }
  }
  ```
- Prometheus đã kết nối thành công tới Alertmanager qua mạng nội bộ `monitoring`.

### 5.3. Alertmanager Alerts API (`/api/v2/alerts`)
Truy vấn: `GET http://localhost:9093/api/v2/alerts`
- Trạng thái trả về: HTTP 200 OK, danh sách rỗng (do hệ thống hạ tầng máy chủ và ứng dụng hiện đang hoàn toàn khỏe mạnh, không có vi phạm ngưỡng cảnh báo).

---

## 6. Những rule chưa kiểm thử Firing và nguyên nhân

- **Các rule chưa kích hoạt (Firing):**
  - `HighCPUUsage` (ngưỡng > 80%, thực tế ~2.2%)
  - `HighRAMUsage` (ngưỡng > 85%, thực tế ~30.2%)
  - `MySQLTooManyConnections` (ngưỡng > 80, thực tế 1 kết nối)
- **Nguyên nhân kỹ thuật:**
  - Theo nguyên tắc an toàn vận hành (SRE best practices) và yêu cầu đề bài: *"Không cần cố tình làm CPU/RAM tăng cao hoặc tạo quá nhiều kết nối MySQL trên môi trường đang chạy thật chỉ để thử nghiệm"*.
  - Việc tạo quá tải nhân tạo có nguy cơ gây OOM killer hoặc làm nghẽn database của ứng dụng HRM.
  - Đã phân biệt rõ: Các biểu thức đã được đánh giá thực tế (evaluate) trên TSDB, cú pháp PromQL và cú pháp YAML đều đã được `promtool` xác nhận `SUCCESS`, engine alerting của Prometheus đã đánh giá theo chu kỳ `evaluation_interval: 15s`.

---

## 7. Hướng dẫn kiểm tra lại sau khi khởi động hệ thống

1. **Khởi động / cập nhật toàn bộ stack monitoring:**
   ```bash
   docker compose up -d
   ```
2. **Kiểm tra trạng thái các container:**
   ```bash
   docker compose ps prometheus alertmanager node-exporter mysqld-exporter
   ```
3. **Xác thực rules trong container Prometheus:**
   ```bash
   docker exec hrm-prometheus /bin/promtool check rules /etc/prometheus/rules/alerts.yml
   ```
4. **Kiểm tra giao diện Web hoặc API:**
   - Prometheus Rules UI: Mở trình duyệt truy cập `http://localhost:9090/rules`
   - Prometheus Alerts UI: Mở trình duyệt truy cập `http://localhost:9090/alerts`
   - Alertmanager UI: Mở trình duyệt truy cập `http://localhost:9093`
5. **(Tùy chọn Staging) Kiểm tra thử nghiệm kích hoạt Firing an toàn:**
   - Nếu muốn xem rule chuyển sang `Pending` rồi `Firing`, có thể tạm thời sửa tạm ngưỡng của `HighCPUUsage` xuống `> 0.1` trong vài phút để quan sát trên Alertmanager Web UI, sau đó rollback lại giá trị chuẩn `> 80`.
