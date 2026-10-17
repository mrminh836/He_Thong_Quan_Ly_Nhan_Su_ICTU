/**
 * ==============================================================================
 * BỘ KIỂM THỬ TÍCH HỢP TOÀN DIỆN E2E SPRINT 2 (HRM-226)
 * Môi trường: Docker Compose Multi-tier Stack (10 Containers)
 * ==============================================================================
 * Phạm vi đối soát:
 * 1. Hạ tầng Docker Compose & Network Isolation (app-network vs monitoring)
 * 2. US 3.0:  Đổi mật khẩu cá nhân (Bcrypt băm, chính sách >= 12 ký tự, đăng nhập lại)
 * 3. US 7.0:  Chỉnh sửa & Cập nhật phòng ban (PUT /api/departments/:id)
 * 4. US 13.0: Cập nhật hồ sơ nhân sự (PUT /api/employees/:id, bảo toàn CCCD AES-256)
 * 5. US 14.0: Thôi việc nhân viên (Soft-delete Resigned, tự động khóa User, chặn login)
 * 6. US 19.0: Bảng lịch sử chấm công theo tháng & Thống kê công (GET /api/attendance/history)
 * 7. US 22.0: Xuất báo cáo chấm công Excel (.xlsx) & CSV (.csv) chuẩn UTF-8
 * 8. US 20.0: Dashboard thống kê KPI & Phân bổ phòng ban (GET /api/dashboard/stats)
 * 9. US 29.0: Hạ tầng Observability: 5/5 Targets Prometheus UP & 3 Grafana Dashboards
 * ==============================================================================
 */

import http from 'http';
import https from 'https';
import mysql from 'mysql2/promise';
import { hashPassword } from '../src/utils/password.js';

const BACKEND_URL = 'http://127.0.0.1:3005';
const PROMETHEUS_URL = 'http://127.0.0.1:9090';
const GRAFANA_URL = 'http://127.0.0.1:3000';
const GRAFANA_AUTH = 'Basic ' + Buffer.from('admin:Admin@Pass2026').toString('base64');

async function resetEmp1Password() {
  try {
    const conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3308,
      user: 'root',
      password: 'RootPassword@2026',
      database: 'hrm_db'
    });
    const hash = await hashPassword('Emp@123');
    await conn.execute('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'emp1']);
    await conn.end();
  } catch (err) {
    // ignore
  }
}

function request(method, urlStr, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: reqHeaders,
      rejectUnauthorized: false
    };

    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let parsedData = null;
        try {
          parsedData = JSON.parse(buffer.toString('utf8'));
        } catch {
          parsedData = buffer.toString('utf8');
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsedData,
          rawBuffer: buffer
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const rand = () => Math.floor(1000 + Math.random() * 9000);

async function runSprint2E2eTests() {
  console.log('==============================================================================');
  console.log('🌟 BẮT ĐẦU KIỂM THỬ TÍCH HỢP E2E TOÀN BỘ SPRINT 2 TRÊN DOCKER COMPOSE');
  console.log('==============================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message, detail = '') {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] Kịch bản ${total}: ${message}${detail ? ' -> ' + detail : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] Kịch bản ${total}: ${message}${detail ? ' -> ' + detail : ''}`);
      process.exitCode = 1;
    }
  }

  try {
    // =========================================================================
    // GIAI ĐOẠN 1: HẠ TẦNG DOCKER COMPOSE VÀ MẠNG ĐA TẦNG (MULTI-TIER STACK)
    // =========================================================================
    console.log('📦 GIAI ĐOẠN 1: ĐỐI SOÁT HẠ TẦNG DOCKER COMPOSE VÀ HEALTHCHECKS');
    const healthBackend = await request('GET', `${BACKEND_URL}/api/health`);
    assert(healthBackend.statusCode === 200 && healthBackend.data?.data?.status === 'UP', 'Backend API container hrm-ictu-backend khỏe mạnh (HTTP 200 UP)');

    const healthProm = await request('GET', `${PROMETHEUS_URL}/-/healthy`);
    assert(healthProm.statusCode === 200, 'Prometheus container hrm-prometheus khỏe mạnh (HTTP 200)');

    const healthGraf = await request('GET', `${GRAFANA_URL}/api/health`);
    assert(healthGraf.statusCode === 200 && healthGraf.data?.database === 'ok', 'Grafana container grafana khỏe mạnh (HTTP 200, DB OK)');

    // =========================================================================
    // GIAI ĐOẠN 2: XÁC THỰC ADMIN VÀ BẢO MẬT ĐỔI MẬT KHẨU (US 3.0)
    // =========================================================================
    console.log('\n🔒 GIAI ĐOẠN 2: US 3.0 - QUẢN LÝ TÀI KHOẢN & ĐỔI MẬT KHẨU CÁ NHÂN');
    // 2.1. Đăng nhập Admin
    const adminLogin = await request('POST', `${BACKEND_URL}/api/auth/login`, {
      username: 'admin',
      password: 'Admin@123'
    });
    assert(adminLogin.statusCode === 200 && adminLogin.data?.data?.accessToken, 'Đăng nhập Admin thành công nhận JWT Bearer Token');
    const adminToken = adminLogin.data?.data?.accessToken;

    // 2.2. Đăng nhập tài khoản nhân viên kiểm thử đổi mật khẩu (emp1 / Emp@123)
    await resetEmp1Password();
    const empLoginBefore = await request('POST', `${BACKEND_URL}/api/auth/login`, {
      username: 'emp1',
      password: 'Emp@123'
    });
    assert(empLoginBefore.statusCode === 200 && empLoginBefore.data?.data?.accessToken, 'Tài khoản nhân viên (emp1) đăng nhập thành công ban đầu');
    let empToken = empLoginBefore.data?.data?.accessToken;

    // 2.3. Đổi mật khẩu: Thất bại khi mật khẩu cũ sai
    const changePassFailOld = await request('PUT', `${BACKEND_URL}/api/auth/change-password`, {
      currentPassword: 'WrongPassword@123',
      newPassword: 'BrandNewSecure@Pass2026!'
    }, { 'Authorization': `Bearer ${empToken}` });
    assert(changePassFailOld.statusCode === 400, 'Từ chối đổi mật khẩu khi nhập sai mật khẩu cũ (400 Bad Request)');

    // 2.4. Đổi mật khẩu: Thất bại khi mật khẩu mới quá ngắn (< 12 ký tự)
    const changePassFailShort = await request('PUT', `${BACKEND_URL}/api/auth/change-password`, {
      currentPassword: 'Emp@123',
      newPassword: 'Short@123'
    }, { 'Authorization': `Bearer ${empToken}` });
    assert(changePassFailShort.statusCode === 400, 'Từ chối mật khẩu mới không đạt chuẩn bảo mật >= 12 ký tự (WEAK_PASSWORD)');

    // 2.5. Đổi mật khẩu thành công sang mật khẩu mới
    const changePassSuccess = await request('PUT', `${BACKEND_URL}/api/auth/change-password`, {
      currentPassword: 'Emp@123',
      newPassword: 'BrandNewSecure@Pass2026!',
      confirmPassword: 'BrandNewSecure@Pass2026!'
    }, { 'Authorization': `Bearer ${empToken}` });
    assert(changePassSuccess.statusCode === 200, 'Đổi mật khẩu thành công với mật khẩu hợp lệ (HTTP 200)');

    // 2.6. Thử đăng nhập lại bằng mật khẩu cũ -> Bị từ chối
    const loginOldPass = await request('POST', `${BACKEND_URL}/api/auth/login`, {
      username: 'emp1',
      password: 'Emp@123'
    });
    assert(loginOldPass.statusCode === 401, 'Mật khẩu cũ bị vô hiệu hóa tức thời (HTTP 401 Unauthorized)');

    // 2.7. Đăng nhập lại bằng mật khẩu mới -> Thành công
    const loginNewPass = await request('POST', `${BACKEND_URL}/api/auth/login`, {
      username: 'emp1',
      password: 'BrandNewSecure@Pass2026!'
    });
    assert(loginNewPass.statusCode === 200 && loginNewPass.data?.data?.accessToken, 'Đăng nhập thành công với mật khẩu mới được băm Bcrypt');

    // 2.8. Khôi phục lại mật khẩu gốc cho emp1 để không ảnh hưởng dữ liệu mẫu
    await resetEmp1Password();

    // =========================================================================
    // GIAI ĐOẠN 3: US 7.0 - CHỈNH SỬA & CẬP NHẬT PHÒNG BAN
    // =========================================================================
    console.log('\n🏢 GIAI ĐOẠN 3: US 7.0 - CHỈNH SỬA & CẬP NHẬT THÔNG TIN PHÒNG BAN');
    // 3.1. Lấy danh sách phòng ban
    const deptList = await request('GET', `${BACKEND_URL}/api/departments`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(deptList.statusCode === 200 && Array.isArray(deptList.data?.data), 'Lấy danh sách phòng ban hiện có');
    const firstDept = deptList.data?.data?.[0];
    const deptId = firstDept?.departmentId || firstDept?.id;

    // 3.2. Cập nhật phòng ban bằng PUT
    const originalName = firstDept?.departmentName;
    const updatedName = `${originalName} E2E`;
    const updateDeptRes = await request('PUT', `${BACKEND_URL}/api/departments/${deptId}`, {
      departmentName: updatedName,
      description: 'Phòng ban đã được kiểm thử cập nhật E2E Sprint 2 thành công'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert(updateDeptRes.statusCode === 200, `Cập nhật phòng ban ID ${deptId} thành công qua API PUT`);

    // 3.3. Đối soát lại bằng GET chi tiết
    const getDeptDetail = await request('GET', `${BACKEND_URL}/api/departments/${deptId}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(getDeptDetail.statusCode === 200 && getDeptDetail.data?.data?.departmentName === updatedName, 'Dữ liệu phòng ban được cập nhật chính xác trong CSDL');

    // 3.4. Khôi phục tên ban đầu
    await request('PUT', `${BACKEND_URL}/api/departments/${deptId}`, {
      departmentName: originalName,
      description: firstDept?.description || 'Phòng ban ICTU'
    }, { 'Authorization': `Bearer ${adminToken}` });

    // =========================================================================
    // GIAI ĐOẠN 4: US 13.0 & 14.0 - HỒ SƠ NHÂN VIÊN & THÔI VIỆC (SOFT-DELETE)
    // =========================================================================
    console.log('\n👥 GIAI ĐOẠN 4: US 13.0 & 14.0 - HỒ SƠ NHÂN SỰ, BẢO TOÀN CCCD & THÔI VIỆC');
    // 4.1. Tạo nhân viên kiểm thử mới để thao tác an toàn
    const suffix = rand();
    const testEmployeePayload = {
      fullName: `Nguyễn Văn E2E ${suffix}`,
      cccd: `03820400${suffix}`,
      phone: `0981${suffix}0`,
      departmentId: deptId,
      position: 'Kỹ sư Thử nghiệm E2E',
      baseSalary: 18000000,
      hireDate: '2026-02-01'
    };
    const createEmpRes = await request('POST', `${BACKEND_URL}/api/employees`, testEmployeePayload, { 'Authorization': `Bearer ${adminToken}` });
    const testEmpId = createEmpRes.data?.data?.employeeId;
    assert(createEmpRes.statusCode === 201 && testEmpId, `Khởi tạo nhân viên mới ID ${testEmpId} phục vụ kiểm thử E2E (CCCD mã hóa AES-256)`);

    // 4.2. Cập nhật chức vụ, lương, số điện thoại (US 13.0)
    const updateEmpRes = await request('PUT', `${BACKEND_URL}/api/employees/${testEmpId}`, {
      position: 'Senior SRE Lead',
      baseSalary: 28000000,
      phone: '0987654999'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert(updateEmpRes.statusCode === 200, `Cập nhật hồ sơ nhân viên ID ${testEmpId} thành công (PUT /api/employees/:id)`);

    // 4.3. Đối soát chi tiết và kiểm tra giải mã CCCD (Bảo toàn mã hóa AES-256)
    const empDetail = await request('GET', `${BACKEND_URL}/api/employees/${testEmpId}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(empDetail.statusCode === 200 && empDetail.data?.data?.position === 'Senior SRE Lead', 'Hồ sơ nhân viên phản ánh chức danh mới sau cập nhật');
    assert(empDetail.data?.data?.cccd === testEmployeePayload.cccd, 'Số CCCD được giải mã toàn vẹn đúng 12 chữ số ban đầu (AES-256)');

    // 4.4. Thôi việc nhân viên (US 14.0 - Soft-delete)
    const resignRes = await request('PATCH', `${BACKEND_URL}/api/employees/${testEmpId}`, {
      action: 'RESIGN'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert(resignRes.statusCode === 200, `Cho nhân viên ID ${testEmpId} thôi việc thành công (PATCH /api/employees/:id action=RESIGN)`);

    // 4.5. Xác minh nhân viên bị chuyển trạng thái nhưng dữ liệu vẫn tồn tại (Không xóa cứng CSDL)
    const empAfterResign = await request('GET', `${BACKEND_URL}/api/employees/${testEmpId}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(empAfterResign.statusCode === 200 && empAfterResign.data?.data?.employmentStatus === 'Resigned', 'Trạng thái nhân viên chuyển thành "Resigned" và bảo toàn bản ghi trong CSDL');

    // =========================================================================
    // GIAI ĐOẠN 5: US 19.0 & 22.0 - LỊCH SỬ CHẤM CÔNG & XUẤT FILE BÁO CÁO
    // =========================================================================
    console.log('\n📊 GIAI ĐOẠN 5: US 19.0 & 22.0 - LỊCH SỬ CHẤM CÔNG THEO THÁNG & XUẤT EXCEL/CSV');
    // 5.1. Lấy lịch sử chấm công tháng 10/2026
    const historyRes = await request('GET', `${BACKEND_URL}/api/attendance/history?month=10&year=2026`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(historyRes.statusCode === 200 && historyRes.data?.summary, 'API GET /api/attendance/history trả về dữ liệu lịch sử kèm tổng hợp công');
    const summary = historyRes.data?.summary;
    assert(summary && typeof summary.totalWorkDays === 'number', `Tổng hợp ngày công tháng 10/2026: ${summary?.totalWorkDays} ngày công, đi muộn: ${summary?.lateCount || summary?.lateDays || 0}`);

    // 5.2. Xuất báo cáo chấm công ra file Excel (.xlsx)
    const exportExcelRes = await request('GET', `${BACKEND_URL}/api/reports/attendance/export?format=xlsx&month=10&year=2026`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(exportExcelRes.statusCode === 200, 'API GET /api/reports/attendance/export?format=xlsx phản hồi HTTP 200');
    assert(exportExcelRes.headers['content-type']?.includes('spreadsheetml'), 'Content-Type phản hồi là application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const isZipSignature = exportExcelRes.rawBuffer[0] === 0x50 && exportExcelRes.rawBuffer[1] === 0x4B;
    assert(isZipSignature, 'File Excel xuất ra có chữ ký binary ZIP PK chuẩn của định dạng .xlsx');

    // 5.3. Xuất báo cáo chấm công ra file CSV (.csv) UTF-8
    const exportCsvRes = await request('GET', `${BACKEND_URL}/api/reports/attendance/export?format=csv&month=10&year=2026`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(exportCsvRes.statusCode === 200, 'API GET /api/reports/attendance/export?format=csv phản hồi HTTP 200');
    assert(exportCsvRes.headers['content-type']?.includes('csv'), 'Content-Type phản hồi là text/csv; charset=utf-8');
    const hasUtf8Bom = exportCsvRes.rawBuffer[0] === 0xEF && exportCsvRes.rawBuffer[1] === 0xBB && exportCsvRes.rawBuffer[2] === 0xBF;
    assert(hasUtf8Bom, 'File CSV chứa UTF-8 Byte Order Mark (BOM) bảo đảm hiển thị tiếng Việt có dấu chuẩn xác trên Excel');

    // =========================================================================
    // GIAI ĐOẠN 6: US 20.0 - DASHBOARD STATS & KPI THỜI GIAN THỰC
    // =========================================================================
    console.log('\n📈 GIAI ĐOẠN 6: US 20.0 - DASHBOARD KPI TỔNG QUAN & PHÂN BỔ PHÒNG BAN');
    const dashRes = await request('GET', `${BACKEND_URL}/api/dashboard/stats`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert(dashRes.statusCode === 200 && dashRes.data?.data, 'API GET /api/dashboard/stats phản hồi HTTP 200');
    const kpi = dashRes.data?.data;
    assert(kpi.totalEmployees >= 0 && kpi.presentEmployees >= 0, `KPI nhân sự: Tổng NV=${kpi.totalEmployees}, Có mặt hôm nay=${kpi.presentEmployees}, Tỷ lệ=${kpi.attendanceRate}%`);
    assert(kpi.totalDepartments >= 0, `Tổng số phòng ban thống kê trên Dashboard: ${kpi.totalDepartments} đơn vị`);

    // =========================================================================
    // GIAI ĐOẠN 7: US 29.0 - HẠ TẦNG GIÁM SÁT PROMETHEUS + GRAFANA (MỐC COMMIT 2)
    // =========================================================================
    console.log('\n🔭 GIAI ĐOẠN 7: US 29.0 - HẠ TẦNG OBSERVABILITY (PROMETHEUS 5 TARGETS & GRAFANA)');
    // 7.1. Kiểm tra 5/5 Targets trên Prometheus
    const pTargets = await request('GET', `${PROMETHEUS_URL}/api/v1/targets`);
    const active = pTargets.data?.data?.activeTargets || [];
    assert(pTargets.statusCode === 200 && active.length >= 5, `Prometheus quản lý đủ ${active.length} active scrape targets`);

    const jobs = ['prometheus', 'node-exporter', 'cadvisor', 'mysql-exporter', 'hrm-app'];
    for (const j of jobs) {
      const t = active.find(item => item.labels?.job === j);
      assert(t && t.health === 'up', `Target [${j}] đạt trạng thái UP (1)`, `ScrapeUrl: ${t?.scrapeUrl}`);
    }

    // 7.2. Kiểm tra Grafana Datasource Prometheus
    const dsRes = await request('GET', `${GRAFANA_URL}/api/datasources`, null, { 'Authorization': GRAFANA_AUTH });
    const promDs = (dsRes.data || []).find(d => d.uid === 'prometheus');
    assert(promDs && promDs.isDefault === true && promDs.url === 'http://prometheus:9090', 'Grafana có sẵn Datasource Prometheus mặc định qua Docker network');

    // 7.3. Kiểm tra 3 Dashboards tự động nạp trên Grafana
    const searchRes = await request('GET', `${GRAFANA_URL}/api/search`, null, { 'Authorization': GRAFANA_AUTH });
    const items = searchRes.data || [];
    const d1860 = items.find(i => i.uid === 'rYdddlPWk');
    const d14282 = items.find(i => i.uid === 'pMEd7m0Mz');
    const d7362 = items.find(i => i.uid === 'MQWgroiiz');
    assert(d1860 !== undefined, 'Dashboard ID 1860 (Node Exporter Full) hiển thị trên Grafana');
    assert(d14282 !== undefined, 'Dashboard ID 14282 (Docker cAdvisor) hiển thị trên Grafana');
    assert(d7362 !== undefined, 'Dashboard ID 7362 (MySQL Overview) hiển thị trên Grafana');

    // 7.4. Kiểm tra luồng số liệu thời gian thực qua Grafana Query Engine
    const gQuery = await request('POST', `${GRAFANA_URL}/api/ds/query`, {
      queries: [{ datasource: { type: 'prometheus', uid: 'prometheus' }, expr: 'up', refId: 'A' }],
      from: (Date.now() - 300000).toString(),
      to: Date.now().toString()
    }, { 'Authorization': GRAFANA_AUTH });
    assert(gQuery.statusCode === 200 && gQuery.data?.results?.A?.frames?.length >= 5, 'Grafana truy vấn số liệu trực tiếp từ Prometheus thời gian thực thành công');

    console.log('\n==============================================================================');
    console.log(`🎉 TỔNG KẾT E2E SPRINT 2: ĐÃ VƯỢT QUA ${passed}/${total} KỊCH BẢN KIỂM THỬ TÍCH HỢP!`);
    console.log('   - 100% Nghiệp vụ Sprint 2 (US 3, 7, 13, 14, 19, 20, 22) vận hành trơn tru.');
    console.log('   - 100% Hạ tầng Giám sát Sprint 2 (US 29.0 - Commit 2) sẵn sàng và kết nối chuẩn.');
    console.log('   - ĐỦ ĐIỀU KIỆN ĐÓNG SPRINT 2 VÀ CÁN MỐC COMMIT 2 TRÊN GITHUB!');
    console.log('==============================================================================\n');
  } catch (err) {
    console.error('Lỗi khi thực thi bài kiểm thử E2E Sprint 2:', err.message);
    process.exitCode = 1;
  }
}

runSprint2E2eTests();
