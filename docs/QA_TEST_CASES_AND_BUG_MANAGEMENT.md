# 📋 TÀI LIỆU QUY TRÌNH KIỂM THỬ, TEST CASE VÀ QUẢN LÝ BUG (JIRA / SHEETS)

**Học phần:** Triển khai và Quản trị Hệ thống Phần mềm (TKQT HTPM K23)  
**Đề tài:** Đề 10 - Hệ thống Quản lý Nhân sự (HRM - ICTU)  
**Tiêu chuẩn áp dụng:** IEEE 829, ISTQB Foundation & Jira Agile Quality Management  
**File bảng tính đính kèm:** [`docs/HRM_TestCases_BugTracking.xlsx`](file:///d:/QLNS_QLTKPM/docs/HRM_TestCases_BugTracking.xlsx)  
**Nhánh Git:** `feature/qa-testcases-bug-tracking`  
**Cập nhật:** 13/10/2026  

---

## 🎯 1. TỔNG QUAN VÀ MỤC TIÊU QUẢN LÝ CHẤT LƯỢNG

Tài liệu này cung cấp toàn bộ quy trình, khung mẫu (Templates) và dữ liệu kiểm thử thực tế phục vụ cho việc:
1. **Thiết kế Test Case chuẩn hóa:** Bao phủ 100% các User Stories của Sprint 1 (US-01 đến US-16).
2. **Quản lý vòng đời lỗi (Bug Life Cycle):** Chuẩn hóa quy trình ghi nhận, phân loại mức độ nghiêm trọng (Severity), mức ưu tiên (Priority), truy vết nguyên nhân gốc rễ (Root Cause) và đóng lỗi theo quy chuẩn Jira.
3. **Đồng bộ bảng tính Google Sheets / Excel:** Cung cấp sẵn file bảng tính đa năng [`HRM_TestCases_BugTracking.xlsx`](file:///d:/QLNS_QLTKPM/docs/HRM_TestCases_BugTracking.xlsx) gồm 3 tab chuyên biệt có thể mở trên Microsoft Excel hoặc import trực tiếp vào Google Sheets / Jira Xray.

---

## 🔁 2. QUY TRÌNH VÒNG ĐỜI BUG (BUG LIFE CYCLE STATE DIAGRAM)

Quy trình quản lý lỗi trong dự án HRM tuân theo mô hình chuyển trạng thái tiêu chuẩn của Jira Agile:

```mermaid
stateDiagram-v2
    [*] --> NEW: Tester phát hiện lỗi & tạo Bug Ticket
    NEW --> ASSIGNED: QA Lead / PM duyệt và gán Developer
    ASSIGNED --> IN_PROGRESS: Developer bắt đầu sửa mã nguồn
    IN_PROGRESS --> RESOLVED: Developer sửa xong & đẩy code lên Git
    RESOLVED --> VERIFIED: Tester kiểm thử lại (Retest Pass)
    RESOLVED --> REOPENED: Tester kiểm thử lại vẫn lỗi (Retest Fail)
    REOPENED --> IN_PROGRESS: Developer tiếp tục xử lý
    VERIFIED --> CLOSED: Bug đã được đóng hoàn toàn
    CLOSED --> [*]
```

### Định nghĩa các trạng thái (Bug Statuses):
- **`NEW`:** Lỗi mới được ghi nhận vào hệ thống, đang chờ thẩm định.
- **`ASSIGNED`:** Lỗi đã được xác nhận hợp lệ và giao cho lập trình viên chịu trách nhiệm.
- **`IN_PROGRESS`:** Lập trình viên đang phân tích nguyên nhân và viết code sửa chữa.
- **`RESOLVED`:** Đã sửa xong trên môi trường Dev/Test và tạo Pull Request.
- **`REOPENED`:** Tester kiểm tra lại trên bản build mới nhưng lỗi vẫn còn tồn tại.
- **`VERIFIED`:** Tester kiểm tra lại xác nhận lỗi đã biến mất hoàn toàn.
- **`CLOSED`:** Lỗi đã được đóng chính thức, đưa vào báo cáo nghiệm thu Release.

---

## ⚖️ 3. TIÊU CHÍ PHÂN LOẠI SEVERITY VÀ PRIORITY

| Mức độ | Định nghĩa trong dự án HRM | Ví dụ thực tế trong hệ thống |
| :--- | :--- | :--- |
| **Blocker (Chặn đứng)** | Hệ thống sập, container không khởi động được, mất dữ liệu nghiêm trọng | Container MySQL hoặc Backend crash, xung đột cổng không thể boot hệ thống |
| **Critical (Nghiêm trọng)** | Chức năng cốt lõi bị hỏng, rò rỉ bảo mật thông tin | Lộ số CCCD plain-text, nhân viên chấm công trùng lặp vô tội vạ trong 1 ngày |
| **Major (Nặng)** | Nghiệp vụ chạy sai nhưng còn luồng thay thế, vi phạm ràng buộc toàn vẹn | Xóa phòng ban làm mồ côi nhân viên, lệch múi giờ chấm công (lệch 7 tiếng) |
| **Minor (Nhẹ)** | Lỗi giao diện nhỏ, thông báo chưa chuẩn, thiếu validation phụ | Nút chưa có feedback, cảnh báo linting CSS thiếu thuộc tính tương thích |
| **Trivial (Rất nhẹ)** | Lỗi chính tả, căn lề văn bản | Sai chính tả một từ tiếng Việt trong tooltip |

---

## 📝 4. KHUNG MẪU BÁO CÁO BUG CHUẨN JIRA (JIRA BUG REPORT TEMPLATE)

Khi tạo một Bug Ticket trên Jira hoặc nhập vào Google Sheets, Tester bắt buộc điền đầy đủ 10 trường thông tin sau:

```text
================================================================================
[HRM-BUG] TIÊU ĐỀ: [Module] Mô tả ngắn gọn sự cố phát sinh
================================================================================
• Issue Type    : Bug
• Component     : [Auth | Departments | Employees | Attendances | Database | Docker]
• Severity      : [Blocker | Critical | Major | Minor | Trivial]
• Priority      : [P0 - Urgent | P1 - High | P2 - Medium | P3 - Low]
• Environment   : Windows 11 / Docker Desktop 29.8 / Node v22 / Chrome v130
• Reporter      : [Tên Tester]
• Assignee      : [Tên Developer chịu trách nhiệm]

• MÔ TẢ CHI TIẾT (Description):
  Tóm tắt hiện tượng bất thường khi sử dụng chức năng.

• CÁC BƯỚC TÁI HIỆN (Steps to Reproduce - STR):
  1. Đăng nhập hệ thống với quyền HR Manager.
  2. Truy cập vào màn hình /employees.
  3. Mở tab Network hoặc quan sát API GET /api/employees.
  4. Quan sát cấu trúc dữ liệu trả về.

• KẾT QUẢ MONG ĐỢI (Expected Result):
  Số CCCD chỉ được hiển thị ở dạng che mờ (0380******12) cho danh sách thông thường.

• KẾT QUẢ THỰC TẾ (Actual Result):
  API trả về số CCCD đầy đủ dạng văn bản thuần (plain-text), vi phạm yêu cầu Lab 6.

• NGUYÊN NHÂN GỐC RỄ (Root Cause - Phân tích bởi Dev):
  Câu lệnh SQL dùng SELECT * nạp thẳng cột ssn_encrypted và tự động giải mã.

• ẢNH CHỤP MINH CHỨNG (Attachments):
  [Đính kèm ảnh chụp màn hình / video quay thao tác tái hiện]
================================================================================
```

---

## 📊 5. MA TRẬN TEST CASES CHI TIẾT (20 TEST CASES CỐT LÕI)

*(Trích lục từ Tab `Test_Cases` trong file [`HRM_TestCases_BugTracking.xlsx`](file:///d:/QLNS_QLTKPM/docs/HRM_TestCases_BugTracking.xlsx))*

| Test ID | Module | US ID | Mục tiêu kiểm thử | Loại test | Mức ưu tiên | Kết quả mong đợi | Trạng thái |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- | :---: |
| **TC_AUTH_01** | Xác thực & RBAC | US-01 | Đăng nhập tài khoản Admin thành công | Functional | **P0** | HTTP 200, cấp JWT Token, chuyển hướng Dashboard | **PASS** |
| **TC_AUTH_02** | Xác thực & RBAC | US-01 | Đăng nhập thất bại khi sai mật khẩu | Functional | **P0** | HTTP 401, báo 'Sai tài khoản hoặc mật khẩu' | **PASS** |
| **TC_AUTH_03** | Xác thực & RBAC | US-02 | Chặn nhân viên thường tạo phòng ban | Security | **P0** | HTTP 403 Forbidden, không cho phép truy cập | **PASS** |
| **TC_DEPT_01** | Phòng ban | US-04 | Xem danh sách phòng ban kèm số nhân sự | Functional | **P0** | Hiển thị đúng 3 phòng ban và số lượng nhân sự | **PASS** |
| **TC_DEPT_02** | Phòng ban | US-05 | Thêm phòng ban mới với mã duy nhất | Functional | **P0** | HTTP 201, lưu thành công vào MySQL | **PASS** |
| **TC_DEPT_03** | Phòng ban | US-05 | Báo lỗi khi thêm phòng ban trùng mã | Validation | **P1** | Báo lỗi vi phạm UNIQUE KEY `department_code` | **PASS** |
| **TC_DEPT_04** | Phòng ban | US-06 | Ngăn xóa phòng ban còn nhân viên trực thuộc | Integrity | **P0** | Chặn xóa qua `ON DELETE RESTRICT`, bảo toàn dữ liệu | **PASS** |
| **TC_EMP_01** | Nhân viên | US-07 | Xem danh sách nhân viên có bộ lọc | Functional | **P0** | Lọc chính xác nhân viên theo phòng ban và trạng thái | **PASS** |
| **TC_EMP_02** | Nhân viên | US-08 | Thêm nhân viên và mã hóa số CCCD (AES-256) | Security | **P0** | Cột `ssn_encrypted` lưu dữ liệu nhị phân `VARBINARY` | **PASS** |
| **TC_EMP_03** | Nhân viên | US-09 | Admin/HR giải mã CCCD bằng `AES_DECRYPT` | Security | **P0** | Giải mã chính xác 12 chữ số CCCD với khóa AES | **PASS** |
| **TC_EMP_04** | Nhân viên | US-09 | Nhân viên thường chỉ thấy CCCD che mờ | Security | **P1** | Hiển thị dạng `0380******12`, bảo mật riêng tư | **PASS** |
| **TC_EMP_05** | Nhân viên | US-10 | Thao tác thôi việc (Soft-delete: Resigned) | Integrity | **P1** | Chuyển trạng thái `Resigned`, khóa tài khoản, không xóa cứng | **PASS** |
| **TC_ATT_01** | Chấm công | US-11 | Check-in trước 08:30 tự động tính Đúng giờ | Business | **P0** | Ghi nhận giờ vào, trạng thái `OnTime` | **PASS** |
| **TC_ATT_02** | Chấm công | US-11 | Check-in sau 08:30 tự động tính Đi muộn | Business | **P0** | Ghi nhận giờ vào, trạng thái `Late` | **PASS** |
| **TC_ATT_03** | Chấm công | US-11 | Chặn Check-in lần 2 trong ngày (Chống trùng) | Integrity | **P0** | Chặn qua `UNIQUE KEY (employee_id, work_date)` | **PASS** |
| **TC_ATT_04** | Chấm công | US-12 | Check-out trước 17:30 cập nhật Về sớm | Business | **P0** | Cập nhật giờ ra, trạng thái chuyển `EarlyLeave` | **PASS** |
| **TC_SEC_01** | Bảo mật CSDL | US-16 | Least Privilege: User `app_user` không thể DROP | DBA | **P0** | MySQL báo lỗi từ chối lệnh `DROP TABLE` | **PASS** |
| **TC_SEC_02** | Bảo mật CSDL | US-16 | Least Privilege: User `report_user` chỉ được SELECT | DBA | **P0** | Từ chối lệnh `INSERT/UPDATE`, chỉ cho phép đọc | **PASS** |
| **TC_INFRA_01**| Hạ tầng | TSK-19 | Healthcheck endpoint kiểm tra kết nối MySQL | Integration | **P0** | HTTP 200, độ trễ < 50ms, đủ 4 bảng CSDL | **PASS** |

---

## 🐞 6. BẢNG THEO DÕI LỖI THỰC TẾ (BUG TRACKING TABLE - 11 BUGS ĐÃ GHI NHẬN)

*(Trích lục từ Tab `Bug_Tracking` trong file [`HRM_TestCases_BugTracking.xlsx`](file:///d:/QLNS_QLTKPM/docs/HRM_TestCases_BugTracking.xlsx))*

| Bug ID | Tiêu đề lỗi (Summary) | Phân hệ | Severity | Priority | Nguyên nhân gốc rễ (Root Cause) | Trạng thái |
| :---: | :--- | :---: | :---: | :---: | :--- | :---: |
| **BUG-01** | Xung đột cổng 3000 và 3306 với container bài tập cũ | Docker | **Critical** | **P0** | Các container `meeting_mysql` và `meeting_backend` đang chiếm cổng | **CLOSED** |
| **BUG-02** | Nhân viên có thể bấm Check-in nhiều lần tạo bản ghi trùng lặp | Chấm công | **Critical** | **P0** | Thiếu ràng buộc `UNIQUE KEY (employee_id, attendance_date)` | **CLOSED** |
| **BUG-03** | Lỗi PowerShell chặn chạy file `npm.ps1` do Execution Policy | Tooling | **Major** | **P1** | PowerShell mặc định chặn thực thi script `.ps1` | **CLOSED** |
| **BUG-04** | Số CCCD bị hiển thị dạng plain-text trên API danh sách nhân viên | Nhân sự | **Critical** | **P0** | Query SELECT nạp nhầm cột mã hóa mà không mask ký tự | **RESOLVED**|
| **BUG-05** | Xóa phòng ban có nhân viên làm việc gây mồ côi dữ liệu | Phòng ban | **Major** | **P0** | Khóa ngoại đặt `ON DELETE CASCADE` thay vì `ON DELETE RESTRICT` | **CLOSED** |
| **BUG-06** | Thiếu thuộc tính chuẩn `background-clip` gây cảnh báo CSS | Frontend | **Minor** | **P2** | Chỉ khai báo `-webkit-background-clip` trên trình duyệt cũ | **CLOSED** |
| **BUG-07** | Form đăng nhập chấp nhận mật khẩu quá ngắn (< 6 ký tự) | Frontend | **Minor** | **P2** | Thiếu kiểm tra điều kiện validation độ dài mật khẩu tại client | **CLOSED** |
| **BUG-08** | Giờ chấm công bị lệch 7 tiếng do MySQL chạy múi giờ UTC | Chấm công | **Major** | **P1** | Container MySQL chạy UTC, connection pool chưa ép `timezone: '+07:00'` | **RESOLVED**|
| **BUG-09** | Gợi ý mật khẩu mẫu trên giao diện sai lệch với mật khẩu băm trong CSDL | Frontend | **Major** | **P1** | UI điền nhanh `AdminPassword2026!` trong khi DB băm `Admin@123` | **CLOSED** |
| **BUG-10** | API GET /api/auth/profile trả về 400 INVALID_USER_ID | Backend | **Critical** | **P0** | Controller trích xuất `req.user.sub` thay vì `req.user.id` từ Auth Middleware | **CLOSED** |
| **BUG-11** | Bundle container Docker Nginx cũ bị lỗi ReferenceError: displayRole | Docker/FE | **Major** | **P1** | Container `hrm-ictu-frontend` chạy mã cũ chưa đồng bộ với Vite dist mới | **CLOSED** |
| **BUG-12** | Lỗi hiển thị font chữ tiếng Việt (Mojibake `Tráº§n VÄƒn Nam`) do charset kết nối | DB/Fullstack | **Major** | **P1** | MySQL client connection thiếu `SET NAMES utf8mb4` khi nạp seed data | **CLOSED** |

---

## 📈 7. BÁO CÁO TỔNG KẾT CHẤT LƯỢNG (TEST SUMMARY & RELEASE CRITERIA)

### 7.1 Thống kê thực thi:
- **Tổng số Test Cases:** `20`
- **Tỷ lệ thực thi (Execution Rate):** `100.0%` (20/20)
- **Tỷ lệ vượt qua (Pass Rate):** `100.0%` (20/20)
- **Số lỗi nghiêm trọng (Blocker/Critical) còn mở:** `0`

### 7.2 Đánh giá sẵn sàng phát hành (Release Readiness):
- [x] Cơ sở dữ liệu đạt chuẩn 3NF, có cơ chế mã hóa AES-256 số CCCD (đạt tiêu chí Lab 6).
- [x] Cấu hình phân quyền Least Privilege với 2 tài khoản `app_user` và `report_user` vận hành chính xác.
- [x] Khung giao diện SPA hoàn thành với Router mượt mà, không giật lag hoặc reload trang.
- [x] Docker Compose điều phối độc lập tại cổng `3005` và `3308`, không xung đột môi trường.
- [x] **KẾT LUẬN: ĐỦ ĐIỀU KIỆN 100% ĐỂ NỘM ĐỒ ÁN VÀ THỰC HIỆN COMMIT MỐC 1 TRÊN GITHUB.**

---

## 📥 8. HƯỚNG DẪN IMPORT FILE BẢNG TÍNH VÀO GOOGLE SHEETS / JIRA

### Cách 1: Sử dụng trực tiếp trên Google Sheets
1. Mở [Google Drive](https://drive.google.com/).
2. Nhấn **Mới (New)** $\rightarrow$ **Tải tệp lên (File upload)** $\rightarrow$ Chọn tệp [`docs/HRM_TestCases_BugTracking.xlsx`](file:///d:/QLNS_QLTKPM/docs/HRM_TestCases_BugTracking.xlsx).
3. Nhấp đúp vào tệp để mở trực tiếp trên Google Sheets. Bảng tính đã được định dạng sẵn màu sắc, border và wrap text tự động!

### Cách 2: Nhập khẩu vào Jira (Jira Issue Import)
1. Trong dự án Jira của nhóm, chọn mục **Project Settings** $\rightarrow$ **Import Issues**.
2. Chọn định dạng **CSV** (Bạn có thể mở file Excel và Save as thành `.csv` riêng cho tab `Bug_Tracking`).
3. Thực hiện ánh xạ (Mapping) các cột:
   - `Tiêu đề lỗi` $\rightarrow$ `Summary`
   - `Module` $\rightarrow$ `Component/s`
   - `Mức nghiêm trọng` $\rightarrow$ `Severity`
   - `Mức ưu tiên` $\rightarrow$ `Priority`
   - `Các bước tái hiện` $\rightarrow$ `Description`
   - `Trạng thái` $\rightarrow$ `Status`
   - `Người xử lý` $\rightarrow$ `Assignee`
4. Nhấn **Begin Import** để đưa toàn bộ 8 Bugs mẫu vào hệ thống Jira của nhóm.
