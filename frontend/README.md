# 🖥️ HRM FRONTEND — SINGLE PAGE APPLICATION (SPA)

> **Học phần:** Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM K23)  
> **Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM - ICTU)  
> **Công nghệ:** HTML5 | CSS3 | Vanilla JavaScript ES Modules | Vite  
> **Kiến trúc:** Single Page Application (SPA) với HTML5 History API Router  
> **Nhánh Git:** `feature/frontend-spa-base`

---

## 📁 1. CẤU TRÚC THƯ MỤC SOURCE CODE

```text
frontend/
├── index.html                # File HTML gốc duy nhất chứa #app
├── package.json              # Khai báo script và devDependencies (Vite)
├── package-lock.json         # Khóa chính xác phiên bản thư viện
├── vite.config.js            # Cấu hình Vite dev server (Port 5173, proxy /api)
├── .env.example              # Mẫu biến môi trường kết nối Backend
├── .env                      # Cấu hình môi trường local (VITE_API_BASE_URL)
├── README.md                 # Tài liệu hướng dẫn phát triển Frontend
│
└── src/
    ├── main.js               # Entrypoint nạp toàn bộ CSS và khởi động app
    ├── app.js                # Khởi tạo Router và bộ lắng nghe sự kiện
    │
    ├── router/               # 🚦 HỆ THỐNG SPA ROUTER
    │   ├── routes.js         # Khai báo danh sách route, layout, tiêu đề và component
    │   └── router.js         # Engine điều hướng History API, navigateTo, popstate
    │
    ├── layouts/              # 📐 KHUNG BỐ CỤC GIAO DIỆN
    │   ├── AppLayout.js      # Layout quản trị (Sidebar + Header + Breadcrumb + Content)
    │   └── AuthLayout.js     # Layout toàn màn hình tối giản cho trang Đăng nhập
    │
    ├── components/           # 🧩 THÀNH PHẦN GIAO DIỆN DÙNG CHUNG
    │   ├── Sidebar.js        # Thanh điều hướng trái, icon SVG, thu gọn, active link
    │   ├── Header.js         # Header sticky, tìm kiếm, chuông thông báo, menu avatar
    │   ├── Breadcrumb.js     # Thanh đường dẫn breadcrumb động theo route
    │   ├── PageHeader.js     # Tiêu đề trang, mô tả và nút thao tác
    │   ├── Loading.js        # Spinner xoay trạng thái tải
    │   └── Toast.js          # Thông báo popup nổi (info, success, warning, error)
    │
    ├── pages/                # 📄 CÁC MÀN HÌNH CHỨC NĂNG (PAGES)
    │   ├── DashboardPage.js  # Tổng quan: Thẻ KPI, nhật ký gần đây, kiểm tra live MySQL
    │   ├── DepartmentsPage.js# Quản lý phòng ban: Tìm kiếm, lọc và bảng dữ liệu mẫu
    │   ├── EmployeesPage.js  # Quản lý nhân viên: Lọc phòng ban, CCCD che mờ an toàn
    │   ├── AttendancesPage.js# Quản lý chấm công: Check-in/out, trạng thái OnTime/Late
    │   ├── UsersPage.js      # Quản lý tài khoản: Danh sách user và phân quyền RBAC
    │   ├── LoginPage.js      # Đăng nhập: Form validation, ẩn/hiện mật khẩu, gợi ý demo
    │   └── NotFoundPage.js   # Báo lỗi 404 thân thiện, nút quay về trang chủ
    │
    ├── services/             # 🌐 GIAO TIẾP BACKEND API
    │   └── api.js            # Fetch wrapper: GET, POST, PUT, DELETE, health check
    │
    ├── styles/               # 🎨 HỆ THỐNG DESIGN SYSTEM CSS
    │   ├── variables.css     # CSS Variables: Màu sắc, font chữ, spacing, radius, shadow
    │   ├── reset.css         # Modern CSS reset chuẩn
    │   ├── layout.css        # Bố cục App Shell, sidebar responsive, mobile drawer
    │   ├── components.css    # Nút, thẻ card, bảng data-table, badge, dropdown, toast
    │   └── pages.css         # Định kiểu riêng cho Dashboard KPI, Login card, 404
    │
    └── utils/                # 🛠️ TIỆN ÍCH DÙNG CHUNG
        └── dom.js            # Thao tác DOM an toàn và hàm sanitizeHTML chống XSS
```

---

## 🚀 2. HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY DỰ ÁN

### Yêu cầu:
- Node.js $\ge$ 18.0 (Khuyến nghị Node.js v20 hoặc v22).

### Các bước khởi chạy:
1. Di chuyển vào thư mục frontend:
   ```powershell
   cd frontend
   ```
2. Cài đặt thư viện:
   ```powershell
   npm install
   ```
3. Khởi động Development Server (Hot Module Replacement):
   ```powershell
   npm run dev
   ```
4. Truy cập giao diện trên trình duyệt tại địa chỉ:
   👉 **`http://localhost:5173`**

### Kiểm tra build đóng gói sản phẩm:
```powershell
npm run build
```

---

## 🧭 3. CƠ CHẾ SPA ROUTER (HTML5 HISTORY API)

Router được xây dựng hoàn toàn bằng JavaScript thuần không phụ thuộc thư viện ngoài:
- **Điều hướng mượt mà không tải lại trang:** Sử dụng `window.history.pushState(null, null, path)` kết hợp bắt sự kiện `popstate` để hỗ trợ đầy đủ các nút Back/Forward của trình duyệt.
- **Link Interceptor:** Mọi thẻ `<a href="..." data-link>` đều tự động được chuyển hướng nội bộ.
- **Hàm điều hướng dùng chung:** Bất kỳ component nào cũng có thể gọi `navigateTo('/employees')` để chuyển trang an toàn.

| Đường dẫn (URL) | Màn hình | Layout áp dụng | Tiêu đề trang |
| :--- | :--- | :---: | :--- |
| `/` | Tự động chuyển hướng | - | - |
| `/dashboard` | Tổng quan hệ thống | `AppLayout` | Tổng quan - HRM ICTU |
| `/departments` | Quản lý phòng ban | `AppLayout` | Quản lý phòng ban - HRM ICTU |
| `/employees` | Quản lý nhân viên | `AppLayout` | Quản lý nhân viên - HRM ICTU |
| `/attendances` | Quản lý chấm công | `AppLayout` | Quản lý chấm công - HRM ICTU |
| `/users` | Quản lý tài khoản | `AppLayout` | Quản lý tài khoản - HRM ICTU |
| `/login` | Đăng nhập hệ thống | `AuthLayout` | Đăng nhập - HRM ICTU |
| `*` (khác) | Báo lỗi 404 | `AppLayout` | 404 - Không tìm thấy trang |

---

## 🎨 4. PHÂN BIỆT APPLAYOUT & AUTHLAYOUT

1. **`AppLayout` (Layout quản trị):**
   - Áp dụng cho: `Dashboard`, `Departments`, `Employees`, `Attendances`, `Users`.
   - Cấu trúc:
     - **Sidebar:** Cố định bên trái, tông màu Dark Navy Slate (`#0f172a`), icon SVG sắc nét (không dùng emoji), có nút thu gọn/mở rộng, hỗ trợ mobile drawer kéo mở trên màn hình nhỏ.
     - **Header:** Cố định phía trên, ô tìm kiếm nhanh, nút chuông thông báo, menu avatar tài khoản kèm dropdown.
     - **Main Content:** Vùng nội dung có thanh Breadcrumb động và tiêu đề trang.
2. **`AuthLayout` (Layout đăng nhập):**
   - Áp dụng cho: `Login`.
   - Cấu trúc toàn màn hình tối giản với nền gradient sâu, tập trung vào form đăng nhập, không có Sidebar hay Header quản trị.

---

## 🌐 5. SẴN SÀNG TÍCH HỢP BACKEND EXPRESS API

Tệp [`src/services/api.js`](file:///d:/QLNS_QLTKPM/frontend/src/services/api.js) đã sẵn sàng tích hợp:
- Tự động đọc biến môi trường `VITE_API_BASE_URL` (Mặc định `http://localhost:3005/api`).
- File `vite.config.js` đã cấu hình proxy ngầm: Mọi request gửi tới `/api/*` sẽ tự động chuyển tiếp tới Backend cổng `3005`.
- **Minh chứng tích hợp thật trên Dashboard:** Trang Dashboard có một thẻ thẻ *"Sức khỏe Hạ tầng Docker"* tự động gọi trực tiếp endpoint `GET /api/health/db` để hiển thị trạng thái kết nối live của CSDL MySQL 8.0!
