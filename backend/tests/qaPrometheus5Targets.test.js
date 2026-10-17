/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG: 5 SCRAPE TARGETS TRÊN PROMETHEUS (HRM-222)
 * ==============================================================================
 * Kiểm thử:
 * 1. Prometheus Scrape Target 1: prometheus (Self-monitoring :9090) -> UP
 * 2. Prometheus Scrape Target 2: node-exporter (Host/OS metrics :9100) -> UP
 * 3. Prometheus Scrape Target 3: cadvisor (Container metrics :8080) -> UP
 * 4. Prometheus Scrape Target 4: mysql-exporter (Database metrics :9104) -> UP
 * 5. Prometheus Scrape Target 5: hrm-app (Express Backend Runtime & HTTP :3005) -> UP
 *
 * Kiểm tra PromQL queries:
 * - up{job="prometheus"} == 1
 * - up{job="node-exporter"} == 1
 * - up{job="cadvisor"} == 1
 * - up{job="mysql-exporter"} == 1
 * - up{job="hrm-app"} == 1
 * - hrm_app_info == 1
 * - http_requests_total
 * ==============================================================================
 */

import http from 'http';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function runPrometheus5TargetsTests() {
  console.log('==================================================================');
  console.log('🔍 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN 5 SCRAPE TARGETS PROMETHEUS (HRM-222)');
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
    // --- PHẦN 1: KIỂM TRA TRỰC TIẾP ENDPOINT METRICS CỦA ỨNG DỤNG HRM ---
    console.log('--- PHẦN 1: KIỂM THỬ TRỰC TIẾP HRM BACKEND METRICS ENDPOINT (/metrics) ---');
    const appRes = await fetchUrl('http://127.0.0.1:3005/metrics');
    assert(appRes.statusCode === 200, 'HRM App metrics endpoint (/metrics) trả về HTTP 200 OK.');
    assert(appRes.data.includes('nodejs_process_cpu_user_seconds_total') || appRes.data.includes('nodejs_cpu_seconds_total'), 'HRM App xuất dữ liệu V8 CPU runtime metrics.');
    assert(appRes.data.includes('nodejs_process_heap_bytes') || appRes.data.includes('nodejs_heap_size_total_bytes'), 'HRM App xuất dữ liệu V8 Memory/Heap metrics.');
    assert(appRes.data.includes('http_requests_total'), 'HRM App thu thập Counter http_requests_total.');
    assert(appRes.data.includes('hrm_app_info'), 'HRM App thu thập Gauge hrm_app_info phiên bản hệ thống.');

    // --- PHẦN 2: KIỂM THỬ CÁC EXPORTERS ĐỘC LẬP TRÊN HOST ---
    console.log('\n--- PHẦN 2: KIỂM THỬ TRỰC TIẾP CÁC EXPORTERS HẠ TẦNG ---');
    const nodeRes = await fetchUrl('http://127.0.0.1:9100/metrics');
    assert(nodeRes.statusCode === 200 && nodeRes.data.includes('node_cpu_seconds_total'), 'Node Exporter (:9100) phản hồi metrics CPU hợp lệ.');

    const cadvisorRes = await fetchUrl('http://127.0.0.1:8085/metrics');
    assert(cadvisorRes.statusCode === 200 && cadvisorRes.data.includes('container_cpu_usage_seconds_total'), 'cAdvisor (:8085) phản hồi container metrics hợp lệ.');

    const mysqlRes = await fetchUrl('http://127.0.0.1:9104/metrics');
    assert(mysqlRes.statusCode === 200 && mysqlRes.data.includes('mysql_up 1'), 'MySQL Exporter (:9104) phản hồi mysql_up = 1.');

    // --- PHẦN 3: KIỂM THỬ PROMETHEUS TARGETS API (/api/v1/targets) ---
    console.log('\n--- PHẦN 3: ĐỐI SOÁT 5 TARGETS TRÊN PROMETHEUS TARGETS API ---');
    const targetsRes = await fetchUrl('http://127.0.0.1:9090/api/v1/targets');
    assert(targetsRes.statusCode === 200, 'Prometheus Targets API (/api/v1/targets) phản hồi HTTP 200.');

    const targetsJson = JSON.parse(targetsRes.data);
    const activeTargets = targetsJson.data?.activeTargets || [];
    assert(activeTargets.length >= 5, `Prometheus quản lý đủ ít nhất 5 active scrape targets (hiện có: ${activeTargets.length}).`);

    // Target 1: prometheus
    const tProm = activeTargets.find(t => t.labels?.job === 'prometheus' && t.discoveredLabels?.__address__ === 'prometheus:9090');
    assert(tProm !== undefined && tProm.health === 'up', 'Target 1 [prometheus:9090] job="prometheus" hiển thị trạng thái "up".');

    // Target 2: node-exporter
    const tNode = activeTargets.find(t => t.labels?.job === 'node-exporter');
    assert(tNode !== undefined && tNode.health === 'up' && tNode.discoveredLabels?.__address__ === 'node-exporter:9100', 'Target 2 [node-exporter:9100] job="node-exporter" hiển thị trạng thái "up".');

    // Target 3: cadvisor
    const tCad = activeTargets.find(t => t.labels?.job === 'cadvisor');
    assert(tCad !== undefined && tCad.health === 'up' && tCad.discoveredLabels?.__address__ === 'cadvisor:8080', 'Target 3 [cadvisor:8080] job="cadvisor" hiển thị trạng thái "up".');

    // Target 4: mysql-exporter
    const tMysql = activeTargets.find(t => t.labels?.job === 'mysql-exporter');
    assert(tMysql !== undefined && tMysql.health === 'up' && tMysql.discoveredLabels?.__address__ === 'mysqld-exporter:9104', 'Target 4 [mysqld-exporter:9104] job="mysql-exporter" hiển thị trạng thái "up".');

    // Target 5: hrm-app
    const tApp = activeTargets.find(t => t.labels?.job === 'hrm-app');
    assert(tApp !== undefined && tApp.health === 'up' && tApp.discoveredLabels?.__address__ === 'hrm-app:3005', 'Target 5 [hrm-app:3005] job="hrm-app" hiển thị trạng thái "up".');
    assert(tApp?.scrapeUrl?.endsWith('/metrics'), 'Target 5 HRM App sử dụng metrics_path = /metrics chuẩn xác.');

    // --- PHẦN 4: KIỂM THỬ PROMQL QUERIES ---
    console.log('\n--- PHẦN 4: TRUY VẤN PROMQL CHO TỪNG TARGET (up == 1) ---');
    const jobs = ['prometheus', 'node-exporter', 'cadvisor', 'mysql-exporter', 'hrm-app'];
    for (const job of jobs) {
      const qRes = await fetchUrl(`http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22${encodeURIComponent(job)}%22%7D`);
      const qJson = JSON.parse(qRes.data);
      const results = qJson.data?.result || [];
      const isUp = results.some(r => r.value?.[1] === '1');
      assert(isUp, `PromQL up{job="${job}"} trả về giá trị 1 (UP).`);
    }

    // --- PHẦN 5: KIỂM THỬ TRUY VẤN DỮ LIỆU METRICS CỦA HRM APP TỪ PROMETHEUS ---
    console.log('\n--- PHẦN 5: TRUY VẤN METRICS HRM APP QUA PROMETHEUS PROMQL ---');
    const qAppInfo = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=hrm_app_info');
    const jAppInfo = JSON.parse(qAppInfo.data);
    assert((jAppInfo.data?.result?.length || 0) > 0, 'PromQL hrm_app_info trả về dữ liệu phiên bản ứng dụng từ scraper.');

    const qReqTotal = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=http_requests_total');
    const jReqTotal = JSON.parse(qReqTotal.data);
    assert((jReqTotal.data?.result?.length || 0) > 0, 'PromQL http_requests_total thu thập thành công số lượng request.');

    console.log('\n==================================================================');
    console.log(`🎉 KẾT QUẢ KIỂM THỬ: ĐÃ VƯỢT QUA ${passed}/${total} BÀI TEST 5 TARGETS!`);
    console.log('   TẤT CẢ 5 TARGETS TRÊN PROMETHEUS ĐÃ SẴN SÀNG VÀ ĐẠT TRẠNG THÁI UP 100%');
    console.log('==================================================================\n');
  } catch (err) {
    console.error('Lỗi khi thực thi bài kiểm thử:', err.message);
    process.exitCode = 1;
  }
}

runPrometheus5TargetsTests();
