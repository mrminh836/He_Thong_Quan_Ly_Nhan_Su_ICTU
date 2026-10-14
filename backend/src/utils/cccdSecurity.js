import crypto from 'node:crypto';

/**
 * UTILITY: CCCD / CMND SECURITY & MASKING MODULE
 * Quản lý an toàn dữ liệu số Căn cước công dân (CCCD / CMND):
 * 1. Chuẩn hóa chuỗi số CCCD (loại bỏ khoảng trắng, ký tự rác).
 * 2. Xác thực định dạng số CCCD (12 chữ số) và CMND cũ (9 chữ số).
 * 3. Sinh chuỗi che mờ (Masked CCCD) phục vụ hiển thị công khai (vd: 0382******34).
 * 4. Tính toán mã băm HMAC-SHA-256 với Secret Key độc lập phục vụ kiểm tra trùng lặp an toàn.
 * 
 * NGUYÊN TẮC BẢO MẬT:
 * - Tuyệt đối không ghi số CCCD rõ hoặc ciphertext vào console log, message lỗi.
 * - Khóa HMAC được tách biệt hoàn toàn khỏi khóa AES mã hóa CSDL.
 */

/**
 * Chuẩn hóa số CCCD (cắt khoảng trắng, dấu gạch nối)
 * @param {string|number} cccd
 * @returns {string} Chuỗi ký tự số đã làm sạch
 */
export function normalizeCccd(cccd) {
  if (cccd === null || cccd === undefined) return '';
  return String(cccd)
    .trim()
    .replace(/[\s\-_.]/g, '');
}

/**
 * Kiểm tra định dạng số CCCD/CMND Việt Nam
 * Tiêu chuẩn:
 * - CCCD mới (12 chữ số)
 * - CMND cũ (9 chữ số)
 * 
 * @param {string} cccd
 * @returns {{ isValid: boolean, error?: string, normalizedCccd: string }}
 */
export function validateCccdFormat(cccd) {
  const normalized = normalizeCccd(cccd);

  if (!normalized) {
    return {
      isValid: false,
      error: 'Số CCCD/CMND là bắt buộc và không được để trống.',
      normalizedCccd: '',
    };
  }

  // Phải hoàn toàn là ký tự số
  if (!/^\d+$/.test(normalized)) {
    return {
      isValid: false,
      error: 'Số CCCD/CMND chỉ được chứa các ký tự số (0-9).',
      normalizedCccd: normalized,
    };
  }

  // Độ dài chuẩn: 12 số (CCCD gắn chip) hoặc 9 số (CMND)
  if (normalized.length !== 12 && normalized.length !== 9) {
    return {
      isValid: false,
      error: 'Số CCCD phải có độ dài 12 chữ số (hoặc 9 chữ số đối với CMND cũ).',
      normalizedCccd: normalized,
    };
  }

  return {
    isValid: true,
    normalizedCccd: normalized,
  };
}

/**
 * Tạo định dạng hiển thị che mờ an toàn cho số CCCD/CMND
 * Ví dụ:
 * - 12 chữ số: "038204001234" -> "0382******34"
 * - 9 chữ số: "038204123" -> "038****23"
 * 
 * @param {string} cccd
 * @returns {string}
 */
export function maskCccd(cccd) {
  const normalized = normalizeCccd(cccd);
  if (!normalized) return '';

  const len = normalized.length;
  if (len === 12) {
    return `${normalized.slice(0, 4)}******${normalized.slice(-2)}`;
  }

  if (len === 9) {
    return `${normalized.slice(0, 3)}****${normalized.slice(-2)}`;
  }

  // Fallback an toàn cho các độ dài khác nếu có
  if (len > 4) {
    return `${normalized.slice(0, 2)}${'*'.repeat(len - 4)}${normalized.slice(-2)}`;
  }

  return '******';
}

/**
 * Tính toán mã băm HMAC-SHA-256 của số CCCD đã chuẩn hóa với khóa bí mật riêng biệt
 * Dùng để kiểm tra trùng lặp trên CSDL mà không phụ thuộc vào ciphertext của AES_ENCRYPT
 * 
 * @param {string} normalizedCccd - Số CCCD đã chuẩn hóa
 * @param {string} hmacSecret - Khóa bí mật HMAC độc lập
 * @returns {string} Mã băm hex 64 ký tự
 */
export function computeCccdHmac(normalizedCccd, hmacSecret) {
  if (!normalizedCccd) {
    throw new Error('Số CCCD chuẩn hóa là bắt buộc để tính toán HMAC.');
  }
  if (!hmacSecret) {
    throw new Error('Khóa bí mật CCCD_HMAC_SECRET chưa được cấu hình.');
  }

  return crypto
    .createHmac('sha256', hmacSecret)
    .update(normalizedCccd)
    .digest('hex');
}

export default {
  normalizeCccd,
  validateCccdFormat,
  maskCccd,
  computeCccdHmac,
};
