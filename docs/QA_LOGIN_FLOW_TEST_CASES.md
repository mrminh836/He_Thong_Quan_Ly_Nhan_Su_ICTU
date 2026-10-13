# 🧪 BỘ TEST CASES CHI TIẾT: LUỒNG XÁC THỰC ĐĂNG NHẬP (HRM LOGIN FLOW)

**Dự án:** Hệ thống Quản trị Nhân sự (HRM - ICTU)  
**Tài liệu:** Kế hoạch và Ma trận Kiểm thử Chức năng Xác thực & Quản lý Phiên (Authentication & Session Management)  
**Tiêu chuẩn áp dụng:** IEEE 829, ISTQB Foundation Level, OWASP ASVS v4.0 (Authentication Verification Standard)  
**Đối tượng:** QA / Tester, Developer, DevOps, Giảng viên đánh giá đồ án  
**Trọng tâm kiểm thử theo yêu cầu:**
1. ❌ **Tài khoản sai** (Tài khoản không tồn tại, sai định dạng email)
2. ❌ **Mật khẩu sai** (Sai password, phân biệt hoa/thường, mật khẩu đặc biệt)
3. ⏳ **Token hết hạn** (JWT Expired, phiên làm việc kết thúc, cơ chế tự động logout an toàn)

---

## 📌 1. TỔNG QUAN VÀ NGUYÊN TẮC BẢO MẬT (SECURITY BASELINE)

Theo tiêu chuẩn bảo mật hệ thống và OWASP:
1. **Chống dò quét tài khoản (Anti-User Enumeration):**
   - Hệ thống **tuyệt đối không** thông báo tách biệt *"Tài khoản không tồn tại"* hay *"Mật khẩu không đúng"*.
   - Đối với mọi trường hợp sai tài khoản hoặc sai mật khẩu, hệ thống phải trả về cùng một thông báo chung:
     > **`"Tên đăng nhập hoặc mật khẩu không chính xác."`**
   - Mã HTTP Status chuẩn: **`401 Unauthorized`**, mã lỗi nội bộ: **`INVALID_CREDENTIALS`**.
2. **Bảo mật JWT Access Token:**
   - Token tạo bằng thuật toán mã hóa `HS256`, ký bằng `JWT_SECRET`.
   - Có thời hạn sống xác định (`expiresIn: 8h` hoặc cấu hình kiểm thử `1s - 5s`).
   - Khi token hết hạn: Backend từ chối với `401 Unauthorized` (`TOKEN_EXPIRED`), Frontend phải lập tức dọn sạch `localStorage` và điều hướng an toàn về `/login`.
3. **Mã hóa mật khẩu bằng Bcrypt:**
   - Mật khẩu lưu trong CSDL được băm với Salt Rounds = 10, không bao giờ lưu mật khẩu dạng plain-text.
   - Phản hồi từ API đăng nhập tuyệt đối không chứa trường `password` hay `password_hash`.

---

## 📋 2. MA TRẬN TEST CASES CHI TIẾT (LOGIN TEST SUITE)

### BẢNG QUY ƯỚC MỨC ĐỘ ƯU TIÊN:
- **P0 (Urgent/Blocker):** Chức năng cốt lõi bắt buộc phải hoạt động chính xác để hệ thống vận hành.
- **P1 (High):** Ca kiểm thử quan trọng về bảo mật, xử lý lỗi nghiệp vụ và toàn vẹn phiên.
- **P2 (Medium):** Kiểm tra tính hợp lệ dữ liệu giao diện (UI validation), trải nghiệm người dùng (UX).

---

### NHÓM 1: KIỂM THỬ TÀI KHOẢN SAI (INVALID USERNAME / EMAIL)

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_ERR_01`** |
| **Tiêu đề** | Đăng nhập thất bại khi nhập Tên đăng nhập (Username) không tồn tại trong CSDL |
| **Mức ưu tiên** | **P0 (Critical)** |
| **Loại kiểm thử** | Functional / Security (Negative Testing) |
| **Điều kiện tiên quyết** | Hệ thống Backend và Database MySQL đang hoạt động. Người dùng đang ở trang `/login`. |
| **Dữ liệu đầu vào** | `username = "user_khong_ton_tai_999"`<br>`password = "Admin@123"` |
| **Các bước thực hiện** | 1. Truy cập đường dẫn `http://localhost:5173/login`.<br>2. Nhập vào ô Tên đăng nhập: `user_khong_ton_tai_999`.<br>3. Nhập vào ô Mật khẩu: `Admin@123`.<br>4. Nhấn nút "Đăng nhập vào hệ thống". |
| **Kết quả mong đợi (UI)** | - Hiển thị khung Alert cảnh báo màu đỏ ở đầu form.<br>- Thông điệp: *"Tên đăng nhập hoặc mật khẩu không chính xác."*<br>- Nút bấm trở lại trạng thái sẵn sàng, không bị treo spinner.<br>- Màn hình vẫn ở lại trang `/login`, không chuyển hướng. |
| **Kết quả mong đợi (API)** | - Endpoint: `POST /api/auth/login`.<br>- HTTP Status Code: **`401 Unauthorized`**.<br>- Response JSON:<br>`{ "status": "error", "statusCode": 401, "errorCode": "INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không chính xác." }` |
| **Kết quả mong đợi (Storage)** | `localStorage.getItem('accessToken') === null`<br>`localStorage.getItem('user') === null` |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_ERR_02`** |
| **Tiêu đề** | Đăng nhập thất bại khi nhập Email không tồn tại trong hệ thống |
| **Mức ưu tiên** | **P0 (Critical)** |
| **Loại kiểm thử** | Functional / Security (Negative Testing) |
| **Điều kiện tiên quyết** | Trang `/login` sẵn sàng. Email `ghost.user@hrm.local` chưa từng được tạo trong bảng `employees`/`users`. |
| **Dữ liệu đầu vào** | `username = "ghost.user@hrm.local"`<br>`password = "SomePassword2026!"` |
| **Các bước thực hiện** | 1. Nhập `ghost.user@hrm.local` vào ô Tên đăng nhập/Email.<br>2. Nhập mật khẩu bất kỳ.<br>3. Bấm Đăng nhập. |
| **Kết quả mong đợi (UI)** | - Vượt qua bước validate định dạng email của client.<br>- Hiển thị Alert đỏ thông báo: *"Tên đăng nhập hoặc mật khẩu không chính xác."* |
| **Kết quả mong đợi (API)** | HTTP **`401 Unauthorized`**; payload trả về mã lỗi `INVALID_CREDENTIALS`. |
| **Kết quả mong đợi (Storage)** | Không lưu bất kỳ token nào vào bộ nhớ client. |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_ERR_03`** |
| **Tiêu đề** | Kiểm tra tính bảo mật chống dò quét tài khoản (Anti-User Enumeration) giữa tài khoản sai và mật khẩu sai |
| **Mức ưu tiên** | **P1 (Security Requirement)** |
| **Loại kiểm thử** | Security Audit |
| **Điều kiện tiên quyết** | Có sẵn tài khoản `admin` tồn tại và tài khoản `fake_admin` không tồn tại. |
| **Dữ liệu đầu vào** | Request A: `username = "fake_admin"`, `password = "Admin@123"`<br>Request B: `username = "admin"`, `password = "WrongPassword999!"` |
| **Các bước thực hiện** | 1. Gửi Request A và ghi nhận thông điệp lỗi + HTTP Status.<br>2. Gửi Request B và ghi nhận thông điệp lỗi + HTTP Status. |
| **Kết quả mong đợi** | - Cả 2 request đều trả về mã HTTP **`401`** giống hệt nhau.<br>- Nội dung thông báo lỗi (`message`) và `errorCode` hoàn toàn trùng khớp: `"Tên đăng nhập hoặc mật khẩu không chính xác."`.<br>- Kẻ tấn công không thể phân biệt được tài khoản nào đã tồn tại trong CSDL. |

---

### NHÓM 2: KIỂM THỬ MẬT KHẨU SAI (INVALID PASSWORD)

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_ERR_04`** |
| **Tiêu đề** | Đăng nhập thất bại khi nhập đúng Tên đăng nhập nhưng sai Mật khẩu |
| **Mức ưu tiên** | **P0 (Critical)** |
| **Loại kiểm thử** | Functional / Security (Negative Testing) |
| **Điều kiện tiên quyết** | Tài khoản `admin` tồn tại trong CSDL với mật khẩu chuẩn `Admin@123`. |
| **Dữ liệu đầu vào** | `username = "admin"`<br>`password = "SaiMatKhauHoanToan123!"` |
| **Các bước thực hiện** | 1. Nhập username `admin`.<br>2. Nhập mật khẩu `SaiMatKhauHoanToan123!`.<br>3. Bấm nút Đăng nhập. |
| **Kết quả mong đợi (UI)** | - Nút hiển thị spinner ngắn hạn trong lúc Bcrypt xử lý, sau đó quay về bình thường.<br>- Xuất hiện thông báo Alert: *"Tên đăng nhập hoặc mật khẩu không chính xác."*<br>- Ô mật khẩu vẫn giữ nguyên hoặc cho phép nhập lại, không chuyển trang. |
| **Kết quả mong đợi (API)** | - HTTP Status Code: **`401 Unauthorized`**.<br>- Thời gian phản hồi tiêu chuẩn: ~60ms – 150ms (do chi phí tính toán băm Bcrypt).<br>- `errorCode: "INVALID_CREDENTIALS"`. |
| **Kết quả mong đợi (Storage)** | Không ghi đè hoặc tạo mới `accessToken` trong `localStorage`. |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_ERR_05`** |
| **Tiêu đề** | Kiểm tra phân biệt chữ hoa/thường của Mật khẩu (Case Sensitivity) |
| **Mức ưu tiên** | **P1 (High)** |
| **Loại kiểm thử** | Functional / Boundary |
| **Điều kiện tiên quyết** | Tài khoản `admin` có mật khẩu chính xác là `Admin@123` (chữ 'A' viết hoa). |
| **Dữ liệu đầu vào** | `username = "admin"`<br>`password = "admin@123"` (toàn bộ chữ thường) |
| **Các bước thực hiện** | 1. Nhập username `admin`.<br>2. Nhập mật khẩu `admin@123`.<br>3. Bấm Đăng nhập. |
| **Kết quả mong đợi** | - Đăng nhập bị từ chối với HTTP **`401 Unauthorized`**.<br>- Hệ thống tôn trọng phân biệt chữ hoa/chữ thường nghiêm ngặt của thuật toán Bcrypt. |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_ERR_06`** |
| **Tiêu đề** | Đăng nhập thất bại khi nhập mật khẩu sai nhiều lần liên tiếp (Brute-force Throttling) |
| **Mức ưu tiên** | **P1 (Security)** |
| **Loại kiểm thử** | Security Rate Limiting |
| **Điều kiện tiên quyết** | Middleware `loginRateLimiter` đang kích hoạt với ngưỡng `15 lần / 15 phút`. |
| **Dữ liệu đầu vào** | Gửi liên tiếp 16 request đăng nhập sai mật khẩu từ cùng 1 IP. |
| **Các bước thực hiện** | 1. Dùng script gửi 15 request sai mật khẩu.<br>2. Gửi tiếp request thứ 16. |
| **Kết quả mong đợi** | - Request 1 đến 15: Trả về HTTP `401 Unauthorized`.<br>- Request thứ 16 trở đi: Trả về HTTP **`429 Too Many Requests`**.<br>- Message: *"Bạn đã thực hiện quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau X phút."* |

---

### NHÓM 3: KIỂM THỬ TOKEN HẾT HẠN & QUẢN LÝ PHIÊN (JWT EXPIRATION & SESSION)

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_JWT_01`** |
| **Tiêu đề** | Backend từ chối xử lý khi Access Token đã hết hạn sử dụng (Expired JWT) |
| **Mức ưu tiên** | **P0 (Critical Security)** |
| **Loại kiểm thử** | API Security / Session Expiration |
| **Điều kiện tiên quyết** | Tạo một JWT Token có claim `exp` ở thời điểm quá khứ (ví dụ `exp = now - 3600s`), ký đúng bí mật `JWT_SECRET`. |
| **Dữ liệu đầu vào** | Header: `Authorization: Bearer <EXPIRED_JWT_TOKEN>`<br>Gọi endpoint yêu cầu xác thực: `GET /api/auth/profile` hoặc `GET /api/rbac/admin/users`. |
| **Các bước thực hiện** | 1. Gửi request `GET /api/auth/profile` với header Bearer Token hết hạn.<br>2. Quan sát phản hồi từ máy chủ. |
| **Kết quả mong đợi (API)** | - HTTP Status Code: **`401 Unauthorized`**.<br>- Response JSON:<br>`{ "status": "error", "statusCode": 401, "errorCode": "TOKEN_EXPIRED", "message": "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại." }` |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_JWT_02`** |
| **Tiêu đề** | Frontend tự động dọn dẹp Storage và chuyển hướng về `/login` khi nhận lỗi Token hết hạn (401) |
| **Mức ưu tiên** | **P0 (Critical UI/UX)** |
| **Loại kiểm thử** | Integration / Frontend Route Guard |
| **Điều kiện tiên quyết** | Người dùng đang ở màn hình quản trị `/dashboard`, trong `localStorage` có chứa token đã hết hạn. |
| **Dữ liệu đầu vào** | Người dùng thực hiện thao tác gọi API (ví dụ F5 tải lại trang hoặc bấm nút "Làm mới"). |
| **Các bước thực hiện** | 1. Giả lập ghi token hết hạn vào `localStorage`.<br>2. Nhấn nút "Làm mới dữ liệu" trên Dashboard hoặc F5.<br>3. Theo dõi hành vi của ứng dụng. |
| **Kết quả mong đợi (UI/Storage)** | - Module [`api.js`](file:///d:/QLNS_QLTKPM/frontend/src/services/api.js) bắt được mã lỗi HTTP `401`.<br>- Tự động kích hoạt: `localStorage.removeItem('accessToken')` và `localStorage.removeItem('user')`.<br>- Trình duyệt ngay lập tức chuyển hướng về trang `http://localhost:5173/login`.<br>- Khi truy cập lại URL `/dashboard`, Route Guard chặn lại và không cho vào. |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_JWT_03`** |
| **Tiêu đề** | Kiểm tra tính toàn vẹn khi Token bị sửa đổi trái phép (Tampered Token Signature) |
| **Mức ưu tiên** | **P0 (Security)** |
| **Loại kiểm thử** | Security Integrity |
| **Điều kiện tiên quyết** | Có một Access Token hợp lệ, sau đó sửa đổi 1 ký tự trong chuỗi payload hoặc signature. |
| **Dữ liệu đầu vào** | Header: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SUA_DOI_PAYLOAD.CHU_KY_CU` |
| **Các bước thực hiện** | Gửi request `GET /api/auth/profile` với token đã bị sửa đổi. |
| **Kết quả mong đợi (API)** | - HTTP Status: **`401 Unauthorized`**.<br>- `errorCode: "INVALID_TOKEN"`.<br>- Message: *"Token xác thực không hợp lệ hoặc đã bị thay đổi."* |

---

| Trường thông tin | Chi tiết Test Case |
| :--- | :--- |
| **Mã Test Case** | **`TC_LOGIN_JWT_04`** |
| **Tiêu đề** | Thao tác Đăng xuất (Logout) thu hồi phiên làm việc trên trình duyệt |
| **Mức ưu tiên** | **P0 (Functional)** |
| **Loại kiểm thử** | Functional / Session Termination |
| **Điều kiện tiên quyết** | Người dùng đã đăng nhập thành công, đang ở giao diện chính. |
| **Dữ liệu đầu vào** | Nhấp chuột vào nút "Đăng xuất" trong menu Profile hoặc Sidebar. |
| **Các bước thực hiện** | 1. Nhấp Avatar trên Header để mở User Dropdown.<br>2. Nhấn nút "Đăng xuất". |
| **Kết quả mong đợi** | - Hiển thị Toast thông báo: *"Đã đăng xuất khỏi hệ thống thành công."*<br>- `localStorage.removeItem('accessToken')` và `localStorage.removeItem('user')` được thực thi.<br>- Hệ thống điều hướng ngay về `/login`.<br>- Nhấn nút Back trên trình duyệt không thể quay lại trang Dashboard có dữ liệu. |

---

### NHÓM 4: KIỂM THỬ XÁC THỰC DỮ LIỆU ĐẦU VÀO (INPUT VALIDATION)

| Mã Test Case | Tên kịch bản | Dữ liệu kiểm thử | Kết quả mong đợi (Client & Server) | Mức ưu tiên |
| :---: | :--- | :--- | :--- | :---: |
| **`TC_LOGIN_VAL_01`** | Bỏ trống Tên đăng nhập | `username = ""` / `password = "Admin@123"` | - Viền ô input Tên đăng nhập chuyển màu đỏ.<br>- Dòng lỗi đỏ dưới input: *"Vui lòng nhập tên đăng nhập hoặc email."*<br>- Form không gửi request HTTP lên server. | **P1** |
| **`TC_LOGIN_VAL_02`** | Bỏ trống Mật khẩu | `username = "admin"` / `password = ""` | - Dòng lỗi đỏ dưới ô mật khẩu: *"Vui lòng nhập mật khẩu."*<br>- Form không gửi request lên server. | **P1** |
| **`TC_LOGIN_VAL_03`** | Bỏ trống cả hai ô | `username = ""` / `password = ""` | - Cả 2 trường đều hiển thị cảnh báo lỗi bắt buộc.<br>- Focus trỏ vào ô đầu tiên. | **P1** |
| **`TC_LOGIN_VAL_04`** | Nhập sai định dạng Email | `username = "admin@"` hoặc `admin@hrm` | - Cảnh báo lỗi: *"Định dạng email không hợp lệ (ví dụ: user@hrm.local)."* | **P2** |
| **`TC_LOGIN_VAL_05`** | Nhập thừa khoảng trắng đầu/cuối | `username = "  admin  "` / `password = "Admin@123"` | - Frontend tự động `.trim()` chuỗi username.<br>- Đăng nhập thành công bình thường. | **P2** |

---

### NHÓM 5: KIỂM THỬ TRƯỜNG HỢP BIÊN & BẢO MẬT ĐẶC THÙ (EDGE CASES & ADVANCED SECURITY)

| Mã Test Case | Tên kịch bản | Dữ liệu kiểm thử | Kết quả mong đợi | Mức ưu tiên |
| :---: | :--- | :--- | :--- | :---: |
| **`TC_LOGIN_SEC_01`** | Đăng nhập tài khoản bị khóa trong CSDL (`account_status = 'Locked'`) | `username = "khoataikhoan"`<br>`password = "UserPassword123!"` | - HTTP Status: **`403 Forbidden`**.<br>- `errorCode: "ACCOUNT_LOCKED"`.<br>- Message: *"Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên..."*<br>- Tuyệt đối không cấp Token. | **P0** |
| **`TC_LOGIN_SEC_02`** | Tấn công SQL Injection trên form đăng nhập | `username = "' OR 1=1 --"`<br>`password = "' OR 'a'='a"` | - Nhờ dùng Parameterized Query (`WHERE username = ?`), Backend tìm user có username đúng bằng chuỗi ký tự trên.<br>- Không tìm thấy user $\rightarrow$ Trả về `401 Unauthorized` an toàn. | **P0** |
| **`TC_LOGIN_SEC_03`** | Không lộ mật khẩu trong Network Tab và Console | Đăng nhập thành công với `admin` / `Admin@123` | - Inspect Network Tab $\rightarrow$ Response API chỉ chứa `accessToken` và metadata (`id`, `username`, `role`).<br>- Hoàn toàn không có trường `password` hay `password_hash`. | **P0** |
| **`TC_LOGIN_POS_01`** | **Đăng nhập thành công (Happy Path)** | `username = "admin"`<br>`password = "Admin@123"` | - HTTP **`200 OK`**.<br>- Cấp JWT token hợp lệ.<br>- Lưu `accessToken` và `user` vào `localStorage`.<br>- Chuyển hướng sang `/dashboard`, hiển thị đủ 5 menu quyền Admin. | **P0** |

---

## 🛠️ 3. HƯỚNG DẪN THỰC THI KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST SCRIPTS)

Dự án đã tích hợp sẵn bộ kiểm thử tự động bằng Node.js Native Test runner:

### 1. Chạy bộ Test Backend (Kiểm tra xác thực, Bcrypt, JWT và Token Expired):
```bash
npm test --prefix backend
```
**Kết quả xác nhận:**
- `Test 2: Mật khẩu sai -> Trả về lỗi 401 và thông báo chung` $\rightarrow$ **PASS**
- `Test 3: Username không tồn tại -> Trả về lỗi 401 (chống User Enumeration)` $\rightarrow$ **PASS**
- `Test 7: Tài khoản bị khóa (Locked) -> Trả về 403 từ chối cấp token` $\rightarrow$ **PASS**
- `Test 10: JWT bị sửa đổi chữ ký hoặc hết hạn -> Bị từ chối` $\rightarrow$ **PASS**
- `Test 11: Response trả về TUYỆT ĐỐI KHÔNG chứa password hay hash` $\rightarrow$ **PASS**

### 2. Chạy bộ Test Frontend (Kiểm tra lưu trữ Storage, Remember Me, Logout và RBAC Menu):
```bash
npm test --prefix frontend
```
**Kết quả xác nhận:**
- `Test 1: Khởi đầu chưa lưu token -> isAuthenticated() === false` $\rightarrow$ **PASS**
- `Test 2: Lưu access token hợp lệ -> isAuthenticated() === true` $\rightarrow$ **PASS**
- `Test 5: Đăng xuất (Logout) -> Xóa token và user, giữ nguyên remember me` $\rightarrow$ **PASS**
- `Test 1.4: Nguyên tắc từ chối mặc định (Default Deny) cho role rỗng/hỏng` $\rightarrow$ **PASS**
- `Test 6.2: Chuyển tài khoản Admin sang Employee không để lộ menu cũ` $\rightarrow$ **PASS**

---

## 📌 4. HƯỚNG DẪN TEST THỦ CÔNG (MANUAL TESTING STEPS TRÊN TRÌNH DUYỆT)

Dành cho Tester kiểm thử trực tiếp trên giao diện [http://localhost:5173/login](http://localhost:5173/login):

### Kịch bản 1: Kiểm thử Tài khoản sai
1. Mở trình duyệt truy cập `http://localhost:5173/login`.
2. Nhập:
   - Tên đăng nhập: `nhanvien_chua_dang_ky`
   - Mật khẩu: `Admin@123`
3. Bấm **Đăng nhập vào hệ thống**.
4. **Xác nhận:**
   - Xuất hiện Alert màu đỏ: *"Tên đăng nhập hoặc mật khẩu không chính xác."*
   - F12 mở tab **Network** $\rightarrow$ Request `login` nhận mã `401 Unauthorized`.
   - F12 mở tab **Application** $\rightarrow$ `Local Storage` không có `accessToken`.

### Kịch bản 2: Kiểm thử Mật khẩu sai
1. Nhập:
   - Tên đăng nhập: `admin` (tài khoản có thật trong DB)
   - Mật khẩu: `SaiMatKhau123!`
2. Bấm **Đăng nhập vào hệ thống**.
3. **Xác nhận:**
   - Xuất hiện Alert màu đỏ: *"Tên đăng nhập hoặc mật khẩu không chính xác."*
   - Thông báo lỗi **hoàn toàn giống hệt** Kịch bản 1 (đạt tiêu chuẩn chống dò quét tài khoản).

### Kịch bản 3: Kiểm thử Token hết hạn
1. Đăng nhập thành công với `admin` / `Admin@123` để vào Dashboard.
2. Mở DevTools (F12) $\rightarrow$ Tab **Application** $\rightarrow$ **Local Storage** $\rightarrow$ `http://localhost:5173`.
3. Sửa giá trị khóa `accessToken` thành một chuỗi token giả lập đã hết hạn (hoặc chuỗi ngẫu nhiên `expired_token_demo_123`).
4. Nhấn phím **F5** để tải lại trang hoặc bấm nút **Làm mới**.
5. **Xác nhận:**
   - API `GET /api/auth/profile` hoặc `GET /api/health/db` gửi lên với token này bị Backend trả về HTTP `401 Unauthorized`.
   - Ứng dụng tự động xóa sạch `accessToken` và `user` khỏi Local Storage.
   - Trình duyệt tự động đưa người dùng trở lại màn hình `/login`.
