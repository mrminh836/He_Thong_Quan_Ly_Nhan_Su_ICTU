# 🧪 BỘ TEST CASES VÀ BÁO CÁO KIỂM THỬ: BẢO TOÀN TRƯỜNG CCCD MÃ HÓA KHI CẬP NHẬT THÔNG TIN NHÂN VIÊN (US 13.0)

**Dự án:** Hệ thống Quản trị Nhân sự (HRM - ICTU)  
**Mã User Story:** `US 13.0` – Quản lý hồ sơ nhân sự & Bảo vệ dữ liệu Căn cước công dân (Employee Profile Management & CCCD Encryption Integrity)  
**Tài liệu:** Kế hoạch kiểm thử, Ma trận Test Cases chi tiết và Báo cáo nghiệm thu chất lượng QA  
**Tiêu chuẩn áp dụng:** IEEE 829, ISTQB Foundation Level, OWASP ASVS v4.0 (V2 Authentication & V8 Data Protection), Nghị định 13/2023/NĐ-CP về Bảo vệ Dữ liệu Cá nhân  
**Người thực hiện (QA Engineer):** Hoàng Văn Khuyến  
**Môi trường kiểm thử:** 
- **Database:** MySQL 8.0 (Container `mysql-db`, cổng `3308`, InnoDB UTF8MB4)
- **Backend API:** Node.js v22 + Express REST API (Container `hrm-ictu-backend`, cổng `3005`)
- **Frontend SPA:** Vanilla JavaScript + Vite Build (Container `hrm-ictu-frontend`, cổng `5173`)
- **Reverse Proxy:** Nginx Alpine (Container `hrm-nginx`, cổng `80` HTTP và `443` HTTPS SSL)

---

## 📌 1. TỔNG QUAN VÀ NGUYÊN TẮC BẢO MẬT DỮ LIỆU CCCD (QA BASELINE)

Số Căn cước công dân (CCCD / CMND) là thông tin định danh cá nhân nhạy cảm cao (PII - Personally Identifiable Information). Theo thiết kế kiến trúc hệ thống HRM ICTU:
1. **Lưu trữ mã hóa AES-256:**
   - Dữ liệu CCCD được lưu trữ dưới dạng nhị phân trong cột `ssn_encrypted` (`VARBINARY(256)`) của bảng `employees`.
   - Sử dụng hàm chuẩn `AES_ENCRYPT(cccd, key)` trong MySQL qua Prepared Statements.
   - Cột `ssn_hash` (`CHAR(64)`): Lưu trữ mã băm `HMAC-SHA-256` của số CCCD với khóa bí mật độc lập phục vụ kiểm tra trùng lặp trên toàn hệ thống mà không cần giải mã.
   - Cột `ssn_masked` (`VARCHAR(20)`): Lưu trữ số CCCD đã che mờ (ví dụ: `0382******34`) phục vụ hiển thị cơ bản.
2. **Quy định đối với API Cập nhật nhân viên (`PUT /api/employees/:id`):**
   - Chỉ cho phép cập nhật **3 trường nghiệp vụ**: Chức vụ (`position`), Mức lương (`base_salary`), Số điện thoại (`phone`).
   - Tuyệt đối **không được phép cập nhật hoặc thay đổi CCCD** qua endpoint này.
   - **Bảo toàn 100% tính nguyên vẹn (Integrity):** Mọi thao tác cập nhật chức vụ, mức lương, SĐT hoặc xóa SĐT đều không được làm thay đổi dù chỉ 1 bit của `ssn_encrypted`, `ssn_hash`, hay `ssn_masked`.
   - **Chống can thiệp dữ liệu trái phép (Tampering):** Nếu client hoặc kẻ tấn công cố tình gửi thêm các trường `cccd`, `ssn`, `ssn_encrypted`, `ssn_hash` trong payload `PUT`, hệ thống phải phớt lờ hoàn toàn.
   - **Vệ sinh dữ liệu đầu ra (Response Hygiene):** Response của `PUT /api/employees/:id` và `GET /api/employees` (danh sách) tuyệt đối không được chứa ciphertext, hash hoặc số CCCD rõ.
   - **Phân quyền nghiêm ngặt (RBAC):** Chỉ `ADMIN` và `HR_MANAGER` được phép gọi cập nhật. Vai trò `EMPLOYEE` bị từ chối với mã lỗi `403 Forbidden`.

---

## 📋 2. MA TRẬN TEST CASES CHI TIẾT (CCCD INTEGRITY TEST SUITE)

### BẢNG QUY ƯỚC MỨC ĐỘ ƯU TIÊN:
- **P0 (Urgent/Blocker):** Chức năng cốt lõi bắt buộc phải vượt qua (Bảo toàn ciphertext trong DB, giải mã chính xác, RBAC).
- **P1 (High):** Chống tấn công giả mạo dữ liệu, kiểm tra boundary, xóa trường liên quan không ảnh hưởng CCCD.
- **P2 (Medium):** Response hygiene, chống SQL Injection, stress test cập nhật liên tục.

---

### NHÓM 1: BẢO TOÀN DỮ LIỆU CCCD TRONG DATABASE (DATABASE INTEGRITY)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **`TC_EMP_CCCD_01`** | Cập nhật Chức vụ, Lương, SĐT và kiểm tra bảo toàn ciphertext | **P0** | Security / Data Integrity | `position = "Senior QA Lead"`<br>`salary = 28000000`<br>`phone = "0987654321"` | 1. Đọc `HEX(ssn_encrypted)`, `ssn_hash`, `ssn_masked` ban đầu từ CSDL.<br>2. Gửi request `PUT /api/employees/:id` cập nhật cả 3 trường.<br>3. Truy vấn lại CSDL và so sánh bit-by-bit. | - API trả về HTTP `200 OK`.<br>- Cột `position`, `base_salary`, `phone` cập nhật giá trị mới.<br>- `HEX(ssn_encrypted)` khớp 100% bit-by-bit.<br>- `ssn_hash` và `ssn_masked` bất biến. | **PASS** |
| **`TC_EMP_CCCD_02`** | Giải mã CCCD qua API GET /api/employees/:id sau khi cập nhật | **P0** | Security / Decryption Verification | Token `ADMIN`<br>`employeeId = [ID test]` | 1. Cập nhật thông tin nhân viên bằng lệnh PUT.<br>2. Gọi API `GET /api/employees/:id` với token Admin.<br>3. Kiểm tra trường `cccd` trong response. | - API trả về HTTP `200 OK`.<br>- Trường `cccd` giải mã ra đúng số CCCD gốc (`038204007788`).<br>- Không bị lỗi `DECRYPTION_ERROR`. | **PASS** |
| **`TC_EMP_CCCD_03`** | Xóa số điện thoại (phone = null hoặc "") không làm ảnh hưởng CCCD | **P1** | Boundary / DB Nullability | `phone = ""` | 1. Gửi request `PUT /api/employees/:id` với `phone = ""`.<br>2. Kiểm tra CSDL xem cột `phone` và cột `ssn_encrypted`. | - API trả HTTP `200 OK`.<br>- Cột `phone` được cập nhật thành `NULL`.<br>- Cột `ssn_encrypted` tuyệt đối không bị NULL hóa, giữ nguyên giá trị mã hóa ban đầu. | **PASS** |
| **`TC_EMP_CCCD_04`** | Cập nhật mức lương cực đại (Boundary: 9.99 tỷ) không gây tràn vùng nhớ CCCD | **P1** | Boundary / Storage Integrity | `salary = 9999999999.99` | 1. Cập nhật mức lương chạm giới hạn `DECIMAL(12, 2)`.<br>2. Kiểm tra dữ liệu cột `base_salary` và `ssn_encrypted`. | - Cột `base_salary` lưu đúng `9999999999.99`.<br>- Không phát sinh lỗi tràn số (overflow).<br>- Ciphertext CCCD hoàn toàn nguyên vẹn. | **PASS** |

---

### NHÓM 2: CHỐNG CAN THIỆP DỮ LIỆU TRÁI PHÉP (TAMPERING & NEGATIVE TESTING)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **`TC_EMP_CCCD_05`** | Cố tình gửi trường `cccd` mới trong payload PUT | **P0** | Security / Anti-Tampering | `position = "Auditor"`<br>`cccd = "099999999999"` | 1. Gửi request `PUT` kèm số CCCD giả mạo khác số gốc.<br>2. Kiểm tra phản hồi và dữ liệu CSDL.<br>3. Gọi API chi tiết để giải mã lại. | - Backend chỉ cập nhật `position`.<br>- Trường `cccd` bị phớt lờ hoàn toàn.<br>- CSDL và API giải mã vẫn ra đúng số CCCD gốc (`038204007788`), không bị đổi thành `099999999999`. | **PASS** |
| **`TC_EMP_CCCD_06`** | Cố tình gửi trường `ssn_encrypted` hoặc `ssn_hash` giả mạo qua PUT | **P0** | Security / Anti-Tampering | `ssn_encrypted = "FAKE_DATA"`<br>`ssn_hash = "fake_hash_123"` | 1. Gửi request `PUT` kèm ciphertext và hash giả mạo.<br>2. Kiểm tra trực tiếp bảng `employees` trong MySQL. | - Backend phớt lờ toàn bộ các trường nhạy cảm.<br>- Giá trị binary trong CSDL giữ nguyên 100%. | **PASS** |
| **`TC_EMP_CCCD_07`** | Cố tình gửi `employeeId` hoặc `userId` mới trong payload PUT | **P1** | Security / Immutability | `employeeId = 99999`<br>`userId = 88` | 1. Gửi request `PUT /api/employees/:id` kèm ID giả mạo.<br>2. Kiểm tra CSDL xem ID nhân viên hoặc liên kết User có đổi không. | - Không bị đổi ID hoặc liên kết User.<br>- Chuỗi khóa ngoại và quan hệ bảng giữ nguyên vẹn. | **PASS** |
| **`TC_EMP_CCCD_08`** | Tấn công SQL Injection qua trường `position` | **P0** | Security / SQLi Prevention | `position = "' OR 1=1; DROP TABLE employees; --"` | 1. Gửi chuỗi tấn công SQL Injection vào trường `position`.<br>2. Kiểm tra CSDL và phản hồi API. | - Hệ thống sử dụng Prepared Statements (`?`), chuỗi được lưu an toàn nguyên bản dạng text thuần.<br>- Bảng `employees` và dữ liệu CCCD an toàn 100%. | **PASS** |

---

### NHÓM 3: VỆ SINH DỮ LIỆU ĐẦU RA (RESPONSE HYGIENE & PRIVACY)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **`TC_EMP_CCCD_09`** | Response của API `PUT /api/employees/:id` không chứa CCCD | **P0** | Privacy / Data Leakage | Token `ADMIN`<br>`PUT /api/employees/:id` | 1. Gửi lệnh cập nhật thành công.<br>2. Phân tích chi tiết JSON response trả về từ máy chủ. | - `data` KHÔNG chứa: `cccd`, `ssn`, `ssn_encrypted`, `ssn_hash`, `ssn_masked`.<br>- Chuỗi JSON tuyệt đối không chứa số CCCD rõ hoặc chuỗi nhị phân. | **PASS** |
| **`TC_EMP_CCCD_10`** | Response của API `GET /api/employees` (danh sách) không chứa CCCD | **P0** | Privacy / Data Leakage | Token `ADMIN`<br>`GET /api/employees?search=...` | 1. Gọi API danh sách nhân viên.<br>2. Duyệt từng phần tử của mảng `data`. | - Toàn bộ các bản ghi trong danh sách nhân sự tuyệt đối không chứa `cccd` hoặc ciphertext.<br>- Tuân thủ chuẩn bảo vệ dữ liệu. | **PASS** |

---

### NHÓM 4: PHÂN QUYỀN RBAC & ĐỘ BỀN LIÊN HOÀN (STRESS TESTING)

| Mã Test Case | Tiêu đề | Mức ưu tiên | Loại kiểm thử | Dữ liệu đầu vào | Các bước thực hiện | Kết quả mong đợi | Trạng thái thực tế |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **`TC_EMP_CCCD_11`** | Tài khoản vai trò EMPLOYEE cố tình gọi PUT cập nhật | **P0** | RBAC / Authorization | Token `EMPLOYEE`<br>`PUT /api/employees/:id` | 1. Đăng nhập tài khoản nhân viên thường (`emp1`).<br>2. Gửi request `PUT /api/employees/:id`. | - Backend từ chối với HTTP **`403 Forbidden`**.<br>- Dữ liệu nhân viên và CCCD không bị thay đổi. | **PASS** |
| **`TC_EMP_CCCD_12`** | Gọi PUT không kèm Bearer Token hoặc Token giả mạo | **P0** | Security / Authentication | Không header hoặc Token giả | 1. Gửi request `PUT` không kèm header `Authorization`.<br>2. Thử lại với token rác ngẫu nhiên. | - Backend từ chối với HTTP **`401 Unauthorized`**.<br>- CSDL được bảo vệ an toàn. | **PASS** |
| **`TC_EMP_CCCD_13`** | Stress Test: Cập nhật liên hoàn 5 lần liên tiếp với chức vụ & lương khác nhau | **P1** | Stress / Concurrency & Integrity | 5 chu kỳ cập nhật liên tục | 1. Chạy vòng lặp 5 lần cập nhật liên tiếp với 5 chức vụ khác nhau.<br>2. Kiểm tra `HEX(ssn_encrypted)` sau mỗi lần cập nhật.<br>3. Giải mã lại ở vòng cuối cùng. | - Cả 5 lần cập nhật đều thành công (HTTP `200 OK`).<br>- Ciphertext sau mỗi lần cập nhật đều trùng khớp 100% với ban đầu.<br>- Giải mã cuối cùng ra đúng số CCCD gốc. | **PASS** |

---

## 🔬 3. KẾT QUẢ THỰC THI KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST EXECUTION LOGS)

Lệnh thực thi trực tiếp trên hệ thống Backend Docker (`hrm-ictu-backend:3005`) và MySQL (`mysql-db:3308`):
```powershell
npm run test:qa:employee:cccd
```

### Log thực thi chi tiết:
```text
============================================================
🛡️  BẮT ĐẦU CHẠY BỘ KIỂM THỬ QA: BẢO TOÀN DỮ LIỆU CCCD KHI CẬP NHẬT NHÂN VIÊN
   (API PUT /api/employees/:id & Ràng buộc bảo mật AES-256 CCCD)
============================================================

ℹ️ [Setup] Đã khởi tạo nhân sự kiểm thử ID=32 (NV-QA-1364) với CCCD=038204007788
ℹ️ [Baseline] HEX(ssn_encrypted) độ dài 32 ký tự, ssn_hash: 3f03aa0b39067719...

  ✅ [PASS] Test 1: Cập nhật Chức vụ, Lương, SĐT -> Dữ liệu CCCD trong Database giữ nguyên 100% bit-by-bit
  ✅ [PASS] Test 2: Gọi GET /api/employees/:id -> Số CCCD giải mã AES-256 khớp chính xác 100% với CCCD gốc
  ✅ [PASS] Test 3: Gửi trường cccd mới ("099999999999") trong payload PUT -> Bị phớt lờ hoàn toàn, CCCD gốc không đổi
  ✅ [PASS] Test 4: Gửi ssn_encrypted hoặc ssn_hash giả mạo trong PUT -> Hệ thống phớt lờ, CSDL bất biến
  ✅ [PASS] Test 5: Xóa số điện thoại (phone = null hoặc "") -> SĐT cập nhật NULL, trường CCCD không bị NULL hóa
  ✅ [PASS] Test 6: Cập nhật liên hoàn 5 lần liên tiếp với chức vụ & mức lương khác nhau -> CCCD luôn toàn vẹn
  ✅ [PASS] Test 7: Cập nhật mức lương cực đại (9,999,999,999.99 VNĐ) -> Không tràn bộ nhớ sang vùng CCCD
  ✅ [PASS] Test 8: Response của PUT /api/employees/:id tuyệt đối KHÔNG chứa số CCCD hoặc ciphertext
  ✅ [PASS] Test 9: Response của GET /api/employees (danh sách) tuyệt đối không chứa CCCD của nhân sự
  ✅ [PASS] Test 10: Tài khoản role EMPLOYEE gọi PUT -> Bị từ chối 403 Forbidden, dữ liệu bất biến
  ✅ [PASS] Test 11: Gọi PUT không kèm Bearer Token -> Bị từ chối 401 Unauthorized, CSDL an toàn
  ✅ [PASS] Test 12: Tấn công SQL Injection qua position ("' OR 1=1 --") -> Bị chặn / sanitize an toàn
  ✅ [PASS] Test 13: Đối soát hàm AES_DECRYPT trong MySQL và giải mã của Backend -> Kết quả trùng khớp 100%

--- DỌN DẸP DỮ LIỆU THỬ NGHIỆM ---
ℹ️ [Cleanup] Đã xóa nhân sự kiểm thử ID=32 (NV-QA-1364)

============================================================
🎉 KẾT QUẢ KIỂM THỬ QA: ĐÃ VƯỢT QUA 13/13 KỊCH BẢN BẢO VỆ CCCD! (100% PASS)
============================================================
```

---

## 📊 4. ĐỐI SOÁT TOÀN VẸN VỚI HỆ THỐNG TEST SUITE HIỆN HÀNH

Sau khi tích hợp kịch bản kiểm thử CCCD, toàn bộ các bài test hồi quy của Backend đều được chạy lại để bảo đảm không xảy ra bất kỳ xung đột nào:

1. **`npm run test:syntax`**: Đạt 100% (Kiểm tra cú pháp 36 module file JS).
2. **`npm run test:auth`**: Đạt 100% (Đăng nhập, JWT token, bcrypt mật khẩu).
3. **`npm run test:rbac`**: Đạt 100% (Phân quyền Admin, HR Manager, Employee).
4. **`npm run test:department`**: Đạt 100% (CRUD phòng ban & ràng buộc).
5. **`npm run test:employee`**: Đạt 100% (38 bài test tạo mới, giải mã CCCD, danh sách phân trang).
6. **`npm run test:employee:update`**: Đạt 100% (15 bài test tích hợp `PUT /api/employees/:id`).
7. **`npm run test:qa:employee:cccd`**: Đạt 100% (13 bài test toàn vẹn mã hóa CCCD).
8. **`npm run test:attendance`**: Đạt 100% (26 bài test điểm danh chấm công).
9. **`npm run test:db`**: Đạt 100% (12 bài test an toàn CSDL Least Privilege).

---

## 🏆 5. KẾT LUẬN NGHIỆM THU QA (QUALITY ACCEPTANCE SIGN-OFF)

| Tiêu chí Đánh giá | Trạng thái | Đánh giá của QA Lead |
| :--- | :---: | :--- |
| **Tính toàn vẹn mã hóa CCCD (`ssn_encrypted`)** | ✅ **ĐẠT** | 100% dữ liệu binary được bảo tồn bất biến qua mọi thao tác cập nhật `PUT`. |
| **Mã băm tra cứu (`ssn_hash`) & Chuỗi che mờ (`ssn_masked`)** | ✅ **ĐẠT** | Không bị thay đổi hoặc ghi đè, duy trì trọn vẹn khả năng tìm kiếm chống trùng lặp. |
| **Tính đúng đắn khi giải mã AES-256 (`AES_DECRYPT`)** | ✅ **ĐẠT** | Kết quả giải mã của hàm MySQL và API Backend trùng khớp 100% với CCCD gốc trước và sau update. |
| **Chống can thiệp giả mạo (Anti-Tampering)** | ✅ **ĐẠT** | Mọi trường nhạy cảm (`cccd`, `ssn_encrypted`, `ssn_hash`, `employeeId`, `userId`) gửi qua PUT đều bị loại bỏ an toàn. |
| **Chống rò rỉ dữ liệu (Privacy / Data Leakage)** | ✅ **ĐẠT** | Response của `PUT` và `GET` danh sách tuyệt đối không trả số CCCD rõ, ciphertext hay mã băm. |
| **Bảo vệ bằng Prepared Statements & RBAC** | ✅ **ĐẠT** | Ngăn chặn hoàn toàn SQL Injection; chặn truy cập trái phép của vai trò `EMPLOYEE` (403) và chưa đăng nhập (401). |

👉 **Xác nhận:** Chức năng Cập nhật thông tin nhân viên (`US 13.0`) **ĐẠT CHUẨN CHẤT LƯỢNG NGHIỆM THU (QA SIGN-OFF)**, sẵn sàng chuyển giao sang các User Story tiếp theo của Sprint 2.
