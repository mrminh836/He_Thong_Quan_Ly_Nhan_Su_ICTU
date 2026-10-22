# 📊 BÁO CÁO KIỂM THỬ QA: ĐỐI SOÁT TỶ LỆ PHẦN TRĂM BIỂU ĐỒ VỚI SỐ LIỆU CSDL THỰC TẾ

**Dự án:** Hệ thống Quản trị Nhân sự (HRM - ICTU)  
**Mục tiêu kiểm thử:** Đối soát độc lập và toàn diện các con số thống kê và tỷ lệ phần trăm (%) hiển thị trên hai biểu đồ Dashboard (Biểu đồ tròn Cơ cấu nhân sự & Biểu đồ cột Tỷ lệ chấm công đúng giờ) trực tiếp với dữ liệu lưu trữ trong CSDL MySQL 8.0 thực tế.  
**Tiêu chuẩn áp dụng:** IEEE 829 (Software Test Documentation), ISO/IEC 25010 (Data Accuracy & Integrity), ISTQB Advanced Technical Test Analyst.  
**Người thực hiện (QA Engineer):** Đỗ Quang Minh  
**Môi trường kiểm thử:**
- **Database:** MySQL 8.0 (Container `mysql-db`, cổng Host `3309`, Database: `hrm_db`, InnoDB UTF8MB4).
- **Backend API:** Node.js v22 + Express REST API (Container `hrm-ictu-backend`, cổng Host `3005`).
- **Frontend SPA:** Vanilla JavaScript + HTML5/SVG + Vite (Container `hrm-ictu-frontend`, cổng Host `5173`).
- **Reverse Proxy / SSL:** Nginx Alpine (Container `hrm-nginx`, cổng `80` và `443`).

---

## 📌 1. NGUYÊN TẮC NGHIỆP VỤ & CÔNG THỨC ĐỐI SOÁT TOÁN HỌC

### 1.1. Biểu đồ tròn (Pie / Doughnut Chart) — Cơ cấu nhân sự theo phòng ban
- **Phạm vi tính toán:** Chỉ đếm các nhân viên có trạng thái làm việc hợp lệ (`employment_status IN ('Active', 'OnLeave')`).
- **Loại trừ nghiêm ngặt:** Nhân viên đã thôi việc (`Resigned`) **tuyệt đối không** được tính vào số nhân sự hiện tại hay mẫu số tỷ trọng.
- **Phòng ban chưa có nhân viên:** Vẫn phải hiển thị trong kết quả với `employeeCount = 0` và `percentage = 0%`. Không làm phát sinh phép chia cho 0.
- **Công thức đối soát:**
  $$\text{Tỷ trọng phòng ban } i \text{ (\%)} = \frac{\text{Số nhân viên đang làm việc của phòng ban } i}{\text{Tổng số nhân viên đang làm việc toàn công ty}} \times 100$$
- **Chuẩn làm tròn:** Làm tròn 2 chữ số thập phân (`toFixed(2)`).
- **Tính toàn vẹn:** Tổng tỷ trọng của tất cả phòng ban phải xấp xỉ $100\%$ ($\sum P_i \approx 100\%$).

### 1.2. Biểu đồ cột (Bar Chart) — Tỷ lệ chấm công đúng giờ theo phòng ban
- **Phạm vi tính toán:** Các nhân viên thuộc phòng ban có bản ghi check-in trong ngày làm việc hôm nay (`check_in IS NOT NULL`).
- **Phân loại giờ làm việc:** Mốc ca làm việc chuẩn là `08:30:00` (múi giờ `Asia/Ho_Chi_Minh`):
  - Check-in $\le$ `08:30:00` hoặc `attendance_status = 'OnTime'`: **Đúng giờ**.
  - Check-in $>$ `08:30:00` hoặc `attendance_status = 'Late'`: **Đi muộn**.
- **Công thức đối soát:**
  $$\text{Tỷ lệ đúng giờ (\%)} = \frac{\text{Số lượt check-in đúng giờ hợp lệ của phòng ban}}{\text{Tổng số lượt check-in hợp lệ của phòng ban}} \times 100$$
- **Xử lý phòng ban chưa có lượt check-in:** 
  - Nếu tổng số lượt check-in = 0 $\rightarrow$ `onTimeRate = null`.
  - Hiển thị nhãn **`Chưa có DL`** kèm vạch chỉ báo rỗng.
  - **Tuyệt đối không hiển thị 0%** để tránh ngộ nhận là 0% đúng giờ (tất cả đều đi muộn).

---

## 📋 2. MA TRẬN ĐỐI SOÁT DỮ LIỆU THỰC TẾ (RECONCILIATION AUDIT MATRIX)

### Bảng 1: Đối soát Biểu đồ tròn Cơ cấu nhân sự với CSDL MySQL thực tế

| ID Phòng | Mã PB | Tên Phòng Ban | CSDL: Nhân sự Active | CSDL: Nhân sự Resigned | CSDL: Tỷ trọng chuẩn (%) | Backend API (`employeeCount`) | Biểu đồ Pie (`percentage`) | Trạng thái đối soát |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | `PB-TECH` | Phòng Kỹ thuật & Công nghệ | **5** | 12 | **71.43%** | **5** | **71.43%** | 🟢 **KHỚP 100%** |
| **2** | `PB-HR` | Phòng Nhân sự & Hành chính | **1** | 0 | **14.29%** | **1** | **14.29%** | 🟢 **KHỚP 100%** |
| **3** | `PB-BIZ` | Phòng Kinh doanh & Marketing | **1** | 0 | **14.29%** | **1** | **14.29%** | 🟢 **KHỚP 100%** |
| **45** | `PB-QA-RES-7137` | Phòng Thử Nghiệm Resigned | **0** | 0 | **0.00%** | **0** | **0.00%** | 🟢 **KHỚP 100%** |
| **TỔNG** | — | **Toàn công ty** | **7** | **12** | **100.01%** | **7** | **100.01%** | 🟢 **KHỚP 100%** |

> **Nhận xét kiểm thử:**
> - Toàn bộ 12 nhân viên trạng thái `Resigned` đã được loại trừ chính xác khỏi mẫu số và tử số.
> - Phòng ban ID 45 không có nhân viên hiển thị chính xác `0 NV` và `0%` trên Legend mà không tạo lát cắt âm hoặc lỗi rendering trên SVG.
> - Tổng tỷ trọng các phòng ban đạt $71.43\% + 14.29\% + 14.29\% + 0\% = 100.01\%$ (sai số làm tròn thập phân $\le 0.05\%$, đạt chuẩn toán học).

---

### Bảng 2: Đối soát Biểu đồ cột Tỷ lệ đúng giờ hôm nay với CSDL MySQL thực tế

| ID Phòng | Tên Phòng Ban | CSDL: Lượt Check-in | CSDL: Lượt Đúng giờ | CSDL: Lượt Đi muộn | CSDL: Tỷ lệ đúng giờ (%) | Bar Chart Value Label | Bar Chart Tooltip Details | Trạng thái đối soát |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | Phòng Kỹ thuật & Công nghệ | **2** | **2** | 0 | **100.0%** | **`100%`** | `2/2 check-in hợp lệ` | 🟢 **KHỚP 100%** |
| **2** | Phòng Nhân sự & Hành chính | **0** | 0 | 0 | **N/A** (Chưa có) | **`Chưa có DL`** | `Chưa có lượt check-in nào hôm nay` | 🟢 **KHỚP 100%** |
| **3** | Phòng Kinh doanh & Marketing | **0** | 0 | 0 | **N/A** (Chưa có) | **`Chưa có DL`** | `Chưa có lượt check-in nào hôm nay` | 🟢 **KHỚP 100%** |
| **45** | Phòng Thử Nghiệm Resigned | **0** | 0 | 0 | **N/A** (Chưa có) | **`Chưa có DL`** | `Chưa có lượt check-in nào hôm nay` | 🟢 **KHỚP 100%** |

> **Nhận xét kiểm thử:**
> - Nhân viên ID 1 và ID 3 thuộc Phòng Kỹ thuật đã check-in vào ca lúc `02:35` và `02:39`, trạng thái `OnTime` $\rightarrow$ Tỷ lệ đạt $2 / 2 = 100.0\%$.
> - Các phòng ban ID 2, 3 và 45 chưa có ai check-in hôm nay được hiển thị vạch xám và nhãn `Chưa có DL`, **tuyệt đối không hiển thị 0%**, ngăn chặn triệt để nguy cơ người quản trị hiểu nhầm là nhân viên đi làm muộn 100%.

---

## 🔬 3. KIỂM THỬ ĐỘNG (LIVE MUTATION & REALTIME RECONCILIATION AUDIT)

Để đảm bảo biểu đồ không sử dụng số liệu hardcode và tự động cập nhật ngay lập tức khi CSDL thay đổi:
1. **Thao tác chèn biến động:**
   - Tạo mới 1 phòng ban rỗng: `PB-QA-DYN` (`Phòng Thử Nghiệm Dynamic QA`).
   - Thêm 1 nhân viên mới vào Phòng ban 2 (`PB-HR`).
   - Tạo 1 lượt chấm công **ĐI MUỘN (`Late`)** vào lúc `08:45:00` hôm nay cho nhân viên này.
2. **Kết quả đối soát sau khi chèn:**
   - **Pie Chart:**
     - Phòng ban 2 tăng từ 1 nhân viên lên 2 nhân viên (tỷ trọng tự động tính lại từ $14.29\%$ lên $25.0\%$).
     - Phòng ban rỗng mới lập tức xuất hiện với số lượng `0 NV` và tỷ trọng `0%`.
   - **Bar Chart:**
     - Phòng ban 2 từ trạng thái `Chưa có DL` lập tức chuyển thành cột dữ liệu với nhãn **`0%`** (do có 1 check-in và $0/1$ đúng giờ).
3. **Dọn dẹp (Rollback):**
   - Xóa bỏ toàn bộ bản ghi tạm thời (`attendances`, `employees`, `departments`).
   - CSDL và các biểu đồ phục hồi về trạng thái nguyên bản 100%.

---

## 💻 4. NHẬT KÝ THỰC THI KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST LOGS)

```bash
> hrm-backend@1.0.0 test:qa:chart:audit
> node tests/qaDatabaseVsChartAudit.test.js

==============================================================================
🔍 BẮT ĐẦU KIỂM THỬ LIVE QA: ĐỐI SOÁT TỶ LỆ TRÊN BIỂU ĐỒ VỚI CSDL THỰC TẾ
   Backend URL: http://127.0.0.1:3005
   MySQL Host:  127.0.0.1:3309 (Database: hrm_db)
==============================================================================

▶ [TEST 1] 1. Đối soát Pie Chart Cơ cấu nhân sự: Số lượng & Tỷ trọng % với CSDL MySQL
     CSDL MySQL: 4 phòng ban, 7 nhân sự đang làm việc, 1 phòng ban rỗng.

     ┌────────────────────────────────────────────────────────────────────────────────────────┐
     │ BẢNG ĐỐI SOÁT CƠ CẤU NHÂN SỰ: CSDL THỰC TẾ VS API & BIỂU ĐỒ TRÒN (PIE CHART)           │
     ├─────┬──────────────────────┬─────────────┬──────────────┬─────────────┬────────────────┤
     │ ID  │ Tên Phòng Ban        │ DB Nhân sự  │ DB Tỷ trọng  │ API Nhân sự │ Biểu đồ Tỷ trọng│
     ├─────┼──────────────────────┼─────────────┼──────────────┼─────────────┼────────────────┤
     │   1 │ Phòng Kỹ thuật & Côn │           5 │       71.43% │           5 │         71.43% │
     │   2 │ Phòng Nhân sự & Hành │           1 │       14.29% │           1 │         14.29% │
     │   3 │ Phòng Kinh doanh & M │           1 │       14.29% │           1 │         14.29% │
     │  45 │ Phòng Thử Nghiệm Res │           0 │           0% │           0 │             0% │
     └─────┴──────────────────────┴─────────────┴──────────────┴─────────────┴────────────────┘
  ✅ [PASS] Đạt chuẩn đối soát 100%

▶ [TEST 2] 2. Đối soát Bar Chart Tỷ lệ đúng giờ: Check-in, On-time & nhãn Chưa có DL với CSDL

     ┌────────────────────────────────────────────────────────────────────────────────────────┐
     │ BẢNG ĐỐI SOÁT CHẤM CÔNG HÔM NAY: CSDL THỰC TẾ VS BIỂU ĐỒ CỘT (BAR CHART)                │
     ├─────┬──────────────────────┬─────────────┬──────────────┬─────────────┬────────────────┤
     │ ID  │ Tên Phòng Ban        │ DB Check-in │ DB Đúng giờ  │ DB Tỷ lệ %  │ Bar Chart Label│
     ├─────┼──────────────────────┼─────────────┼──────────────┼─────────────┼────────────────┤
     │   1 │ Phòng Kỹ thuật & Côn │           2 │            2 │        100% │           100% │
     │   2 │ Phòng Nhân sự & Hành │           0 │            0 │         N/A │     Chưa có DL │
     │   3 │ Phòng Kinh doanh & M │           0 │            0 │         N/A │     Chưa có DL │
     └─────┴──────────────────────┴─────────────┴──────────────┴─────────────┴────────────────┘
  ✅ [PASS] Đạt chuẩn đối soát 100%

▶ [TEST 3] 3. Live Mutation Audit: Thêm nhân viên đi muộn & phòng ban mới -> Kiểm tra biểu đồ cập nhật chuẩn xác
     Mutation Verified: Biến động CSDL cập nhật ngay lập tức vào API và tỷ lệ biểu đồ.
     Cleanup: Đã dọn dẹp toàn bộ bản ghi tạm thời, CSDL trở về trạng thái nguyên bản.
  ✅ [PASS] Đạt chuẩn đối soát 100%

==============================================================================
🎉 KẾT QUẢ QA AUDIT: ĐÃ HOÀN TẤT 3/3 KỊCH BẢN ĐỐI SOÁT CSDL THÀNH CÔNG 100%!
==============================================================================
```

---

## 🏆 5. KẾT LUẬN & ĐÁNH GIÁ NGHIỆM THU QA

1. **Độ chính xác dữ liệu (Data Precision):** Toàn bộ tỷ lệ phần trăm trên cả hai biểu đồ phản ánh chính xác $100\%$ dữ liệu thực tế từ các bảng trong MySQL.
2. **Khử trùng lặp & Ràng buộc logic (Business Rules):**
   - Loại trừ hoàn toàn nhân viên đã nghỉ việc khỏi cơ cấu nhân sự hiện tại.
   - Xử lý hoàn hảo phòng ban chưa có nhân viên và phòng ban chưa có lượt check-in hôm nay.
3. **Phản ứng Realtime:** Dữ liệu biểu đồ thay đổi tức thì và chính xác khi có bản ghi mới trong CSDL mà không cần khởi động lại ứng dụng hay cache sai lệch.
4. **Tiêu chuẩn nghiệm thu:** Tính năng trực quan hóa 2 biểu đồ Dashboard đạt chất lượng kiểm thử ở mức cao nhất (**Production Ready**).
