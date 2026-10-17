/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG: TOÀN DIỆN HẠ TẦNG GIÁM SÁT PROMETHEUS STACK (HRM-221)
 * ==============================================================================
 * Kiểm thử:
 * 1. cAdvisor endpoint http://127.0.0.1:8085/metrics (cổng nội bộ 8080)
 *    - container_cpu_usage_seconds_total
 *    - container_memory_working_set_bytes
 *    - container_network_receive_bytes_total
 *    - container_network_transmit_bytes_total
 * 2. Node Exporter endpoint http://127.0.0.1:9100/metrics (cổng nội bộ 9100)
 *    - node_cpu_seconds_total
 *    - node_memory_MemAvailable_bytes
 *    - node_filesystem_avail_bytes
 *    - node_network_receive_bytes_total
 * 3. MySQL Exporter endpoint http://127.0.0.1:9104/metrics (cổng nội bộ 9104)
 *    - mysql_up = 1
 * 4. Prometheus Targets API (http://127.0.0.1:9090/api/v1/targets)
 *    - 4/4 Targets UP: cadvisor, node-exporter, mysql-exporter, prometheus
 * 5. Prometheus Query API (http://127.0.0.1:9090/api/v1/query)
 *    - up{job="cadvisor"} == 1
 *    - up{job="node-exporter"} == 1
 *    - up{job="mysql-exporter"} == 1
 *    - container_cpu_usage_seconds_total
 *    - node_memory_MemAvailable_bytes
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

async function runMonitoringTests() {
  console.log('==================================================================');
  console.log('🔍 BẮT ĐẦU KIỂM THỬ HẠ TẦNG GIÁM SÁT CADVISOR + NODE EXPORTER (HRM-221)');
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
    // --- PHẦN 1: KIỂM THỬ CADVISOR METRICS (CỔNG NỘI BỘ 8080 / HOST 8085) ---
    console.log('--- PHẦN 1: KIỂM THỬ CADVISOR METRICS ---');
    const cadvisorRes = await fetchUrl('http://127.0.0.1:8085/metrics');
    assert(cadvisorRes.statusCode === 200, 'cAdvisor metrics endpoint trả về HTTP 200 OK.');
    assert(cadvisorRes.data.includes('container_cpu_usage_seconds_total'), 'cAdvisor thu thập thành công container_cpu_usage_seconds_total.');
    assert(cadvisorRes.data.includes('container_memory_working_set_bytes'), 'cAdvisor thu thập thành công container_memory_working_set_bytes.');
    assert(cadvisorRes.data.includes('container_network_receive_bytes_total'), 'cAdvisor thu thập thành công container_network_receive_bytes_total.');
    assert(cadvisorRes.data.includes('container_network_transmit_bytes_total'), 'cAdvisor thu thập thành công container_network_transmit_bytes_total.');

    // --- PHẦN 2: KIỂM THỬ NODE EXPORTER METRICS (CỔNG NỘI BỘ 9100 / HOST 9100) ---
    console.log('\n--- PHẦN 2: KIỂM THỬ NODE EXPORTER METRICS ---');
    const nodeRes = await fetchUrl('http://127.0.0.1:9100/metrics');
    assert(nodeRes.statusCode === 200, 'Node Exporter metrics endpoint trả về HTTP 200 OK.');
    assert(nodeRes.data.includes('node_cpu_seconds_total'), 'Node Exporter thu thập thành công node_cpu_seconds_total.');
    assert(nodeRes.data.includes('node_memory_MemAvailable_bytes'), 'Node Exporter thu thập thành công node_memory_MemAvailable_bytes.');
    assert(nodeRes.data.includes('node_filesystem_avail_bytes'), 'Node Exporter thu thập thành công node_filesystem_avail_bytes.');
    assert(nodeRes.data.includes('node_network_receive_bytes_total'), 'Node Exporter thu thập thành công node_network_receive_bytes_total.');

    // --- PHẦN 3: BẢO TOÀN MYSQL EXPORTER HIỆN CÓ ---
    console.log('\n--- PHẦN 3: BẢO TOÀN MYSQL EXPORTER METRICS ---');
    const mysqlExpRes = await fetchUrl('http://127.0.0.1:9104/metrics');
    assert(mysqlExpRes.statusCode === 200, 'MySQL Exporter metrics endpoint trả về HTTP 200 OK.');
    assert(mysqlExpRes.data.includes('mysql_up 1'), 'MySQL Exporter duy trì kết nối thành công: mysql_up = 1.');

    // --- PHẦN 4: KIỂM THỬ PROMETHEUS TARGETS TRẠNG THÁI UP ---
    console.log('\n--- PHẦN 4: KIỂM THỬ PROMETHEUS SCRAPE TARGETS ---');
    const targetsRes = await fetchUrl('http://127.0.0.1:9090/api/v1/targets');
    assert(targetsRes.statusCode === 200, 'Prometheus Targets API phản hồi HTTP 200.');

    const targetsJson = JSON.parse(targetsRes.data);
    const targets = targetsJson.data?.activeTargets || [];

    const cadvisorTarget = targets.find(t => t.labels?.job === 'cadvisor');
    assert(cadvisorTarget !== undefined && cadvisorTarget.health === 'up', 'Prometheus target "cadvisor" hiển thị trạng thái "up".');

    const nodeTarget = targets.find(t => t.labels?.job === 'node-exporter');
    assert(nodeTarget !== undefined && nodeTarget.health === 'up', 'Prometheus target "node-exporter" hiển thị trạng thái "up".');

    const mysqlTarget = targets.find(t => t.labels?.job === 'mysql-exporter');
    assert(mysqlTarget !== undefined && mysqlTarget.health === 'up', 'Prometheus target "mysql-exporter" hiển thị trạng thái "up".');

    const promTarget = targets.find(t => t.labels?.job === 'prometheus');
    assert(promTarget !== undefined && promTarget.health === 'up', 'Prometheus self-target "prometheus" hiển thị trạng thái "up".');

    // --- PHẦN 5: KIỂM THỬ TRUY VẤN PROMQL ---
    console.log('\n--- PHẦN 5: KIỂM THỬ TRUY VẤN PROMQL ---');
    const qCad = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22cadvisor%22%7D');
    const jCad = JSON.parse(qCad.data);
    assert(jCad.data?.result?.[0]?.value?.[1] === '1', 'PromQL up{job="cadvisor"} trả về giá trị 1.');

    const qNode = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22node-exporter%22%7D');
    const jNode = JSON.parse(qNode.data);
    assert(jNode.data?.result?.[0]?.value?.[1] === '1', 'PromQL up{job="node-exporter"} trả về giá trị 1.');

    const qCpu = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=container_cpu_usage_seconds_total');
    const jCpu = JSON.parse(qCpu.data);
    assert((jCpu.data?.result?.length || 0) > 0, 'PromQL container_cpu_usage_seconds_total trả về dữ liệu mẫu thực tế.');

    const qMem = await fetchUrl('http://127.0.0.1:9090/api/v1/query?query=node_memory_MemAvailable_bytes');
    const jMem = JSON.parse(qMem.data);
    const memBytes = Number(jMem.data?.result?.[0]?.value?.[1]);
    assert(memBytes > 0, `PromQL node_memory_MemAvailable_bytes trả về ${memBytes} bytes (> 0).`);

    console.log('\n==================================================================');
    console.log(`🎉 KẾT QUẢ: ĐÃ VƯỢT QUA ${passed}/${total} BÀI KIỂM THỬ GIÁM SÁT HẠ TẦNG!`);
    console.log('==================================================================\n');
  } catch (err) {
    console.error('Lỗi kiểm thử:', err.message);
    process.exitCode = 1;
  }
}

runMonitoringTests();
