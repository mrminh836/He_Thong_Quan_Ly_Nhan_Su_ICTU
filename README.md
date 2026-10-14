# 🏢 HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### DỰ ÁN BÀI TẬP LỚN / ĐỒ ÁN MÔN HỌC: TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM (K23)
**Khoa Công nghệ Thông tin — Trường Đại học Công nghệ Thông tin & Truyền thông (ICTU)**

---

## 📌 1. TỔNG QUAN DỰ ÁN

Hệ thống Quản lý Nhân sự (**HRM - Human Resource Management**) là giải pháp phần mềm cấp doanh nghiệp được thiết kế theo kiến trúc **Monorepo** hiện đại, kết hợp chặt chẽ giữa **Frontend Single Page Application (SPA)**, **Backend RESTful API** và **Cơ sở dữ liệu quan hệ MySQL 8.0**.

### Các thực thể nghiệp vụ cốt lõi:
- 🏛️ **Departments**: Quản lý phòng ban, cơ cấu tổ chức và ngân sách.
- 👨‍💼 **Employees**: Quản lý hồ sơ nhân viên, mã nhân viên, chức vụ, mức lương và thông tin Căn cước công dân (mã hóa an toàn bằng chuẩn **AES-256**).
- 📅 **Attendances**: Quản lý chấm công, giờ vào/ra, tính toán thời gian làm việc thực tế và trạng thái điểm danh.
- 👤 **Users**: Quản lý tài khoản người dùng, phân quyền truy cập (Admin, HR Manager, Employee) và xác thực qua **JSON Web Token (JWT)**.

---

## 📁 2. CẤU TRÚC THƯ MỤC DỰ ÁN (MONOREPO)

```text
QLNS_QLTKPM/
├── .github/                             # Cấu hình GitHub Workflows & Templates
│   ├── workflows/
│   │   └── ci.yml                       # Pipeline CI tự động kiểm tra cú pháp, build & config
│   └── pull_request_template.md         # Mẫu Pull Request chuẩn mực cho cả nhóm
│
├── compose.yaml                         # Cấu hình Docker Compose hợp nhất (db + backend + frontend)
├── .env.example                         # Mẫu biến môi trường dùng chung toàn hệ thống
├── .gitignore                           # Quy tắc loại trừ tệp rác và bảo vệ bí mật
├── README.md                            # Tài liệu tổng quan và hướng dẫn dự án
│
├── backend/                             # 🟢 DỊCH VỤ BACKEND RESTful API (Express ES Modules)
│   ├── .dockerignore                    # Danh sách loại trừ khi build Docker Backend
│   ├── Dockerfile                       # Dockerfile Node 22-alpine, non-root user 'node'
│   ├── package.json                     # Quản lý thư viện: express, mysql2, dotenv, cors
│   ├── package-lock.json                # Khóa phiên bản thư viện
│   └── src/
│       ├── config/                      # Kết nối MySQL Pool, biến môi trường tập trung
│       ├── controllers/                 # Bộ điều khiển xử lý nghiệp vụ (Health, API)
│       ├── middlewares/                 # Logger, ErrorHandler, 404 Handler
│       ├── routes/                      # Định tuyến API (/api/health, /api/health/db)
│       ├── utils/                       # Response chuẩn hóa, mã hóa
│       ├── app.js                       # Cấu hình Express App & Middlewares
│       └── server.js                    # Khởi chạy HTTP Server & Graceful Shutdown
│
├── frontend/                            # 🔵 DỊCH VỤ FRONTEND SPA (Vanilla JS + Vite + Nginx)
│   ├── .dockerignore                    # Danh sách loại trừ khi build Docker Frontend
│   ├── Dockerfile                       # Multi-stage Dockerfile (Node builder -> Nginx Alpine)
│   ├── nginx.conf                       # Cấu hình Nginx Web Server, SPA fallback & Reverse Proxy
│   ├── package.json                     # Cấu hình Vite & dependencies
│   ├── package-lock.json                # Khóa phiên bản thư viện Frontend
│   ├── vite.config.js                   # Cấu hình Vite bundler & dev server
│   ├── index.html                       # HTML gốc của ứng dụng SPA
│   └── src/                             # Mã nguồn giao diện SPA (Router, Views, Styles)
│
├── database/                            # 🗄️ CƠ SỞ DỮ LIỆU MYSQL 8.0 & KỊCH BẢN KHỞI TẠO
│   ├── schema.sql                       # DDL chuẩn 4 bảng, Index, AES-256, User permissions
│   ├── init.sql                         # Kịch bản DDL sao lưu bổ trợ
│   └── migrations/                      # Kịch bản migration & rollback cơ sở dữ liệu
│
└── docs/                                # 📚 BỘ TÀI LIỆU KỸ THUẬT & QUẢN TRỊ DỰ ÁN
    ├── DEFINITION_OF_DONE.md            # Tiêu chí hoàn thành công việc (DoD) chuẩn mực
    ├── GIT_WORKFLOW.md                  # Quy trình Git Flow, Branching, PR và Conventional Commits
    ├── DOCKER_SETUP.md                  # Hướng dẫn chi tiết vận hành Docker Compose & xử lý lỗi
    ├── ERD_DATABASE_DESIGN.md           # Thiết kế ERD, từ điển dữ liệu và chuẩn 3NF
    ├── PRODUCT_BACKLOG.md               # Product Backlog & phân rã User Stories
    ├── SPRINT_1_BACKLOG.md              # Kế hoạch chi tiết Sprint 1
    ├── API_DEPARTMENTS_GUIDE.md         # Đặc tả REST API & Migration Quản lý Phòng ban
    ├── QA_TEST_CASES_AND_BUG_MANAGEMENT.md # 20 Test Cases chuẩn & Bảng quản lý 8 Bugs
    └── HRM_TestCases_BugTracking.xlsx   # Sổ tay bảng tính Excel quản lý chất lượng
```

---

## 🛠️ 3. KIẾN TRÚC VÀ CỔNG DỊCH VỤ (PORT MAPPING)

Để tránh xung đột với các phần mềm cài đặt sẵn trên máy tính thành viên (như MySQL cổng 3306 hoặc backend cổng 3000), hệ thống được quy hoạch cổng phân tách rõ ràng:

| Dịch vụ | Tên Service trong Docker | Cổng Host | Cổng Container | Mục đích sử dụng |
| :--- | :--- | :---: | :---: | :--- |
| **Frontend Web App** | `frontend` | **`5173`** | `80` | Giao diện quản lý nhân sự SPA Nginx |
| **Backend API** | `backend` | **`3005`** | `3005` | RESTful API server Express |
| **MySQL Database** | `db` | **`3308`** | `3306` | Kết nối CSDL từ DBeaver / Navicat / Workbench |

> **Lưu ý mạng nội bộ Docker:** Trong mạng `hrm-network`, các container gọi nhau qua hostname dịch vụ (ví dụ: Backend kết nối database qua `db:3306`, Frontend Nginx proxy `/api/` sang `http://backend:3005/api/`).

---

## 🚀 4. HƯỚNG DẪN KHỞI CHẠY BẰNG DOCKER COMPOSE

Chi tiết xem tại tài liệu: [DOCKER_SETUP.md](file:///d:/QLNS_QLTKPM/docs/DOCKER_SETUP.md)

### 4.1. Chuẩn bị môi trường
```powershell
# Sao chép tệp biến môi trường mẫu
copy .env.example .env
```

### 4.2. Kiểm tra tính hợp lệ của cấu hình Compose
```powershell
docker compose config
```

### 4.3. Build và khởi chạy toàn bộ 3 dịch vụ
```powershell
docker compose up -d --build
```

### 4.4. Kiểm tra trạng thái hoạt động
```powershell
docker compose ps
```

### 4.5. Các đường dẫn truy cập kiểm thử
- **Frontend SPA**: [http://localhost:5173](http://localhost:5173)
- **Backend Healthcheck**: [http://localhost:3005/api/health](http://localhost:3005/api/health)
- **Database Connection Health**: [http://localhost:3005/api/health/db](http://localhost:3005/api/health/db)

> ⚠️ **LƯU Ý QUAN TRỌNG VỀ DỮ LIỆU:**
> Dữ liệu MySQL được lưu trữ an toàn trên Named Volume `mysql_data`.
> - Để dừng ứng dụng: dùng `docker compose stop` hoặc `docker compose down`.
> - **TUYỆT ĐỐI KHÔNG** dùng `docker compose down -v` vì sẽ xóa sạch toàn bộ dữ liệu trong volume!

---

## 🌿 5. QUY TRÌNH PHÁT TRIỂN & GIT FLOW CHO NHÓM

Chi tiết xem tại tài liệu: [GIT_WORKFLOW.md](file:///d:/QLNS_QLTKPM/docs/GIT_WORKFLOW.md)

Nhóm áp dụng mô hình **Simplified Feature Branch Flow**:
- `main`: Nhánh ổn định cao nhất, chỉ merge phiên bản hoàn chỉnh để nộp bài/demo.
- `develop`: Nhánh tích hợp trung tâm của cả nhóm.
- `feature/HRM-<task>-<mô-tả>`: Nhánh làm việc cho từng tính năng mới (tách từ `develop`).
- `bugfix/HRM-<task>-<mô-tả>`: Nhánh sửa lỗi trong quá trình kiểm thử (tách từ `develop`).

### Quy ước Commit (Conventional Commits):
```text
feat(HRM-102): add employee table view and pagination
fix(HRM-105): resolve SPA router 404 fallback on page refresh
docs: update docker compose and architecture documentation
refactor(backend): separate database connection pool logic
```

### Quy tắc Pull Request:
Mọi thay đổi đưa vào `develop` đều phải thông qua **Pull Request**, vượt qua kiểm tra **GitHub Actions CI**, điền đầy đủ mẫu [pull_request_template.md](file:///d:/QLNS_QLTKPM/.github/pull_request_template.md) và được ít nhất 01 thành viên khác review phê duyệt (Approve).

---

## ✅ 6. TIÊU CHÍ HOÀN THÀNH CÔNG VIỆC (DEFINITION OF DONE)

Chi tiết xem tại tài liệu: [DEFINITION_OF_DONE.md](file:///d:/QLNS_QLTKPM/docs/DEFINITION_OF_DONE.md)

Một công việc **chỉ được coi là DONE** khi thỏa mãn:
1. **Scope & AC**: Đáp ứng đầy đủ tiêu chí nghiệm thu, không sửa đổi ngoài phạm vi.
2. **Security**: Không hardcode mật khẩu, không commit `.env`, dữ liệu nhạy cảm được mã hóa.
3. **Clean Code**: Không rác phát sinh, không còn `console.log` thừa, xử lý ngoại lệ đầy đủ.
4. **Testing**: Kiểm thử thành công tại local, `npm run build` và `npm test` thành công.
5. **Docker**: `docker compose config` hợp lệ, container chạy ở trạng thái healthy.
6. **Review & CI**: GitHub Actions CI báo Xanh, được đồng đội Approve trên Pull Request.

---

## 🔄 7. TỰ ĐỘNG HÓA CI/CD (GITHUB ACTIONS)

Hệ thống tích hợp sẵn pipeline tự động tại [.github/workflows/ci.yml](file:///d:/QLNS_QLTKPM/.github/workflows/ci.yml):
- **Validate Compose**: Kiểm tra cú pháp Compose và tính tương thích của orchestration.
- **Backend Check**: Cài đặt phụ thuộc, kiểm tra tính toàn vẹn cú pháp các module Express.
- **Frontend Check**: Cài đặt phụ thuộc, kiểm tra quá trình build bundle Vite SPA.

Pipeline tự động chạy mỗi khi có commit đẩy lên `main`, `develop` hoặc khi mở Pull Request vào hai nhánh này.

---

## 👥 8. THÀNH VIÊN DỰ ÁN VÀ PHÂN CÔNG TRÁCH NHIỆM

- **Nhóm sinh viên K23** — Học phần Triển khai và Quản trị Hệ thống Phần mềm.
- **Trưởng nhóm / Technical Lead**: Quản trị repository, phê duyệt PR chính, kiểm soát kiến trúc và bảo vệ nhánh.
- **Frontend Engineers**: Phát triển các module SPA (Dashboard, Departments, Employees, Attendances, Users).
- **Backend Engineers**: Phát triển RESTful API, xác thực bảo mật JWT, xử lý logic nghiệp vụ.
- **Database / DevOps Engineers**: Thiết kế ERD, tối ưu hóa truy vấn SQL, cấu hình Docker Compose và CI/CD.
- **QA / Software Testers**: Xây dựng kịch bản kiểm thử, ghi nhận và kiểm chứng lỗi trên Backlog/Sheets.

---
*Bản quyền tài liệu thuộc về Nhóm Phát triển Đề tài 10 (HRM - ICTU) | Lưu hành nội bộ.*
