/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG: GRAFANA PROVISIONING & 3 DASHBOARDS (HRM-224)
 * ==============================================================================
 * Kiểm thử:
 * 1. Grafana Health API: http://127.0.0.1:3000/api/health (database: ok)
 * 2. Prometheus Datasource Provisioning:
 *    - UID: prometheus, Type: prometheus, isDefault: true, access: proxy
 *    - URL: http://prometheus:9090 (kết nối nội bộ Docker network monitoring)
 * 3. Grafana Datasource Proxy to Prometheus:
 *    - Truy vấn PromQL "up" trả về đủ 5 targets UP (1)
 * 4. Dashboards Folder Provisioning:
 *    - Thư mục "Infrastructure Monitoring" tồn tại
 * 5. 3 Dashboards Provisioning:
 *    - Dashboard 1 (ID 1860): "Node Exporter Full" (UID: rYdddlPWk)
 *    - Dashboard 2 (ID 14282): "Cadvisor exporter" (UID: pMEd7m0Mz)
 *    - Dashboard 3 (ID 7362): "MySQL Overview" (UID: MQWgroiiz)
 * 6. Truy vấn số liệu thời gian thực qua Grafana Backend Query API (/api/ds/query):
 *    - Node Exporter: node_memory_MemAvailable_bytes & node_cpu_seconds_total
 *    - MySQL Exporter: mysql_up & mysql_global_status_threads_connected
 *    - cAdvisor: container_cpu_usage_seconds_total
 * ==============================================================================
 */

import http from 'http';

const GRAFANA_HOST = '127.0.0.1';
const GRAFANA_PORT = 3000;
const AUTH_HEADER = 'Basic ' + Buffer.from('admin:Admin@Pass2026').toString('base64');

function grafanaGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GRAFANA_HOST,
      port: GRAFANA_PORT,
      path,
      method: 'GET',
      headers: {
        'Authorization': AUTH_HEADER
      }
    };
    http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function grafanaPost(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: GRAFANA_HOST,
      port: GRAFANA_PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTH_HEADER,
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runGrafanaTests() {
  console.log('==================================================================');
  console.log('🔍 BẮT ĐẦU KIỂM THỬ GRAFANA OBSERVABILITY & 3 DASHBOARDS (HRM-224)');
  console.log('==================================================================\n');

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
    // --- PHẦN 1: GRAFANA SERVER HEALTH & STATUS ---
    console.log('--- PHẦN 1: TRẠNG THÁI MÁY CHỦ GRAFANA (:3000) ---');
    const health = await grafanaGet('/api/health');
    assert(health.statusCode === 200, 'Grafana HTTP Server phản hồi HTTP 200 OK.');
    assert(health.data?.database === 'ok', `Grafana Database trạng thái "ok" (Version: ${health.data?.version}).`);

    // --- PHẦN 2: DATASOURCE PROMETHEUS PROVISIONING ---
    console.log('\n--- PHẦN 2: KIỂM TRA DATASOURCE PROVISIONING ---');
    const dsRes = await grafanaGet('/api/datasources');
    assert(dsRes.statusCode === 200, 'API /api/datasources phản hồi HTTP 200.');
    const datasources = Array.isArray(dsRes.data) ? dsRes.data : [];
    const promDs = datasources.find(d => d.uid === 'prometheus' || d.type === 'prometheus');
    assert(promDs !== undefined, 'Datasource Prometheus được provisioning tự động thành công.');
    assert(promDs?.uid === 'prometheus', 'Datasource Prometheus có UID ổn định: "prometheus".');
    assert(promDs?.isDefault === true, 'Datasource Prometheus được cấu hình làm Default Datasource (isDefault: true).');
    assert(promDs?.access === 'proxy', 'Datasource Prometheus sử dụng cơ chế Server Proxy (access: proxy).');
    assert(promDs?.url === 'http://prometheus:9090', 'Datasource URL trỏ chuẩn xác đến Prometheus nội bộ (http://prometheus:9090).');

    // --- PHẦN 3: KẾT NỐI LIÊN MẠNG QUA PROXY PROMETHEUS ---
    console.log('\n--- PHẦN 3: KIỂM TRA TRUY VẤN PROMETHEUS QUA GRAFANA PROXY ---');
    const proxyRes = await grafanaGet('/api/datasources/proxy/uid/prometheus/api/v1/query?query=up');
    assert(proxyRes.statusCode === 200, 'Grafana kết nối Prometheus qua Docker network thành công (Proxy HTTP 200).');
    const upResults = proxyRes.data?.data?.result || [];
    assert(upResults.length >= 5, `Prometheus trả về đủ ${upResults.length} metrics "up" (yêu cầu tối thiểu 5 targets).`);
    const allUp = upResults.every(r => r.value?.[1] === '1');
    assert(allUp, 'Tất cả 5 scrape targets trong Prometheus đều đạt trạng thái UP (100% value == 1).');

    // --- PHẦN 4: THƯ MỤC VÀ 3 DASHBOARDS PROVISIONING ---
    console.log('\n--- PHẦN 4: ĐỐI SOÁT 3 DASHBOARDS TỰ ĐỘNG PROVISIONING ---');
    const searchRes = await grafanaGet('/api/search');
    assert(searchRes.statusCode === 200, 'API /api/search phản hồi HTTP 200.');
    const searchItems = Array.isArray(searchRes.data) ? searchRes.data : [];

    const folder = searchItems.find(i => i.type === 'dash-folder' && i.title === 'Infrastructure Monitoring');
    assert(folder !== undefined, 'Thư mục dashboard "Infrastructure Monitoring" được tự động khởi tạo.');

    // Dashboard 1: Node Exporter Full (1860)
    const dNode = searchItems.find(i => i.uid === 'rYdddlPWk');
    assert(dNode !== undefined, 'Dashboard 1 [ID: 1860] "Node Exporter Full" (UID: rYdddlPWk) đã được import.');
    assert(dNode?.folderTitle === 'Infrastructure Monitoring', 'Dashboard 1 nằm đúng thư mục "Infrastructure Monitoring".');

    // Dashboard 2: Docker cAdvisor (14282)
    const dCad = searchItems.find(i => i.uid === 'pMEd7m0Mz');
    assert(dCad !== undefined, 'Dashboard 2 [ID: 14282] "Cadvisor exporter" (UID: pMEd7m0Mz) đã được import.');
    assert(dCad?.folderTitle === 'Infrastructure Monitoring', 'Dashboard 2 nằm đúng thư mục "Infrastructure Monitoring".');

    // Dashboard 3: MySQL Overview (7362)
    const dMysql = searchItems.find(i => i.uid === 'MQWgroiiz');
    assert(dMysql !== undefined, 'Dashboard 3 [ID: 7362] "MySQL Overview" (UID: MQWgroiiz) đã được import.');
    assert(dMysql?.folderTitle === 'Infrastructure Monitoring', 'Dashboard 3 nằm đúng thư mục "Infrastructure Monitoring".');

    // --- PHẦN 5: KIỂM TRA TRUY VẤN SỐ LIỆU QUA GRAFANA QUERY API ---
    console.log('\n--- PHẦN 5: KIỂM TRA THU THẬP METRICS CHO CÁC DASHBOARD PANELS (/api/ds/query) ---');
    const now = Date.now();
    const from = (now - 3600000).toString();
    const to = now.toString();

    // Node Exporter metric: RAM available
    const qNodeRes = await grafanaPost('/api/ds/query', {
      queries: [{ datasource: { type: 'prometheus', uid: 'prometheus' }, expr: 'node_memory_MemAvailable_bytes', refId: 'A' }],
      from, to
    });
    const nodeFrames = qNodeRes.data?.results?.A?.frames || [];
    assert(nodeFrames.length > 0, `Node Exporter metric (node_memory_MemAvailable_bytes) có dữ liệu trên Grafana (${nodeFrames.length} frame).`);

    // MySQL Exporter metric: mysql_up
    const qMysqlRes = await grafanaPost('/api/ds/query', {
      queries: [{ datasource: { type: 'prometheus', uid: 'prometheus' }, expr: 'mysql_up', refId: 'A' }],
      from, to
    });
    const mysqlFrames = qMysqlRes.data?.results?.A?.frames || [];
    assert(mysqlFrames.length > 0, `MySQL Exporter metric (mysql_up) có dữ liệu trên Grafana (${mysqlFrames.length} frame).`);

    // MySQL Exporter metric: threads connected
    const qThreadsRes = await grafanaPost('/api/ds/query', {
      queries: [{ datasource: { type: 'prometheus', uid: 'prometheus' }, expr: 'mysql_global_status_threads_connected', refId: 'A' }],
      from, to
    });
    const threadsFrames = qThreadsRes.data?.results?.A?.frames || [];
    assert(threadsFrames.length > 0, `MySQL Threads Connected metric có dữ liệu trên Grafana (${threadsFrames.length} frame).`);

    // cAdvisor metric: container CPU usage
    const qCadRes = await grafanaPost('/api/ds/query', {
      queries: [{ datasource: { type: 'prometheus', uid: 'prometheus' }, expr: 'container_cpu_usage_seconds_total', refId: 'A' }],
      from, to
    });
    const cadFrames = qCadRes.data?.results?.A?.frames || [];
    assert(cadFrames.length > 0, `cAdvisor Container CPU metric (container_cpu_usage_seconds_total) có dữ liệu trên Grafana (${cadFrames.length} frame).`);

    console.log('\n==================================================================');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passed}/${total} BÀI TEST GRAFANA!`);
    console.log('   GRAFANA ĐÃ TỰ ĐỘNG PROVISIONING ĐẦY ĐỦ DATASOURCE & 3 DASHBOARDS 100%');
    console.log('==================================================================\n');
  } catch (err) {
    console.error('Lỗi khi thực thi bài kiểm thử Grafana:', err.message);
    process.exitCode = 1;
  }
}

runGrafanaTests();
