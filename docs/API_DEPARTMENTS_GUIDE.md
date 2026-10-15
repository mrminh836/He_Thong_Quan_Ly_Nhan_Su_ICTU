# HƯỚNG DẪN KỸ THUẬT: MIGRATION, MODEL VÀ REST API CRUD DEPARTMENT (HRM ICTU)

Tài liệu hướng dẫn chi tiết về cấu trúc CSDL, kịch bản Migration/Rollback, kiến trúc mã nguồn và danh mục REST API Quản lý Phòng ban (`departments`) thuộc Hệ thống Quản lý Nhân sự (HRM).

---

## 1. Cấu trúc CSDL & Ràng buộc toàn vẹn (Schema Definition)

### 1.1. Bảng `departments`

| Tên cột | Kiểu dữ liệu | Nullable | Mặc định | Chú thích nghiệp vụ |
|---|---|---|---|---|
| `department_id` | `INT AUTO_INCREMENT` | `NO` | - | **Khóa chính (PK)** tự tăng |
| `department_code` | `VARCHAR(20)` | `NO` | - | **Khóa duy nhất (UK)**: Mã viết tắt (vd: `PB-TECH`, `PB-HR`) |
| `department_name` | `VARCHAR(100)` | `NO` | - | **Khóa duy nhất (UK)**: Tên hiển thị đầy đủ của phòng ban |
| `location` | `VARCHAR(255)` | `YES` | `NULL` | Địa điểm làm việc / Tòa nhà / Tầng |
| `phone` | `VARCHAR(20)` | `YES` | `NULL` | Số điện thoại bàn liên lạc nội bộ |
| `description` | `TEXT` | `YES` | `NULL` | Mô tả chức năng, nhiệm vụ cơ cấu |
| `is_active` | `BOOLEAN` | `NO` | `TRUE` | Trạng thái hoạt động (Phục vụ Soft-delete) |
| `created_at` | `TIMESTAMP` | `NO` | `CURRENT_TIMESTAMP` | Thời điểm tạo bản ghi |
| `updated_at` | `TIMESTAMP` | `NO` | `CURRENT_TIMESTAMP ON UPDATE` | Thời điểm cập nhật cuối |

### 1.2. Quan hệ Khóa ngoại với `employees` (1 : N)

```sql
CONSTRAINT `fk_employees_department`
    FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
```

- **Quy tắc bảo toàn dữ liệu (`ON DELETE RESTRICT`):** Tuyệt đối không cho phép xóa một phòng ban nếu vẫn còn nhân viên đang trực thuộc phòng ban đó.
- **Tầng ứng dụng (Service Guard):** Hàm `departmentService.deleteDepartment` kiểm tra `countEmployeesByDepartmentId(id)`. Nếu `count > 0`, hệ thống chủ động trả về HTTP `409 Conflict` kèm thông báo hướng dẫn người dùng điều chuyển nhân viên trước khi xóa.

---

## 2. Kịch bản Migration và Rollback

### 2.1. File kịch bản SQL (Idempotent)

- **Migration UP:** [`database/migrations/001_create_or_alter_departments.sql`](file:///d:/QLNS_QLTKPM/database/migrations/001_create_or_alter_departments.sql)
  - Khởi tạo bảng `departments` với `CREATE TABLE IF NOT EXISTS`.
  - Kiểm tra và bổ sung ràng buộc `UNIQUE (department_name)` bằng prepared statement an toàn không gây lỗi nếu đã tồn tại.
- **Migration Rollback:** [`database/migrations/001_create_or_alter_departments_rollback.sql`](file:///d:/QLNS_QLTKPM/database/migrations/001_create_or_alter_departments_rollback.sql)
  - Hoàn tác an toàn bằng cách gỡ bỏ ràng buộc duy nhất `uk_departments_name`.
  - **Bảo toàn dữ liệu production:** Tuyệt đối không `DROP TABLE` tự động nhằm tránh thất thoát dữ liệu nhân sự đang chạy thực tế.

### 2.2. Lệnh thực thi Migration qua Node.js Runner

Không cần cài thêm thư viện ORM cồng kềnh, hệ thống sử dụng script chuyên dụng [`backend/src/scripts/migrate.js`](file:///d:/QLNS_QLTKPM/backend/src/scripts/migrate.js):

```bash
# Di chuyển vào thư mục backend
cd backend

# Chạy migration áp dụng các script mới
npm run migrate

# Hoàn tác batch migration gần nhất (Rollback an toàn)
npm run migrate:rollback

# Kiểm tra lịch sử migration
npm run migrate:status
```

---

## 3. Ma trận Phân quyền RBAC (Role-Based Access Control)

| Phương thức | Endpoint | ADMIN | HR_MANAGER | EMPLOYEE | Khách (Chưa đăng nhập) |
|---|---|:---:|:---:|:---:|:---:|
| `GET` | `/api/departments` | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ❌ 401 Unauthorized |
| `GET` | `/api/departments/statistics` | ✅ Cho phép | ✅ Cho phép | ❌ 403 Forbidden | ❌ 401 Unauthorized |
| `GET` | `/api/departments/:id` | ✅ Cho phép | ✅ Cho phép | ✅ Cho phép | ❌ 401 Unauthorized |
| `POST` | `/api/departments` | ✅ Cho phép | ✅ Cho phép | ❌ 403 Forbidden | ❌ 401 Unauthorized |
| `PUT` | `/api/departments/:id` | ✅ Cho phép | ✅ Cho phép | ❌ 403 Forbidden | ❌ 401 Unauthorized |
| `DELETE` | `/api/departments/:id` | ✅ Cho phép | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 401 Unauthorized |

---

## 4. Chi tiết các REST API Endpoint

### 4.1. `GET /api/departments` — Lấy danh sách phòng ban

- **Mô tả:** Lấy danh sách các phòng ban kèm phân trang, tìm kiếm theo tên hoặc mã, và số lượng nhân sự trực thuộc (`employeeCount`).
- **Query Parameters:**
  - `page`: Số trang (Mặc định: `1`)
  - `limit`: Số bản ghi mỗi trang (Mặc định: `10`, tối đa `100`)
  - `search`: Từ khóa tìm kiếm theo tên hoặc mã phòng ban
  - `sortBy`: Cột sắp xếp (`department_id`, `department_name`, `department_code`, `created_at`)
  - `sortOrder`: Thứ tự sắp xếp (`ASC` hoặc `DESC`)
  - `status`: Lọc theo trạng thái (`active`, `inactive`, `all`)
- **Headers:** `Authorization: Bearer <accessToken>`
- **Response `200 OK`:**

```json
{
  "success": true,
  "status": "success",
  "statusCode": 200,
  "message": "Lấy danh sách phòng ban thành công",
  "data": [
    {
      "id": 1,
      "departmentId": 1,
      "departmentCode": "PB-TECH",
      "departmentName": "Phòng Kỹ thuật & Công nghệ",
      "location": "Tầng 4 - Tòa nhà A",
      "phone": "0208-3846-001",
      "description": "Nghiên cứu, phát triển ứng dụng và vận hành hạ tầng CNTT",
      "isActive": true,
      "employeeCount": 3,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  },
  "timestamp": "2026-10-14T11:50:00.000Z"
}
```

---

### 4.2. `GET /api/departments/statistics` — Thống kê số lượng nhân viên hiện tại theo phòng ban

- **Mô tả:** Thống kê số lượng nhân sự thuộc biên chế hiện tại của từng phòng ban phục vụ hiển thị Dashboard và màn hình Cơ cấu tổ chức. Sử dụng `LEFT JOIN` và `COUNT(...)` theo điều kiện trạng thái để bảo đảm các phòng ban chưa có nhân sự vẫn xuất hiện đầy đủ với `employeeCount = 0`.
- **Quyền truy cập:** `ADMIN`, `HR_MANAGER`
- **Query Parameters:**
  - `status`: Lọc phòng ban theo trạng thái (`active`, `inactive`, `all` - Mặc định: `all`)
  - `sortBy`: Tiêu chí sắp xếp (`employee_count`, `department_name`, `department_code` - Mặc định: `employee_count`)
  - `sortOrder`: Thứ tự sắp xếp (`DESC` hoặc `ASC` - Mặc định: `DESC`)
- **Quy tắc đếm nhân viên hiện tại:**
  - Đếm các nhân viên có `employment_status IN ('Active', 'OnLeave')`.
  - **Loại trừ** các nhân viên có trạng thái `Resigned` (đã thôi việc / soft delete).
  - Nhân viên chưa gán phòng ban (`department_id = NULL`) **không** bị tính nhầm vào bất kỳ phòng ban nào.
- **Headers:** `Authorization: Bearer <accessToken>`
- **Response `200 OK`:**

```json
{
  "success": true,
  "status": "success",
  "statusCode": 200,
  "message": "Lấy thống kê số lượng nhân viên theo phòng ban thành công",
  "data": [
    {
      "departmentId": 1,
      "departmentCode": "PB-TECH",
      "departmentName": "Phòng Kỹ thuật & Công nghệ",
      "isActive": true,
      "employeeCount": 3,
      "activeCount": 3,
      "onLeaveCount": 0,
      "resignedCount": 0
    },
    {
      "departmentId": 2,
      "departmentCode": "PB-HR",
      "departmentName": "Phòng Nhân sự & Hành chính",
      "isActive": true,
      "employeeCount": 1,
      "activeCount": 1,
      "onLeaveCount": 0,
      "resignedCount": 0
    },
    {
      "departmentId": 3,
      "departmentCode": "PB-BIZ",
      "departmentName": "Phòng Kinh doanh & Marketing",
      "isActive": true,
      "employeeCount": 1,
      "activeCount": 1,
      "onLeaveCount": 0,
      "resignedCount": 0
    }
  ],
  "meta": {
    "totalDepartments": 3,
    "emptyDepartments": 0,
    "totalEmployees": 5,
    "activeEmployees": 5,
    "onLeaveEmployees": 0
  },
  "timestamp": "2026-10-14T12:00:00.000Z"
}
```

- **Lỗi `401 Unauthorized`:** Nếu không truyền Header Authorization hoặc Token hết hạn.
- **Lỗi `403 Forbidden`:** Nếu người dùng có vai trò `EMPLOYEE` cố tình truy xuất API thống kê tổ chức.

---

### 4.3. `GET /api/departments/:id` — Xem chi tiết phòng ban

- **Mô tả:** Lấy thông tin chi tiết một phòng ban cụ thể bằng ID.
- **Path Parameter:** `id` (Bắt buộc, số nguyên dương)
- **Response `200 OK`:**

```json
{
  "success": true,
  "status": "success",
  "statusCode": 200,
  "message": "Lấy thông tin chi tiết phòng ban thành công",
  "data": {
    "id": 1,
    "departmentId": 1,
    "departmentCode": "PB-TECH",
    "departmentName": "Phòng Kỹ thuật & Công nghệ",
    "location": "Tầng 4 - Tòa nhà A",
    "phone": "0208-3846-001",
    "description": "Nghiên cứu, phát triển ứng dụng",
    "isActive": true,
    "employeeCount": 3,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  "timestamp": "2026-10-14T11:50:00.000Z"
}
```

- **Lỗi `400 Bad Request`:** Nếu `id` không phải số nguyên dương (`{ "errorCode": "INVALID_ID" }`).
- **Lỗi `404 Not Found`:** Nếu không tìm thấy phòng ban (`{ "errorCode": "DEPARTMENT_NOT_FOUND" }`).

---

### 4.4. `POST /api/departments` — Thêm mới phòng ban

- **Mô tả:** Khởi tạo phòng ban mới trong tổ chức.
- **Quyền:** `ADMIN`, `HR_MANAGER`
- **Request Body:**

```json
{
  "departmentName": "Phòng Công nghệ thông tin",
  "departmentCode": "PB-CNTT",
  "location": "Tầng 4 - Tòa nhà Công nghệ",
  "phone": "0208-3846-999",
  "description": "Phụ trách hạ tầng và chuyển đổi số",
  "isActive": true
}
```

> **Ghi chú tự động sinh mã:** Nếu client không truyền `departmentCode`, hệ thống tự động sinh mã từ tên phòng ban (ví dụ: *"Phòng Công nghệ thông tin"* $\rightarrow$ `PB-CNTT`) và bảo đảm tính duy nhất.

- **Response `201 Created`:**

```json
{
  "success": true,
  "status": "success",
  "statusCode": 201,
  "message": "Tạo phòng ban mới thành công",
  "data": {
    "id": 4,
    "departmentId": 4,
    "departmentCode": "PB-CNTT",
    "departmentName": "Phòng Công nghệ thông tin",
    "location": "Tầng 4 - Tòa nhà Công nghệ",
    "phone": "0208-3846-999",
    "description": "Phụ trách hạ tầng và chuyển đổi số",
    "isActive": true,
    "employeeCount": 0,
    "createdAt": "2026-10-14T11:50:00.000Z",
    "updatedAt": "2026-10-14T11:50:00.000Z"
  },
  "timestamp": "2026-10-14T11:50:00.000Z"
}
```

- **Lỗi `400 Bad Request`:** Thiếu `departmentName` hoặc vượt quá 100 ký tự.
- **Lỗi `409 Conflict`:** Trùng tên phòng ban (`DUPLICATE_DEPARTMENT_NAME`) hoặc trùng mã phòng ban (`DUPLICATE_DEPARTMENT_CODE`).

---

### 4.5. `PUT /api/departments/:id` — Cập nhật phòng ban

- **Mô tả:** Chỉnh sửa thông tin phòng ban hiện có.
- **Quyền:** `ADMIN`, `HR_MANAGER`
- **Request Body (Hỗ trợ cập nhật một phần hoặc toàn bộ):**

```json
{
  "departmentName": "Phòng Chuyển đổi số & CNTT",
  "location": "Tầng 5 - Tòa nhà Công nghệ",
  "phone": "0208-3846-888"
}
```

- **Response `200 OK`:**

```json
{
  "success": true,
  "status": "success",
  "statusCode": 200,
  "message": "Cập nhật phòng ban thành công",
  "data": {
    "id": 4,
    "departmentId": 4,
    "departmentCode": "PB-CNTT",
    "departmentName": "Phòng Chuyển đổi số & CNTT",
    "location": "Tầng 5 - Tòa nhà Công nghệ",
    "phone": "0208-3846-888",
    "description": "Phụ trách hạ tầng và chuyển đổi số",
    "isActive": true,
    "employeeCount": 0,
    "createdAt": "2026-10-14T11:50:00.000Z",
    "updatedAt": "2026-10-14T11:51:00.000Z"
  },
  "timestamp": "2026-10-14T11:51:00.000Z"
}
```

- **Lỗi `409 Conflict`:** Nếu tên mới hoặc mã mới bị trùng với phòng ban khác trong hệ thống.

---

### 4.6. `DELETE /api/departments/:id` — Xóa phòng ban

- **Mô tả:** Xóa phòng ban khỏi hệ thống khi đã thỏa mãn nghiêm ngặt ràng buộc toàn vẹn dữ liệu.
- **Quyền:** `ADMIN` (Role `HR_MANAGER` và `EMPLOYEE` bị từ chối với `403 Forbidden`).
- **Luồng xử lý bắt buộc & Ràng buộc nghiệp vụ:**
  1. Xác thực JWT Token và RBAC: Kiểm tra quyền quản trị tối cao (`ADMIN`).
  2. Kiểm tra `id` là số nguyên dương hợp lệ (`400 Bad Request` nếu sai định dạng).
  3. Kiểm tra phòng ban có tồn tại trong CSDL hay không (`404 Not Found` nếu không tìm thấy).
  4. Kiểm tra sự tồn tại của nhân viên tham chiếu (`SELECT EXISTS (SELECT 1 FROM employees WHERE department_id = ?)`):
     - Bao gồm tất cả nhân viên (kể cả nhân viên đã nghỉ việc `Resigned` nếu vẫn còn liên kết trong bảng `employees`).
     - Nếu có nhân viên: Dừng thao tác ngay lập tức và trả về `409 Conflict`. Tuyệt đối không tự động chuyển hoặc xóa nhân viên.
  5. Bảo đảm an toàn dữ liệu khi có request đồng thời (Concurrency Safety):
     - Sử dụng Transaction và khóa bi quan hàng: `SELECT * FROM departments WHERE department_id = ? FOR UPDATE`.
     - Giữ nguyên ràng buộc khóa ngoại CSDL InnoDB: `CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT`.
     - Nếu phát sinh lỗi vi phạm khóa ngoại CSDL (`ER_ROW_IS_REFERENCED_2` / Error 1451), hệ thống tự động rollback và chuẩn hóa về response `409 Conflict`, không để lộ stack trace hoặc cấu trúc SQL ra bên ngoài.

#### Response trường hợp 1: Xóa thành công `200 OK`

```json
{
  "success": true,
  "status": "success",
  "statusCode": 200,
  "message": "Xóa phòng ban thành công",
  "data": {
    "success": true,
    "departmentId": 3,
    "departmentName": "Phòng Dự án Thử nghiệm",
    "type": "HARD_DELETE",
    "message": "Xóa phòng ban thành công"
  },
  "timestamp": "2026-10-14T11:52:00.000Z"
}
```

#### Response trường hợp 2: Phòng ban đang có nhân viên trực thuộc `409 Conflict`

```json
{
  "success": false,
  "status": "error",
  "statusCode": 409,
  "code": "DEPARTMENT_HAS_EMPLOYEES",
  "errorCode": "DEPARTMENT_HAS_EMPLOYEES",
  "message": "Không thể xóa phòng ban vì vẫn còn nhân viên trực thuộc.",
  "timestamp": "2026-10-14T11:52:00.000Z"
}
```

#### Response trường hợp 3: Không tìm thấy phòng ban `404 Not Found`

```json
{
  "success": false,
  "status": "error",
  "statusCode": 404,
  "code": "DEPARTMENT_NOT_FOUND",
  "errorCode": "DEPARTMENT_NOT_FOUND",
  "message": "Không tìm thấy phòng ban.",
  "timestamp": "2026-10-14T11:52:00.000Z"
}
```

#### Response trường hợp 4: ID sai định dạng `400 Bad Request`

```json
{
  "success": false,
  "status": "error",
  "statusCode": 400,
  "code": "INVALID_ID",
  "errorCode": "INVALID_ID",
  "message": "ID phòng ban không hợp lệ. ID phải là số nguyên dương lớn hơn 0.",
  "timestamp": "2026-10-14T11:52:00.000Z"
}
```

#### Response trường hợp 5: Phân quyền & Xác thực

- `401 Unauthorized`: Thiếu Authorization Header hoặc Token không hợp lệ (`errorCode: "TOKEN_REQUIRED"` hoặc `"INVALID_TOKEN"`).
- `403 Forbidden`: Người dùng đã đăng nhập nhưng không có vai trò `ADMIN` (`errorCode: "FORBIDDEN"`).


---

## 5. Hướng dẫn chạy kiểm thử tự động (Test Suite)

Dự án cung cấp bộ kiểm thử tự động gồm 16 test case độc lập:

```bash
cd backend

# Chạy riêng bộ kiểm thử Department CRUD
npm run test:department

# Chạy toàn bộ kiểm thử hệ thống (Syntax, Auth, RBAC, Department)
npm test
```

Ngoài ra, nhà phát triển có thể dùng file [`backend/tests/department.http`](file:///d:/QLNS_QLTKPM/backend/tests/department.http) trên VS Code Extension REST Client để chạy trực tiếp từng request với token tự động trích xuất.
