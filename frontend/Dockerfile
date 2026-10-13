# ==============================================================================
# FRONTEND DOCKERFILE - HRM ICTU (Vite + Vanilla JS SPA -> Nginx Alpine)
# Multi-stage build nhằm tối ưu kích thước image và bảo mật
# ==============================================================================

# ------------------------------------------------------------------------------
# STAGE 1: Build Application
# ------------------------------------------------------------------------------
FROM node:22-alpine AS build-stage

WORKDIR /app

# Sao chép file định nghĩa package để tận dụng Docker layer caching
COPY package*.json ./

# Cài đặt dependencies (bao gồm Vite)
RUN npm ci

# Sao chép toàn bộ mã nguồn Frontend
COPY . .

# Build ứng dụng SPA sang thư mục /app/dist
RUN npm run build

# ------------------------------------------------------------------------------
# STAGE 2: Serve via Nginx Web Server
# ------------------------------------------------------------------------------
FROM nginx:alpine AS production-stage

# Xóa cấu hình mặc định của Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Sao chép cấu hình Nginx tối ưu hóa cho SPA Fallback & Proxy API
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Sao chép các tệp tĩnh đã build từ stage 1 vào thư mục root của Nginx
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Mở cổng 80 của container
EXPOSE 80

# Healthcheck định kỳ kiểm tra web server Nginx có đang phản hồi không
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

# Khởi chạy Nginx ở chế độ foreground
CMD ["nginx", "-g", "daemon off;"]
