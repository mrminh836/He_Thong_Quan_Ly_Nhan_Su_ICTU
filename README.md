# 🏢 HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) — BACKEND & DOCKER DEPLOYMENT

> **Học phần:** Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM K23)  
> **Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM - ICTU)  
> **Công nghệ:** Node.js (Express ES Modules) | MySQL 8.0 | Docker Compose  
> **Nhánh Git:** `feature/backend-docker-init`

---

## 📁 1. CẤU TRÚC THƯ MỤC DỰ ÁN

```text
QLNS_QLTKPM/
├── .env.example              # Mẫu cấu hình biến môi trường
├── .env                      # Cấu hình môi trường thực tế (bảo mật, được .gitignore)
├── .gitignore                # Danh sách loại trừ khi commit Git
├── .dockerignore             # Danh sách loại trừ khi build Docker image
├── Dockerfile                # Dockerfile cho Backend (Node 22-alpine, non-root user)
├── compose.yaml              # Cấu hình Docker Compose (MySQL 8.0 + Backend Express)
├── package.json              # Khai báo dependencies, scripts chạy dự án
├── package-lock.json         # Khóa chính xác phiên bản thư viện
├── README.md                 # Hướng dẫn chi tiết cài đặt và vận hành hệ thống
│
├── database/                 # Thư mục lưu trữ kịch bản CSDL
│   ├── schema.sql            # Kịch bản DDL chuẩn 4 bảng, Least Privilege & Seed data
│   └── init.sql              # Kịch bản DDL sao lưu bổ trợ
│
├── docs/                     # Tài liệu thiết kế và quản lý dự án
│   ├── ERD_DATABASE_DESIGN.md# Đặc tả chi tiết ERD và từ điển dữ liệu 3NF
│   ├── PRODUCT_BACKLOG.md    # Product Backlog tổng thể hệ thống
│   └── SPRINT_1_BACKLOG.md   # Chi tiết kế hoạch triển khai Sprint 1
│
├── src/                      # Toàn bộ mã nguồn ứng dụng Backend
│   ├── config/
│   │   ├── env.js            # Module xử lý và xác thực biến môi trường
│   │   └── database.js       # Module Connection Pool mysql2/promise, test kết nối
│   ├── controllers/
│   │   └── healthController.js # Xử lý các endpoint kiểm tra sức khỏe hệ thống và CSDL
│   ├── middlewares/
│   │   ├── logger.js         # Ghi nhật ký yêu cầu HTTP tối giản
│   │   ├── errorHandler.js   # Xử lý lỗi tập trung toàn hệ thống
│   │   └── notFoundHandler.js# Bắt lỗi đường dẫn không tồn tại (404)
│   ├── routes/
│   │   ├── healthRoutes.js   # Định nghĩa tuyến đường /api/health, /api/health/db
│   │   └── index.js          # Router tổng hợp các API của ứng dụng
│   ├── utils/
│   │   └── response.js       # Chuẩn hóa định dạng JSON phản hồi (Standard Envelope)
│   ├── app.js                # Thiết lập Express App, CORS, Body parser, Middleware
│   └── server.js             # Khởi động máy chủ HTTP và Graceful Shutdown
│
└── tests/
    └── health.http           # File kiểm thử REST Client trên VS Code
```

---

## ⚙️ 2. YÊU CẦU MÔI TRƯỜNG (PREREQUISITES)

Để chạy dự án mượt mà trên hệ điều hành **Windows 10/11** hoặc **macOS/Linux**:

1. **Docker Desktop:** Đã cài đặt và đang chạy ([Tải Docker Desktop](https://www.docker.com/products/docker-desktop/)).
2. **Node.js (Tùy chọn khi chạy local không qua Docker):** Phiên bản Node.js $\ge$ 18.0 (Khuyến nghị Node.js v20 hoặc v22).
3. **VS Code Extensions (Khuyến nghị):**
   - *REST Client* (Huachao Mao) để chạy file `tests/health.http`.
   - *Docker* (Microsoft).

---

## 🚀 3. HƯỚNG DẪN KHỞI CHẠY BẰNG DOCKER COMPOSE (KHUYẾN NGHỊ)

Đây là phương thức chuẩn hóa giúp chạy cả **MySQL 8.0** và **Backend API** trong môi trường cô lập, tự động khởi tạo bảng và seed data mẫu.

### Bước 1: Chuẩn bị file biến môi trường `.env`
Sao chép từ tệp mẫu `.env.example`:
```powershell
# Chạy trong PowerShell
Copy-Item .env.example .env
```
*(Hoặc dùng chuột phải trên VS Code: Copy `.env.example` $\rightarrow$ Paste và đổi tên thành `.env`)*

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

Bạn có thể kiểm tra trực tiếp qua trình duyệt web, PowerShell `curl`, hoặc mở file `tests/health.http` trong VS Code:

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

### 2. Kiểm tra Healthcheck Ứng dụng
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

Nếu bạn chỉ muốn chạy riêng MySQL trong Docker và chạy Backend trực tiếp trên máy host để debug nhanh:

1. **Khởi động riêng MySQL container:**
   ```powershell
   docker compose up -d db
   ```
2. **Cấu hình file `.env` trên máy host:**
   Mở file `.env` và sửa:
   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   ```
3. **Cài đặt dependencies và chạy chế độ lập trình (Hot-reload):**
   ```powershell
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
> **Quan trọng:** Dữ liệu CSDL được lưu an toàn trong named volume `hrm_mysql_data`. Khi bạn chạy lại `docker compose up -d`, toàn bộ dữ liệu phòng ban, nhân viên và chấm công vẫn được bảo toàn nguyên vẹn!

### Khởi động lại dịch vụ
```powershell
docker compose up -d
```

### Khi nào cần xóa sạch CSDL để nạp lại script mới từ đầu?
Nếu bạn chỉnh sửa file `database/schema.sql` và muốn MySQL khởi tạo lại dữ liệu mẫu sạch sẽ từ đầu:
```powershell
docker compose down -v
docker compose up -d --build
```
*(Lệnh `-v` sẽ xóa bỏ volume `hrm_mysql_data`, chỉ sử dụng khi bạn chủ đích muốn reset CSDL).*

---

## 🛠️ 7. HƯỚNG DẪN XỬ LÝ SỰ CỐ PHỔ BIẾN (TROUBLESHOOTING)

| Hiện tượng lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| `failed to connect to the docker API at npipe:...` | Ứng dụng Docker Desktop trên Windows chưa được bật | Mở Start Menu $\rightarrow$ gõ **Docker Desktop** và chờ biểu tượng cá voi chuyển sang màu xanh (Running) |
| `port is already allocated: 3306` | Cổng 3306 trên máy tính đang bị MySQL cài ngoài máy chiếm giữ | Tạm tắt dịch vụ MySQL trên máy host (`services.msc` $\rightarrow$ Stop MySQL), hoặc đổi `DB_PORT=3307` trong file `.env` |
| `port is already allocated: 3000` | Một ứng dụng Node.js khác đang lắng nghe trên cổng 3000 | Đổi `PORT=3001` trong file `.env` |
| `Access denied for user 'app_user'@'%'` | Mật khẩu trong `.env` không khớp với mật khẩu khởi tạo | Kiểm tra lại `DB_PASSWORD=AppUser@Pass2026` trong `.env` |
| MySQL container không nạp bảng mới khi sửa `schema.sql` | Volume dữ liệu cũ `hrm_mysql_data` đã tồn tại, MySQL bỏ qua thư mục `initdb.d` | Chạy `docker compose down -v` rồi chạy lại `docker compose up -d` để khởi tạo volume mới |
