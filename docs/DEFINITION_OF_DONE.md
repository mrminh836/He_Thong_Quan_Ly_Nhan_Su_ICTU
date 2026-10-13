# BỘ TIÊU CHÍ HOÀN THÀNH CÔNG VIỆC (DEFINITION OF DONE - DoD)
## DỰ ÁN: HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
### Nhóm Phát triển Phần mềm | K23 - Khoa CNTT - ICTU

---

## 1. Mục đích và Ý nghĩa của Definition of Done (DoD)

Trong quy trình phát triển phần mềm Agile/Scrum của nhóm, **Definition of Done (DoD)** là một "bản cam kết chất lượng" được toàn bộ thành viên thống nhất. Một công việc (Task / User Story / Bugfix) **chỉ được coi là HOÀN THÀNH (DONE)** khi và chỉ khi thỏa mãn toàn bộ các tiêu chí nghiệm thu tương ứng trong tài liệu này.

> **Nguyên tắc cốt lõi:**
> - *"Code xong" KHÔNG đồng nghĩa với "Done".*
> - Không có khái niệm "Done 90%" hay "Done nhưng chưa test".
> - Nếu một tiêu chí chưa đạt hoặc chưa kiểm thử, công việc vẫn giữ trạng thái **In Progress** hoặc **In Review**, tuyệt đối **KHÔNG** được merge vào nhánh tích hợp `develop` hoặc `main`.

---

## 2. Tiêu chí DoD Chung (Áp dụng cho MỌI Task)

Mọi thành viên khi thực hiện bất kỳ task nào đều phải vượt qua danh sách kiểm tra sau:

| STT | Tiêu chí | Mô tả chi tiết & Tiêu chuẩn nghiệm thu | Minh chứng bắt buộc |
| :---: | :--- | :--- | :--- |
| **G-01** | **Đáp ứng Acceptance Criteria** | Tính năng đáp ứng 100% tiêu chí nghiệm thu được mô tả trong Product Backlog / Sprint Backlog. | Kịch bản kiểm thử thực tế đạt kết quả mong muốn. |
| **G-02** | **Đúng phạm vi (Scope)** | Code chỉ thay đổi trong phạm vi chức năng được giao, không sửa đổi chéo các module không liên quan. | Git diff trên Pull Request gọn gàng, đúng module. |
| **G-03** | **Bảo mật bí mật (No Secrets)** | Tuyệt đối không hardcode mật khẩu, token, private key hoặc commit file `.env` cá nhân vào Git. | `.gitignore` được áp dụng; biến nhạy cảm đưa vào biến môi trường. |
| **G-04** | **Không rác phát sinh** | Không commit các file sinh tự động (`node_modules/`, `dist/`, `*.log`, `.DS_Store`, cache). | Working tree sạch sẽ. |
| **G-05** | **Đồng bộ nhánh (No Conflicts)** | Nhánh làm việc đã rebase hoặc merge mã nguồn mới nhất từ nhánh `develop`, không xảy ra xung đột code. | Pull Request hiển thị trạng thái *"Able to merge"*. |
| **G-06** | **Xử lý ngoại lệ (Error Handling)** | Mọi tình huống người dùng nhập sai, rớt mạng hoặc lỗi hệ thống đều có thông báo thân thiện, không crash. | Thử nghiệm với dữ liệu biên / dữ liệu lỗi. |
| **G-07** | **Code Review** | Được ít nhất **01 thành viên trong nhóm** (hoặc Tech Lead) review độc lập và phê duyệt (Approve) trên GitHub. | Lịch sử Review và Approve trên PR. |
| **G-08** | **Tự động hóa CI thành công** | Toàn bộ các bước kiểm tra tự động trên GitHub Actions CI đều đạt trạng thái Xanh (Passed). | Badge / Tích xanh trên GitHub Actions. |
| **G-09** | **Cập nhật tài liệu liên quan** | Nếu có thay đổi cấu hình, API, biến môi trường mới, phải cập nhật vào `.env.example` và tài liệu tương ứng. | Diff của các file tài liệu và `.env.example`. |
| **G-10** | **Cập nhật trạng thái Task** | Chuyển trạng thái task trên bảng quản lý (Jira / Sheets / GitHub Projects) từ *In Review* sang *Done*. | Cập nhật link PR vào thẻ Task. |

---

## 3. Tiêu chí DoD Chuyên biệt theo Từng Lĩnh vực

### 3.1. DoD Dành cho Frontend (Giao diện & Trải nghiệm người dùng)

Áp dụng cho các task phát triển giao diện SPA (Vanilla JS + Vite / CSS / DOM):

- [ ] **Đúng thiết kế & Thẩm mỹ**: Giao diện chuẩn Enterprise, tuân thủ Design Tokens (bảng màu Indigo/Slate, typography Inter/Segoe UI, icon SVG đồng bộ).
- [ ] **Responsive Design**: Hiển thị rõ ràng trên Desktop (>= 1280px), Laptop (1024px) và Mobile/Tablet (<= 768px), không bị tràn viền (horizontal scroll ngoài ý muốn) hay đè nút.
- [ ] **Router & SPA Navigation**: Điều hướng không reload trang; các route chức năng (`/departments`, `/employees`, `/attendances`, `/users`, `/login`) hoạt động chính xác.
- [ ] **Bảo đảm SPA Fallback**: Khi người dùng F5 hoặc copy dán trực tiếp đường dẫn con vào thanh địa chỉ, trang web không bị lỗi 404 (đã kiểm tra qua Nginx fallback).
- [ ] **Trạng thái UI toàn diện (UI States)**:
  - *Loading State*: Có skeleton hoặc spinner khi đang fetch dữ liệu.
  - *Empty State*: Có thông báo và icon trực quan khi danh sách trống.
  - *Error State*: Thông báo lỗi rõ ràng kèm nút thử lại khi gọi API thất bại.
  - *Success State*: Toast thông báo thành công khi thêm/sửa/xóa hoàn tất.
- [ ] **Form Validation**: Kiểm tra hợp lệ dữ liệu client trước khi submit (bắt buộc nhập, định dạng email, CCCD 12 chữ số, số điện thoại, ngày tháng).
- [ ] **Developer Console Sạch sẽ**: Không có bất kỳ uncaught exception, lỗi cú pháp, hoặc cảnh báo nghiêm trọng nào trong Console (F12).
- [ ] **Build Production**: Chạy lệnh `npm run build` tại thư mục `frontend` không sinh ra lỗi biên dịch.

---

### 3.2. DoD Dành cho Backend (Node.js / Express API)

Áp dụng cho các task xây dựng RESTful API và xử lý logic nghiệp vụ:

- [ ] **Chuẩn RESTful API**: Endpoint đặt tên danh từ số nhiều (ví dụ: `GET /api/employees`, `POST /api/departments`), định dạng phản hồi chuẩn JSON:
  ```json
  { "success": true, "data": { ... } }
  // hoặc khi lỗi:
  { "success": false, "error": { "code": "VALIDATION_FAILED", "message": "..." } }
  ```
- [ ] **Mã trạng thái HTTP chính xác**:
  - `200 OK`: Truy vấn hoặc cập nhật thành công.
  - `201 Created`: Tạo mới bản ghi thành công.
  - `400 Bad Request`: Tham số đầu vào không hợp lệ.
  - `401 Unauthorized`: Chưa đăng nhập hoặc Token hết hạn.
  - `403 Forbidden`: Không có quyền truy cập chức năng.
  - `404 Not Found`: Không tìm thấy tài nguyên.
  - `409 Conflict`: Trùng lặp dữ liệu (Email/Mã NV/CCCD đã tồn tại).
  - `500 Internal Server Error`: Lỗi hệ thống nội bộ.
- [ ] **Kiểm tra và khử trùng dữ liệu (Validation & Sanitization)**: Mọi payload body, query params đều được kiểm tra kiểu dữ liệu, giới hạn ký tự trước khi xử lý.
- [ ] **Bảo mật dữ liệu nhạy cảm**:
  - Mật khẩu người dùng bắt buộc băm bằng thuật toán an toàn (Bcrypt/Argon2).
  - Không bao giờ trả về trường `password` hoặc chuỗi kết nối trong API response.
  - Không để lộ chi tiết stack trace của máy chủ khi trả về lỗi 500 cho client.
- [ ] **An toàn cơ sở dữ liệu**: Bắt buộc dùng **Parameterized Queries** (`mysql2` với placeholder `?`) để chống SQL Injection 100%.
- [ ] **Healthcheck Endpoint**: Có endpoint `/api/health` và `/api/health/db` hoạt động chính xác phục vụ giám sát container.
- [ ] **Static Check**: Lệnh `npm test` (hoặc `npm run test:syntax`) chạy thành công không có lỗi cú pháp.

---

### 3.3. DoD Dành cho Database (MySQL 8.0)

Áp dụng cho các task liên quan đến DDL, DML, Migration hoặc thiết kế bảng:

- [ ] **Tuân thủ ERD chuẩn**: Tên bảng, tên cột, quan hệ tuân thủ 100% tài liệu thiết kế cơ sở dữ liệu đã phê duyệt (`docs/ERD_DATABASE_DESIGN.md`).
- [ ] **Ràng buộc toàn vẹn (Integrity Constraints)**:
  - Khóa chính (Primary Key) tự tăng hoặc UUID chuẩn mực.
  - Khóa ngoại (Foreign Key) có quy tắc `ON DELETE RESTRICT` hoặc `CASCADE` rõ ràng.
  - Đánh chỉ mục (INDEX) trên các cột thường xuyên tìm kiếm hoặc lọc (ví dụ: `email`, `employee_code`, `department_id`).
  - Khóa duy nhất (UNIQUE) trên `email`, `employee_code`, `citizen_id`.
- [ ] **Mã hóa dữ liệu nhạy cảm**: Trường số Căn cước công dân (`citizen_id`) phải được mã hóa AES-256 theo tiêu chuẩn bảo mật.
- [ ] **Tính tái lập của Migration (Idempotency)**: Các kịch bản SQL phải an toàn khi chạy lại (`CREATE TABLE IF NOT EXISTS`, kiểm tra tồn tại).
- [ ] **Phân quyền truy cập (Least Privilege)**:
  - Ứng dụng kết nối bằng tài khoản nghiệp vụ `app_user` (chỉ có quyền `SELECT, INSERT, UPDATE, DELETE`).
  - Tuyệt đối không dùng quyền `root` cho kết nối ứng dụng thông thường.
- [ ] **Bảo toàn dữ liệu**: Không tạo script làm mất dữ liệu hiện có trong volume khi chưa có phương án sao lưu.

---

### 3.4. DoD Dành cho Docker & DevOps

Áp dụng cho các task liên quan đến container hóa, CI/CD và môi trường triển khai:

- [ ] **Cú pháp Compose hợp lệ**: Chạy lệnh `docker compose config` không phát sinh lỗi cảnh báo cú pháp.
- [ ] **Multi-stage Image tối ưu**: Dockerfile phân chia stage rõ ràng, dung lượng image nhỏ gọn, sử dụng base image Alpine bảo mật.
- [ ] **Chạy với Non-root User**: Container Backend và Frontend chạy với user giới hạn quyền (như `node` hoặc `nginx`), không dùng user root của Linux.
- [ ] **Healthcheck hoạt động**: Cả 3 service `db`, `backend`, `frontend` đều có cấu hình `healthcheck` chính xác và đạt trạng thái `healthy`.
- [ ] **Thứ tự khởi động phụ thuộc**: Sử dụng `depends_on` kèm `condition: service_healthy` để backend chỉ chạy sau khi MySQL đã sẵn sàng nhận kết nối.
- [ ] **Lưu trữ dữ liệu bền vững (Persistent Volume)**: Dữ liệu MySQL được lưu trên named volume `mysql_data`. Khi chạy `docker compose down` rồi `docker compose up -d`, toàn bộ dữ liệu bảng vẫn còn nguyên vẹn.
- [ ] **Phân tách Port máy Host an toàn**: Cấu hình port không đụng chạm với các dịch vụ mặc định trên máy học viên:
  - MySQL: `3308:3306`
  - Backend: `3005:3005`
  - Frontend: `5173:80`
- [ ] **Không commit file môi trường**: Tệp `.env` không bị đẩy lên Git; `.env.example` cung cấp đủ biến cấu hình mẫu.

---

### 3.5. DoD Dành cho Tài liệu & Hướng dẫn (Documentation)

Áp dụng cho các task cập nhật tài liệu kỹ thuật, hướng dẫn sử dụng:

- [ ] **Tính chính xác & Khả năng tái lập**: Mọi câu lệnh, đường dẫn, tham số được ghi trong tài liệu đều phải được thực tế chạy thử và kiểm chứng thành công trên máy khác.
- [ ] **Dễ hiểu cho người mới**: Tài liệu hướng dẫn thiết lập (`DOCKER_SETUP.md`, `GIT_WORKFLOW.md`) phải đủ chi tiết để một thành viên mới clone dự án về có thể khởi chạy được hệ thống mà không cần người khác hướng dẫn trực tiếp.
- [ ] **Không chứa lệnh nguy hiểm mặc định**: Không hướng dẫn chạy `docker compose down -v` như lệnh tắt ứng dụng thông thường (vì làm mất dữ liệu database). Nếu có hướng dẫn lệnh xóa dữ liệu, bắt buộc phải có cảnh báo màu đỏ/vàng rõ ràng.

---

## 4. Bảng Tóm tắt Kiểm tra Nhanh (Checklist Trước khi Bấm Merge)

```text
[ ] 1. Task có mã nhận diện rõ ràng (ví dụ: HRM-102)?
[ ] 2. Mã nguồn đã được rebase/merge develop mới nhất?
[ ] 3. Đã chạy thử tại local và đáp ứng toàn bộ Acceptance Criteria?
[ ] 4. Đã chạy build thành công (npm run build / npm test)?
[ ] 5. docker compose config và khởi động 3 container hoạt động tốt?
[ ] 6. Không có mật khẩu / file .env / mã thừa lọt vào Git?
[ ] 7. Đã điền đầy đủ mẫu Pull Request Template (có kèm ảnh chụp UI nếu sửa Frontend)?
[ ] 8. GitHub Actions CI đã chạy Xanh (Passed)?
[ ] 9. Đã được ít nhất 1 Peer Reviewer Approve?
[ ] 10. Trạng thái task trên Backlog đã sẵn sàng chuyển sang "Done"?
```

---
*Tài liệu này là quy chuẩn bắt buộc của dự án HRM ICTU. Mọi thắc mắc hoặc đề xuất cải tiến vui lòng liên hệ Technical Lead hoặc thảo luận trong buổi họp Sprint Retrospective.*
