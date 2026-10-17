/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG: MYSQL EXPORTER & PROMETHEUS SCRAPE TARGETS (HRM-220)
 * ==============================================================================
 * Kiểm thử:
 * 1. MySQL Exporter container lắng nghe tại cổng 9104 và trả về metrics hợp lệ.
 * 2. Chỉ số mysql_up = 1 (kết nối cơ sở dữ liệu thành công).
 * 3. Prometheus scrape target `mysql-exporter` hiển thị trạng thái `UP` (up = 1).
 * 4. Truy vấn chỉ số `mysql_up` trong Prometheus trả về 1.
 * 5. Nguyên tắc Least Privilege: Tài khoản `exporter` bị chặn đọc bảng dữ liệu người dùng.
 * ==============================================================================
 */

import http from 'http';
import { testConnection, getPool } from '../src/config/database.js';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function runExporterTests() {
  console.log('============================================================');
  console.log('🔍 BẮT ĐẦU KIỂM THỬ MYSQL EXPORTER & PROMETHEUS INTEGRATION');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] Test ${total}: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] Test ${total}: ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Kiểm tra kết nối Database của hệ thống
    const dbStatus = await testConnection();
    assert(dbStatus.ok === true, 'MySQL database hrm-db đang hoạt động bình thường.');

    // 2. Kiểm tra Exporter metrics endpoint
    console.log('\n--- PHẦN 1: KIỂM THỬ METRICS ENDPOINT (PORT 9104) ---');
    const exporterRes = await fetchUrl('http://127.0.0.1:9104/metrics');
    assert(exporterRes.statusCode === 200, 'Endpoint http://127.0.0.1:9104/metrics trả về HTTP 200 OK.');
    assert(exporterRes.data.includes('mysql_up 1'), 'Chỉ số mysql_up = 1 (Exporter kết nối MySQL thành công).');
    assert(exporterRes.data.includes('mysql_global_status_uptime'), 'Exporter thu thập thành công mysql_global_status_uptime.');
    assert(exporterRes.data.includes('mysql_global_status_threads_connected'), 'Exporter thu thập thành công threads_connected.');

    // 3. Kiểm tra Prometheus targets API
    console.log('\n--- PHẦN 2: KIỂM THỬ PROMETHEUS SCRAPE TARGETS (PORT 9090) ---');
    const targetsRes = await fetchUrl('http://127.0.0.1:9090/api/v1/targets');
    assert(targetsRes.statusCode === 200, 'Prometheus Targets API http://127.0.0.1:9090/api/v1/targets phản hồi HTTP 200.');
    
    const targetsJson = JSON.parse(targetsRes.data);
    const mysqlTarget = targetsJson.data?.activeTargets?.find(t => t.labels?.job === 'mysql-exporter');
    assert(mysqlTarget !== undefined, 'Target job "mysql-exporter" được khai báo trong Prometheus.');
    assert(mysqlTarget?.health === 'up', `Target job "mysql-exporter" có trạng thái "${mysqlTarget?.health}" (Kỳ vọng: "up").`);

    // 4. Kiểm tra Prometheus Query API
    console.log('\n--- PHẦN 3: KIỂM THỬ PROMETHEUS QUERY API ---');
    const upQueryRes = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22mysql-exporter%22%7D');
    const upJson = JSON.parse(upQueryRes.data);
    const upValue = upJson.data?.result?.[0]?.value?.[1];
    assert(upValue === '1', `Truy vấn up{job="mysql-exporter"} trả về giá trị 1 (Giá trị nhận được: ${upValue}).`);

    const mysqlUpQueryRes = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=mysql_up');
    const mysqlUpJson = JSON.parse(mysqlUpQueryRes.data);
    const mysqlUpValue = mysqlUpJson.data?.result?.[0]?.value?.[1];
    assert(mysqlUpValue === '1', `Truy vấn mysql_up trong Prometheus trả về giá trị 1 (Giá trị nhận được: ${mysqlUpValue}).`);

    // 5. Kiểm tra bảo mật Least Privilege của tài khoản exporter
    console.log('\n--- PHẦN 4: KIỂM THỬ BẢO MẬT LEAST PRIVILEGE ---');
    import('mysql2/promise').then(async (mysql) => {
      const exporterConn = await mysql.createConnection({
        host: '127.0.0.1',
        port: Number(process.env.DB_PORT || 3308),
        user: 'exporter',
        password: 'Pr0m3th3us@M0n2026!'
      });

      const [selfGrants] = await exporterConn.query('SHOW GRANTS;');
      const grantsStr = selfGrants.map(g => Object.values(g)[0]).join(' | ');
      assert(grantsStr.includes('PROCESS') && grantsStr.includes('REPLICATION CLIENT'), 'Tài khoản exporter có quyền PROCESS và REPLICATION CLIENT.');
      assert(grantsStr.includes('performance_schema'), 'Tài khoản exporter chỉ có quyền SELECT trên performance_schema.');
      assert(!grantsStr.includes('ALL PRIVILEGES'), 'Tài khoản exporter TUYỆT ĐỐI không có ALL PRIVILEGES.');
      assert(!grantsStr.includes('hrm_db'), 'Tài khoản exporter TUYỆT ĐỐI không có quyền trên cơ sở dữ liệu nghiệp vụ hrm_db.');

      // Thử đọc bảng nghiệp vụ nhân sự -> Bắt buộc bị từ chối
      let accessBlocked = false;
      try {
        await exporterConn.query('SELECT * FROM hrm_db.users LIMIT 1;');
      } catch (accessErr) {
        if (accessErr.code === 'ER_TABLEACCESS_DENIED_ERROR' || accessErr.message.includes('command denied')) {
          accessBlocked = true;
        }
      }
      assert(accessBlocked === true, 'Tài khoản exporter BỊ CHẶN truy cập vào bảng người dùng hrm_db.users (ER_TABLEACCESS_DENIED_ERROR).');

      await exporterConn.end();

      console.log('\n============================================================');
      console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passed}/${total} BÀI KIỂM THỬ MYSQL EXPORTER & PROMETHEUS!`);
      console.log('============================================================\n');
    }).catch((err) => {
      console.error('Lỗi kiểm thử Least Privilege:', err.message);
      process.exitCode = 1;
    });
  } catch (err) {
    console.error('Lỗi kiểm thử:', err.message);
    process.exitCode = 1;
  } finally {
    const pool = getPool();
    if (pool) await pool.end();
  }
}

runExporterTests();
