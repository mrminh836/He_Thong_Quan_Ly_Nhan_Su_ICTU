#!/bin/bash
# ==============================================================================
# SCRIPT TẠO VÀ XÁC MINH CHỨNG CHỈ TLS/SSL TỰ KÝ X.509 CHO HRM.LOCAL (LINUX/WSL/CI)
# Tiêu chuẩn: RSA 2048-bit | SHA-256 | SAN: DNS:hrm.local, DNS:localhost, IP:127.0.0.1
# Thời hạn: 365 ngày
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${1:-"${SCRIPT_DIR}/../certs"}"
DAYS="${2:-365}"

mkdir -p "${CERTS_DIR}"

KEY_FILE="${CERTS_DIR}/hrm.local.key"
CRT_FILE="${CERTS_DIR}/hrm.local.crt"
CNF_FILE="${CERTS_DIR}/hrm.local.cnf"

echo "============================================================"
echo "🔐 KHỞI TẠO CHỨNG CHỈ X.509 SSL/TLS CHO DOMAIN: hrm.local"
echo "============================================================"

# 1. Kiểm tra OpenSSL
openssl version

# 2. Tạo Private Key RSA 2048-bit
echo "--> Đang tạo Private Key RSA 2048-bit..."
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "${KEY_FILE}"

# 3. Tạo Chứng chỉ tự ký X.509
echo "--> Đang tạo Chứng chỉ X.509 tự ký..."
openssl req -x509 -new \
  -key "${KEY_FILE}" \
  -out "${CRT_FILE}" \
  -days "${DAYS}" \
  -sha256 \
  -config "${CNF_FILE}" \
  -extensions v3_req

# 4. Bảo vệ quyền file Private Key (Chỉ chủ sở hữu đọc/ghi)
chmod 600 "${KEY_FILE}"
chmod 644 "${CRT_FILE}"

# 5. Xác minh
echo "--- KẾT QUẢ KIỂM TRA (VERIFICATION) ---"
openssl pkey -in "${KEY_FILE}" -check -noout
openssl x509 -in "${CRT_FILE}" -noout -subject
openssl x509 -in "${CRT_FILE}" -noout -ext subjectAltName
openssl x509 -in "${CRT_FILE}" -noout -fingerprint -sha256

KEY_HASH=$(openssl pkey -in "${KEY_FILE}" -pubout -outform DER | openssl sha256 | awk '{print $NF}')
CRT_HASH=$(openssl x509 -in "${CRT_FILE}" -pubkey -noout | openssl pkey -pubin -outform DER | openssl sha256 | awk '{print $NF}')

if [ "${KEY_HASH}" = "${CRT_HASH}" ]; then
  echo "✅ [PASS] Private Key và Certificate khớp 100% (Hash: ${KEY_HASH})"
else
  echo "❌ [FAIL] Mismatch giữa Private Key và Certificate!"
  exit 1
fi

echo "============================================================"
echo "🎉 HOÀN THÀNH TẠO CHỨNG CHỈ CHO hrm.local THÀNH CÔNG!"
echo "============================================================"
