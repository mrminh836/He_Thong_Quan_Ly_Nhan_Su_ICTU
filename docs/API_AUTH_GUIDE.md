# TÀI LIỆU KỸ THUẬT: XÁC THỰC NGƯỜI DÙNG, BCRYPT & JWT LOGIN API
## DỰ ÁN: HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### Nhóm Phát triển Phần mềm | K23 - Khoa CNTT - ICTU

---

## 1. Tổng quan Kiến trúc Xác thực (Authentication Architecture)

Hệ thống Quản lý Nhân sự HRM áp dụng tiêu chuẩn bảo mật Stateless Authentication hiện đại dựa trên:
- **Bcrypt Password Hashing**: Mật khẩu người dùng được băm một chiều với muối ngẫu nhiên (Salt rounds = 10-12), loại bỏ hoàn toàn nguy cơ rò rỉ mật khẩu gốc ngay cả khi cơ sở dữ liệu bị lộ lọt.
- **JSON Web Token (JWT) Access Token**: Sử dụng thuật toán ký đối xứng an toàn **HS256**, thời hạn sống xác định (`JWT_EXPIRES_IN=8h`), chứa các claim định danh tối thiểu (`sub`, `username`, `role`, `employeeId`).
- **Phân tầng kiến trúc (Clean Multi-layer Architecture)**:
  - **Routes**: Tiếp nhận URL và gắn middleware bảo vệ.
  - **Middlewares**: `loginRateLimiter` (chống brute force), `authenticateToken` (giải mã và xác thực chữ ký JWT), `requireRoles` (kiểm tra phân quyền RBAC).
  - **Controllers**: Kiểm tra kiểu dữ liệu, bắt lỗi và trả về chuẩn JSON Standard Envelope.
  - **Services**: Xử lý logic nghiệp vụ, đối chiếu mật khẩu, kiểm tra trạng thái khóa tài khoản và sinh token.
  - **Repositories**: Thực hiện truy vấn MySQL 8.0 bằng **Parameterized Queries (`?`)** chống tấn công SQL Injection 100%.

```text
[ Client / Frontend ]
         │
         │ 1. POST /api/auth/login { username, password }
         ▼
[ loginRateLimiter ] ──(Kiểm tra Brute-Force)──► [ authController.login ]
                                                         │
                                                         ▼
                                               [ authService.login ]
                                                         │
                                  ┌──────────────────────┴──────────────────────┐
                                  ▼                                             ▼
                     [ userRepository ]                               [ password.compare ]
                 (SELECT WHERE u=? OR e=?)                             (bcrypt.compare)
                                  │                                             │
                                  ▼                                             ▼
                     [ MySQL DB: users table ]                     [ jwt.generateAccessToken ]
                                                                                │
                                                                                ▼
                                                                     [ Trả JWT Access Token ]
```

---

## 2. Thiết kế Bảng `users` trong Cơ sở dữ liệu

Bảng `users` được tích hợp chặt chẽ với bảng hồ sơ nhân sự `employees` theo quan hệ **0..1 : 1**:
- Một nhân viên có tối đa một tài khoản hệ thống (`employee_id` có ràng buộc UNIQUE).
- Tài khoản quản trị viên kỹ thuật cấp cao (Root Admin) có thể có `employee_id = NULL`.

```sql
CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Khóa chính định danh tài khoản',
    `employee_id` INT NULL COMMENT 'Liên kết 1-1 với hồ sơ nhân viên (Admin hệ thống có thể NULL)',
    `username` VARCHAR(50) NOT NULL COMMENT 'Tên đăng nhập hệ thống duy nhất',
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã được băm an toàn bằng thuật toán Bcrypt',
    `role` ENUM('Admin', 'HR', 'Employee') NOT NULL DEFAULT 'Employee' COMMENT 'Vai trò phân quyền hệ thống (RBAC)',
    `account_status` ENUM('Active', 'Locked', 'Inactive') NOT NULL DEFAULT 'Active' COMMENT 'Trạng thái tài khoản người dùng',
    `last_login_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Thời điểm đăng nhập thành công gần nhất',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tạo tài khoản',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời điểm cập nhật tài khoản',

    -- Ràng buộc duy nhất
    CONSTRAINT `uk_users_username` UNIQUE (`username`),
    CONSTRAINT `uk_users_employee` UNIQUE (`employee_id`),

    -- Ràng buộc khóa ngoại
    CONSTRAINT `fk_users_employee`
        FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
        ON DELETE SET NULL ON UPDATE CASCADE,

    -- Chỉ mục tối ưu truy vấn
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_status` (`account_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng tài khoản người dùng và xác thực RBAC';
```

---

## 3. Đặc tả Chi tiết API Xác thực

### 3.1. API Đăng nhập Hệ thống (`POST /api/auth/login`)

- **Đường dẫn**: `/api/auth/login`
- **Phương thức**: `POST`
- **Quyền truy cập**: Public (Được bảo vệ bởi `loginRateLimiter`: tối đa 15 lần thử / 15 phút)
- **Content-Type**: `application/json`

#### Header yêu cầu:
```http
Content-Type: application/json
```

#### Request Body mẫu:
```json
{
  "username": "admin",
  "password": "AdminPassword2026!"
}
```
*(Hệ thống hỗ trợ nhập `username` hoặc địa chỉ `email` nhân viên).*

#### 🟢 Phản hồi Thành công (HTTP 200 OK):
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Đăng nhập thành công",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 28800,
    "user": {
      "id": 1,
      "username": "admin",
      "role": "Admin",
      "employeeId": 1,
      "fullName": "Đỗ Quang Minh",
      "email": "minh.dq@hrm.local",
      "position": "Trưởng phòng Kỹ thuật"
    }
  },
  "timestamp": "2026-10-13T13:45:00.000Z"
}
```

#### 🔴 Phản hồi Thất bại:

| Mã HTTP | Tình huống | Response mẫu |
| :---: | :--- | :--- |
| **400** | Thiếu username hoặc password | `{"status": "error", "statusCode": 400, "errorCode": "VALIDATION_ERROR", "message": "Tên đăng nhập và mật khẩu là bắt buộc."}` |
| **401** | Sai username hoặc sai password | `{"status": "error", "statusCode": 401, "errorCode": "INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không chính xác."}` *(Dùng chung thông báo để chống User Enumeration)* |
| **403** | Tài khoản bị khóa (`Locked`/`Inactive`) | `{"status": "error", "statusCode": 403, "errorCode": "ACCOUNT_LOCKED", "message": "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ."}` |
| **429** | Thử đăng nhập sai quá nhiều lần | `{"status": "error", "statusCode": 429, "errorCode": "TOO_MANY_REQUESTS", "message": "Bạn đã thực hiện quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau 15 phút."}` |
| **500** | Lỗi máy chủ / Mất kết nối DB | `{"status": "error", "statusCode": 500, "errorCode": "INTERNAL_SERVER_ERROR", "message": "Đã xảy ra lỗi trong quá trình xử lý"}` |

---

### 3.2. API Lấy Thông tin Hồ sơ Hiện tại (`GET /api/auth/profile`)

- **Đường dẫn**: `/api/auth/profile`
- **Phương thức**: `GET`
- **Quyền truy cập**: Private (Bắt buộc có JWT Token)

#### Header yêu cầu:
```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

#### 🟢 Phản hồi Thành công (HTTP 200 OK):
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Lấy thông tin tài khoản thành công",
  "data": {
    "id": 1,
    "username": "admin",
    "role": "Admin",
    "employeeId": 1,
    "accountStatus": "Active",
    "fullName": "Đỗ Quang Minh",
    "email": "minh.dq@hrm.local",
    "position": "Trưởng phòng Kỹ thuật",
    "departmentId": 1,
    "lastLoginAt": "2026-10-13T13:45:00.000Z",
    "createdAt": "2026-10-13T12:00:00.000Z"
  },
  "timestamp": "2026-10-13T13:46:00.000Z"
}
```

---

## 4. Công cụ Hỗ trợ Quản trị: Sinh Mã băm Bcrypt An toàn (CLI)

Nhóm đã tích hợp sẵn công cụ dòng lệnh để Quản trị viên và Lập trình viên tạo mật khẩu băm chuẩn Bcrypt mà **không cần sử dụng các công cụ online không an toàn**:

```bash
# Cú pháp:
npm run hash:password --prefix backend "<MẬT_KHẨU_CẦN_BĂM>" [saltRounds]

# Ví dụ thực tế:
npm run hash:password --prefix backend "Admin@Pass2026" 10
```

**Kết quả in ra Terminal:**
```text
--- CÔNG CỤ SINH BCRYPT HASH AN TOÀN (HRM ICTU) ---
- Mật khẩu đầu vào: "Admin@Pass2026"
- Salt Rounds:      10
- Thời gian băm:    61ms
- Chuỗi Bcrypt Hash:
  $2b$10$eOsVViI./D2YsXqhdFP0uOLXrJY/yWEK/bI5FbkGMrDu5pP/jTGD.
----------------------------------------------------
👉 Bạn có thể dùng chuỗi này trong câu lệnh INSERT/UPDATE SQL:
   UPDATE users SET password_hash = '$2b$10$eOsVViI./D2YsXqhdFP0uOLXrJY/yWEK/bI5FbkGMrDu5pP/jTGD.' WHERE username = 'admin';
```

---

## 5. Hướng dẫn Chạy Kiểm thử Tự động (Automated Testing)

Toàn bộ 12 kịch bản an ninh và xác thực được kiểm tra tự động bằng lệnh:

```bash
# Chạy bộ test xác thực chuyên sâu:
npm run test:auth --prefix backend

# Chạy toàn bộ test cú pháp và xác thực:
npm test --prefix backend
```

### Danh mục 12 Bài kiểm thử tự động đã vượt qua:
1. `Test 1`: Đăng nhập thành công với tài khoản hợp lệ và nhận JWT.
2. `Test 2`: Nhập sai mật khẩu $\rightarrow$ Trả về lỗi 401 với thông báo chung.
3. `Test 3`: Tài khoản không tồn tại $\rightarrow$ Trả về lỗi 401 giống hệt sai mật khẩu (chống User Enumeration).
4. `Test 4`: Thiếu username $\rightarrow$ Trả về lỗi 400 VALIDATION_ERROR.
5. `Test 5`: Thiếu password $\rightarrow$ Trả về lỗi 400 VALIDATION_ERROR.
6. `Test 6`: Kiểu dữ liệu không phải string (Object/Number) $\rightarrow$ Trả về 400.
7. `Test 7`: Tài khoản bị khóa (Locked) $\rightarrow$ Trả về lỗi 403 và từ chối cấp token.
8. `Test 8`: Database truy vấn gặp lỗi $\rightarrow$ Bắn ngoại lệ không lộ mật khẩu kết nối.
9. `Test 9`: JWT tạo đúng thuật toán HS256 và giải mã chính xác các claim (`sub`, `username`, `role`).
10. `Test 10`: JWT bị sửa đổi chữ ký hoặc hết hạn $\rightarrow$ Bị từ chối (Verification fails).
11. `Test 11`: Response trả về **TUYỆT ĐỐI KHÔNG** chứa `password` hoặc `password_hash`.
12. `Test 12`: Parameterized Queries an toàn trước tấn công SQL Injection (`' OR '1'='1'`).

---
*Tài liệu kỹ thuật lưu hành nội bộ — Nhóm Kỹ sư Backend HRM ICTU.*
