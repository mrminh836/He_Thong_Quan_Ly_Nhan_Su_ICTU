# HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH DOCKER COMPOSE BASE
## DỰ ÁN: HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### Nhóm Phát triển Phần mềm | K23 - Khoa CNTT - ICTU

---

## 1. Tổng quan Kiến trúc Hệ thống Containers

Dự án HRM ICTU được thiết kế theo mô hình Monorepo hợp nhất, bao gồm 3 dịch vụ chính được đóng gói và điều phối tự động qua **Docker Compose**:

```text
               [ Trình duyệt Web người dùng ]
                 (http://localhost:5173)
                            │
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  DOCKER NETWORK: hrm-network                │
 │                                                             │
 │  ┌──────────────────────┐        ┌───────────────────────┐  │
 │  │ frontend (Nginx SPA) │        │ backend (Express API) │  │
 │  │ Container port: 80   │───────►│ Container port: 3005  │  │
 │  │ Host port: 5173      │ Proxy  │ Host port: 3005       │  │
 │  │ Healthcheck: wget    │  /api/ │ Healthcheck: curl     │  │
 │  └──────────────────────┘        └───────────┬───────────┘  │
 │                                              │              │
 │                                              ▼              │
 │                                  ┌───────────────────────┐  │
 │                                  │   db (MySQL 8.0)      │  │
 │                                  │ Container port: 3306  │  │
 │                                  │ Host port: 3308       │  │
 │                                  │ Healthcheck: ping     │  │
 │                                  └───────────┬───────────┘  │
 └──────────────────────────────────────────────┼──────────────┘
                                                ▼
                                    ┌───────────────────────┐
                                    │ Volume: mysql_data    │
                                    │ (Lưu trữ bền vững)    │
                                    └───────────────────────┘
```

### Chi tiết các dịch vụ:
1. **`db` (MySQL 8.0 Database)**:
   - Quản lý toàn bộ dữ liệu nhân sự, phòng ban, người dùng, chấm công.
   - Dữ liệu được lưu trữ trên **Named Volume** (`mysql_data`), đảm bảo **không bao giờ bị mất** khi khởi động lại máy hoặc tắt container.
   - Tự động nạp cấu trúc bảng từ thư mục `database/` trong lần đầu khởi tạo.
   - Cổng nội bộ: `3306`, Cổng mở ra máy Host: `3308` (tránh xung đột với MySQL cài sẵn trên máy tính).
2. **`backend` (Node.js 22 Express API)**:
   - Cung cấp toàn bộ RESTful API và logic xử lý nghiệp vụ HRM.
   - Chạy với tài khoản bảo mật `node` (non-root).
   - Kết nối với MySQL thông qua hostname nội bộ `db` trên cổng `3306`.
   - Có cơ chế chờ MySQL khởi động hoàn tất (`depends_on: condition: service_healthy`).
   - Cổng máy Host: `3005`.
3. **`frontend` (Vite SPA + Nginx Alpine)**:
   - Ứng dụng giao diện quản lý nhân sự Single Page Application.
   - Multi-stage build: Biên dịch tối ưu qua Node.js và phục vụ tệp tĩnh qua Web Server Nginx.
   - Tích hợp sẵn **SPA Fallback** (`try_files $uri $uri/ /index.html`), giúp người dùng F5 tại các trang con (`/employees`, `/departments`) không bị lỗi 404.
   - Tích hợp Reverse Proxy chuyển tiếp yêu cầu `/api/` đến service `backend`.
   - Cổng máy Host: `5173`.

---

## 2. Yêu cầu Môi trường (Prerequisites)

Trước khi bắt đầu, máy tính của bạn cần cài đặt:
- **Docker Desktop** (bản 4.25 trở lên cho Windows/macOS) hoặc **Docker Engine & Docker Compose V2** (trên Linux).
- Bật tính năng WSL 2 (nếu dùng Windows).

Kiểm tra trạng thái cài đặt tại Terminal:
```bash
docker --version
docker compose version
```
*(Cả hai lệnh phải in ra phiên bản tương ứng không báo lỗi)*.

---

## 3. Hướng dẫn Khởi chạy Nhanh (Quick Start)

Thực hiện đúng 4 bước sau để khởi chạy toàn bộ hệ thống từ đầu:

### Bước 1: Chuẩn bị tệp cấu hình môi trường
Từ thư mục gốc của dự án (`QLNS_QLTKPM`), sao chép tệp cấu hình mẫu `.env.example` thành `.env`:

```bash
# Trên Windows PowerShell / CMD:
copy .env.example .env

# Trên Linux / macOS:
cp .env.example .env
```
*(Tệp `.env` đã chứa đầy đủ cấu hình mặc định an toàn cho môi trường phát triển local, bạn có thể chỉnh sửa mật khẩu nếu muốn).*

### Bước 2: Kiểm tra tính hợp lệ của cấu hình
```bash
docker compose config
```
*Lệnh sẽ in ra toàn bộ cây cấu hình phân giải hợp lệ mà không có bất kỳ thông báo lỗi nào.*

### Bước 3: Build và Khởi động toàn bộ Services
```bash
docker compose up -d --build
```
- Quá trình build lần đầu sẽ tải MySQL, build Backend image và compile Frontend SPA bundle qua Vite & Nginx.
- Sau khi hoàn tất, cả 3 containers sẽ chạy ngầm ở chế độ daemon (`-d`).

### Bước 4: Kiểm tra trạng thái hoạt động và Healthcheck
```bash
docker compose ps
```
**Kết quả chuẩn:** Cả 3 dịch vụ đều ở trạng thái `running` (hoặc `healthy`):
```text
NAME                IMAGE               COMMAND                  SERVICE    STATUS
hrm-ictu-backend    qlns-backend        "docker-entrypoint.s…"   backend    running (healthy)
hrm-ictu-frontend   qlns-frontend       "/docker-entrypoint.…"   frontend   running (healthy)
hrm-ictu-mysql      mysql:8.0           "docker-entrypoint.s…"   db         running (healthy)
```

---

## 4. Danh mục Cổng và Địa chỉ Truy cập

Sau khi khởi chạy thành công, các thành viên trong nhóm có thể truy cập các đường dẫn sau:

| Dịch vụ | Mục đích | Địa chỉ truy cập trên Máy Host |
| :--- | :--- | :--- |
| **Giao diện HRM Frontend** | Ứng dụng web người dùng | [http://localhost:5173](http://localhost:5173) |
| **Backend Healthcheck** | Giám sát trạng thái Backend | [http://localhost:3005/api/health](http://localhost:3005/api/health) |
| **Database Healthcheck** | Giám sát kết nối Backend -> MySQL | [http://localhost:3005/api/health/db](http://localhost:3005/api/health/db) |
| **MySQL Quản trị DB** | DBeaver / Navicat / Workbench | Host: `127.0.0.1`<br>Port: `3308`<br>User: `app_user`<br>Pass: `AppUser@Pass2026`<br>DB: `hrm_db` |

---

## 5. Cơ chế Quản lý Dữ liệu và Cảnh báo Quan trọng

### 5.1. Cơ chế Tự động Nạp Dữ liệu Ban đầu (Init Script)
- Khi Docker Compose khởi tạo container MySQL lần đầu tiên, thư mục `./database` được mount vào `/docker-entrypoint-initdb.d` bên trong container.
- MySQL sẽ tự động chạy file `01_init_hrm_schema.sql` để tạo database `hrm_db`, 4 bảng chuẩn (`departments`, `employees`, `users`, `attendances`), cấu hình mã hóa CCCD và phân quyền người dùng.
- **Lưu ý cốt lõi:** Cơ chế này **CHỈ CHẠY 1 LẦN DUY NHẤT** khi thư mục volume dữ liệu MySQL còn trống. Khi dữ liệu đã tồn tại trong volume `mysql_data`, các lần restart sau MySQL sẽ đọc trực tiếp từ dữ liệu hiện có chứ không chạy lại file init.

### 5.2. ⚠️ CẢNH BÁO AN TOÀN DỮ LIỆU: Lệnh Dừng Container Chuẩn
Khi kết thúc phiên làm việc hoặc muốn tắt các dịch vụ, hãy sử dụng:

```bash
# Tắt bình thường, GIỮ NGUYÊN TOÀN BỘ DỮ LIỆU DATABASE:
docker compose stop
# hoặc:
docker compose down
```

> ⛔ **CẢNH BÁO NGUY HIỂM:**
> **TUYỆT ĐỐI KHÔNG CHẠY** lệnh: `docker compose down -v`
> - Cờ `-v` (volumes) sẽ **XÓA SẠCH** toàn bộ dữ liệu nhân viên, chấm công và tài khoản đã tạo trong cơ sở dữ liệu!
> - Chỉ dùng lệnh này khi bạn thực sự muốn reset lại toàn bộ hệ thống từ đầu và chấp nhận mất trắng dữ liệu thử nghiệm.

---

## 6. Các Lệnh Thao tác Thường dùng trong Nhóm

### Xem nhật ký chạy (Logs)
```bash
# Xem log toàn bộ hệ thống
docker compose logs -f

# Xem log riêng Backend
docker compose logs -f backend

# Xem log riêng Database
docker compose logs -f db

# Xem log riêng Frontend Nginx
docker compose logs -f frontend
```

### Rebuild lại khi sửa đổi code
```bash
# Khi bạn sửa code Backend và muốn áp dụng vào Docker:
docker compose up -d --build backend

# Khi bạn sửa code Frontend và muốn compile lại:
docker compose up -d --build frontend
```

### Thực thi lệnh bên trong container
```bash
# Truy cập shell của container Backend
docker compose exec backend sh

# Đăng nhập trực tiếp vào MySQL client bằng tài khoản root
docker compose exec -it db mysql -u root -pRootPassword@2026 hrm_db
```

---

## 7. Xử lý Sự cố Thường gặp (Troubleshooting)

### 7.1. Lỗi cổng bị chiếm dụng (`bind: address already in use`)
- **Hiện tượng**: Báo lỗi cổng `3005`, `3308` hoặc `5173` đã có ứng dụng khác sử dụng.
- **Cách xử lý**: Mở tệp `.env` tại thư mục gốc, đổi cổng tương ứng sang số khác (ví dụ: `PORT=3006`, `DB_PORT=3309`, `FRONTEND_PORT=5174`), sau đó chạy lại `docker compose up -d`.

### 7.2. Lỗi Backend không kết nối được Database (`ECONNREFUSED db:3306`)
- **Hiện tượng**: Backend log báo lỗi không kết nối được database khi vừa khởi động.
- **Nguyên nhân & Khắc phục**:
  1. MySQL cần 10-15 giây để khởi tạo hoàn tất. Cấu hình `depends_on: condition: service_healthy` đã được thiết lập để tự động chờ.
  2. Nếu bạn chạy backend trực tiếp bằng lệnh `npm run dev` ở ngoài máy Host (không qua Docker), hãy đổi biến `DB_HOST=localhost` và `DB_PORT=3308` trong file `.env` (vì máy host không nhận diện được hostname `db`).

### 7.3. Lỗi Frontend F5 bị lỗi 404
- **Hiện tượng**: Khi vào `http://localhost:5173/employees` và bấm F5 thì Nginx báo 404 Not Found.
- **Khắc phục**: Đảm bảo tệp `frontend/nginx.conf` có dòng `try_files $uri $uri/ /index.html;`. Dockerfile đã tự động chép file cấu hình này vào image khi build.

### 7.4. Ổ cứng bị đầy do Docker lưu cache nhiều
- **Cách xử lý**: Dọn dẹp các image/container không dùng đến:
  ```bash
  docker system prune -f
  ```

---
*Tài liệu này được biên soạn bởi DevOps / Technical Lead nhằm bảo đảm môi trường phát triển thống nhất và ổn định cho toàn bộ thành viên dự án HRM ICTU.*
