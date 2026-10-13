# CHÍNH SÁCH BẢO MẬT & PHÂN QUYỀN TRUY CẬP (RBAC SECURITY POLICY)
## DỰ ÁN: HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### Nhóm Phát triển Phần mềm | K23 - Khoa CNTT - ICTU

---

## 1. Tổng quan Mô hình Phân quyền RBAC (Role-Based Access Control)

Hệ thống Quản lý Nhân sự HRM áp dụng mô hình phân quyền dựa trên vai trò **RBAC** kết hợp với **Bảo vệ quyền sở hữu dữ liệu cá nhân (Data Ownership Guard)**. Hệ thống phân định rõ ràng ba cấp độ vai trò:

| Vai trò chuẩn (RBAC) | Tên vai trò hiển thị | Giá trị ENUM trong MySQL | Quyền hạn và Phạm vi hoạt động |
| :--- | :--- | :---: | :--- |
| **`ADMIN`** | Quản trị viên hệ thống | `'Admin'` | Toàn quyền kiểm soát hệ thống: Quản lý tài khoản người dùng, phân quyền, cấu hình hệ thống, xem toàn bộ dữ liệu và audit log. |
| **`HR_MANAGER`** | Quản lý Nhân sự | `'HR'` | Quản trị nghiệp vụ nhân sự: Quản lý phòng ban, hồ sơ nhân viên, giải mã số CCCD nghiệp vụ, giám sát chấm công toàn công ty. Không được cấp quyền quản trị tài khoản Admin. |
| **`EMPLOYEE`** | Nhân viên thông thường | `'Employee'` | Nhân viên công ty: Tự chấm công vào/ra hàng ngày, xem lịch sử công của cá nhân, xem hồ sơ cá nhân và danh sách phòng ban cho phép. Bị chặn tuyệt đối khỏi dữ liệu của nhân viên khác. |

> 💡 **Cơ chế Chuẩn hóa Vai trò (Role Normalization):**
> Module [`backend/src/constants/roles.js`](file:///d:/QLNS_QLTKPM/backend/src/constants/roles.js) tự động chuyển đổi thông minh giữa các định dạng (ví dụ `'Admin'`, `'admin'`, `'ADMIN'` đều quy về `'ADMIN'`; `'HR'`, `'hr'`, `'HR_MANAGER'` đều quy về `'HR_MANAGER'`), đảm bảo tính nhất quán giữa Database MySQL và mã nguồn Express.

---

## 2. Bảng Ma trận Phân quyền Nghiệp vụ (Permission Matrix)

| Chức năng hệ thống | Hành vi cụ thể | ADMIN | HR_MANAGER | EMPLOYEE | Ghi chú & Ràng buộc bảo vệ |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Hệ thống Dashboard** | Xem KPI tổng quan toàn công ty | ✅ Có | ✅ Có | ❌ Không | Employee chỉ xem Dashboard cá nhân. |
| **Quản lý Phòng ban** | Xem danh mục phòng ban | ✅ Có | ✅ Có | ✅ Có | Cho phép xem thông tin cơ bản. |
| | Thêm / Sửa / Xóa phòng ban | ✅ Có | ✅ Có | ❌ Không | `requireRole('ADMIN', 'HR_MANAGER')` |
| **Hồ sơ Nhân sự** | Xem danh sách nhân viên | ✅ Có | ✅ Có | ❌ Không | Employee không được duyệt danh sách chung. |
| | Thêm mới / Cập nhật hồ sơ | ✅ Có | ✅ Có | ❌ Không | `requireRole('ADMIN', 'HR_MANAGER')` |
| | Giải mã số CCCD (AES-256) | ✅ Có | ✅ Có | ❌ Không | Bắt buộc kiểm tra quyền quản lý nhân sự. |
| | Xem hồ sơ cá nhân của mình | ✅ Có | ✅ Có | ✅ Có | Kiểm tra quyền sở hữu (`requireOwnershipOrRole`). |
| | Xem trộm hồ sơ nhân viên khác | ✅ Có | ✅ Có | 🚫 BỊ CHẶN | Trả về HTTP 403 Forbidden. |
| **Quản lý Chấm công** | Check-in / Check-out ca làm | ✅ Có | ✅ Có | ✅ Có | Chấm công cho chính bản thân. |
| | Xem lịch sử chấm công của mình | ✅ Có | ✅ Có | ✅ Có | `requireOwnershipOrRole({ paramName: 'id' })` |
| | Xem bảng chấm công toàn công ty | ✅ Có | ✅ Có | ❌ Không | `requireRole('ADMIN', 'HR_MANAGER')` |
| | Cập nhật / Điều chỉnh giờ công | ✅ Có | ✅ Có | ❌ Không | Chỉ quản lý mới có quyền duyệt giải trình công. |
| **Quản trị Tài khoản** | Xem danh sách tài khoản (`users`) | ✅ Có | ❌ Không | ❌ Không | `requireRole('ADMIN')` |
| | Khóa / Kích hoạt tài khoản | ✅ Có | ❌ Không | ❌ Không | Chỉ Admin hệ thống mới có quyền khóa. |
| | Đổi vai trò tài khoản (Role) | ✅ Có | ❌ Không | ❌ Không | Ngăn chặn HR tự phong quyền Admin. |

---

## 3. Kiến trúc Bộ 3 Middleware Bảo vệ API

Hệ thống xây dựng 3 lớp bảo vệ độc lập, tái sử dụng linh hoạt:

```text
[ Client Request ]
        │
        ▼
[ LỚP 1: authenticateToken ] ──(Token thiếu / Sai chữ ký / Hết hạn / User bị khóa)──► Trả 401/403
        │
        │ (Gắn req.user đã xác minh vào Request)
        ▼
[ LỚP 2: requireRole("ADMIN", ...) ] ──(Vai trò không nằm trong danh sách)──► Trả 403 FORBIDDEN
        │
        │ (Vai trò hợp lệ)
        ▼
[ LỚP 3: requireOwnershipOrRole ] ──(Employee cố truy cập ID người khác)──► Trả 403 FORBIDDEN
        │
        │ (Là Admin/HR HOẶC là chính chủ dữ liệu)
        ▼
[ Controller xử lý nghiệp vụ ]
```

### 3.1. Lớp 1: `authenticateToken` ([backend/src/middlewares/auth.js](file:///d:/QLNS_QLTKPM/backend/src/middlewares/auth.js))
- Trích xuất token từ `Authorization: Bearer <token>`.
- Xác minh chữ ký `HS256` và thời hạn hiệu lực.
- **Xác minh thời gian thực (Real-time DB Check)**: Truy vấn `userRepository.findById(sub)`. Nếu tài khoản vừa bị Admin khóa (`account_status === 'Locked'`) trong DB, request lập tức bị từ chối với HTTP 403 (dù token JWT vẫn còn hạn).
- Chuẩn hóa role và gắn vào `req.user`.

### 3.2. Lớp 2: `requireRole` ([backend/src/middlewares/role.js](file:///d:/QLNS_QLTKPM/backend/src/middlewares/role.js))
- Kiểm tra vai trò của `req.user.role` với danh sách cho phép.
- Hỗ trợ cú pháp: `requireRole('ADMIN')`, `requireRole('ADMIN', 'HR_MANAGER')`, hoặc mảng `requireRole(['ADMIN', 'HR_MANAGER'])`.
- Không có quyền: trả HTTP 403 Forbidden.

### 3.3. Lớp 3: `requireOwnershipOrRole` ([backend/src/middlewares/ownership.js](file:///d:/QLNS_QLTKPM/backend/src/middlewares/ownership.js))
- Kiểm tra quyền sở hữu dữ liệu cá nhân dựa trên `id` truyền trên URL params hoặc query.
- Nếu là `ADMIN` hoặc `HR_MANAGER`: Tự động bỏ qua kiểm tra (Bypass).
- Nếu là `EMPLOYEE`: Chỉ cho phép nếu `Number(req.params.id) === Number(req.user.employeeId)`.
- Ngăn chặn hoàn toàn lỗ hổng IDOR (Insecure Direct Object References).

---

## 4. Hướng dẫn Lập trình viên Áp dụng vào các API CRUD Tiếp theo

Khi phát triển các chức năng tiếp theo của Sprint 1, thành viên chỉ cần import và gắn middleware vào Router như sau:

```javascript
import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/role.js';
import { requireOwnershipOrRole } from '../middlewares/ownership.js';
import employeeController from '../controllers/employeeController.js';

const router = Router();

// 1. API Chỉ dành riêng cho Quản trị viên (Admin only)
router.get(
  '/admin/system-logs',
  authenticateToken,
  requireRole('ADMIN'),
  systemLogController.getLogs
);

// 2. API Quản lý dành cho Admin và HR Manager
router.post(
  '/employees',
  authenticateToken,
  requireRole('ADMIN', 'HR_MANAGER'),
  employeeController.createEmployee
);

// 3. API Xem thông tin có kiểm tra quyền sở hữu cá nhân:
// - Admin và HR Manager xem được mọi nhân viên
// - Nhân viên thông thường chỉ xem được của chính mình
router.get(
  '/employees/:id/attendances',
  authenticateToken,
  requireOwnershipOrRole({ paramName: 'id', resourceType: 'employee' }),
  attendanceController.getEmployeeAttendances
);
```

---

## 5. Quy chuẩn Định dạng Phản hồi Lỗi (Error Response Standard)

### 5.1. Khi chưa đăng nhập hoặc Token không hợp lệ (HTTP 401 Unauthorized)
```json
{
  "success": false,
  "status": "error",
  "statusCode": 401,
  "errorCode": "TOKEN_REQUIRED", // hoặc "INVALID_TOKEN", "TOKEN_EXPIRED"
  "message": "Vui lòng đăng nhập để tiếp tục.",
  "timestamp": "2026-10-13T14:00:00.000Z"
}
```

### 5.2. Khi đã đăng nhập nhưng không đủ quyền hạn (HTTP 403 Forbidden)
```json
{
  "success": false,
  "status": "error",
  "statusCode": 403,
  "errorCode": "FORBIDDEN",
  "message": "Bạn không có quyền thực hiện thao tác này.",
  "timestamp": "2026-10-13T14:00:00.000Z"
}
```

### 5.3. Khi nhân viên cố truy cập dữ liệu của đồng nghiệp khác (HTTP 403 Forbidden)
```json
{
  "success": false,
  "status": "error",
  "statusCode": 403,
  "errorCode": "FORBIDDEN_RESOURCE",
  "message": "Bạn chỉ có quyền truy cập dữ liệu cá nhân của chính mình.",
  "timestamp": "2026-10-13T14:00:00.000Z"
}
```

---

## 6. Kết quả Kiểm thử Tự động (Verification)

Hệ thống đã chạy thực tế và **vượt qua 100% (15/15 bài test)** trong file [`backend/tests/rbac.test.js`](file:///d:/QLNS_QLTKPM/backend/tests/rbac.test.js):

```text
============================================================
🛡️ BẮT ĐẦU CHẠY BỘ KIỂM THỬ AUTH MIDDLEWARE & RBAC (15 CASES)
============================================================

  ✅ [PASS] Test 1: Request không có Authorization header -> 401 TOKEN_REQUIRED
  ✅ [PASS] Test 2: Header không theo định dạng Bearer (Basic/Token) -> 401 INVALID_TOKEN_FORMAT
  ✅ [PASS] Test 3: Token sai chữ ký (ký bằng secret giả) -> 401 INVALID_TOKEN
  ✅ [PASS] Test 4: Token đã hết hạn (expired) -> 401 TOKEN_EXPIRED
  ✅ [PASS] Test 5: Token thiếu claim định danh bắt buộc (sub) -> 401 INVALID_TOKEN_CLAIMS
  ✅ [PASS] Test 6: Token hợp lệ của Admin -> Gọi next() và gắn req.user.role=ADMIN
  ✅ [PASS] Test 7: Token hợp lệ của HR Manager -> Gọi next() và chuẩn hóa role HR_MANAGER
  ✅ [PASS] Test 8: Token hợp lệ của Employee -> Gọi next() và gắn role EMPLOYEE
  ✅ [PASS] Test 9: Employee truy cập API yêu cầu ADMIN -> 403 FORBIDDEN
  ✅ [PASS] Test 10: HR Manager truy cập API chỉ dành cho ADMIN -> 403 FORBIDDEN
  ✅ [PASS] Test 11: Admin truy cập endpoint yêu cầu ADMIN -> Next() được gọi thành công
  ✅ [PASS] Test 12: Tài khoản bị khóa trong DB (Locked) nhưng token còn hạn -> 403 ACCOUNT_LOCKED (Real-time DB check)
  ✅ [PASS] Test 13: Tài khoản có role không hợp lệ trong DB (hacker/rác) -> 403 INVALID_USER_ROLE
  ✅ [PASS] Test 14: Database truy vấn lỗi -> Chuyển tiếp next(error) an toàn cho Error Handler
  ✅ [PASS] Test 15: Employee truy cập dữ liệu của nhân viên khác -> 403 FORBIDDEN_RESOURCE

============================================================
🎉 KẾT QUẢ: ĐÃ VƯỢT QUA 15/15 BÀI KIỂM THỬ AUTH MIDDLEWARE & RBAC!
============================================================
```

---
*Tài liệu quy chuẩn bảo mật dự án HRM ICTU | Technical Lead & Backend Engineering Team.*
