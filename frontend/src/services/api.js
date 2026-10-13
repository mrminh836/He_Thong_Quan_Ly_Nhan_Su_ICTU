/**
 * Tầng giao tiếp Backend API (HTTP Client Service)
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3005/api';

/**
 * Thực hiện yêu cầu HTTP Fetch tổng quát
 * @param {string} endpoint - Đường dẫn con (vd: '/health' hoặc '/departments')
 * @param {RequestInit} options - Tùy chọn fetch
 * @returns {Promise<any>}
 */
export async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

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
      const netError = new Error('Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra Docker hoặc cổng API.');
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
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),

  // Endpoints kiểm tra sức khỏe
  checkHealth: () => request('/health'),
  checkDbHealth: () => request('/health/db'),
};

export default api;
