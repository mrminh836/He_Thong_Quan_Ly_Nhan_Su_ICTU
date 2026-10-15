# 🏢 HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### DỰ ÁN BÀI TẬP LỚN / ĐỒ ÁN MÔN HỌC: TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM (K23)
**Khoa Công nghệ Thông tin — Trường Đại học Công nghệ Thông tin & Truyền thông (ICTU)**

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-5%20Services-blue?logo=docker)](file:///d:/QLNS_QLTKPM/compose.yaml)
[![Node.js](https://img.shields.io/badge/Node.js-v22%20LTS-green?logo=node.js)](file:///d:/QLNS_QLTKPM/backend/package.json)
[![Nginx HTTPS](https://img.shields.io/badge/Nginx-Reverse%20Proxy%20HTTPS-brightgreen?logo=nginx)](file:///d:/QLNS_QLTKPM/nginx/conf.d/hrm.conf)
[![MySQL 8.0](https://img.shields.io/badge/MySQL-8.0%20Secured-orange?logo=mysql)](file:///d:/QLNS_QLTKPM/database/init.sql)
[![Tests Passing](https://img.shields.io/badge/Tests-252%2F252%20Passing%20(100%25)-success)](file:///d:/QLNS_QLTKPM/backend/tests)
[![Commit Milestone](https://img.shields.io/badge/GitHub%20Milestone-Commit%201%20Completed-blueviolet)](file:///d:/QLNS_QLTKPM/docs/SPRINT_1_BACKLOG.md)

---

## 📌 1. TỔNG QUAN HỆ THỐNG

Hệ thống Quản lý Nhân sự (**HRM - Human Resource Management**) là nền tảng quản trị nguồn nhân lực doanh nghiệp được thiết kế theo kiến trúc **Monorepo** hiện đại, kết hợp chặt chẽ giữa **Frontend Single Page Application (SPA)**, **Backend RESTful API**, **MySQL 8.0**, công cụ quản trị **phpMyAdmin** và cổng giao tiếp bảo mật **Nginx Reverse Proxy HTTPS**.

Hệ thống đáp ứng trọn vẹn các yêu cầu chuẩn hóa trong học phần **Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM)**, đạt mốc **Commit 1** (Sprint 1) bao gồm các tiêu chí:
1. **Container hóa Docker Compose:** Điều phối 5 container độc lập trong cùng Docker Network.
2. **Cơ sở dữ liệu an toàn:** Phân quyền Least Privilege (`app_user`, `report_user`), bật `general_log = 1`, kích hoạt chính sách mật khẩu mức `MEDIUM`.
3. **Bảo mật dữ liệu định danh:** Mã hóa số Căn cước công dân (CCCD) bằng thuật toán chuẩn `AES-256` của MySQL và kiểm tra tính duy nhất bằng `HMAC-SHA-256`.
4. **Nginx Reverse Proxy HTTPS:** Lắng nghe cổng 80 (tự động chuyển hướng 301 sang HTTPS) và cổng 443 với chứng chỉ số X.509 RSA 2048-bit cho domain nội bộ `hrm.local`.
5. **Bộ Security Headers chuẩn OWASP / DevSecOps:** Chống Clickjacking (`X-Frame-Options: SAMEORIGIN`), chống MIME sniffing (`X-Content-Type-Options: nosniff`), `Referrer-Policy`, `Permissions-Policy`, và `Content-Security-Policy`.

---

## 🏗️ 2. KIẾN TRÚC ĐIỀU PHỐI CONTAINER (DOCKER COMPOSE)

Hệ thống được đóng gói và vận hành qua tệp [compose.yaml](file:///d:/QLNS_QLTKPM/compose.yaml) với 5 container dịch vụ:

```mermaid
graph TD
    User["🌐 Client / Trình duyệt (hrm.local)"]
    
    subgraph Gateway ["Cổng Reverse Proxy Nginx (hrm-nginx)"]
        HTTP["Port 80 (HTTP) -> 301 Redirect"]
        HTTPS["Port 443 (HTTPS) - X.509 SSL & Security Headers"]
    end
    
    subgraph DockerNet ["Docker Network (hrm-network)"]
        FE["hrm-ictu-frontend (hrm-app)<br/>Port nội bộ: 80 (Host 5173)"]
        BE["hrm-ictu-backend<br/>Port nội bộ: 3005 (Host 3005)"]
        PMA["phpmyadmin<br/>Port nội bộ: 80 (Host 8080)"]
        DB["mysql-db (MySQL 8.0)<br/>Port nội bộ: 3306 (Host 3308)<br/>general_log=1 | password_policy=MEDIUM"]
        VOL[("Named Volume<br/>hrm_ictu_mysql_data")]
    end
    
    User -->|HTTP :80| HTTP
    HTTP -.->|301 Redirect| HTTPS
    User -->|HTTPS :443| HTTPS
    
    HTTPS -->|Proxy /| FE
    HTTPS -->|Proxy /api/| BE
    HTTPS -->|Proxy /phpmyadmin/| PMA
    
    FE -->|API fetch| BE
    BE -->|app_user: DML| DB
    PMA -->|SQL Connection| DB
    DB --- VOL
```

### Bảng phân bổ cổng dịch vụ (Port Mapping)

| Dịch vụ | Tên Container | Cổng Host | Cổng Container | Giao thức / Mục đích |
| :--- | :--- | :---: | :---: | :--- |
| **Nginx HTTPS Gateway** | `hrm-nginx` | **`80` / `443`** | `80` / `443` | Cổng vào duy nhất: Tự động chuyển hướng HTTP $\rightarrow$ HTTPS, phục vụ SSL và Security Headers |
| **Frontend Web SPA** | `hrm-ictu-frontend` | `5173` | `80` | Giao diện quản lý nhân sự SPA Nginx (alias nội bộ `hrm-app`) |
| **Backend API Service** | `hrm-ictu-backend` | `3005` | `3005` | RESTful API Node.js Express, xác thực JWT, mã hóa AES-256 |
| **phpMyAdmin** | `phpmyadmin` | `8080` | `80` | Công cụ quản trị CSDL MySQL trực quan |
| **MySQL Database** | `mysql-db` | `3308` | `3306` | CSDL MySQL 8.0 lưu trữ bền vững trên Named Volume `mysql_data` |

---

## 🔑 3. TÀI KHOẢN MẪU & ĐĂNG NHẬP HỆ THỐNG

### 3.1. Tài khoản Người dùng Ứng dụng (RBAC)
Đăng nhập tại: **`https://hrm.local`** (hoặc `http://localhost:5173` khi test dev)

| Tên đăng nhập | Mật khẩu | Vai trò (Role) | Thẩm quyền & Phạm vi truy cập |
| :--- | :--- | :---: | :--- |
| **`admin`** | **`Admin@123`** | **Admin** | **Toàn quyền:** Quản lý cơ cấu phòng ban, thêm/sửa nhân viên, giải mã số CCCD, xem bảng chấm công toàn công ty & chỉ số KPI tổng thể. |
| **`hr`** | **`Hr@123`** | **HR** | **Quản lý Nhân sự:** Quản lý danh sách nhân sự, phòng ban, giải mã số CCCD, theo dõi chấm công toàn công ty. |
| **`emp1`** | **`Emp@123`** | **Employee** | **Nhân viên:** Giao diện Tổng quan cá nhân hóa (Widget Chấm công thời gian thực, Thẻ Số ngày công tích lũy, Thẻ Hồ sơ cá nhân; tự động ẩn toàn bộ chỉ số công ty). |

### 3.2. Tài khoản Cơ sở dữ liệu & phpMyAdmin
Đăng nhập tại: **`https://hrm.local/phpmyadmin/`** (Server: `mysql-db`)

| Tài khoản | Mật khẩu | Quyền hạn (Privileges) | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| **`root`** | `RootPassword@2026` | `ALL PRIVILEGES` | Quản trị tối cao CSDL, cấu hình server |
| **`app_user`** | `AppUser@Pass2026` | `SELECT, INSERT, UPDATE, DELETE` trên `hrm_db` | Tài khoản Runtime dành riêng cho Backend Express API (Least Privilege, không có quyền phá hủy DDL) |
| **`report_user`** | `ReportUser@Pass2026` | `SELECT` trên `hrm_db`.* | Tài khoản chỉ đọc (Read-only) phục vụ trích xuất báo cáo, phân tích số liệu |

---

## 🛡️ 4. BẢO MẬT HỆ THỐNG (DEVSECOPS STANDARDS)

### A. Mã hóa số Căn cước công dân (CCCD) bằng AES-256 (Lab 6)
- **Mã hóa khi lưu:** Số CCCD được mã hóa bằng hàm MySQL `AES_ENCRYPT(?, @AES_KEY)` lưu vào cột nhị phân `ssn_encrypted VARBINARY(255)`.
- **Chống trùng lặp an toàn:** Sử dụng mã băm `HMAC-SHA-256` lưu tại cột `ssn_hash VARCHAR(64)` có chỉ mục `UNIQUE`, cho phép kiểm tra trùng lặp tức thì mà **không cần giải mã toàn bộ bảng**.
- **Che mờ hiển thị:** Cột `ssn_masked VARCHAR(20)` lưu định dạng an toàn (ví dụ: `0382******34`) phục vụ hiển thị công khai.
- **Giải mã có thẩm quyền:** Chỉ người dùng có vai trò `Admin` hoặc `HR` mới được giải mã CCCD qua API `GET /api/employees/:id` bằng hàm MySQL `AES_DECRYPT()`. Danh sách nhân sự (`GET /api/employees`) tuyệt đối **không trả về số CCCD rõ hay ciphertext**.

### B. Chứng chỉ số X.509 SSL & Cấu hình Nginx HTTPS
- Chứng chỉ tự ký định dạng **X.509 RSA 2048-bit**, thuật toán băm `SHA-256`, thời hạn 365 ngày.
- Bổ sung trường mở rộng **Subject Alternative Name (SAN)**: `DNS:hrm.local, DNS:localhost, IP:127.0.0.1`.
- Cấu hình Nginx hỗ trợ giao thức bảo mật cao `TLSv1.2` và `TLSv1.3`.

### C. Bộ Security Headers chuẩn OWASP (Lab 1 & Lab 5)
Hệ thống Nginx được cấu hình snippet [nginx/conf.d/security_headers.inc](file:///d:/QLNS_QLTKPM/nginx/conf.d/security_headers.inc):
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header X-Permitted-Cross-Domain-Policies "none" always;
```
- **X-Frame-Options: SAMEORIGIN**: Chống tấn công Clickjacking / UI Redressing.
- **X-Content-Type-Options: nosniff**: Chống tấn công MIME sniffing.
- **proxy_hide_header**: Ẩn header `X-Powered-By` (Express, PHP) nhằm chống rò rỉ phiên bản phần mềm máy chủ; loại bỏ header trùng lặp từ upstream.
- **Content-Security-Policy (CSP)**: Thiết lập an toàn cho Frontend SPA, cho phép nạp tài nguyên hợp lệ và Google Fonts.

---

## 🚀 5. HƯỚNG DẪN CÀI ĐẶT VÀ VẬN HÀNH

### 5.1. Yêu cầu môi trường
- **Docker Desktop** (hỗ trợ Docker Compose v2).
- **Git** client.
- **Node.js** >= 18.x (nếu muốn chạy bộ test tại máy host).

### 5.2. Cấu hình phân giải Domain nội bộ (`hrm.local`)
Để truy cập được tên miền `https://hrm.local` trên trình duyệt máy bạn:

**Trên Windows:**
1. Mở Notepad bằng quyền Administrator (Run as Administrator).
2. Mở file: `C:\Windows\System32\drivers\etc\hosts`.
3. Thêm dòng sau vào cuối file và lưu lại:
   ```text
   127.0.0.1 hrm.local
   ```

**Trên Linux / macOS:**
```bash
sudo echo "127.0.0.1 hrm.local" >> /etc/hosts
```

### 5.3. Khởi chạy toàn bộ hệ thống bằng Docker Compose

```powershell
# 1. Sao chép file cấu hình biến môi trường
copy .env.example .env

# 2. Khởi chạy và build toàn bộ 5 dịch vụ container
docker compose up -d --build

# 3. Kiểm tra trạng thái các container
docker compose ps
```

*Kỳ vọng đầu ra:*
```text
NAME                IMAGE                   STATUS                  PORTS
hrm-nginx           nginx:alpine            Up (healthy)            0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
hrm-ictu-frontend   qlns_qltkpm-frontend    Up (healthy)            0.0.0.0:5173->80/tcp
hrm-ictu-backend    qlns_qltkpm-backend     Up (healthy)            0.0.0.0:3005->3005/tcp
phpmyadmin          phpmyadmin:5.2.1        Up (healthy)            0.0.0.0:8080->80/tcp
mysql-db            mysql:8.0               Up (healthy)            0.0.0.0:3308->3306/tcp
```

### 5.4. Dừng hệ thống an toàn (Bảo toàn dữ liệu)
```powershell
# Dừng container an toàn (dữ liệu MySQL vẫn nguyên vẹn)
docker compose down

# ⚠️ CẢNH BÁO: TUYỆT ĐỐI KHÔNG dùng 'docker compose down -v' vì sẽ xóa sạch volume dữ liệu!
```

---

## 🧪 6. KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST SUITES)

Dự án sở hữu bộ kiểm thử tự động toàn diện với **252 bài kiểm thử (100% PASS)**:

```powershell
# 1. Chạy bộ kiểm thử tích hợp đầu cuối E2E qua HTTPS (32 kịch bản)
cd backend
npm run test:e2e:https

# 2. Chạy toàn bộ Unit & Security Test Suites của Backend (119 bài kiểm thử)
npm test

# 3. Chạy toàn bộ Test Suites của Frontend SPA (101 bài kiểm thử)
cd ../frontend
npm test
```

### Chi tiết các bộ test:
1. **E2E HTTPS Integration Test (`npm run test:e2e:https` - 32 tests):**
   - Xác thực bắt tay TLS, kiểm tra X.509 cert, kiểm tra 6 Security Headers và CSP.
   - Luồng Đăng nhập, giải mã JWT, phân quyền 3 vai trò Admin / HR / Employee.
   - Luồng CRUD Nhân sự, mã hóa AES-256 CCCD, bắt lỗi trùng mã NV (409) và trùng CCCD (409).
   - Luồng Chấm công: Check-in, Check-out, chống chấm công trùng lặp trong ngày (409).
   - Kiểm toán bảo mật dữ liệu (Data Privacy Audit): Không lộ CCCD trong bảng danh sách.
2. **Backend Test Suite (`npm test` - 119 tests):**
   - `test:auth`: Kiểm thử Bcrypt băm mật khẩu, đăng nhập, JWT expiry & signature (12 tests).
   - `test:rbac`: Kiểm thử Middleware phân quyền truy cập và bảo vệ dữ liệu (15 tests).
   - `test:department`: Kiểm thử CRUD phòng ban và ràng buộc xóa (16 tests).
   - `test:employee`: Kiểm thử thêm mới, phân trang, giải mã CCCD AES-256 (38 tests).
   - `test:attendance`: Kiểm thử mốc biên thời gian 08:30:00, OnTime/Late, Today board (26 tests).
   - `test:db`: Kiểm thử Schema, Least Privilege của `app_user` & `report_user`, Lab 6 `general_log` và Password Policy `MEDIUM` (12 tests).
3. **Frontend Test Suite (`npm test` - 101 tests):**
   - Kiểm thử UI Dashboard cá nhân hóa cho Employee (ẩn chỉ số công ty).
   - Kiểm thử Widget Chấm công thời gian thực và Bảng chấm công hôm nay.
   - Kiểm thử Modal thêm nhân viên và Modal chi tiết giải mã CCCD.
   - Kiểm thử Navigation Sidebar theo vai trò RBAC.

---

## 🏁 7. RÀ SOÁT TIÊU CHÍ DEFINITION OF DONE (COMMIT 1)

Theo [docs/SPRINT_1_BACKLOG.md](file:///d:/QLNS_QLTKPM/docs/SPRINT_1_BACKLOG.md), toàn bộ 8 tiêu chí nghiệm thu của Sprint 1 đã hoàn thành xuất sắc:

- [x] **DoD 1:** Lệnh `docker compose up -d` khởi động thành công cả 5 container: `mysql-db`, `hrm-ictu-backend`, `hrm-ictu-frontend`, `phpmyadmin`, `hrm-nginx`.
- [x] **DoD 2:** Container `mysql-db` đạt trạng thái `(healthy)`.
- [x] **DoD 3:** Truy cập `http://hrm.local` tự động chuyển hướng 301 sang `https://hrm.local` với biểu tượng ổ khóa SSL tự ký và bộ Security Headers chuẩn DevSecOps.
- [x] **DoD 4:** Đăng nhập thành công với 3 tài khoản mẫu: `admin`, `hr`, `emp1`.
- [x] **DoD 5:** Thêm mới nhân viên, số CCCD được mã hóa bằng MySQL `AES_ENCRYPT` (trong CSDL là `ssn_encrypted`), tính duy nhất bảo vệ bằng `ssn_hash` (HMAC-SHA-256), giải mã chuẩn xác 100% khi có thẩm quyền.
- [x] **DoD 6:** Thực hiện Check-in / Check-out và xem bảng chấm công thời gian thực theo phân quyền RBAC.
- [x] **DoD 7:** Truy cập thành công trang quản trị CSDL phpMyAdmin tại đường dẫn `https://hrm.local/phpmyadmin/`.
- [x] **DoD 8:** Hoàn tất **Commit số 1** lên GitHub với commit message chuẩn mực:  
  `feat(core): deploy hrm application, mysql 8.0, phpmyadmin and nginx reverse proxy with https and security headers`

---

## 👥 8. THÀNH VIÊN DỰ ÁN

- **Nhóm sinh viên K23** — Học phần Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM).
- **Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM).
- **Khoa Công nghệ Thông tin — Trường Đại học Công nghệ Thông tin & Truyền thông (ICTU).**

---
*Bản quyền tài liệu thuộc về Nhóm Phát triển Đề tài 10 (HRM - ICTU) | Tháng 10/2026.*
