<!-- ======================================================================= -->
<!-- HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU) - PULL REQUEST TEMPLATE -->
<!-- Vui lòng điền đầy đủ các mục bên dưới trước khi yêu cầu Code Review -->
<!-- ======================================================================= -->

## 1. 🎯 Mục tiêu & Tổng quan thay đổi
<!-- Tóm tắt ngắn gọn mục tiêu của Pull Request này (Giải quyết vấn đề gì? Thêm tính năng gì?) -->
- 

## 2. 📋 Mã Task liên quan (Jira / GitHub Issues / Backlog)
<!-- Ghi rõ mã task theo quy ước, ví dụ: HRM-102, HRM-105 -->
- Task: `HRM-`
- Link Backlog / Sheet: 

## 3. 🔍 Chi tiết các thay đổi chính
<!-- Đánh dấu vào phạm vi thay đổi và liệt kê các tệp/thành phần cốt lõi -->
- [ ] **Frontend**: 
- [ ] **Backend**: 
- [ ] **Database / Migration**: 
- [ ] **DevOps / Docker / Config**: 
- [ ] **Tài liệu**: 

## 4. 🧪 Hướng dẫn kiểm thử (Test Steps)
<!-- Các bước để reviewer tái hiện và kiểm tra tính năng trên máy local -->
1. Chuyển sang nhánh: `git checkout <tên_nhánh>`
2. Cập nhật môi trường (nếu có): `...`
3. Khởi động service: `docker compose up -d` (hoặc `npm run dev`)
4. Các bước thao tác trên giao diện hoặc API:
   - Bước 1: 
   - Bước 2: 
5. Kết quả mong đợi (Expected Result): 

## 5. 📸 Ảnh chụp màn hình / Video minh họa (UI Changes)
<!-- Bắt buộc đính kèm ảnh chụp màn hình nếu có thay đổi giao diện người dùng -->
| Trước thay đổi (Before) | Sau thay đổi (After) |
| --- | --- |
| *(Nếu có)* | *(Kéo thả ảnh hoặc dán link ảnh vào đây)* |

## 6. 🗄️ Thay đổi Cơ sở dữ liệu (Database Changes)
<!-- Có thay đổi bảng, cột, khóa ngoại hay thêm dữ liệu mẫu không? -->
- [ ] Không có thay đổi DB.
- [ ] Có cập nhật DDL / DML trong thư mục `database/`.
  - Tên file SQL: 
  - Mô tả thay đổi: 

## 7. 🔐 Biến môi trường mới (New Environment Variables)
<!-- Có thêm biến môi trường mới nào vào .env không? -->
- [ ] Không có biến môi trường mới.
- [ ] Có biến môi trường mới (ĐÃ CẬP NHẬT VÀO `.env.example`):
  - Tên biến: `...`
  - Giá trị mẫu: `...`

---

## 8. ✅ Checklist Definition of Done (DoD)
<!-- Đánh dấu [x] vào các tiêu chí đã hoàn thành. Nếu mục nào không áp dụng, ghi rõ N/A -->

### DoD Chung
- [ ] Mã nguồn nằm đúng phạm vi của task, không sửa đổi file ngoài phạm vi.
- [ ] Tuân thủ Conventional Commits (ví dụ: `feat(HRM-102): ...`, `fix(HRM-105): ...`).
- [ ] Không commit file nhạy cảm (`.env`, mật khẩu, token, private key).
- [ ] Không commit rác (`node_modules/`, `dist/`, `*.log`, file tạm).
- [ ] Đã rebase / merge nhánh `develop` mới nhất và không có xung đột (merge conflicts).
- [ ] Code sạch sẽ, không còn `console.log` thừa, `debugger`, hoặc mã nguồn comment bỏ đi.

### DoD Frontend (Nếu có)
- [ ] Giao diện responsive, không vỡ layout trên desktop & mobile.
- [ ] Đã xử lý đầy đủ các trạng thái: Loading, Empty, Error, Success.
- [ ] Kiểm tra hợp lệ dữ liệu form đầu vào (Validation) trước khi gửi API.
- [ ] Không có lỗi runtime hoặc uncaught exception trong Developer Console (F12).
- [ ] Lệnh `npm run build` chạy thành công, không phát sinh lỗi biên dịch.

### DoD Backend (Nếu có)
- [ ] Endpoint tuân thủ chuẩn RESTful API và quy chuẩn đặt tên đã thống nhất.
- [ ] Kiểm tra và sanitize dữ liệu đầu vào (Request validation).
- [ ] Xử lý ngoại lệ đầy đủ (try/catch), mã HTTP status trả về chính xác (200, 201, 400, 401, 403, 404, 500).
- [ ] Không để lộ thông tin nhạy cảm trong response (mật khẩu băm, chuỗi kết nối, stack trace).
- [ ] Endpoint đã được kiểm tra thực tế bằng Postman / cURL.

### DoD Database / Docker (Nếu có)
- [ ] Lệnh `docker compose config` chạy hợp lệ không báo lỗi.
- [ ] Dữ liệu không bị mất mát khi khởi động lại container (Persistent Volume).
- [ ] Kịch bản SQL tuân thủ quy ước đặt tên (snake_case, có khóa chính, khóa ngoại).

---
*Reviewed by: @...*
