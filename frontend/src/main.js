// Nạp toàn bộ hệ thống styles CSS theo thứ tự tầng kiến trúc
import './styles/variables.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/departments.css';
import './styles/department-form-modal.css';
import './styles/employees.css';
import './styles/employee-edit-modal.css';
import './styles/attendance-widget.css';
import './styles/attendance-board.css';
import './styles/attendance-history.css';
import './styles/dashboard.css';

import { initApp } from './app.js';

// Khởi chạy ứng dụng khi DOM đã sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
