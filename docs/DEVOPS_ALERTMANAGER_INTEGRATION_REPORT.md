# BÁO CÁO DEVOPS: TRIỂN KHAI ALERTMANAGER VÀ TÍCH HỢP DOCKER NETWORK MONITORING
**Dự án:** Hệ thống Quản lý Nhân sự (HRM - ICTU)  
**Tác giả:** Senior DevOps/SRE Engineer  
**Sprint:** Sprint 3 - US 31.0 (Tiêu chí số 6 / Commit 3)  
**Image Alertmanager:** `prom/alertmanager:latest` (v0.34.1)  
**Mạng Docker:** `monitoring` (`hrm-monitoring-network`)  
**Volume lưu trữ:** `alertmanager-data` (`hrm_ictu_alertmanager_data`)  

---

## 1. TỔNG QUAN KHẢO SÁT HẠ TẦNG TRƯỚC KHI TRIỂN KHAI

Trước khi thực hiện các thay đổi, hệ thống giám sát HRM bao gồm 12 containers:
* **Metrics:** Prometheus (`hrm-prometheus:9090`), Node Exporter (`9100`), cAdvisor (`8080`), MySQL Exporter (`9104`), Backend API Runtime metrics (`3005`).
* **Visualizations:** Grafana (`grafana:3000 -> 3001`).
* **Logging:** Loki (`loki:3100`), Promtail (`promtail:9080`).
* **Mạng Docker chung:** Mạng bridge `monitoring` (tên thực tế: `hrm-monitoring-network`).
* **Hiện trạng Prometheus:** Trước triển khai, `prometheus/prometheus.yml` chỉ có khối `scrape_configs`, chưa có cấu hình `alerting` và `rule_files`.

Đội ngũ DevOps tiến hành tích hợp Alertmanager đảm bảo:
* Giữ nguyên vẹn toàn bộ 5 scrape targets hiện có của Prometheus.
* Không làm gián đoạn hoặc restart các dịch vụ không liên quan (`mysql-db`, `hrm-ictu-backend`, `hrm-nginx`).
* Bảo toàn volume dữ liệu và tuân thủ nguyên tắc Least Privilege (chỉ bind cổng ra `127.0.0.1:9093` trên Host).

---

## 2. NỘI DUNG CẤU HÌNH ĐÃ TRIỂN KHAI

### 2.1. Cấu hình Alertmanager (`monitoring/alertmanager/alertmanager.yml`)
```yaml
# ==============================================================================
# ALERTMANAGER CONFIGURATION - HRM ICTU MONITORING STACK
# Quản lý, gom cụm và định tuyến cảnh báo từ Prometheus
# ==============================================================================
global:
  resolve_timeout: 5m

route:
  receiver: "default-receiver"
  group_by:
    - alertname
    - job
    - severity
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: "default-receiver"
```

### 2.2. Quy tắc cảnh báo Prometheus Alert Rules (`prometheus/alert.rules.yml`)
Thiết lập 6 quy tắc cảnh báo chuẩn cho cả hạ tầng máy chủ và ứng dụng HRM:
```yaml
groups:
  - name: hrm-infrastructure-alerts
    rules:
      # 1. Target giám sát bị gián đoạn (Instance Down)
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
          environment: production
        annotations:
          summary: "Target {{ $labels.instance }} bị gián đoạn"
          description: "Target {{ $labels.instance }} thuộc job {{ $labels.job }} đã mất kết nối hơn 1 phút."

      # 2. Ứng dụng HRM Backend không phản hồi
      - alert: HRMApplicationDown
        expr: up{job="hrm-app"} == 0
        for: 30s
        labels:
          severity: critical
          service: hrm-backend
        annotations:
          summary: "HRM Backend API đang không phản hồi"
          description: "Container hrm-app tại {{ $labels.instance }} không thể scrape metrics qua /metrics."

      # 3. MySQL Exporter không thể kết nối DB
      - alert: MySQLExporterDown
        expr: up{job="mysql-exporter"} == 0
        for: 1m
        labels:
          severity: critical
          service: mysql-database
        annotations:
          summary: "MySQL Exporter không thể thu thập số liệu CSDL"
          description: "MySQL Exporter tại {{ $labels.instance }} bị gián đoạn kết nối tới MySQL Database."

      # 4. Quá tải CPU máy chủ (> 80%)
      - alert: HighCPUUsage
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 3m
        labels:
          severity: warning
          component: host-node
        annotations:
          summary: "Mức sử dụng CPU máy chủ vượt ngưỡng 80%"
          description: "CPU trung bình trong 5 phút của {{ $labels.instance }} đạt mức cao (giá trị: {{ $value | printf \"%.2f\" }}%)."

      # 5. Cạn kiệt bộ nhớ RAM máy chủ (> 85%)
      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 3m
        labels:
          severity: warning
          component: host-node
        annotations:
          summary: "Mức sử dụng bộ nhớ RAM vượt ngưỡng 85%"
          description: "Bộ nhớ khả dụng của {{ $labels.instance }} đang dưới 15% (đang sử dụng: {{ $value | printf \"%.2f\" }}%)."

      # 6. Quá tải kết nối MySQL Database (> 80 active connections)
      - alert: MySQLTooManyConnections
        expr: mysql_global_status_threads_connected > 80
        for: 2m
        labels:
          severity: warning
          service: mysql-database
        annotations:
          summary: "Số lượng kết nối MySQL vượt quá 80 kết nối"
          description: "MySQL đang có {{ $value }} active threads connected, có nguy cơ cạn kiệt connection pool."
```

### 2.3. Cập nhật cấu hình Prometheus (`prometheus/prometheus.yml`)
Bổ sung khai báo `rule_files` và `alerting`:
```yaml
# Quy tắc cảnh báo hạ tầng & ứng dụng HRM (Sprint 3 - US 31.0)
rule_files:
  - "/etc/prometheus/alert.rules.yml"

# Kết nối Prometheus tới Alertmanager qua mạng Docker monitoring
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - "alertmanager:9093"
```

### 2.4. Khai báo Service trong Docker Compose (`compose.yaml`)
```yaml
  # ----------------------------------------------------------------------------
  # SERVICE 13: Prometheus Alertmanager (alertmanager)
  # Quản lý, gom cụm và định tuyến cảnh báo hạ tầng & ứng dụng (port 9093)
  # ----------------------------------------------------------------------------
  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    restart: unless-stopped
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
      - "--storage.path=/alertmanager"
    ports:
      # Bind 127.0.0.1:9093 trên Host phục vụ truy cập dashboard nội bộ (Least Privilege)
      - "127.0.0.1:${ALERTMANAGER_PORT:-9093}:9093"
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager-data:/alertmanager
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:9093/-/healthy"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      monitoring:
        aliases:
          - alertmanager

volumes:
  alertmanager-data:
    name: hrm_ictu_alertmanager_data
```

---

## 3. QUÁ TRÌNH KIỂM THỬ KỸ THUẬT VÀ BẰNG CHỨNG XÁC THỰC

### 3.1. Kiểm tra cú pháp cấu hình với `amtool` và `promtool`
1. **Kiểm tra `alertmanager.yml` bằng `amtool`:**
   ```powershell
   docker run --rm -v "d:\QLNS_QLTKPM\monitoring\alertmanager\alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" --entrypoint /bin/amtool prom/alertmanager:latest check-config /etc/alertmanager/alertmanager.yml
   # Kết quả: Checking '/etc/alertmanager/alertmanager.yml' SUCCESS
   ```
2. **Kiểm tra `alert.rules.yml` bằng `promtool`:**
   ```powershell
   docker run --rm -v "d:\QLNS_QLTKPM\prometheus\alert.rules.yml:/etc/prometheus/alert.rules.yml:ro" --entrypoint /bin/promtool prom/prometheus:v2.51.0 check rules /etc/prometheus/alert.rules.yml
   # Kết quả: Checking /etc/prometheus/alert.rules.yml -> SUCCESS: 6 rules found
   ```
3. **Kiểm tra `prometheus.yml` bằng `promtool`:**
   ```powershell
   docker run --rm -v "d:\QLNS_QLTKPM\prometheus\prometheus.yml:/etc/prometheus/prometheus.yml:ro" -v "d:\QLNS_QLTKPM\prometheus\alert.rules.yml:/etc/prometheus/alert.rules.yml:ro" --entrypoint /bin/promtool prom/prometheus:v2.51.0 check config /etc/prometheus/prometheus.yml
   # Kết quả: SUCCESS: 1 rule files found | SUCCESS: /etc/prometheus/prometheus.yml is valid prometheus config file syntax
   ```

### 3.2. Trạng thái khởi động container
```powershell
docker compose ps alertmanager prometheus
```
```text
NAME             IMAGE                      COMMAND                  SERVICE        STATUS                   PORTS
alertmanager     prom/alertmanager:latest   "/bin/alertmanager -…"   alertmanager   Up (healthy)             127.0.0.1:9093->9093/tcp
hrm-prometheus   prom/prometheus:v2.51.0    "/bin/prometheus --c…"   prometheus     Up (healthy)             127.0.0.1:9090->9090/tcp
```

### 3.3. Xác minh kết nối từ Prometheus tới Alertmanager qua Docker DNS
Truy vấn trực tiếp endpoint `/api/v1/alertmanagers` của Prometheus:
```powershell
curl.exe -s http://localhost:9090/api/v1/alertmanagers
```
* **Kết quả:**
  ```json
  {
    "status": "success",
    "data": {
      "activeAlertmanagers": [
        { "url": "http://alertmanager:9093/api/v2/alerts" }
      ],
      "droppedAlertmanagers": []
    }
  }
  ```
  *(Prometheus đã tự động kết nối và gửi cảnh báo tới Alertmanager qua DNS nội bộ `alertmanager:9093`).*

### 3.4. Xác minh nạp và đánh giá Alert Rules
Truy vấn endpoint `/api/v1/rules` của Prometheus:
```powershell
curl.exe -s http://localhost:9090/api/v1/rules
```
* **Kết quả:** Trả về đầy đủ 6 rules đang hoạt động với `health: "ok"`, chu kỳ đánh giá 15 giây/lần.

### 3.5. Kiểm thử gửi Alert an toàn vào Alertmanager
Gửi cảnh báo kiểm thử mẫu qua API `POST http://localhost:9093/api/v2/alerts`:
```json
[
  {
    "labels": {
      "alertname": "TestAlertHRM",
      "instance": "hrm-test-instance:9093",
      "severity": "warning",
      "service": "hrm-monitoring-test"
    },
    "annotations": {
      "summary": "Alertmanager Integration Test Alert for HRM ICTU",
      "description": "Safe verification alert confirming Alertmanager v0.34.1 is properly receiving and routing alerts in HRM monitoring network."
    }
  }
]
```
* **Kết quả kiểm tra tại `GET http://localhost:9093/api/v2/alerts`:**
  ```json
  [
    {
      "labels": {
        "alertname": "TestAlertHRM",
        "instance": "hrm-test-instance:9093",
        "service": "hrm-monitoring-test",
        "severity": "warning"
      },
      "status": { "state": "active" },
      "receivers": [ { "name": "default-receiver" } ]
    }
  ]
  ```
  *(Alertmanager tiếp nhận, phân nhóm và định tuyến cảnh báo thành công 100%).*

---

## 4. BẢNG TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

| STT | Tiêu chí nghiệm thu | Trạng thái kỹ thuật | Đánh giá |
| :---: | :--- | :--- | :---: |
| 1 | Container Alertmanager khởi động thành công | Service `alertmanager` image `prom/alertmanager:latest` chạy `healthy` | **ĐẠT** |
| 2 | Cổng 9093 được ánh xạ đúng theo yêu cầu bảo mật | Bind `127.0.0.1:9093:9093`, không mở port ra public host | **ĐẠT** |
| 3 | Alertmanager kết nối vào network `monitoring` | Tham gia `hrm-monitoring-network`, alias `alertmanager` | **ĐẠT** |
| 4 | File cấu hình `alertmanager.yml` hợp lệ & mount đúng | Kiểm tra thành công qua `amtool check-config`, mount `ro` | **ĐẠT** |
| 5 | Prometheus cấu hình đúng endpoint `alertmanager:9093` | `activeAlertmanagers` trả về `http://alertmanager:9093/api/v2/alerts` | **ĐẠT** |
| 6 | Prometheus vẫn scrape được tất cả 5 targets hiện có | Tất cả targets (`cadvisor`, `node-exporter`, `hrm-app`, `mysqld-exporter`, `prometheus`) đều `UP` | **ĐẠT** |
| 7 | Alert rules hợp lệ và được nạp vào Prometheus | 6 alert rules được nạp thành công qua file `alert.rules.yml` | **ĐẠT** |
| 8 | Alertmanager nhận được alert kiểm thử an toàn | Gửi và nhận thành công alert `TestAlertHRM` qua `/api/v2/alerts` | **ĐẠT** |
| 9 | Grafana, Loki, Prometheus, Exporters không bị ảnh hưởng | Toàn bộ 13 containers trong hệ thống đều hoạt động ổn định | **ĐẠT** |
| 10 | Dữ liệu và volume không bị xóa | Named volume `hrm_ictu_alertmanager_data` được bảo vệ nguyên vẹn | **ĐẠT** |
