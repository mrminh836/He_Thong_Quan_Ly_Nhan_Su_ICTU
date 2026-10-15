# ==============================================================================
# HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
# SECURITY HEADERS CHUẨN DEVSECOPS (LAB 1 & LAB 5 / OWASP BEST PRACTICES)
# ==============================================================================

# A. Bắt buộc: Chống Clickjacking - Chỉ cho phép nhúng iframe từ cùng một Origin
add_header X-Frame-Options "SAMEORIGIN" always;

# B. Bắt buộc: Chống MIME-Type Sniffing - Ngăn trình duyệt tự đoán MIME type
add_header X-Content-Type-Options "nosniff" always;

# C. Bổ sung: Bảo vệ chống Cross-Site Scripting (XSS) cho các trình duyệt kế thừa
add_header X-XSS-Protection "1; mode=block" always;

# D. Bổ sung: Giới hạn thông tin Referrer khi điều hướng liên nguồn
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# E. Bổ sung: Vô hiệu hóa các tính năng phần cứng nhạy cảm không cần thiết (Camera, Mic, GPS)
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# F. Bổ sung: Ngăn chặn Adobe Flash & PDF tải policy chéo domain
add_header X-Permitted-Cross-Domain-Policies "none" always;
