# HƯỚNG DẪN KỸ THUẬT: FORM ĐĂNG NHẬP, VALIDATE VÀ QUẢN LÝ JWT TRÊN FRONTEND
## DỰ ÁN: HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### Nhóm Phát triển Phần mềm | K23 - Khoa CNTT - ICTU

---

## 1. Tổng quan Chức năng Đăng nhập Frontend

Chức năng Đăng nhập được xây dựng theo chuẩn **Single Page Application (SPA)** hiện đại sử dụng **Vanilla JavaScript ES Modules** và **Vite**, không sử dụng framework nặng nề, bảo đảm tốc độ tải trang tức thì (< 300ms) và tính tương thích cao với Web Server Nginx.

### Các thành phần chính:
- **Giao diện Form Đăng nhập** ([`frontend/src/pages/LoginPage.js`](file:///d:/QLNS_QLTKPM/frontend/src/pages/LoginPage.js)): Thiết kế phong cách Enterprise (Indigo & Slate), có đầy đủ Logo HRM ICTU, Alert banner thông báo lỗi, icon trường nhập liệu, nút bật/tắt hiện mật khẩu và hộp gợi ý tài khoản test nhanh.
- **Dịch vụ Xác thực** ([`frontend/src/services/authService.js`](file:///d:/QLNS_QLTKPM/frontend/src/services/authService.js)): Gọi API `POST /api/auth/login`, quản lý lưu trữ token và thông tin người dùng an toàn trong `localStorage`.
- **Tầng HTTP Client** ([`frontend/src/services/api.js`](file:///d:/QLNS_QLTKPM/frontend/src/services/api.js)): Tự động gắn header `Authorization: Bearer <accessToken>` cho toàn bộ các request sau khi đăng nhập; tự động xóa token và chuyển hướng về `/login` nếu nhận mã lỗi 401.
- **Route Guard** ([`frontend/src/router/router.js`](file:///d:/QLNS_QLTKPM/frontend/src/router/router.js)): Ngăn chặn người dùng chưa đăng nhập truy cập các trang quản trị (`/dashboard`, `/departments`, `/employees`, v.v.), đồng thời tự động chuyển hướng người dùng đã đăng nhập từ trang `/login` vào `/dashboard`.

---

## 2. Quy trình Validation Form Phía Client

Form thực hiện kiểm tra tính hợp lệ dữ liệu ngay tại trình duyệt trước khi gửi request tới Backend nhằm tiết kiệm băng thông và tăng trải nghiệm người dùng:

| Trường nhập liệu | Quy tắc kiểm tra | Thông báo lỗi hiển thị |
| :--- | :--- | :--- |
| **Tên đăng nhập / Email** | Bắt buộc nhập, không được để trống hoặc chuỗi khoảng trắng. | `"Vui lòng nhập tên đăng nhập hoặc email."` |
| | Nếu chuỗi có chứa ký tự `@`: Kiểm tra định dạng email `^[^\s@]+@[^\s@]+\.[^\s@]+$`. | `"Định dạng email không hợp lệ (ví dụ: user@hrm.local)."` |
| **Mật khẩu** | Bắt buộc nhập, không được để trống. | `"Vui lòng nhập mật khẩu."` |

### Tính năng trải nghiệm người dùng nổi bật:
- **Tự động xóa lỗi khi nhập liệu (Live Error Clearing)**: Khi người dùng gõ vào ô nhập liệu (`input` event), thông báo lỗi inline màu đỏ và Alert banner sẽ tự động biến mất ngay lập tức.
- **Bật/Tắt hiện mật khẩu**: Nút con mắt SVG cho phép người dùng chuyển đổi linh hoạt giữa `type="password"` và `type="text"`.
- **Chống Submit trùng lặp (Prevent Double Submit)**: Khi người dùng nhấn nút Đăng nhập, nút sẽ chuyển sang trạng thái `disabled`, hiển thị Spinner SVG và dòng chữ `"Đang xác thực tài khoản..."`. Người dùng không thể spam click tạo nhiều request đồng thời.
- **Ghi nhớ tên đăng nhập (Remember Me)**: Nếu tích chọn checkbox, tên đăng nhập sẽ được lưu vào khóa `hrm_remember_username` và tự động điền sẵn trong các lần truy cập tiếp theo.

---

## 3. Kết nối API Backend & Xử lý Mã Phản hồi

### Endpoint sử dụng:
- **URL**: `POST http://localhost:3005/api/auth/login` (hoặc proxy `/api/auth/login` qua Nginx Docker)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "AdminPassword2026!"
  }
  ```

### Xử lý các trường hợp phản hồi từ máy chủ:

| Mã HTTP | Trạng thái nghiệp vụ | Hành vi xử lý trên Giao diện Frontend |
| :---: | :--- | :--- |
| **`200 OK`** | Đăng nhập thành công | 1. Lưu `accessToken` và `user` vào `localStorage`.<br>2. Hiển thị Toast thông báo thành công.<br>3. Điều hướng người dùng vào `/dashboard` sau 350ms. |
| **`400 Bad Request`** | Thiếu tham số hoặc sai kiểu dữ liệu | Hiển thị thông báo lỗi chi tiết trên Alert Banner. |
| **`401 Unauthorized`** | Sai tên đăng nhập hoặc sai mật khẩu | Hiển thị Alert Banner: `"Tên đăng nhập hoặc mật khẩu không chính xác."` (Không lưu token). |
| **`403 Forbidden`** | Tài khoản bị khóa trong DB | Hiển thị Alert Banner: `"Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ."` |
| **`429 Too Many Requests`** | Thử sai quá 15 lần trong 15 phút | Hiển thị Alert Banner: `"Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút."` |
| **Lỗi mạng (Fetch Failed)** | Máy chủ Backend chưa bật hoặc sập kết nối | Hiển thị Alert Banner: `"Không thể kết nối tới máy chủ Backend (cổng 3005). Vui lòng kiểm tra Docker hoặc kết nối mạng."` |

---

## 4. Quản lý Token & Bảo mật trong LocalStorage

### Danh mục các khóa lưu trữ:
- **`accessToken`**: Chuỗi JWT Access Token do Backend ký (thuật toán HS256).
- **`user`**: Chuỗi JSON chứa thông tin người dùng cần thiết để hiển thị giao diện:
  ```json
  {
    "id": 1,
    "username": "admin",
    "role": "Admin",
    "employeeId": 1,
    "fullName": "Đỗ Quang Minh",
    "email": "minh.dq@hrm.local",
    "position": "Trưởng phòng Kỹ thuật"
  }
  ```
- **`hrm_remember_username`**: Lưu tên đăng nhập người dùng đã chọn ghi nhớ.

### Các nguyên tắc an ninh bắt buộc:
1. **Tuyệt đối KHÔNG lưu mật khẩu** vào `localStorage` hay bất kỳ bộ nhớ client nào.
2. **Tuyệt đối KHÔNG ghi token ra `console.log`** trong mã nguồn sản phẩm.
3. **Không tin tưởng quyền từ client**: Frontend chỉ dùng trường `role` để hiển thị nhãn thân thiện trên Header; Backend mới là nơi xác minh quyền thực tế qua middleware `requireRole` trên từng API.

---

## 5. Danh sách Tài khoản Kiểm thử Sẵn sàng

Hộp gợi ý trên màn hình đăng nhập cung cấp 3 tài khoản chuẩn đã băm mật khẩu Bcrypt trong cơ sở dữ liệu (người dùng chỉ cần **Click chuột vào dòng tài khoản** để tự động điền nhanh):

| Vai trò | Tên đăng nhập (`username`) | Mật khẩu mẫu (`password`) | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin` | `AdminPassword2026!` | Toàn quyền quản trị hệ thống |
| **Quản lý Nhân sự (HR)** | `hr` | `HrPassword2026!` | Quản lý nhân viên & phòng ban |
| **Nhân viên (Employee)** | `emp1` | `EmpPassword2026!` | Tự chấm công và xem lịch sử cá nhân |

---

## 6. Hướng dẫn Khởi chạy & Kiểm thử Thực tế

### 6.1. Chạy bài kiểm thử tự động Frontend Auth
```powershell
npm test --prefix frontend
```
**Kết quả kiểm thử:** Vượt qua 6/6 kịch bản (Token storage, User object storage, Remember me, Logout cleanup, Email regex).

### 6.2. Kiểm tra biên dịch Vite Bundle
```powershell
npm run build --prefix frontend
```
**Kết quả:** Biên dịch 28 modules thành công không có lỗi cú pháp hoặc cảnh báo import.

### 6.3. Khởi chạy môi trường phát triển (Dev Server)
```powershell
npm run dev --prefix frontend
```
- Mở trình duyệt tại: [http://localhost:5173](http://localhost:5173).
- Trình duyệt sẽ tự động chuyển hướng đến `/login` nếu chưa đăng nhập.

---
*Tài liệu kỹ thuật lưu hành nội bộ — Nhóm Kỹ sư Frontend HRM ICTU.*
