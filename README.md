# 🏢 HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) — DỰ ÁN TỔNG THỂ

> **Học phần:** Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM K23)  
> **Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM - ICTU)  
> **Kiến trúc:** Microservices / Multi-service Monorepo (`backend/`, `database/`, `docs/`)  
> **Công nghệ:** Node.js (Express ES Modules) | MySQL 8.0 | Docker Compose  
> **Nhánh Git:** `feature/backend-docker-init`

---

## 📁 1. CẤU TRÚC THƯ MỤC DỰ ÁN

Toàn bộ mã nguồn Backend đã được gom gọn vào thư mục `backend/`:

```text
QLNS_QLTKPM/
├── compose.yaml              # Cấu hình Docker Compose điều phối (MySQL 8.0 + Backend)
├── .gitignore                # Danh sách loại trừ khi commit Git
├── README.md                 # Hướng dẫn chi tiết cài đặt và vận hành hệ thống
│
├── backend/                  # 🟢 TOÀN BỘ MÃ NGUỒN VÀ DỊCH VỤ BACKEND API
│   ├── .env.example          # Mẫu cấu hình biến môi trường Backend
│   ├── .env                  # Cấu hình môi trường thực tế (được .gitignore bảo vệ)
│   ├── .dockerignore         # Danh sách loại trừ khi build Docker image Backend
│   ├── Dockerfile            # Dockerfile cho Backend (Node 22-alpine, non-root user)
│   ├── package.json          # Khai báo dependencies (express, mysql2, dotenv, cors)
│   ├── package-lock.json     # Khóa chính xác phiên bản thư viện
│   │
│   ├── src/                  # Mã nguồn chính Express API
│   │   ├── config/
│   │   │   ├── env.js        # Module tải và xác thực biến môi trường tập trung
│   │   │   └── database.js   # Module Connection Pool mysql2/promise, đo độ trễ
│   │   ├── controllers/
│   │   │   └── healthController.js # Controller kiểm tra sức khỏe hệ thống và CSDL
│   │   ├── middlewares/
│   │   │   ├── logger.js     # Ghi nhật ký yêu cầu HTTP tối giản
│   │   │   ├── errorHandler.js # Xử lý lỗi tập trung toàn hệ thống
│   │   │   └── notFoundHandler.js # Bắt lỗi đường dẫn không tồn tại (404)
│   │   ├── routes/
│   │   │   ├── healthRoutes.js # Tuyến đường /api/health và /api/health/db
│   │   │   └── index.js      # Router tổng hợp toàn bộ API
│   │   ├── utils/
│   │   │   └── response.js   # Chuẩn hóa định dạng JSON phản hồi (Standard Envelope)
│   │   ├── app.js            # Thiết lập Express App, CORS, Body parser, Middleware
│   │   └── server.js         # Khởi động máy chủ HTTP và Graceful Shutdown
│   │
│   └── tests/
│       └── health.http       # Bộ kiểm thử REST Client trên VS Code
│
├── database/                 # 🔵 THƯ MỤC LƯU TRỮ KỊCH BẢN CƠ SỞ DỮ LIỆU
│   ├── schema.sql            # Kịch bản DDL chuẩn 4 bảng, Least Privilege & Seed data
│   └── init.sql              # Kịch bản DDL sao lưu bổ trợ
│
└── docs/                     # 📚 THƯ MỤC TÀI LIỆU DỰ ÁN
    ├── ERD_DATABASE_DESIGN.md# Đặc tả chi tiết ERD và từ điển dữ liệu 3NF
    ├── PRODUCT_BACKLOG.md    # Product Backlog chi tiết
    └── SPRINT_1_BACKLOG.md   # Kế hoạch chi tiết Sprint 1
```

---

## ⚙️ 2. YÊU CẦU MÔI TRƯỜNG (PREREQUISITES)

1. **Docker Desktop:** Đã cài đặt và đang bật ([Tải Docker Desktop](https://www.docker.com/products/docker-desktop/)).
2. **Node.js (Tùy chọn khi chạy local máy host):** Node.js $\ge$ 18.0 (Khuyến nghị Node.js v20 hoặc v22).
3. **VS Code Extensions (Khuyến nghị):**
   - *REST Client* (Huachao Mao) để kiểm thử file `backend/tests/health.http`.
   - *Docker* (Microsoft).

---

## 🚀 3. HƯỚNG DẪN KHỞI CHẠY BẰNG DOCKER COMPOSE

Từ thư mục gốc dự án (`d:\QLNS_QLTKPM`):

### Bước 1: Chuẩn bị file biến môi trường `.env`
Sao chép từ tệp mẫu `backend/.env.example`:
```powershell
Copy-Item backend\.env.example backend\.env
```

### Bước 2: Kiểm tra cú pháp Compose
```powershell
docker compose config
```

### Bước 3: Build và khởi động các dịch vụ ở chế độ chạy nền
```powershell
docker compose up -d --build
```
> **Cơ chế khởi động an toàn:** Dịch vụ `backend` được cấu hình `condition: service_healthy` phụ thuộc vào `db`. Backend sẽ kiên nhẫn chờ đến khi MySQL hoàn tất khởi tạo schema và sẵn sàng nhận kết nối mới bắt đầu khởi động.

### Bước 4: Kiểm tra trạng thái các container
```powershell
docker compose ps
```
*Kết quả kỳ vọng:*
- `hrm-mysql` hiển thị trạng thái `Up (healthy)`.
- `hrm-backend` hiển thị trạng thái `Up`.

### Bước 5: Xem nhật ký hoạt động (Logs)
- Xem log của Backend:
  ```powershell
  docker compose logs -f backend
  ```
- Xem log của MySQL:
  ```powershell
  docker compose logs -f db
  ```

---

## 🩺 4. KIỂM THỬ KẾT NỐI VÀ API HEALTHCHECK

Bạn có thể kiểm tra trực tiếp qua trình duyệt web, PowerShell `curl`, hoặc mở file `backend/tests/health.http` trong VS Code:

### 1. Kiểm tra API Root
- **URL:** `http://localhost:3000/api`
- **Method:** `GET`
- **Phản hồi mẫu:**
  ```json
  {
    "service": "HRM Backend API Service",
    "version": "1.0.0",
    "status": "ONLINE"
  }
  ```

### 2. Kiểm tra Healthcheck Ứng dụng Backend
- **URL:** `http://localhost:3000/api/health`
- **Method:** `GET`
- **Phản hồi mẫu:**
  ```json
  {
    "status": "success",
    "statusCode": 200,
    "message": "Hệ thống HRM Backend API đang hoạt động bình thường.",
    "data": {
      "status": "UP",
      "uptime": "42s",
      "environment": "development",
      "nodeVersion": "v22.23.2"
    }
  }
  ```

### 3. Kiểm tra Kết nối CSDL MySQL 8.0
- **URL:** `http://localhost:3000/api/health/db`
- **Method:** `GET`
- **Phản hồi mẫu:**
  ```json
  {
    "status": "success",
    "statusCode": 200,
    "message": "Kết nối cơ sở dữ liệu MySQL 8.0 thành công và ổn định.",
    "data": {
      "databaseStatus": "HEALTHY",
      "databaseName": "hrm_db",
      "latencyMs": "4ms",
      "mysqlVersion": "8.0.41",
      "detectedTables": [
        { "tableName": "departments", "approximateRows": 3 },
        { "tableName": "employees", "approximateRows": 5 },
        { "tableName": "users", "approximateRows": 3 },
        { "tableName": "attendances", "approximateRows": 5 }
      ]
    }
  }
  ```

---

## 💻 5. HƯỚNG DẪN CHẠY LOCAL MÁY HOST (CHO LẬP TRÌNH VIÊN)

Nếu bạn chỉ muốn chạy riêng MySQL trong Docker và chạy Backend trực tiếp trên máy host:

1. **Khởi động riêng MySQL container:**
   ```powershell
   docker compose up -d db
   ```
2. **Cấu hình file `backend/.env`:**
   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   ```
3. **Cài đặt thư viện và chạy Backend:**
   ```powershell
   cd backend
   npm install
   npm run dev
   ```

---

## 🛑 6. QUẢN LÝ VÒNG ĐỜI DỊCH VỤ & BẢO TOÀN DỮ LIỆU

### Dừng dịch vụ mà KHÔNG LÀM MẤT dữ liệu
```powershell
docker compose stop
# hoặc
docker compose down
```
> Dữ liệu CSDL được lưu an toàn trong named volume `hrm_mysql_data`. Khi bạn chạy lại `docker compose up -d`, toàn bộ dữ liệu vẫn được bảo toàn nguyên vẹn.

### Khi nào cần xóa sạch CSDL để nạp lại script mới từ đầu?
```powershell
docker compose down -v
docker compose up -d --build
```
*(Lệnh `-v` sẽ xóa bỏ volume `hrm_mysql_data`, chỉ sử dụng khi bạn chủ đích muốn reset CSDL).*
