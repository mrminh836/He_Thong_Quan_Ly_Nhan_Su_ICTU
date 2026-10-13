# HƯỚNG DẪN TRIỂN KHAI MENU ĐIỀU HƯỚNG THEO ROLE (RBAC) TRÊN FRONTEND HRM

Tài liệu mô tả chi tiết kiến trúc, cấu hình tập trung và cơ chế kiểm soát phân quyền (Role-Based Access Control - RBAC) trên giao diện Frontend của Hệ thống Quản trị Nhân sự (HRM ICTU).

---

## 1. TỔNG QUAN VÀ NGUYÊN TẮC BẢO MẬT

Hệ thống quản lý nhân sự HRM hỗ trợ 3 vai trò người dùng chuẩn hóa:
- **`ADMIN`**: Quản trị viên hệ thống – toàn quyền truy cập cấu hình và các phân hệ.
- **`HR_MANAGER`**: Quản lý Nhân sự & Phòng ban – xem hồ sơ nhân sự công ty, cơ cấu phòng ban và chấm công.
- **`EMPLOYEE`**: Nhân viên thông thường – xem tổng quan và tra cứu dữ liệu chấm công cá nhân.

### ⚠️ Nguyên tắc bảo mật cốt lõi:
1. **Frontend chỉ hỗ trợ UI/UX**: Việc ẩn menu trên giao diện và chặn route tại Router chỉ nhằm tối ưu trải nghiệm người dùng, hạn chế thao tác nhầm lẫn.
2. **Không thay thế Backend Security**: Mọi request dữ liệu đều phải đi qua `authenticateToken` và `requireRole` middleware tại Express API. Nếu client tự sửa đổi role trong `localStorage`, Backend vẫn từ chối trả dữ liệu (`HTTP 403 Forbidden`).
3. **Từ chối mặc định (Default Deny)**: Nếu tài khoản chưa đăng nhập, role bị rỗng hoặc chứa giá trị không hợp lệ (ví dụ bị can thiệp trái phép), toàn bộ menu đặc quyền bị ẩn và route guard sẽ chặn truy cập.

---

## 2. MA TRẬN PHÂN QUYỀN CHỨC NĂNG & MENU ĐIỀU HƯỚNG

Cấu hình tập trung tại [`frontend/src/utils/rbac.js`](file:///d:/QLNS_QLTKPM/frontend/src/utils/rbac.js):

| Mã Menu ID | Chức năng | Đường dẫn URL | ADMIN | HR_MANAGER | EMPLOYEE | Ghi chú |
|---|---|---|:---:|:---:|:---:|---|
| `nav-dashboard` | **Tổng quan** | `/dashboard` | ✅ Có | ✅ Có | ✅ Có | Bảng tin thống kê và phím tắt chung |
| `nav-departments` | **Phòng ban** | `/departments` | ✅ Có | ✅ Có | ❌ Ẩn | Quản lý cây phòng ban và định biên |
| `nav-employees` | **Nhân viên** | `/employees` | ✅ Có | ✅ Có | ❌ Ẩn | Xem toàn bộ hồ sơ NV, thêm mới NV |
| `nav-attendances` | **Chấm công** | `/attendances` | ✅ Có | ✅ Có | ✅ Có | Admin/HR xem toàn bộ; NV xem cá nhân |
| `nav-users` | **Tài khoản** | `/users` | ✅ Có | ❌ Ẩn | ❌ Ẩn | Quản trị tài khoản đăng nhập & phân quyền |

---

## 3. KIẾN TRÚC VÀ CÁC THÀNH PHẦN TRIỂN KHAI

### 3.1. Cấu hình RBAC tập trung (`src/utils/rbac.js`)
- **`ROLES`**: Khai báo hằng số `ADMIN`, `HR_MANAGER`, `EMPLOYEE`.
- **`normalizeRole(role)`**: Chuẩn hóa role từ CSDL (`'Admin'` -> `'ADMIN'`, `'HR'` -> `'HR_MANAGER'`, `'Employee'` -> `'EMPLOYEE'`). Nếu role không hợp lệ, trả về `null` (Default Deny).
- **`getRoleBadgeInfo(role)`**: Trả về nhãn hiển thị và class màu badge:
  - `ADMIN`: Nhãn *"Quản trị viên (Admin)"*, badge tím (`badge-purple`).
  - `HR_MANAGER`: Nhãn *"Quản lý Nhân sự (HR)"*, badge xanh dương (`badge-blue`).
  - `EMPLOYEE`: Nhãn *"Nhân viên (Employee)"*, badge xám (`badge-gray`).
- **`NAVIGATION_SECTIONS`**: Khai báo danh sách các mục menu theo từng Section (`TỔNG QUAN`, `QUẢN LÝ NHÂN SỰ`, `HỆ THỐNG`) kèm mảng `allowedRoles`.
- **`filterNavigationByRole(userRole)` / `getMenuByRole(userRole)`**: Lọc động danh sách menu được phép hiển thị; tự động loại bỏ các section không còn mục menu nào.
- **`hasAccessToRoute(path, userRole)`**: Kiểm tra xem vai trò hiện tại có được phép truy cập đường dẫn cụ thể không.

### 3.2. Quản lý trạng thái và đồng bộ phiên (`src/services/authService.js`)
- **`getCurrentUser()`**: Lấy thông tin user hiện tại từ `localStorage`.
- **`getCurrentRole()` / `getCurrentUserRole()`**: Lấy vai trò đã được chuẩn hóa của người dùng đăng nhập.
- **`fetchUserProfile()`**: Gọi API `GET /api/auth/profile` để đồng bộ lại thông tin và vai trò mới nhất được Backend xác thực. Nếu API trả về `401 Unauthorized` (token hết hạn), tự động kích hoạt `logout()`.
- **`logout()`**: Xóa token và user trong `localStorage`, ngăn chặn việc lưu lại trạng thái tài khoản trước đó.

### 3.3. Hiển thị Menu Sidebar động (`src/components/Sidebar.js`)
- **`renderSidebarMenu(role, currentPath)`**: Sinh mã HTML cho các mục menu dựa trên role đã lọc.
- **Huy hiệu vai trò (Role Badge)**: Hiển thị tag vai trò của người dùng ở chân Sidebar (Sidebar Footer) và các tag phụ trên từng mục menu đặc quyền (`Admin`, `HR`).
- **Nút thu gọn/mở rộng**: Hỗ trợ đầy đủ Desktop toggle và Mobile drawer.

### 3.4. Bảo vệ đường dẫn (Route Guard trong `src/router/router.js`)
Tại hàm `handleRouteChange()`:
1. **Chưa đăng nhập**: Nếu truy cập route yêu cầu đăng nhập (`layout: 'app'`), lập tức chuyển hướng về `/login`.
2. **Đã đăng nhập**: Nếu truy cập `/login`, lập tức chuyển hướng về `/dashboard`.
3. **Phân quyền Route (RBAC)**: Nếu route có khai báo `allowedRoles` và role của người dùng hiện tại không nằm trong danh sách:
   - Hiển thị Toast cảnh báo: *"Bạn không có quyền truy cập vào chức năng này."*
   - Chuyển hướng an toàn về `/dashboard`.

---

## 4. HƯỚNG DẪN KIỂM THỬ VÀ XÁC MINH

### 4.1. Chạy bộ kiểm thử tự động
```bash
# Chạy bộ test Frontend AuthService và RBAC
npm test --prefix frontend
```

### 4.2. Kiểm thử thực tế trên trình duyệt
1. Đăng nhập với tài khoản **Admin** (`admin` / `AdminPassword2026!`):
   - Sidebar xuất hiện đầy đủ 5 menu: Tổng quan, Phòng ban, Nhân viên, Chấm công, Tài khoản.
   - Badge hiển thị: `Admin` (màu tím).
2. Nhấn nút Đăng xuất (Logout) -> Giao diện chuyển về màn hình Login.
3. Đăng nhập với tài khoản **HR Manager** (`hr` / `HrPassword2026!`):
   - Sidebar chỉ hiển thị 4 menu: Tổng quan, Phòng ban, Nhân viên, Chấm công.
   - Menu *Tài khoản* và section *HỆ THỐNG* bị ẩn hoàn toàn.
   - Gõ trực tiếp URL `http://localhost:5173/users` -> Hệ thống hiển thị Toast cảnh báo quyền hạn và tự động chuyển về `/dashboard`.
4. Đăng xuất và đăng nhập với tài khoản **Nhân viên** (`emp1` / `EmpPassword2026!`):
   - Sidebar chỉ hiển thị 2 menu: Tổng quan, Chấm công.
   - Menu *Phòng ban*, *Nhân viên*, *Tài khoản* bị ẩn hoàn toàn.
   - Gõ trực tiếp URL `http://localhost:5173/employees` hoặc `/departments` -> Bị Route Guard chặn và đưa về `/dashboard`.
5. Thử sửa đổi localStorage `user.role` thành giá trị bất kỳ:
   - F5 tải lại trang -> `normalizeRole()` từ chối mặc định, không hiển thị menu đặc quyền.
   - Gửi bất kỳ request API nào -> Backend từ chối do JWT Token ký mã bảo mật không thể bị sửa đổi ở client.

---

## 5. ĐỐI SOÁT VỚI BACKEND API

| Phân hệ Frontend | Endpoint Backend tương ứng | Middleware kiểm tra quyền |
|---|---|---|
| Xác thực / Hồ sơ | `GET /api/auth/profile` | `authenticateToken` |
| Quản lý tài khoản | `GET /api/rbac/admin/users` | `requireRole('ADMIN')` |
| Quản lý nhân sự | `GET /api/rbac/hr/employees` | `requireRole('ADMIN', 'HR_MANAGER')` |
| Chấm công nhân viên | `GET /api/rbac/employees/:id/attendances` | `requireOwnershipOrRole({ resourceType: 'employee' })` |
