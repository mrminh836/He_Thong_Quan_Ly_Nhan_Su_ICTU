# BÁO CÁO SRE: CẤU HÌNH GRAFANA TỰ ĐỘNG NẠP LOKI DATASOURCE QUA PROVISIONING YAML
**Dự án:** Hệ thống Quản lý Nhân sự (HRM - ICTU)  
**Tác giả:** Senior SRE/DevOps Engineer  
**Môi trường:** Docker Compose | Grafana v13.2.4 | Loki v3.7.9  
**Mạng Docker:** `monitoring` (`hrm-monitoring-network`)  

---

## 1. KHẢO SÁT HẠ TẦNG VÀ CƠ CHẾ PROVISIONING HIỆN CÓ

1. **Service và Network:**
   * Container `grafana` và container `loki` cùng tham gia mạng Docker nội bộ `monitoring` (tên network thực tế: `hrm-monitoring-network`).
   * Grafana có thể phân giải trực tiếp hostname `loki` qua Docker Embedded DNS tại cổng `3100` (`http://loki:3100`).
2. **Cơ chế Mount Provisioning trong Compose:**
   * Trong `compose.yaml`, Grafana mount thư mục provisioning datasources dưới chế độ Read-Only:
     ```yaml
     volumes:
       - grafana-data:/var/lib/grafana
       - ./monitoring/grafana/provisioning/datasources:/etc/grafana/provisioning/datasources:ro
     ```
   * Cấu hình hiện có: `monitoring/grafana/provisioning/datasources/prometheus.yml` (Datasource Prometheus kết nối `http://prometheus:9090`, `isDefault: true`).
3. **Nguyên tắc triển khai:**
   * Không ghi đè hoặc can thiệp vào `prometheus.yml`.
   * Sử dụng file cấu hình riêng `monitoring/grafana/provisioning/datasources/loki.yml` để đảm bảo tính module hóa và không gây xung đột UID.

---

## 2. NỘI DUNG CẤU HÌNH PROVISIONING YAML

File cấu hình được khởi tạo tại: **`monitoring/grafana/provisioning/datasources/loki.yml`**

```yaml
# ==============================================================================
# GRAFANA DATASOURCE PROVISIONING - LOKI (HRM - ICTU)
# Tự động kết nối Grafana với Loki qua DNS nội bộ Docker (mạng monitoring)
# ==============================================================================
apiVersion: 1

datasources:
  - name: Loki
    uid: loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    editable: true
    jsonData:
      maxLines: 1000
```

### Giải thích các tham số kỹ thuật:
* `name: Loki`: Tên hiển thị trực quan trên giao diện Grafana (Connections → Data sources).
* `uid: loki`: Định danh tĩnh bất biến (Static UID) giúp các Dashboard và câu truy vấn LogQL tham chiếu nhất quán.
* `type: loki`: Plugin datasource Loki tích hợp sẵn của Grafana.
* `access: proxy`: Mọi truy vấn từ trình duyệt người dùng được Grafana Backend đứng ra làm proxy chuyển tiếp đến Loki qua mạng nội bộ `http://loki:3100`.
* `url: http://loki:3100`: Trỏ chính xác vào hostname Docker của service Loki cổng nội bộ 3100.
* `isDefault: false`: Không thay thế Prometheus (Prometheus vẫn giữ vai trò default metrics datasource).
* `editable: true`: Cho phép quản trị viên xem/điều chỉnh cấu hình qua giao diện nếu cần.

---

## 3. KẾT QUẢ KIỂM THỬ KỸ THUẬT

### 3.1. Kiểm tra trạng thái sẵn sàng của Loki (Readiness)
```powershell
curl.exe -i http://localhost:3100/ready
```
* **Kết quả:** `HTTP/1.1 200 OK` - Phản hồi `ready` (Ingester và Storage TSDB sẵn sàng tiếp nhận truy vấn).

### 3.2. Kiểm tra danh sách Datasources tự động đăng ký trong Grafana
```powershell
curl.exe -s -u "admin:Admin@Pass2026" http://localhost:3001/api/datasources
```
* **Kết quả:**
  ```json
  [
    {
      "id": 3,
      "uid": "loki",
      "name": "Loki",
      "type": "loki",
      "access": "proxy",
      "url": "http://loki:3100",
      "isDefault": false,
      "jsonData": { "maxLines": 1000 }
    },
    {
      "id": 1,
      "uid": "prometheus",
      "name": "Prometheus",
      "type": "prometheus",
      "access": "proxy",
      "url": "http://prometheus:9090",
      "isDefault": true
    }
  ]
  ```
  *(Cả hai Datasource Prometheus và Loki đều tồn tại song song, không gây xung đột).*

### 3.3. Kiểm tra kết nối từ Grafana đến Loki (Tương đương nút "Save & test")
```powershell
curl.exe -i -s -u "admin:Admin@Pass2026" http://localhost:3001/api/datasources/uid/loki/health
```
* **Kết quả:**
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json

  {"message":"Data source successfully connected.","status":"OK"}
  ```

### 3.4. Kiểm tra sức khỏe của Datasource Prometheus hiện có
```powershell
curl.exe -i -s -u "admin:Admin@Pass2026" http://localhost:3001/api/datasources/uid/prometheus/health
```
* **Kết quả:** `HTTP/1.1 200 OK` - `{"message":"Successfully queried the Prometheus API.","status":"OK"}`.

### 3.5. Kiểm tra khả năng tự động nạp lại sau khi Restart container
```powershell
docker compose restart grafana
curl.exe -s -u "admin:Admin@Pass2026" http://localhost:3001/api/datasources/uid/loki/health
```
* **Kết quả:** Sau khi container `grafana` khởi động lại, Datasource `Loki` tự động được nạp lại tức thì mà không cần thao tác thủ công, trả về trạng thái `OK`.

### 3.6. Kiểm tra truy vấn End-to-End qua Grafana Explore API
```powershell
POST /api/ds/query với biểu thức LogQL {job="hrm-test"}
```
* **Kết quả:** Grafana Backend proxy thành công dữ liệu log từ Loki TSDB Storage và trả về bản ghi log mẫu `HRM-ICTU: Persistence verification entry at 1792738153507000000`.

---

## 4. BẢNG ĐỐI CHIẾU TIÊU CHÍ HOÀN THÀNH

| STT | Tiêu chí nghiệm thu | Hiện trạng kiểm chứng | Đánh giá |
| :---: | :--- | :--- | :---: |
| 1 | File `loki.yml` hợp lệ | Định dạng YAML chuẩn Grafana Provisioning v1 | **Đạt** |
| 2 | Grafana mount đúng thư mục provisioning | Mount `./monitoring/grafana/provisioning/datasources` vào `/etc/grafana/provisioning/datasources:ro` | **Đạt** |
| 3 | Datasource Loki xuất hiện tự động sau khi khởi động | Đã kiểm chứng qua API `/api/datasources` và log Grafana | **Đạt** |
| 4 | UID datasource ổn định là `loki` | UID cố định `loki`, không bị thay đổi ngẫu nhiên | **Đạt** |
| 5 | URL datasource trỏ đúng service Loki trong Docker network | URL nội bộ `http://loki:3100` giải mã qua Docker DNS alias | **Đạt** |
| 6 | Prometheus datasource và cấu hình hiện có vẫn hoạt động | Datasource Prometheus giữ nguyên vai trò default, healthcheck `OK` | **Đạt** |
| 7 | Kiểm tra kết nối Loki thành công | Endpoint `/api/datasources/uid/loki/health` trả về HTTP 200 `status: OK` | **Đạt** |
| 8 | Không mất dữ liệu hoặc xóa volume hiện có | Named volume `hrm_ictu_grafana_data` và `hrm_ictu_loki_data` nguyên vẹn | **Đạt** |
