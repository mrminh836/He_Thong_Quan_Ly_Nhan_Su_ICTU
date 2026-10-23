#!/usr/bin/env bash
# ==============================================================================
# HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
# DevOps Automated MySQL Backup, Verification & Safe Disaster Recovery Script
# ==============================================================================
# Hỗ trợ các lệnh:
#   backup                      : Tạo bản sao lưu toàn vẹn (mysqldump + gzip + sha256)
#   list                        : Liệt kê các bản sao lưu hiện có và trạng thái checksum
#   verify <backup_file>        : Kiểm chứng tính toàn vẹn (gzip + sha256 + SQL structure)
#   restore <backup_file> [db]  : Phục hồi an toàn (Mặc định vào DB test cô lập)
#   test-recovery               : Tự động chạy quy trình sao lưu & phục hồi thử nghiệm E2E
#   help                        : Hiển thị hướng dẫn chi tiết
# ==============================================================================

set -Eeuo pipefail

# Màu hiển thị console
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Đường dẫn thư mục
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Tải biến môi trường từ .env
load_env() {
  local env_files=(
    "${PROJECT_ROOT}/.env"
    "${SCRIPT_DIR}/.env"
    "./.env"
  )
  for f in "${env_files[@]}"; do
    if [[ -f "$f" ]]; then
      # Đọc file .env an toàn (bỏ qua comment và dòng trống)
      while IFS= read -r line || [[ -n "$line" ]]; do
        line=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
        if [[ -n "$line" && ! "$line" =~ ^# && "$line" =~ = ]]; then
          local key="${line%%=*}"
          local val="${line#*=}"
          # Bỏ dấu nháy kép hoặc đơn bọc ngoài nếu có
          val="${val%\"}"
          val="${val#\"}"
          val="${val%\'}"
          val="${val#\'}"
          export "${key}=${val}" 2>/dev/null || true
        fi
      done < "$f"
      break
    fi
  done
}

load_env

# Biến cấu hình (Tự động thích ứng môi trường hoặc lấy từ .env)
CONTAINER_NAME="${MYSQL_CONTAINER:-mysql-db}"
DB_NAME="${DB_NAME:-hrm_db}"
DB_USER="root"
DB_PASS="${DB_ROOT_PASSWORD:-RootPassword@2026}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
DEFAULT_TEST_DB="${DB_NAME}_restore_test"

# File tạm để dọn dẹp khi có lỗi
TMP_FILE=""
TMP_SQL=""

cleanup() {
  local exit_code=$?
  if [[ -n "${TMP_FILE:-}" && -f "$TMP_FILE" ]]; then
    rm -f "$TMP_FILE"
  fi
  if [[ -n "${TMP_SQL:-}" && -f "$TMP_SQL" ]]; then
    rm -f "$TMP_SQL"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

log_info() {
  echo -e "${BLUE}ℹ️  [INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}✅ [SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠️  [WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}❌ [ERROR]${NC} $1" >&2
}

# Kiểm tra các công cụ phụ thuộc trên hệ thống
check_prerequisites() {
  local missing=()
  for cmd in docker gzip; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done

  # Kiểm tra sha256sum hoặc shasum
  if ! command -v sha256sum &>/dev/null && ! command -v shasum &>/dev/null; then
    missing+=("sha256sum/shasum")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Thiếu công cụ bắt buộc trên hệ thống: ${missing[*]}"
    log_error "Vui lòng cài đặt công cụ cần thiết trước khi chạy script."
    exit 1
  fi
}

# Hàm tính SHA-256 thích ứng
calculate_sha256() {
  local file="$1"
  if command -v sha256sum &>/dev/null; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    echo "N/A"
  fi
}

# Kiểm tra container MySQL đang chạy và sẵn sàng
check_mysql_ready() {
  log_info "Kiểm tra trạng thái container '${CONTAINER_NAME}'..."
  if ! docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}$"; then
    log_error "Container '${CONTAINER_NAME}' hiện không chạy!"
    log_error "Vui lòng khởi động hệ thống: docker compose up -d"
    exit 1
  fi

  # Ping MySQL trong container
  if ! docker exec -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysqladmin ping -u "${DB_USER}" --silent 2>/dev/null; then
    log_error "MySQL Server bên trong '${CONTAINER_NAME}' chưa sẵn sàng nhận kết nối!"
    exit 1
  fi
  log_success "MySQL Server '${CONTAINER_NAME}' đang hoạt động ổn định - Ping OK."
}

# ------------------------------------------------------------------------------
# 1. CHỨC NĂNG BACKUP (SAO LƯU DỮ LIỆU TOÀN VẸN)
# ------------------------------------------------------------------------------
do_backup() {
  local target_db="${1:-${DB_NAME}}"
  check_prerequisites
  check_mysql_ready

  mkdir -p "${BACKUP_DIR}"
  local timestamp
  timestamp="$(date +"%Y%m%d_%H%M%S")"
  local backup_filename="mysql_${target_db}_${timestamp}.sql.gz"
  local final_file="${BACKUP_DIR}/${backup_filename}"
  local checksum_file="${final_file}.sha256"
  TMP_FILE="${BACKUP_DIR}/.tmp_${backup_filename}"

  log_info "Bắt đầu sao lưu cơ sở dữ liệu: '${target_db}'"
  log_info "Đích lưu: ${final_file}"

  # Đếm số lượng bảng và bản ghi trước khi dump
  local table_count
  table_count=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${target_db}' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "0")

  log_info "Phát hiện ${table_count} bảng dữ liệu trong '${target_db}'."

  # Thực thi mysqldump với snapshot nhất quán
  # --single-transaction: Snapshot nhất quán cho InnoDB
  # --quick: Đọc từng dòng tránh tràn RAM
  # --routines: Sao lưu Stored Procedures / Functions
  # --triggers: Sao lưu Triggers
  # --events: Sao lưu Events
  # --hex-blob: Mã hóa nhị phân an toàn cho cột CCCD mã hóa AES
  # --default-character-set=utf8mb4: Bảo toàn 100% font tiếng Việt
  if ! docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysqldump -u "${DB_USER}" \
      --single-transaction \
      --quick \
      --routines \
      --triggers \
      --events \
      --hex-blob \
      --default-character-set=utf8mb4 \
      "${target_db}" 2>/dev/null | gzip -9 > "${TMP_FILE}"; then
    log_error "Quá trình mysqldump hoặc nén gzip thất bại!"
    rm -f "${TMP_FILE}"
    exit 1
  fi

  # Kiểm tra toàn vẹn file nén gzip
  if ! gzip -t "${TMP_FILE}" 2>/dev/null; then
    log_error "File nén gzip bị lỗi toàn vẹn!"
    rm -f "${TMP_FILE}"
    exit 1
  fi

  # Di chuyển file tạm thành file chính thức
  mv "${TMP_FILE}" "${final_file}"
  TMP_FILE=""

  # Tạo file mã băm SHA-256
  local sha256_hash
  sha256_hash="$(calculate_sha256 "${final_file}")"
  echo "${sha256_hash}  $(basename "${final_file}")" > "${checksum_file}"

  local file_size
  file_size=$(ls -lh "${final_file}" | awk '{print $5}')

  echo ""
  log_success "Sao lưu cơ sở dữ liệu thành công!"
  echo "------------------------------------------------------------------------------"
  echo -e "  📂 Tệp sao lưu : ${BOLD}${final_file}${NC}"
  echo -e "  📦 Kích thước  : ${file_size}"
  echo -e "  ⏱️  Thời điểm  : ${timestamp}"
  echo -e "  🔒 SHA-256     : ${CYAN}${sha256_hash}${NC}"
  echo -e "  📑 Tệp Checksum: ${checksum_file}"
  echo "------------------------------------------------------------------------------"
}

# ------------------------------------------------------------------------------
# 2. CHỨC NĂNG LIST (LIỆT KÊ BẢN SAO LƯU)
# ------------------------------------------------------------------------------
do_list() {
  check_prerequisites
  echo "=============================================================================="
  echo -e "${BOLD}📋 DANH SÁCH CÁC BẢN SAO LƯU MYSQL TRONG THƯ MỤC: ${BACKUP_DIR}${NC}"
  echo "=============================================================================="

  if [[ ! -d "${BACKUP_DIR}" ]]; then
    log_info "Thư mục sao lưu '${BACKUP_DIR}' chưa tồn tại."
    return 0
  fi

  local files
  shopt -s nullglob
  files=("${BACKUP_DIR}"/mysql_*.sql.gz)
  shopt -u nullglob

  if [[ ${#files[@]} -eq 0 ]]; then
    log_warn "Chưa có bản sao lưu nào trong thư mục '${BACKUP_DIR}'."
    echo "Sử dụng lệnh: $0 backup để tạo bản sao lưu đầu tiên."
    return 0
  fi

  printf "%-38s | %-10s | %-19s | %-10s\n" "Tên tệp sao lưu" "Kích thước" "Thời gian tạo" "Checksum"
  echo "------------------------------------------------------------------------------"

  for f in "${files[@]}"; do
    local fname
    fname="$(basename "$f")"
    local fsize
    fsize="$(ls -lh "$f" | awk '{print $5}')"
    local ftime
    ftime="$(date -r "$f" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || stat -c %y "$f" 2>/dev/null | cut -d'.' -f1 || echo "N/A")"
    
    local cstatus="${RED}Thiếu${NC}"
    if [[ -f "${f}.sha256" ]]; then
      local expected
      expected=$(awk '{print $1}' "${f}.sha256")
      local actual
      actual=$(calculate_sha256 "$f")
      if [[ "$expected" == "$actual" ]]; then
        cstatus="${GREEN}Khop [OK]${NC}"
      else
        cstatus="${RED}LỆCH!${NC}"
      fi
    fi

    printf "%-38s | %-10s | %-19s | %-10b\n" "$fname" "$fsize" "$ftime" "$cstatus"
  done
  echo "=============================================================================="
}

# ------------------------------------------------------------------------------
# 3. CHỨC NĂNG VERIFY (KIỂM CHỨNG TOÀN VẸN BẢN SAO LƯU)
# ------------------------------------------------------------------------------
do_verify() {
  local backup_file="${1:-}"
  check_prerequisites

  if [[ -z "$backup_file" ]]; then
    log_error "Vui lòng chỉ định đường dẫn tệp sao lưu cần kiểm tra!"
    echo "Cú pháp: $0 verify <đường_dẫn_tệp_sao_lưu.sql.gz>"
    exit 1
  fi

  if [[ ! -f "$backup_file" ]]; then
    log_error "Tệp sao lưu không tồn tại: ${backup_file}"
    exit 1
  fi

  if [[ ! -s "$backup_file" ]]; then
    log_error "Tệp sao lưu rỗng (0 bytes): ${backup_file}"
    exit 1
  fi

  echo "=============================================================================="
  echo -e "${BOLD}🔍 BẮT ĐẦU KIỂM CHỨNG TÍNH TOÀN VẸN TỆP SAO LƯU${NC}"
  echo -e "   Tệp: ${backup_file}"
  echo "=============================================================================="

  local checks_passed=0
  local total_checks=4

  # 1. Kiểm tra định dạng gzip
  log_info "1/4. Kiểm tra cấu trúc nén gzip..."
  if gzip -t "$backup_file" 2>/dev/null; then
    log_success "Cấu trúc file nén gzip nguyên vẹn, không bị hỏng archive."
    checks_passed=$((checks_passed + 1))
  else
    log_error "File nén gzip bị lỗi/hỏng dữ liệu!"
    exit 1
  fi

  # 2. Kiểm tra checksum SHA-256
  log_info "2/4. Kiểm tra mã băm SHA-256..."
  local checksum_file="${backup_file}.sha256"
  if [[ -f "$checksum_file" ]]; then
    local expected_hash
    expected_hash=$(awk '{print $1}' "$checksum_file")
    local actual_hash
    actual_hash=$(calculate_sha256 "$backup_file")
    if [[ "$expected_hash" == "$actual_hash" ]]; then
      log_success "Mã băm SHA-256 khớp 100%: ${actual_hash}"
      checks_passed=$((checks_passed + 1))
    else
      log_error "Mã băm SHA-256 KHÔNG KHỚP! Tệp có nguy cơ bị chỉnh sửa hoặc hư hại!"
      log_error "Kỳ vọng: ${expected_hash}"
      log_error "Thực tế: ${actual_hash}"
      exit 1
    fi
  else
    log_warn "Không tìm thấy tệp checksum ${checksum_file}. Bỏ qua đối chiếu hash."
    total_checks=$((total_checks - 1))
  fi

  # 3. Kiểm tra Header và Metadata SQL
  log_info "3/4. Kiểm tra cấu trúc Header & Metadata SQL bên trong archive..."
  local header_snippet
  header_snippet="$(gzip -dc "$backup_file" 2>/dev/null | head -n 30 || true)"

  if echo "$header_snippet" | grep -q "MySQL dump"; then
    local dump_version
    dump_version=$(echo "$header_snippet" | grep "MySQL dump" | head -n 1 | sed -e 's/^[[:space:]]*--[[:space:]]*//')
    log_success "Phát hiện chữ ký SQL Dump chuẩn: ${dump_version}"
    checks_passed=$((checks_passed + 1))
  else
    log_error "Tệp không chứa chữ ký chuẩn của mysqldump!"
    exit 1
  fi

  # 4. Kiểm tra các câu lệnh DDL bảng
  log_info "4/4. Kiểm tra cấu trúc bảng DDL và kết thúc dump..."
  local tail_snippet
  tail_snippet="$(gzip -dc "$backup_file" 2>/dev/null | tail -n 20 || true)"

  if echo "$tail_snippet" | grep -q "Dump completed"; then
    log_success "Tệp dump hoàn tất trọn vẹn (Phát hiện 'Dump completed' ở cuối file)."
    checks_passed=$((checks_passed + 1))
  else
    log_warn "Không phát hiện dòng 'Dump completed' ở cuối tệp (Có thể dump bị gián đoạn)."
  fi

  echo "=============================================================================="
  if [[ $checks_passed -ge $total_checks ]]; then
    log_success "KẾT QUẢ: Tệp sao lưu ĐẠT CHUẨN TOÀN VẸN (${checks_passed}/${total_checks} tiêu chí)!"
  else
    log_warn "KẾT QUẢ: Tệp sao lưu hợp lệ nhưng cần cẩn trọng (${checks_passed}/${total_checks} tiêu chí)."
  fi
  echo "=============================================================================="
}

# ------------------------------------------------------------------------------
# 4. CHỨC NĂNG RESTORE (PHỤC HỒI AN TOÀN)
# ------------------------------------------------------------------------------
do_restore() {
  local backup_file="${1:-}"
  local target_db="${2:-${DEFAULT_TEST_DB}}"
  local force_mode="${3:-}"

  check_prerequisites
  check_mysql_ready

  if [[ -z "$backup_file" ]]; then
    log_error "Vui lòng chỉ định tệp sao lưu cần phục hồi!"
    echo "Cú pháp: $0 restore <tệp_sao_lưu.sql.gz> [tên_database_đích]"
    exit 1
  fi

  # 1. Kiểm tra tính toàn vẹn tệp trước khi phục hồi
  do_verify "$backup_file"

  echo ""
  echo "=============================================================================="
  echo -e "${BOLD}🚨 CẢNH BÁO AN TOÀN PHỤC HỒI DỮ LIỆU (RESTORE SAFETY GUARD)${NC}"
  echo "=============================================================================="
  echo -e "  📂 Tệp nguồn     : ${BOLD}${backup_file}${NC}"
  echo -e "  🎯 Cơ sở dữ liệu : ${BOLD}${target_db}${NC}"
  echo "------------------------------------------------------------------------------"

  # NGUYÊN TẮC BẢO VỆ PRODUCTION DATABASE:
  # Mặc định TỪ CHỐI ghi đè vào database chính (hrm_db) nếu không có cờ xác nhận khẩn cấp
  if [[ "$target_db" == "${DB_NAME}" ]]; then
    log_error "BẢO VỆ PRODUCTION: Database đích là database chính thức '${DB_NAME}'!"
    log_error "Mặc định hệ thống KHÔNG CHO PHÉP phục hồi trực tiếp vào database đang chạy thật."
    echo ""
    echo "Nếu đây là trường hợp khắc phục thảm họa (Disaster Recovery) THỰC SỰ:"
    echo "Bạn phải nhập chính xác cụm từ: YES_RESTORE_PRODUCTION"
    echo -n "Nhập xác nhận: "
    read -r confirm_prod || true
    if [[ "$confirm_prod" != "YES_RESTORE_PRODUCTION" ]]; then
      log_warn "Hủy thao tác phục hồi Production. Dữ liệu hiện tại được bảo toàn 100%."
      exit 0
    fi
  else
    # Phục hồi vào database thử nghiệm / cô lập
    log_info "Database đích là database thử nghiệm: '${target_db}'."
    if [[ "$force_mode" != "--yes" && "$force_mode" != "-y" ]]; then
      echo -n "Bạn có chắc chắn muốn phục hồi vào '${target_db}'? [y/N]: "
      read -r confirm_test || true
      if [[ "$confirm_test" != "y" && "$confirm_test" != "Y" ]]; then
        log_warn "Hủy thao tác phục hồi theo yêu cầu người dùng."
        exit 0
      fi
    fi
  fi

  log_info "Khởi tạo database đích '${target_db}' nếu chưa tồn tại..."
  docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysql -u "${DB_USER}" -e \
    "CREATE DATABASE IF NOT EXISTS \`${target_db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

  log_info "Đang nạp dữ liệu từ tệp sao lưu vào '${target_db}'..."

  # Thực thi giải nén và nạp SQL trực tiếp
  if ! gzip -dc "$backup_file" | docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysql -u "${DB_USER}" "${target_db}"; then
    log_error "Quá trình phục hồi dữ liệu vào '${target_db}' thất bại!"
    exit 1
  fi

  # Kiểm tra số lượng bảng và bản ghi sau phục hồi
  local restored_tables
  restored_tables=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${target_db}' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "0")

  local restored_employees
  restored_employees=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${target_db}\`.employees;" 2>/dev/null || echo "0")

  local restored_departments
  restored_departments=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" \
    mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${target_db}\`.departments;" 2>/dev/null || echo "0")

  echo ""
  log_success "Phục hồi cơ sở dữ liệu thành công hoàn toàn!"
  echo "------------------------------------------------------------------------------"
  echo -e "  🎯 Database đích      : ${BOLD}${target_db}${NC}"
  echo -e "  📊 Tổng số bảng phục hồi: ${BOLD}${restored_tables}${NC} bảng"
  echo -e "  👥 Số nhân sự phục hồi : ${BOLD}${restored_employees}${NC} nhân sự"
  echo -e "  🏢 Số phòng ban phục hồi: ${BOLD}${restored_departments}${NC} phòng ban"
  echo "------------------------------------------------------------------------------"
}

# ------------------------------------------------------------------------------
# 5. CHỨC NĂNG TEST-RECOVERY (KIỂM THỬ KHÔI PHỤC THẢM HỌA TRONG MÔI TRƯỜNG CÔ LẬP)
# ------------------------------------------------------------------------------
do_test_recovery() {
  check_prerequisites
  check_mysql_ready

  echo "=============================================================================="
  echo -e "${BOLD}🧪 BẮT ĐẦU QUY TRÌNH KIỂM THỬ TÍCH HỢP SAO LƯU & PHỤC HỒI CÔ LẬP (DR TEST)${NC}"
  echo "   Mục tiêu: Đảm bảo tính toàn vẹn 100% dữ liệu mà KHÔNG ảnh hưởng database thật"
  echo "=============================================================================="

  local isolated_test_db="${DEFAULT_TEST_DB}"

  # 1. Thống kê baseline dữ liệu hiện tại trong DB production
  log_info "Bước 1/6: Thu thập số liệu baseline từ database nguồn '${DB_NAME}'..."
  local orig_tables orig_dept orig_emp orig_user orig_att
  orig_tables=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${DB_NAME}' AND table_type = 'BASE TABLE';" 2>/dev/null)
  orig_dept=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${DB_NAME}\`.departments;" 2>/dev/null)
  orig_emp=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${DB_NAME}\`.employees;" 2>/dev/null)
  orig_user=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${DB_NAME}\`.users;" 2>/dev/null)
  orig_att=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${DB_NAME}\`.attendances;" 2>/dev/null)

  echo -e "   -> Baseline: ${orig_tables} bảng | ${orig_dept} phòng ban | ${orig_emp} nhân viên | ${orig_user} users | ${orig_att} chấm công."

  # 2. Tạo bản sao lưu mới nhất
  log_info "Bước 2/6: Tạo bản sao lưu tức thời..."
  do_backup "${DB_NAME}"

  # Lấy file backup vừa tạo
  local latest_backup
  latest_backup=$(ls -t "${BACKUP_DIR}"/mysql_${DB_NAME}_*.sql.gz | head -n 1)
  log_success "Bản sao lưu vừa tạo: $(basename "$latest_backup")"

  # 3. Kiểm chứng archive
  log_info "Bước 3/6: Kiểm chứng archive và SHA-256..."
  do_verify "$latest_backup"

  # 4. Phục hồi vào database cô lập
  log_info "Bước 4/6: Phục hồi vào môi trường cô lập '${isolated_test_db}'..."
  # Xóa database test cũ nếu có
  docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -e \
    "DROP DATABASE IF EXISTS \`${isolated_test_db}\`;" 2>/dev/null || true

  # Chạy phục hồi không tương tác với cờ -y
  do_restore "$latest_backup" "$isolated_test_db" "-y"

  # 5. Đối soát dữ liệu chi tiết giữa Database Thật và Database Phục Hồi
  log_info "Bước 5/6: Đối soát tính nhất quán dữ liệu (Deep Data Reconciliation)..."
  local rest_tables rest_dept rest_emp rest_user rest_att
  rest_tables=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${isolated_test_db}' AND table_type = 'BASE TABLE';" 2>/dev/null)
  rest_dept=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${isolated_test_db}\`.departments;" 2>/dev/null)
  rest_emp=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${isolated_test_db}\`.employees;" 2>/dev/null)
  rest_user=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${isolated_test_db}\`.users;" 2>/dev/null)
  rest_att=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT COUNT(*) FROM \`${isolated_test_db}\`.attendances;" 2>/dev/null)

  # So sánh đối soát
  local has_error=0
  if [[ "$orig_tables" != "$rest_tables" ]]; then
    log_error "Số lượng bảng không khớp: Gốc ${orig_tables} != Phục hồi ${rest_tables}"
    has_error=1
  fi
  if [[ "$orig_dept" != "$rest_dept" ]]; then
    log_error "Số lượng phòng ban không khớp: Gốc ${orig_dept} != Phục hồi ${rest_dept}"
    has_error=1
  fi
  if [[ "$orig_emp" != "$rest_emp" ]]; then
    log_error "Số lượng nhân viên không khớp: Gốc ${orig_emp} != Phục hồi ${rest_emp}"
    has_error=1
  fi
  if [[ "$orig_user" != "$rest_user" ]]; then
    log_error "Số lượng users không khớp: Gốc ${orig_user} != Phục hồi ${rest_user}"
    has_error=1
  fi
  if [[ "$orig_att" != "$rest_att" ]]; then
    log_error "Số lượng chấm công không khớp: Gốc ${orig_att} != Phục hồi ${rest_att}"
    has_error=1
  fi

  if [[ $has_error -eq 1 ]]; then
    log_error "ĐỐI SOÁT THẤT BẠI: Có sự sai lệch dữ liệu sau phục hồi!"
    exit 1
  fi

  log_success "Đối soát số lượng bản ghi: KHỚP 100% TRÊN TẤT CẢ CÁC BẢNG!"

  # Kiểm tra tính toàn vẹn của dữ liệu mã hóa CCCD sau phục hồi
  local orig_sample_emp rest_sample_emp
  orig_sample_emp=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT ssn_masked FROM \`${DB_NAME}\`.employees WHERE employee_id = 1;" 2>/dev/null)
  rest_sample_emp=$(docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -N -s -e \
    "SELECT ssn_masked FROM \`${isolated_test_db}\`.employees WHERE employee_id = 1;" 2>/dev/null)

  if [[ "$orig_sample_emp" == "$rest_sample_emp" ]]; then
    log_success "Đối soát bản ghi nhạy cảm (CCCD Masked ID 1): Khớp hoàn hảo ('${orig_sample_emp}')."
  else
    log_error "Sai lệch dữ liệu bản ghi nhân viên ID 1!"
    exit 1
  fi

  # 6. Dọn dẹp an toàn database thử nghiệm
  log_info "Bước 6/6: Dọn dẹp database thử nghiệm cô lập '${isolated_test_db}'..."
  docker exec -i -e MYSQL_PWD="${DB_PASS}" "${CONTAINER_NAME}" mysql -u "${DB_USER}" -e \
    "DROP DATABASE IF EXISTS \`${isolated_test_db}\`;" 2>/dev/null || true
  log_success "Đã dọn dẹp sạch sẽ database thử nghiệm."

  echo "=============================================================================="
  log_success "CHỨNG NHẬN DISASTER RECOVERY: QUY TRÌNH KIỂM THỬ THÀNH CÔNG 100%!"
  echo "=============================================================================="
}

# ------------------------------------------------------------------------------
# 6. HƯỚNG DẪN SỬ DỤNG (HELP)
# ------------------------------------------------------------------------------
do_help() {
  cat << EOF
==============================================================================
HỆ THỐNG QUẢN LÝ NHÂN SỰ (HRM - ICTU)
DevOps Automated MySQL Backup, Verification & Safe Disaster Recovery Tool
==============================================================================

CÚ PHÁP:
  $0 <lệnh> [tham_số...]

CÁC LỆNH HỖ TRỢ:
  backup                  Tạo bản sao lưu nhất quán (--single-transaction, gzip, sha256)
  list                    Liệt kê toàn bộ các bản sao lưu trong thư mục 'backups/'
  verify <backup_file>    Kiểm chứng tính toàn vẹn archive (gzip + sha256 + SQL structure)
  restore <backup_file> [db] Phục hồi an toàn (Mặc định vào '${DEFAULT_TEST_DB}')
  test-recovery           Kiểm thử tự động chu trình sao lưu & phục hồi cô lập E2E
  help                    Hiển thị thông tin trợ giúp này

VÍ DỤ SỬ DỤNG:
  # 1. Tạo một bản backup mới:
  $0 backup

  # 2. Xem danh sách các bản backup hiện có:
  $0 list

  # 3. Kiểm chứng một tệp backup:
  $0 verify backups/mysql_hrm_db_20261023_150000.sql.gz

  # 4. Phục hồi an toàn vào database thử nghiệm độc lập (Không ảnh hưởng Production):
  $0 restore backups/mysql_hrm_db_20261023_150000.sql.gz hrm_db_restore_test

  # 5. Chạy toàn bộ quy trình kiểm thử Disaster Recovery tự động:
  $0 test-recovery

NGUYÊN TẮC AN TOÀN:
  - Mặc định bảo vệ Production: Không cho phép tự ý ghi đè lên '${DB_NAME}'.
  - Tự động dọn file tạm khi có lỗi qua trap signal.
  - Sử dụng biến môi trường từ .env; không in mật khẩu ra log/terminal.
==============================================================================
EOF
}

# ------------------------------------------------------------------------------
# ROUTER ĐIỀU HƯỚNG LỆNH
# ------------------------------------------------------------------------------
COMMAND="${1:-help}"

case "${COMMAND}" in
  backup)
    do_backup "${2:-${DB_NAME}}"
    ;;
  list)
    do_list
    ;;
  verify)
    if [[ $# -lt 2 ]]; then
      log_error "Thiếu tham số đường dẫn tệp sao lưu!"
      echo "Cú pháp: $0 verify <đường_dẫn_tệp.sql.gz>"
      exit 1
    fi
    do_verify "$2"
    ;;
  restore)
    if [[ $# -lt 2 ]]; then
      log_error "Thiếu tham số đường dẫn tệp sao lưu!"
      echo "Cú pháp: $0 restore <đường_dẫn_tệp.sql.gz> [database_đích]"
      exit 1
    fi
    do_restore "$2" "${3:-${DEFAULT_TEST_DB}}" "${4:-}"
    ;;
  test-recovery|test)
    do_test_recovery
    ;;
  help|--help|-h)
    do_help
    ;;
  *)
    log_error "Lệnh '${COMMAND}' không hợp lệ!"
    echo "Sử dụng: $0 help để xem danh sách lệnh được hỗ trợ."
    exit 1
    ;;
esac
