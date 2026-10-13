# ==============================================================================
# HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM) - DOCKERFILE BACKEND SERVICE
# Multi-stage / Production-ready Node.js container với non-root user
# ==============================================================================

FROM node:22-alpine AS base

# Cài đặt curl để hỗ trợ container healthcheck (nếu cần)
RUN apk add --no-cache curl

WORKDIR /usr/src/app

# Sao chép file cấu hình dependencies
COPY package*.json ./

# Cài đặt dependencies cho production (loại trừ devDependencies)
RUN npm ci --omit=dev && npm cache clean --force

# Sao chép toàn bộ mã nguồn ứng dụng
COPY src/ ./src/

# Chuyển quyền sở hữu thư mục làm việc cho người dùng non-root 'node' (Tiêu chuẩn bảo mật Lab 6 / US-17)
RUN chown -R node:node /usr/src/app

# Kích hoạt user non-root
USER node

# Biến môi trường mặc định trong container
ENV NODE_ENV=production \
    PORT=3000

# Mở cổng dịch vụ
EXPOSE 3000

# Khai báo Healthcheck nội bộ của container
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Lệnh khởi chạy ứng dụng
CMD ["node", "src/server.js"]
