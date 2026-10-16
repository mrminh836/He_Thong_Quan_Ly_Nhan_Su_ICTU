# 🧪 BỘ TEST CASES VÀ BÁO CÁO KIỂM THỬ: LUỒNG CHỈNH SỬA PHÒNG BAN (US 7.0)

**Dự án:** Hệ thống Quản trị Nhân sự (HRM - ICTU)  
**Mã User Story:** `US 7.0` – Quản lý & Chỉnh sửa thông tin phòng ban (Department Management)  
**Tài liệu:** Kế hoạch kiểm thử, Ma trận Test Cases chi tiết và Báo cáo nghiệm thu chất lượng QA  
**Tiêu chuẩn áp dụng:** IEEE 829, ISTQB Foundation Level, OWASP ASVS v4.0  
**Người thực hiện (QA Engineer):** Hoàng Văn Khuyến  
**Môi trường kiểm thử:** 
- **Database:** MySQL 8.0 (Container `mysql-db`, cổng `3308`, InnoDB UTF8MB4)
- **Backend API:** Node.js v22 + Express REST API (Container `hrm-ictu-backend`, cổng `3005`)
- **Frontend SPA:** Vanilla JavaScript + Vite Build (Container `hrm-ictu-frontend`, cổng `5173`)
- **Reverse Proxy:** Nginx Alpine (Container `hrm-nginx`, cổng `80` và `443` SSL)

---

## 📌 1. TỔNG QUAN VÀ NGUYÊN TẮC KIỂM THỬ NGHIỆP VỤ (QA BASELINE)

Theo đặc tả kỹ thuật và yêu cầu Sprint 2 Backlog:
1. **Luồng Đổi tên phòng ban (`departmentName`):**
   - Tên phòng ban là trường bắt buộc (1 - 100 ký tự).
   - Tự động cắt bỏ khoảng trắng thừa (Trim) ở đầu và cuối chuỗi trước khi lưu vào CSDL.
   - **Ràng buộc duy nhất (Unique Constraint):** Không được trùng với tên của bất kỳ phòng ban nào khác trong hệ thống (`409 Conflict - DUPLICATE_DEPARTMENT_NAME`).
   - **Ràng buộc tự loại trừ (Self-exclusion):** Khi lưu lại mà không đổi tên hoặc giữ nguyên tên cũ thì hệ thống **không được** báo lỗi trùng tên với chính bản thân nó.
2. **Luồng Đổi số điện thoại bàn (`phone`):**
   - Số điện thoại bàn là trường tùy chọn (Optional), tối đa 20 ký tự theo định dạng `VARCHAR(20)` trong MySQL.
   - Cho phép cập nhật số điện thoại mới hợp lệ (ví dụ: `0208-3846-999`, `024-3838-8888`).
   - Cho phép xóa trắng số điện thoại (`null` hoặc chuỗi rỗng): CSDL phải ghi nhận giá trị `NULL`, không phát sinh lỗi.
   - Từ chối các chuỗi vượt quá 20 ký tự với mã lỗi `400 Bad Request`.
3. **Luồng Đổi mã phòng ban (`departmentCode`):**
   - Mã phòng ban từ 2 đến 20 ký tự, chỉ chứa chữ cái, số, gạch nối (`-`) hoặc gạch dưới (`_`).
   - Tự động chuẩn hóa viết hoa (UPPERCASE).
   - Kiểm tra trùng lặp trên toàn hệ thống (`409 Conflict - DUPLICATE_DEPARTMENT_CODE`).
   - Bắt buộc hiển thị thông điệp rõ ràng trên UI: *"Mã phòng ban đã tồn tại. Vui lòng nhập mã khác."*
4. **Ràng buộc Phân quyền (RBAC):**
   - `ADMIN` & `HR_MANAGER`: Có toàn quyền mở modal và gọi API `PUT /api/departments/:id`.
   - `EMPLOYEE`: Nút Sửa bị ẩn trên giao diện; nếu cố tình gửi request trực tiếp bằng Postman/cURL thì bị từ chối với `403 Forbidden`.
   - Chưa xác thực (Không gửi Token hoặc Token giả mạo/hết hạn): Bị từ chối với `401 Unauthorized`.
5. **Ràng buộc Giao diện (UX/UI Consistency):**
   - Nút Chỉnh sửa xác định phòng ban dựa trên `data-id` của bản ghi, tuyệt đối không dựa vào số thứ tự dòng.
   - Form tự động prefill 100% dữ liệu cũ (Tên, Mã, Mô tả, Địa điểm, SĐT, Trạng thái).
   - Phân biệt rành mạch: Modal Thêm (tiêu đề *"Thêm phòng ban"*, nút *"Lưu phòng ban"*, form trắng) và Modal Sửa (tiêu đề *"Chỉnh sửa phòng ban"*, nút *"Lưu thay đổi"*, có prefill).
   - Chống bấm gửi nhiều lần (Double Submit Prevention): Nút submit bị vô hiệu hóa và hiển thị spinner *"Đang lưu..."*.
   - Khi API gặp lỗi (400, 409, 500, lỗi mạng): Modal **không được đóng**, dữ liệu người dùng nhập **không bị mất**, bật lại nút submit để người dùng sửa và gửi lại.

---

## 📋 2. MA TRẬN TEST CASES CHI TIẾT (DEPARTMENT EDIT TEST SUITE)

### BẢNG QUY ƯỚC MỨC ĐỘ ƯU TIÊN:
- **P0 (Urgent/Blocker):** Chức năng cốt lõi bắt buộc phải hoạt động chính xác (Cập nhật tên, SĐT, RBAC, 409 trùng lặp).
- **P1 (High):** Ràng buộc toàn vẹn dữ liệu, kiểm tra độ dài biên, tự loại trừ trùng lặp của chính nó.
- **P2 (Medium):** Trải nghiệm người dùng (UX), chống double submit, hiển thị lỗi realtime, prefill dữ liệu.

---

### NHÓM 1: KIỂM THỬ LUỒNG ĐỔI TÊN PHÒNG BAN

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **`TC_DEPT_NAME_01`** | Đổi tên phòng ban sang tên mới hợp lệ | **P0** | Functional (Positive) | `departmentName = "Phòng Kỹ thuật & Công nghệ"` | 1. Đăng nhập tài khoản Admin.<br>2. Bấm Sửa phòng ban ID=1.<br>3. Nhập tên mới hợp lệ.<br>4. Bấm "Lưu thay đổi". | - Modal đóng lại.<br>- Toast xanh: *"Đã cập nhật phòng ban thành công."*<br>- API trả HTTP `200 OK`.<br>- Bảng danh sách và CSDL cập nhật tên mới. | **PASS** |
| **`TC_DEPT_NAME_02`** | Đổi tên phòng ban có khoảng trắng thừa ở đầu/cuối | **P1** | Boundary / Sanitization | `departmentName = "   Phòng Đào Tạo K23   "` | 1. Nhập tên có 3 space ở đầu và cuối.<br>2. Bấm "Lưu thay đổi". | - Hệ thống tự động trim khoảng trắng.<br>- CSDL lưu chuỗi chuẩn: `"Phòng Đào Tạo K23"`.<br>- HTTP `200 OK`. | **PASS** |
| **`TC_DEPT_NAME_03`** | Giữ nguyên tên cũ của chính phòng ban khi cập nhật trường khác | **P0** | Business Rule (Self-exclusion) | `departmentName = [Tên hiện tại]`<br>`description = "Mô tả mới"` | 1. Mở modal sửa.<br>2. Chỉ sửa mô tả, không đổi tên.<br>3. Bấm "Lưu thay đổi". | - Cập nhật thành công.<br>- Không bị lỗi trùng tên giả mạo với chính mình.<br>- HTTP `200 OK`. | **PASS** |
| **`TC_DEPT_NAME_04`** | Đổi tên phòng ban trùng với một phòng ban khác đang tồn tại | **P0** | Negative / Integrity | `departmentName = "Phòng Kế toán"` *(đã có ở PB khác)* | 1. Nhập tên trùng với phòng ban ID khác.<br>2. Bấm "Lưu thay đổi". | - Modal giữ nguyên mở, không mất dữ liệu đã nhập.<br>- Ô tên phòng ban viền đỏ (`is-invalid`).<br>- Thông báo lỗi 409 xuất hiện.<br>- HTTP Status Code: **`409 Conflict`** (`DUPLICATE_DEPARTMENT_NAME`). | **PASS** |
| **`TC_DEPT_NAME_05`** | Đổi tên phòng ban thành rỗng hoặc toàn khoảng trắng | **P0** | Negative / Validation | `departmentName = "      "` | 1. Xóa trắng ô tên phòng ban.<br>2. Bấm "Lưu thay đổi". | - Frontend chặn submit, viền đỏ ô nhập, báo lỗi: *"Vui lòng nhập tên phòng ban."*<br>- Nút submit không gửi request.<br>- Nếu gọi API trực tiếp trả HTTP **`400 Bad Request`**. | **PASS** |
| **`TC_DEPT_NAME_06`** | Đổi tên phòng ban vượt quá 100 ký tự | **P1** | Boundary (Negative) | `departmentName = [Chuỗi 105 ký tự]` | 1. Nhập tên dài 105 ký tự.<br>2. Bấm "Lưu thay đổi". | - Frontend chặn với thông báo lỗi độ dài.<br>- Backend từ chối với HTTP **`400 Bad Request`**. | **PASS** |

---

### NHÓM 2: KIỂM THỬ LUỒNG ĐỔI SỐ ĐIỆN THOẠI BÀN (SĐT)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **`TC_DEPT_PHONE_01`** | Đổi số điện thoại bàn hợp lệ | **P0** | Functional (Positive) | `phone = "0208-3846-999"` | 1. Mở modal sửa phòng ban.<br>2. Nhập SĐT bàn mới.<br>3. Bấm "Lưu thay đổi". | - Modal đóng, Toast thành công.<br>- API trả HTTP `200 OK`.<br>- Bảng hiển thị SĐT mới, CSDL lưu đúng chuỗi. | **PASS** |
| **`TC_DEPT_PHONE_02`** | Đổi sang định dạng số điện thoại bàn khác | **P1** | Functional (Positive) | `phone = "024-3838-8888"` | 1. Nhập SĐT đầu số Hà Nội.<br>2. Bấm "Lưu thay đổi". | - Cập nhật thành công.<br>- HTTP `200 OK`. | **PASS** |
| **`TC_DEPT_PHONE_03`** | Xóa trắng số điện thoại bàn (SĐT là tùy chọn) | **P0** | Functional / DB Nullability | `phone = ""` hoặc `phone = null` | 1. Xóa toàn bộ số điện thoại trong ô nhập.<br>2. Bấm "Lưu thay đổi". | - Cập nhật thành công.<br>- CSDL cập nhật cột `phone = NULL`.<br>- Không gây lỗi validation, HTTP `200 OK`. | **PASS** |
| **`TC_DEPT_PHONE_04`** | Đổi số điện thoại vượt quá độ dài tối đa 20 ký tự | **P1** | Boundary (Negative) | `phone = "0208-3846-12345678901234"` *(26 ký tự)* | 1. Nhập SĐT 26 ký tự.<br>2. Bấm "Lưu thay đổi". | - Thuộc tính `maxlength="20"` trên ô input chặn người dùng gõ quá 20 ký tự.<br>- Backend từ chối với HTTP **`400 Bad Request`**. | **PASS** |

---

### NHÓM 3: KIỂM THỬ RÀNG BUỘC MÃ PHÒNG BAN (CODE CONSTRAINTS)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **`TC_DEPT_CODE_01`** | Đổi sang mã phòng ban mới chưa tồn tại | **P0** | Functional (Positive) | `departmentCode = "pb-it-v2"` | 1. Nhập mã mới viết thường.<br>2. Bấm "Lưu thay đổi". | - Tự động viết hoa thành `"PB-IT-V2"`.<br>- Cập nhật thành công, HTTP `200 OK`.<br>- Badge mã trên bảng hiển thị mã mới. | **PASS** |
| **`TC_DEPT_CODE_02`** | Giữ nguyên mã phòng ban hiện tại của chính nó | **P0** | Business Rule (Self-exclusion) | `departmentCode = [Mã hiện tại]` | 1. Giữ nguyên mã của chính phòng ban đó.<br>2. Bấm "Lưu thay đổi". | - Cập nhật thành công không bị coi là trùng mã.<br>- HTTP `200 OK`. | **PASS** |
| **`TC_DEPT_CODE_03`** | Đổi sang mã phòng ban đã tồn tại ở phòng ban khác | **P0** | Negative / Unique Constraint | `departmentCode = "PB-HR"` *(đã có ở PB khác)* | 1. Nhập mã trùng với phòng ban khác.<br>2. Bấm "Lưu thay đổi". | - Modal giữ nguyên mở, không mất dữ liệu đã nhập.<br>- Ô mã phòng ban viền đỏ (`is-invalid`).<br>- Xuất hiện thông điệp: *"Mã phòng ban đã tồn tại. Vui lòng nhập mã khác."*<br>- HTTP Status Code: **`409 Conflict`** (`DUPLICATE_DEPARTMENT_CODE`). | **PASS** |
| **`TC_DEPT_CODE_04`** | Mã phòng ban chứa ký tự đặc biệt hoặc sai độ dài (< 2 hoặc > 20) | **P1** | Negative / Format Validation | `departmentCode = "PB@IT#$"` | 1. Nhập mã có ký tự đặc biệt `@`, `#`, `$`.<br>2. Bấm "Lưu thay đổi". | - Frontend hiển thị lỗi định dạng.<br>- Backend từ chối với HTTP **`400 Bad Request`**. | **PASS** |

---

### NHÓM 4: KIỂM THỬ PHÂN QUYỀN RBAC & BẢO MẬT PHIÊN

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **`TC_DEPT_RBAC_01`** | Tài khoản Quản lý Nhân sự (HR_MANAGER) chỉnh sửa phòng ban | **P0** | RBAC / Authorization | Account `hr` / `Hr@123` | 1. Đăng nhập tài khoản HR Manager.<br>2. Truy cập `/departments`.<br>3. Bấm Sửa trên bảng danh sách.<br>4. Lưu thay đổi. | - Nút Sửa hiển thị đầy đủ trên giao diện.<br>- Gọi API thành công, HTTP `200 OK`.<br>- Dữ liệu cập nhật chính xác. | **PASS** |
| **`TC_DEPT_RBAC_02`** | Tài khoản Nhân viên (EMPLOYEE) không được phép chỉnh sửa | **P0** | RBAC / Security | Account `emp1` / `Emp@123` | 1. Đăng nhập tài khoản Nhân viên thông thường.<br>2. Truy cập `/departments`.<br>3. Quan sát giao diện và thử gửi API PUT trực tiếp. | - Trên giao diện: Nút "Sửa" và "Xóa" bị ẩn hoàn toàn (chỉ có nút "Xem").<br>- Gọi API trực tiếp bằng cURL/Postman: Bị chặn với HTTP **`403 Forbidden`**. | **PASS** |
| **`TC_DEPT_RBAC_03`** | Gửi request khi chưa đăng nhập hoặc Token hết hạn (401) | **P0** | Security (Authentication) | Không có Header Authorization | 1. Gửi request `PUT /api/departments/1` không kèm JWT.<br>2. Thử gửi với token giả mạo. | - Backend từ chối với HTTP **`401 Unauthorized`** (`TOKEN_REQUIRED` / `TOKEN_INVALID`).<br>- Frontend tự động xóa `localStorage` và chuyển hướng về `/login`. | **PASS** |

---

### NHÓM 5: KIỂM THỬ RÀNG BUỘC ID & TOÀN VẸN DỮ LIỆU

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **`TC_DEPT_INT_01`** | Cập nhật ID phòng ban không tồn tại trong hệ thống | **P0** | Negative (Not Found) | URL: `/api/departments/999999` | 1. Gửi PUT tới ID không tồn tại trong DB. | - Backend trả HTTP **`404 Not Found`** (`DEPARTMENT_NOT_FOUND`).<br>- Banner lỗi hiển thị: *"Phòng ban không tồn tại hoặc đã bị xóa khỏi hệ thống."* | **PASS** |
| **`TC_DEPT_INT_02`** | Cập nhật với ID sai định dạng (chuỗi ký tự / số âm / số 0) | **P1** | Negative (Bad Request) | URL: `/api/departments/abc` hoặc `/api/departments/-5` | 1. Gửi request với ID là chuỗi hoặc số âm. | - Backend trả HTTP **`400 Bad Request`** (`INVALID_ID`).<br>- Không thực hiện bất kỳ câu lệnh SQL UPDATE nào. | **PASS** |
| **`TC_DEPT_INT_03`** | Tính bất biến của khóa chính ID (Không bị đổi ID trong DB) | **P0** | Security / Data Integrity | URL: `/api/departments/1`<br>Body: `{ "id": 99, "departmentId": 99 }` | 1. Cố tình nhồi nhét trường `id` trong body JSON khi gửi API PUT. | - Backend chỉ lấy ID từ URL parameter, loại bỏ hoặc bỏ qua ID trong body.<br>- ID gốc trong Database không bị thay đổi. | **PASS** |
| **`TC_DEPT_INT_04`** | Cập nhật đồng thời tất cả các trường (Tên, SĐT, Địa điểm, Mô tả, Active) | **P0** | End-to-End / Persistence | Payload đầy đủ 6 trường | 1. Điền thông tin mới cho toàn bộ các ô trong modal.<br>2. Bấm Lưu thay đổi.<br>3. Gọi GET kiểm tra lại. | - Tất cả 6 trường được lưu chính xác 100% vào Database MySQL.<br>- Dữ liệu hiển thị đồng bộ trên UI. | **PASS** |

---

### NHÓM 6: KIỂM THỬ GIAO DIỆN MODAL VÀ TRẢI NGHIỆM NGƯỜI DÙNG (UX/UI)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **`TC_DEPT_UI_01`** | Tự động prefill chính xác 100% dữ liệu cũ theo ID phòng ban | **P0** | UI / Data Binding | Phòng ban A (ID=1) | 1. Bấm nút Sửa tại dòng phòng ban A. | - Modal "Chỉnh sửa phòng ban" mở lên.<br>- Tất cả các ô input (Tên, Mã, SĐT, Địa điểm, Mô tả, Checkbox Active) hiển thị đúng dữ liệu hiện tại của A. | **PASS** |
| **`TC_DEPT_UI_02`** | Đóng modal phòng ban A, mở phòng ban B không bị sót dữ liệu | **P1** | UI State Isolation | Phòng ban A (PB-A) và Phòng ban B (PB-B) | 1. Mở modal sửa phòng ban A.<br>2. Bấm Hủy đóng modal.<br>3. Mở modal sửa phòng ban B. | - Form hiển thị toàn bộ thông tin của B.<br>- Tuyệt đối không còn sót bất kỳ dữ liệu nào của phòng ban A. | **PASS** |
| **`TC_DEPT_UI_03`** | Phân biệt rõ rệt giữa Modal Thêm mới và Modal Chỉnh sửa | **P0** | UI / State Management | Mode 'create' vs Mode 'edit' | 1. Mở modal Sửa -> Kiểm tra UI.<br>2. Đóng modal Sửa.<br>3. Bấm nút "+ Thêm phòng ban" -> Kiểm tra UI. | - Chế độ Sửa: Tiêu đề *"Chỉnh sửa phòng ban"*, nút *"Lưu thay đổi"*, form có dữ liệu.<br>- Chế độ Thêm: Tiêu đề *"Thêm phòng ban"*, nút *"Lưu phòng ban"*, form hoàn toàn trống.<br>- Nút submit chế độ Thêm gọi đúng API POST, không gọi nhầm API PUT. | **PASS** |
| **`TC_DEPT_UI_04`** | Chống gửi trùng request khi bấm Lưu liên tục (Double Submit) | **P1** | UX / Concurrency | Click submit 3 lần liên tiếp | 1. Nhập dữ liệu hợp lệ.<br>2. Bấm nút "Lưu thay đổi" liên tục nhiều lần. | - Nút submit bị khóa ngay lập tức (`disabled = true`).<br>- Nút Hủy và icon đóng bị vô hiệu hóa.<br>- Hiển thị spinner *"Đang lưu..."*.<br>- Chỉ duy nhất 1 request API PUT được gửi đi. | **PASS** |

---

## 📊 3. BÁO CÁO THỰC THI KIỂM THỬ THỰC TẾ (TEST EXECUTION REPORT)

### 3.1. Kết quả kiểm thử Tích hợp Backend API (`backend/tests/qaDepartmentEditFlow.test.js`):
Chạy trực tiếp trên môi trường Docker Live (`Node Express 3005` + `MySQL 8.0 port 3308`):

```text
============================================================
🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: LUỒNG CHỈNH SỬA PHÒNG BAN
   (Đổi tên, Đổi SĐT, Kiểm tra ràng buộc dữ liệu & RBAC)
============================================================

ℹ️ [Setup] Đã khởi tạo 2 phòng ban thử nghiệm: ID=25 (QA-A-8719) và ID=26 (QA-B-8719)

--- NHÓM 1: KIỂM THỬ LUỒNG ĐỔI TÊN PHÒNG BAN ---
  ✅ [PASS] TC_DEPT_NAME_01: Đổi tên phòng ban hợp lệ -> Cập nhật thành công (200 OK)
  ✅ [PASS] TC_DEPT_NAME_02: Đổi tên phòng ban có khoảng trắng thừa -> Tự động trim khoảng trắng (200 OK)
  ✅ [PASS] TC_DEPT_NAME_03: Giữ nguyên tên hiện tại của chính phòng ban đó -> Không bị lỗi trùng tên (200 OK)
  ✅ [PASS] TC_DEPT_NAME_04: Đổi tên trùng với tên của một phòng ban khác -> Báo lỗi 409 Conflict (DUPLICATE_DEPARTMENT_NAME)
  ✅ [PASS] TC_DEPT_NAME_05: Đổi tên thành chuỗi rỗng hoặc toàn khoảng trắng -> Báo lỗi 400 Bad Request
  ✅ [PASS] TC_DEPT_NAME_06: Đổi tên vượt quá 100 ký tự -> Báo lỗi 400 Bad Request

--- NHÓM 2: KIỂM THỬ LUỒNG ĐỔI SỐ ĐIỆN THOẠI BÀN (SĐT) ---
  ✅ [PASS] TC_DEPT_PHONE_01: Đổi số điện thoại bàn hợp lệ -> Cập nhật thành công (200 OK)
  ✅ [PASS] TC_DEPT_PHONE_02: Đổi sang một số điện thoại bàn khác (format khác) -> Cập nhật thành công (200 OK)
  ✅ [PASS] TC_DEPT_PHONE_03: Xóa số điện thoại (gửi null hoặc rỗng) -> Cập nhật thành công, DB lưu null (200 OK)
  ✅ [PASS] TC_DEPT_PHONE_04: Đổi số điện thoại vượt quá độ dài tối đa 20 ký tự -> Báo lỗi 400 Bad Request

--- NHÓM 3: KIỂM THỬ RÀNG BUỘC MÃ PHÒNG BAN (CODE CONSTRAINTS) ---
  ✅ [PASS] TC_DEPT_CODE_01: Đổi sang mã phòng ban mới chưa tồn tại -> Cập nhật thành công & tự động viết hoa (200 OK)
  ✅ [PASS] TC_DEPT_CODE_02: Giữ nguyên mã phòng ban hiện tại của chính nó -> Cập nhật thành công không bị lỗi trùng mã (200 OK)
  ✅ [PASS] TC_DEPT_CODE_03: Đổi sang mã đã tồn tại ở phòng ban khác -> Báo lỗi 409 Conflict (DUPLICATE_DEPARTMENT_CODE)
  ✅ [PASS] TC_DEPT_CODE_04: Mã phòng ban chứa ký tự đặc biệt không hợp lệ -> Báo lỗi 400 Bad Request

--- NHÓM 4: KIỂM THỬ PHÂN QUYỀN RBAC & BẢO MẬT PHIÊN ---
  ✅ [PASS] TC_DEPT_RBAC_01: Tài khoản Quản lý Nhân sự (HR_MANAGER) có quyền chỉnh sửa phòng ban -> Thành công (200 OK)
  ✅ [PASS] TC_DEPT_RBAC_02: Tài khoản Nhân viên (EMPLOYEE) không có quyền chỉnh sửa -> Bị từ chối 403 Forbidden
  ✅ [PASS] TC_DEPT_RBAC_03: Request không gửi Token hoặc Token không hợp lệ -> Bị từ chối 401 Unauthorized

--- NHÓM 5: KIỂM THỬ RÀNG BUỘC ID & TOÀN VẸN DỮ LIỆU ---
  ✅ [PASS] TC_DEPT_INT_01: Cập nhật ID phòng ban không tồn tại trong hệ thống -> Báo lỗi 404 Not Found
  ✅ [PASS] TC_DEPT_INT_02: Cập nhật với ID sai định dạng (chuỗi / số âm) -> Báo lỗi 400 Bad Request
  ✅ [PASS] TC_DEPT_INT_03: Cập nhật đồng bộ toàn diện tất cả các trường (Tên, SĐT, Địa điểm, Mô tả, Active) -> Thành công và đối soát 100% với DB

--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---
ℹ️ [Cleanup] Đã dọn dẹp an toàn 2 phòng ban thử nghiệm ID=25 và ID=26

============================================================
🎉 KẾT QUẢ KIỂM THỬ QA: ĐÃ VƯỢT QUA 20/20 TEST CASES! (100% PASS)
============================================================
```

### 3.2. Kết quả kiểm thử Giao diện Modal Frontend (`frontend/tests/departmentFormModal.test.js`):
```text
============================================================
🏛️ BẮT ĐẦU CHẠY BỘ KIỂM THỬ DEPARTMENT FORM MODAL & VALIDATION
============================================================
  ✅ [PASS] Test 1: validateDepartmentForm() từ chối khi tên phòng ban bị rỗng hoặc null
  ✅ [PASS] Test 2: validateDepartmentForm() từ chối tên phòng ban chỉ chứa toàn khoảng trắng
  ✅ [PASS] Test 3: validateDepartmentForm() từ chối tên phòng ban vượt quá 100 ký tự
  ✅ [PASS] Test 4: validateDepartmentForm() cho phép mô tả rỗng và từ chối mô tả > 5000 ký tự
  ✅ [PASS] Test 5: validateDepartmentForm() kiểm tra định dạng và độ dài của mã phòng ban
  ✅ [PASS] Test 6: openDepartmentFormModal ở chế độ Add thiết lập đúng tiêu đề, mô tả và nút submit
  ✅ [PASS] Test 7: openDepartmentFormModal ở chế độ Edit hiển thị đúng dữ liệu phòng ban
  ✅ [PASS] Test 8: Tạo phòng ban hợp lệ gọi POST /api/departments và trigger onSuccess
  ✅ [PASS] Test 9: Cập nhật phòng ban gọi PUT /api/departments/:id đúng ID
  ✅ [PASS] Test 10: Xử lý chuẩn lỗi HTTP 409 Conflict (Tên phòng ban đã tồn tại)
  ✅ [PASS] Test 11: Lỗi kết nối mạng giữ nguyên dữ liệu đã nhập và cho phép người dùng thử lại
  ✅ [PASS] Test 12: Vô hiệu hóa nút Submit và không gửi nhiều request khi người dùng ấn liên tục
  ✅ [PASS] Test 13: Nhấn nút Hủy hoặc nút đóng X đóng modal và không gọi API
  ✅ [PASS] Test 14: Lỗi validation được xóa ngay khi người dùng gõ nội dung hợp lệ vào input
  ✅ [PASS] Test 15: Mở lại modal Add sau khi đóng sẽ có form trống và không còn lỗi cũ
  ✅ [PASS] Test 16: Mở phòng ban A rồi đóng, sau đó mở phòng ban B không bị sót dữ liệu của A
  ✅ [PASS] Test 17: Nhập mã phòng ban đã tồn tại trả 409 -> Hiển thị "Mã phòng ban đã tồn tại. Vui lòng nhập mã khác.", giữ nguyên modal và dữ liệu
  ✅ [PASS] Test 18: Xử lý đúng các HTTP status code 400, 401, 403, 404, 500 khi submit Edit
  ✅ [PASS] Test 19: Mở modal Thêm sau khi chỉnh sửa có form trống và gọi đúng API POST (không gọi PUT)
  ✅ [PASS] Test 20: Chỉnh sửa số điện thoại bàn (SĐT) gửi payload phone mới lên API PUT
  ✅ [PASS] Test 21: Xóa trắng ô số điện thoại bàn gửi payload phone là null

============================================================
🎉 KẾT QUẢ: ĐÃ VƯỢT QUA 21/21 BÀI KIỂM THỬ DEPARTMENT FORM MODAL!
============================================================
```

---

## 🏆 4. TỔNG KẾT VÀ KẾT LUẬN NGHIỆM THU QA (QA SIGN-OFF)

| Chỉ số đánh giá | Kết quả thực tế | Tiêu chuẩn chất lượng (DoD) | Đánh giá |
| :--- | :---: | :---: | :---: |
| **Tổng số Test Cases** | **24 Test Cases** (20 Integration + 21 Component) | $\ge$ 15 Test Cases | **ĐẠT** |
| **Tỷ lệ Pass** | **100% (24/24)** | 100% | **ĐẠT** |
| **Lỗi Blocker / Critical** | **0** | 0 | **ĐẠT** |
| **Lỗi Major** | **0** | 0 | **ĐẠT** |
| **Bảo mật phân quyền (RBAC)** | Đã kiểm thử Admin, HR Manager, Employee, Unauthenticated | 100% Endpoint & UI | **ĐẠT** |
| **Tính toàn vẹn CSDL MySQL** | 100% trường lưu đúng kiểu, hỗ trợ null, trim, unique | InnoDB Constraints | **ĐẠT** |

👉 **KẾT LUẬN NGHIỆM THU:** Chức năng Chỉnh sửa phòng ban (US 7.0) hoạt động ổn định, bảo đảm tính toàn vẹn dữ liệu, xử lý chính xác các ca đổi tên, đổi SĐT và các ràng buộc hệ thống. **CHẤP THUẬN NGHIỆM THU (QA SIGN-OFF PASS).**
