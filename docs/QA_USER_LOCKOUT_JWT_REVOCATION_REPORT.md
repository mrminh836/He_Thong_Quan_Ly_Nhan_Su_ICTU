# 🔒 BÁO CÁO KIỂM THỬ QA: CHẶN ĐĂNG NHẬP VÀ THU HỒI QUYỀN TRUY CẬP ĐỐI VỚI TÀI KHOẢN BỊ KHÓA

**Dự án:** Hệ thống Quản trị Nhân sự (HRM - ICTU)  
**Mục tiêu kiểm thử:** Kiểm thử xác thực, chặn đăng nhập mới và thu hồi quyền truy cập JWT ngay lập tức khi tài khoản người dùng bị khóa (`status = 'Locked'`).  
**Tài liệu:** Kế hoạch kiểm thử, Ma trận Test Cases chi tiết và Báo cáo nghiệm thu chất lượng QA  
**Tiêu chuẩn áp dụng:** OWASP ASVS v4.0 (V2 Authentication Verification, V3 Session Management), ISTQB Foundation Level, IEEE 829  
**Người thực hiện (QA Engineer):** Đỗ Quang Minh  
**Môi trường kiểm thử:** 
- **Database:** MySQL 8.0 (Container `mysql-db`, cổng `3309`, InnoDB UTF8MB4)
- **Backend API:** Node.js v22 + Express REST API (Container `hrm-ictu-backend`, cổng `3005`)
- **Frontend SPA:** Vanilla JavaScript + Vite Build (Container `hrm-ictu-frontend`, cổng `5173`)
- **Reverse Proxy:** Nginx Alpine (Container `hrm-nginx`, cổng `80` HTTP và `443` HTTPS SSL)

---

## 📌 1. NGUYÊN TẮC BẢO MẬT & CƠ CHẾ THU HỒI QUYỀN TRUY CẬP (QA BASELINE)

Theo tiêu chuẩn bảo mật phiên làm việc và kiểm soát danh tính (OWASP Session Management):
1. **Chặn đăng nhập đối với tài khoản bị khóa (`POST /api/auth/login`):**
   - Khi tài khoản có `account_status = 'Locked'`, mọi yêu cầu đăng nhập bằng username/password đúng phải bị từ chối với HTTP `403 Forbidden`.
   - Mã lỗi nghiệp vụ: `ACCOUNT_LOCKED`.
   - Thông điệp: *"Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ."*
   - Tuyệt đối không cấp Access Token mới hay Refresh Token.
2. **Thu hồi quyền truy cập JWT ngay lập tức (Immediate JWT Revocation):**
   - Một lỗ hổng phổ biến của hệ thống dùng JWT Stateless là: khi tài khoản bị khóa trong CSDL, Token cũ vẫn còn hạn thời gian (ví dụ 15 phút - 1 giờ) nên kẻ gian hoặc người dùng cũ vẫn tiếp tục gọi API được.
   - Hệ thống HRM ICTU triển khai **Real-time Database Auth Guard** trong `authenticateToken` middleware:
     - Giải mã và kiểm tra tính hợp lệ về chữ ký, thời hạn của Token.
     - Truy vấn trực tiếp trạng thái tài khoản thời gian thực trong bảng `users` (`account_status`).
     - Nếu `account_status !== 'Active'`, request bị từ chối **NGAY LẬP TỨC** với HTTP `403 Forbidden` (`ACCOUNT_LOCKED`) mà không cần chờ đến khi JWT hết hạn.
3. **Chính sách an toàn & Phân quyền (RBAC & Safety Policies):**
   - Chỉ người dùng có vai trò `ADMIN` mới được phép gọi `PATCH /api/users/:id/status`.
   - Quản trị viên không được phép tự khóa chính tài khoản của mình (`CANNOT_LOCK_SELF`, HTTP `400 Bad Request`).
   - Việc khóa một tài khoản không được ảnh hưởng đến phiên làm việc của các tài khoản khác đang hoạt động.
   - Khi tài khoản được mở khóa lại (`Active`), người dùng phải thực hiện đăng nhập mới để cấp phiên làm việc mới.

---

## 📋 2. MA TRẬN TEST CASES CHI TIẾT (LIVE E2E TEST SUITE)

| Mã Test Case | Tiêu đề kịch bản | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **`TC_AUTH_LOCK_01`** | Đăng nhập tài khoản đang hoạt động (Active) | **P0** | Functional / Auth | `username = "emp1"`<br>`password = "Emp@123"` | HTTP `200 OK`, cấp JWT `accessToken`. | **PASS** |
| **`TC_AUTH_LOCK_02`** | Truy cập API bảo mật khi tài khoản đang Active | **P0** | Authorization | Header `Authorization: Bearer <empToken>`<br>`GET /api/attendance/today` | HTTP `200 OK`, trả về dữ liệu chấm công. | **PASS** |
| **`TC_AUTH_LOCK_03`** | Admin gọi API khóa tài khoản người dùng | **P0** | Functional / RBAC | Token Admin<br>`PATCH /api/users/3/status`<br>`{ "status": "Locked" }` | HTTP `200 OK`, `status = "Locked"`. CSDL MySQL cập nhật `account_status = 'Locked'`. | **PASS** |
| **`TC_AUTH_LOCK_04`** | Thu hồi JWT ngay lập tức ở request tiếp theo | **P0** | Security / Revocation | Dùng lại `empToken` ở TC 02 (token còn hạn)<br>`GET /api/attendance/today` | BỊ CHẶN NGAY LẬP TỨC: HTTP `403 Forbidden`, `errorCode: "ACCOUNT_LOCKED"`. | **PASS** |
| **`TC_AUTH_LOCK_05`** | Chặn đăng nhập mới với tài khoản bị khóa | **P0** | Security / Auth | `POST /api/auth/login`<br>`username = "emp1"`, `password = "Emp@123"` | HTTP `403 Forbidden`, `errorCode: "ACCOUNT_LOCKED"`, không cấp token mới. | **PASS** |
| **`TC_AUTH_LOCK_06`** | Người dùng không phải Admin cố gọi API đổi trạng thái | **P1** | RBAC / Security | Token HR_MANAGER<br>`PATCH /api/users/3/status` | Bị từ chối HTTP `403 Forbidden`. | **PASS** |
| **`TC_AUTH_LOCK_07`** | Chống Admin tự khóa chính tài khoản của mình | **P1** | Safety Policy | Token Admin<br>`PATCH /api/users/1/status`<br>`{ "status": "Locked" }` | HTTP `400 Bad Request`, `errorCode: "CANNOT_LOCK_SELF"`. CSDL giữ nguyên `Active`. | **PASS** |
| **`TC_AUTH_LOCK_08`** | Độc lập phiên làm việc của các tài khoản Active khác | **P1** | Integrity | Token của `hr` và `admin`<br>Gọi các API phân hệ | Hoạt động bình thường HTTP `200 OK`, không bị gián đoạn chéo. | **PASS** |
| **`TC_AUTH_LOCK_09`** | Admin mở khóa tài khoản người dùng | **P0** | Functional | Token Admin<br>`PATCH /api/users/3/status`<br>`{ "status": "Active" }` | HTTP `200 OK`, `status = "Active"`. CSDL MySQL ghi nhận `Active`. | **PASS** |
| **`TC_AUTH_LOCK_10`** | Khôi phục đăng nhập sau khi mở khóa | **P0** | Functional / Auth | `POST /api/auth/login`<br>`username = "emp1"`, `password = "Emp@123"` | HTTP `200 OK`, cấp `newAccessToken`. | **PASS** |
| **`TC_AUTH_LOCK_11`** | Token mới sử dụng đầy đủ quyền hạn hệ thống | **P0** | Authorization | Header `Authorization: Bearer <newAccessToken>`<br>`GET /api/attendance/today` | HTTP `200 OK`, khôi phục truy cập hoàn toàn. | **PASS** |
| **`TC_AUTH_LOCK_12`** | Đối soát tính toàn vẹn CSDL MySQL | **P0** | Database Integrity | Kiểm tra bảng `users` trong MySQL | Cả 3 tài khoản mẫu (`admin`, `hr`, `emp1`) đều ở trạng thái `Active`, quan hệ khóa ngoại nguyên vẹn. | **PASS** |

---

## 🔬 3. NHẬT KÝ THỰC THI KIỂM THỬ TRỰC TIẾP (LIVE E2E LOGS)

```bash
> hrm-backend@1.0.0 test:qa:user:lockout
> node tests/qaUserLockoutJwtRevocationLiveE2E.test.js

==============================================================================
🔒 BẮT ĐẦU KIỂM THỬ LIVE QA: CHẶN ĐĂNG NHẬP & THU HỒI JWT TÀI KHOẢN BỊ KHÓA
   Backend API: http://127.0.0.1:3005
   MySQL Database: 127.0.0.1:3309/hrm_db
==============================================================================

▶ [TEST 1] Đăng nhập tài khoản emp1 (Active): Trả về HTTP 200 OK và JWT Token hợp lệ
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 2] Tài khoản Active dùng JWT gọi API xác thực: Trả về HTTP 200 OK
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 3] Admin đăng nhập và gửi request khóa tài khoản emp1: Trả về 200 OK, status="Locked"
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 4] THU HỒI JWT LẬP TỨC: empToken cũ bị từ chối NGAY LẬP TỨC (403 ACCOUNT_LOCKED)
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 5] CHẶN ĐĂNG NHẬP: Tài khoản emp1 bị khóa không thể đăng nhập mới (403 ACCOUNT_LOCKED)
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 6] Phân quyền RBAC: HR Manager cố gọi API cập nhật trạng thái người dùng -> 403 Forbidden
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 7] Chính sách an toàn: Admin cố tình tự khóa tài khoản của chính mình -> 400 CANNOT_LOCK_SELF
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 8] Phiên làm việc độc lập: Tài khoản hr và admin vẫn gọi API bình thường 100%
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 9] Admin mở khóa tài khoản emp1: Gửi status="Active" -> Trả về 200 OK
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 10] Khôi phục quyền đăng nhập: POST /api/auth/login thành công sau khi tài khoản mở khóa
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 11] Token mới hoạt động đầy đủ quyền hạn và khôi phục quyền truy cập hệ thống
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

▶ [TEST 12] Toàn vẹn CSDL MySQL: Trạng thái và vai trò của 3 tài khoản nguyên vẹn và an toàn
  ✅ [PASS] Hoàn thành đạt chuẩn 100%

==============================================================================
🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA 12/12 KỊCH BẢN!
   Hệ thống kiểm soát khóa tài khoản, chặn đăng nhập & thu hồi JWT đạt chuẩn 100%.
==============================================================================
```

---

## 🏆 4. KẾT LUẬN NGHIỆM THU CHẤT LƯỢNG (QA SIGN-OFF)

- **Chặn đăng nhập:** Đạt chuẩn 100%. Mọi nỗ lực xác thực với tài khoản có `account_status = 'Locked'` đều bị từ chối với HTTP 403 `ACCOUNT_LOCKED`.
- **Thu hồi JWT tức thì:** Đạt chuẩn 100%. Token của tài khoản bị khóa mất quyền truy cập ngay ở request kế tiếp, hoàn toàn triệt tiêu nguy cơ lỗ hổng JWT Stateless tồn lưu.
- **Tính toàn vẹn hệ thống:** Phiên làm việc của các tài khoản khác không bị xáo trộn; CSDL MySQL bảo toàn toàn bộ dữ liệu người dùng và lịch sử chấm công.
- **Tiêu chí nghiệm thu:** **ACCEPT / PASSED 100%**.
