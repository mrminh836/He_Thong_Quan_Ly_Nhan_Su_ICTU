/**
 * TIỆN ÍCH XỬ LÝ VÀ BẢO MẬT XUẤT FILE CSV
 * Tuân thủ tiêu chuẩn RFC 4180 và phòng chống tấn công CSV Formula Injection (CWE-1236).
 */

const DANGEROUS_FORMULA_CHARS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Xử lý an toàn một giá trị ô trong file CSV:
 * 1. Chống CSV Formula Injection: Nếu giá trị bắt đầu bằng =, +, -, @, \t, \r thì chèn thêm dấu nháy đơn (') ở đầu.
 * 2. Escape chuẩn RFC 4180: Nếu ô có chứa dấu phẩy (,), nháy kép (") hoặc ký tự xuống dòng (\n, \r),
 *    nhân đôi dấu nháy kép (" -> "") và bọc toàn bộ chuỗi trong cặp dấu nháy kép ("...").
 * 
 * @param {any} val - Giá trị cần đưa vào ô CSV
 * @param {boolean} [isTextField=true] - Có phải là trường văn bản hay không (để tránh can thiệp vào số nguyên/thực)
 * @returns {string} Chuỗi CSV an toàn
 */
export function formatCsvField(val, isTextField = true) {
  if (val === null || val === undefined) {
    return '';
  }

  let str = String(val);

  // 1. Chống CSV Formula Injection cho các trường văn bản
  if (isTextField && typeof val === 'string' && str.length > 0) {
    const firstChar = str.charAt(0);
    // Nếu bắt đầu bằng ký tự công thức (=, +, -, @, \t, \r), luôn prepend nháy đơn (') để vô hiệu hóa
    if (DANGEROUS_FORMULA_CHARS.includes(firstChar)) {
      str = `'${str}`;
    }
  }

  // 2. Escape dấu nháy kép và bao bọc nếu có ký tự đặc biệt
  const needsQuotes = str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');
  if (needsQuotes) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Tạo nội dung file CSV hoàn chỉnh có tiền tố UTF-8 BOM (\uFEFF)
 * @param {Array<string>} headers - Mảng tiêu đề cột
 * @param {Array<Array<any>>} rows - Mảng các dòng dữ liệu (mỗi dòng là mảng các giá trị)
 * @param {Array<string>} [additionalLines=[]] - Các dòng ghi chú/tóm tắt ở cuối
 * @returns {Buffer} Buffer chứa nội dung CSV với mã hóa UTF-8 BOM
 */
export function buildCsvBuffer(headers, rows, additionalLines = []) {
  const UTF8_BOM = '\uFEFF';
  const lines = [];

  // Hàng tiêu đề
  lines.push(headers.map((h) => formatCsvField(h, false)).join(','));

  // Các hàng dữ liệu
  for (const row of rows) {
    lines.push(row.map((cell) => formatCsvField(cell, true)).join(','));
  }

  // Các dòng tổng hợp / thông tin bổ sung ở cuối
  if (additionalLines && additionalLines.length > 0) {
    lines.push(''); // Dòng trống ngăn cách
    for (const line of additionalLines) {
      if (Array.isArray(line)) {
        lines.push(line.map((cell) => formatCsvField(cell, false)).join(','));
      } else {
        lines.push(formatCsvField(line, false));
      }
    }
  }

  const csvString = UTF8_BOM + lines.join('\r\n');
  return Buffer.from(csvString, 'utf-8');
}

export default {
  formatCsvField,
  buildCsvBuffer,
};
