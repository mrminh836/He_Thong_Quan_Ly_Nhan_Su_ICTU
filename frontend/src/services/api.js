/**
 * Tầng giao tiếp Backend API (HTTP Client Service)
 * Tự động gắn JWT Bearer Token và xử lý mã lỗi xác thực 401
 */

export const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:3005/api';

/**
 * Trích xuất tên file an toàn từ HTTP header Content-Disposition
 * Hỗ trợ cả định dạng chuẩn RFC 5987 / RFC 6266 (filename*=UTF-8''...) và filename="..."
 * @param {string|null} contentDisposition
 * @returns {string|null}
 */
export function parseContentDispositionFilename(contentDisposition) {
  if (!contentDisposition || typeof contentDisposition !== 'string') {
    return null;
  }

  // 1. Ưu tiên RFC 5987 (filename*=UTF-8''encoded_name)
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      return utf8Match[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  // 2. Định dạng thông thường: filename="name.xlsx" hoặc filename=name.xlsx
  const standardMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (standardMatch && standardMatch[1]) {
    return standardMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  return null;
}

/**
 * Thực hiện yêu cầu HTTP Fetch trả về Blob (file nhị phân: Excel, CSV, PDF, ...)
 * Tự động gắn JWT Token, kiểm tra status code, bóc tách lỗi JSON nếu API trả về mã lỗi HTTP >= 400
 * @param {string} endpoint - Đường dẫn con (vd: '/reports/attendance/export')
 * @param {RequestInit} options - Tùy chọn fetch
 * @returns {Promise<{ blob: Blob, fileName: string|null, contentType: string|null, response: Response }>}
 */
export async function requestBlob(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const defaultHeaders = {
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv, application/octet-stream, application/json, */*',
  };

  const token = localStorage.getItem('accessToken');
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      // 1. Tự động xử lý khi Token hết hạn hoặc không hợp lệ (401 Unauthorized)
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        console.warn('[API Auth] Phiên làm việc đã hết hạn hoặc token không hợp lệ (401). Đang xóa token...');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');

        if (typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }

      // 2. Đọc nội dung lỗi từ response (thường là JSON lỗi của Backend)
      let errorMessage = `Lỗi HTTP ${response.status}: ${response.statusText}`;
      let errorData = null;

      try {
        const text = await response.text();
        if (text) {
          try {
            errorData = JSON.parse(text);
            if (errorData && errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            errorMessage = text;
          }
        }
      } catch {
        // bỏ qua nếu không đọc được text
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    // 3. Kiểm tra trường hợp đặc biệt: status 200 nhưng content-type lại là JSON lỗi
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const jsonData = await response.json();
      if (jsonData.success === false || jsonData.message) {
        throw new Error(jsonData.message || 'Phản hồi từ máy chủ không phải là file nhị phân hợp lệ.');
      }
    }

    // 4. Trích xuất tên file từ Header
    const contentDisposition = response.headers.get('content-disposition');
    const fileName = parseContentDispositionFilename(contentDisposition);

    // 5. Đọc Blob nhị phân
    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Dữ liệu file tải về bị rỗng. Vui lòng kiểm tra lại bộ lọc.');
    }

    return {
      blob,
      fileName,
      contentType,
      response,
    };
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[API Network Error]: Không thể kết nối tới máy chủ Backend tại', BASE_URL);
      const netError = new Error('Không thể kết nối tới máy chủ Backend (cổng 3005). Vui lòng kiểm tra Docker hoặc kết nối mạng.');
      netError.isNetworkError = true;
      throw netError;
    }
    throw error;
  }
}

/**
 * Thực hiện yêu cầu HTTP Fetch tổng quát
 * @param {string} endpoint - Đường dẫn con (vd: '/health', '/auth/login', '/departments')
 * @param {RequestInit} options - Tùy chọn fetch
 * @returns {Promise<any>}
 */
export async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // 1. Tự động gắn JWT Token từ localStorage nếu người dùng đã đăng nhập
  const token = localStorage.getItem('accessToken');
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Kiểm tra định dạng phản hồi
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      // 2. Tự động xử lý khi Token hết hạn hoặc không hợp lệ (401 Unauthorized)
      // Chỉ kích hoạt tự động logout nếu không phải request đang đăng nhập (/auth/login)
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        console.warn('[API Auth] Phiên làm việc đã hết hạn hoặc token không hợp lệ (401). Đang xóa token...');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');

        // Chuyển hướng về trang đăng nhập nếu đang ở các trang quản trị
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }

      const errorMessage =
        (typeof data === 'object' && data.message) ||
        `Lỗi HTTP ${response.status}: ${response.statusText}`;

      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    // Xử lý lỗi mất kết nối mạng hoặc server không phản hồi
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[API Network Error]: Không thể kết nối tới máy chủ Backend tại', BASE_URL);
      const netError = new Error('Không thể kết nối tới máy chủ Backend (cổng 3005). Vui lòng kiểm tra Docker hoặc kết nối mạng.');
      netError.isNetworkError = true;
      throw netError;
    }
    throw error;
  }
}

export const api = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),

  // Tải file nhị phân (Blob)
  getBlob: (endpoint, options = {}) => requestBlob(endpoint, { ...options, method: 'GET' }),

  // Endpoints kiểm tra sức khỏe
  checkHealth: () => request('/health'),
  checkDbHealth: () => request('/health/db'),
};

export default api;
