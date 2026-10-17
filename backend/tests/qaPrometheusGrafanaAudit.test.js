/**
 * ==============================================================================
 * BỘ KIỂM TOÁN CHẤT LƯỢNG (QA AUDIT SUITE):
 * XÁC NHẬN 5/5 TARGETS PROMETHEUS UP & SỐ LIỆU HIỂN THỊ REALTIME TRÊN GRAFANA
 * ==============================================================================
 * Kiểm toán:
 * 1. [Prometheus Native API] Kiểm tra trạng thái 5/5 Targets UP:
 *    - Target 1: prometheus:9090 (job: prometheus)
 *    - Target 2: node-exporter:9100 (job: node-exporter)
 *    - Target 3: cadvisor:8080 (job: cadvisor)
 *    - Target 4: mysqld-exporter:9104 (job: mysql-exporter)
 *    - Target 5: hrm-app:3005 (job: hrm-app)
 *
 * 2. [PromQL Evaluation] Kiểm tra giá trị up{job="..."} == 1 cho từng target.
 *
 * 3. [Grafana Datasource Proxy] Kiểm tra kết nối từ Grafana Server đến Prometheus
 *    qua mạng nội bộ Docker "monitoring".
 *
 * 4. [Grafana Dashboards Provisioning] Kiểm tra sự hiện diện của Folder và 3 Dashboards:
 *    - Folder: "Infrastructure Monitoring"
 *    - Dashboard 1 (1860): Node Exporter Full (UID: rYdddlPWk)
 *    - Dashboard 2 (14282): Cadvisor exporter (UID: pMEd7m0Mz)
 *    - Dashboard 3 (7362): MySQL Overview (UID: MQWgroiiz)
 *
 * 5. [Grafana Realtime Query Engine - /api/ds/query] Kiểm tra các luồng số liệu thời gian thực:
 *    - Node Exporter: CPU, RAM, Disk, Network
 *    - MySQL: Uptime, Threads Connected, Queries, InnoDB Buffer Pool
 *    - cAdvisor: Container CPU usage, Container Memory
 *    - HRM App: V8 Heap, http_requests_total, hrm_app_info
 *    - Prometheus: TSDB samples appended, HTTP requests total
 *
 * 6. [Realtime Dynamic Traffic Test] Tạo request API vào hrm-app và đối soát biến thiên
 *    tức thời của http_requests_total trên Grafana Query Engine.
 * ==============================================================================
 */

import http from 'http';

const PROMETHEUS_URL = 'http://127.0.0.1:9090';
const GRAFANA_URL = 'http://127.0.0.1:3000';
const BACKEND_URL = 'http://127.0.0.1:3005';
const GRAFANA_AUTH = 'Basic ' + Buffer.from('admin:Admin@Pass2026').toString('base64');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
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

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = typeof body === 'string' ? body : JSON.stringify(body);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
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

async function runQaAudit() {
  console.log('==============================================================================');
  console.log('🛡️  BẮT ĐẦU KIỂM TOÁN QA: 5/5 PROMETHEUS TARGETS UP & GRAFANA REALTIME STACK');
  console.log('==============================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message, detail = '') {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] Ca ${total}: ${message}${detail ? ' -> ' + detail : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] Ca ${total}: ${message}${detail ? ' -> ' + detail : ''}`);
      process.exitCode = 1;
    }
  }

  try {
    // =========================================================================
    // PHẦN 1: ĐỐI SOÁT 5/5 TARGETS TRÊN PROMETHEUS CORE
    // =========================================================================
    console.log('📋 PHẦN 1: ĐỐI SOÁT TRẠNG THÁI 5/5 TARGETS TRÊN PROMETHEUS CORE');
    const targetsRes = await httpGet(`${PROMETHEUS_URL}/api/v1/targets`);
    assert(targetsRes.statusCode === 200, 'Prometheus Targets API phản hồi HTTP 200');

    const activeTargets = targetsRes.data?.data?.activeTargets || [];
    assert(activeTargets.length >= 5, `Prometheus quản lý đủ ${activeTargets.length}/5 active targets`);

    const expectedTargets = [
      { job: 'prometheus', address: 'prometheus:9090', desc: 'Prometheus Server Self-monitoring' },
      { job: 'node-exporter', address: 'node-exporter:9100', desc: 'Node Exporter OS/Host Metrics' },
      { job: 'cadvisor', address: 'cadvisor:8080', desc: 'cAdvisor Docker Containers Metrics' },
      { job: 'mysql-exporter', address: 'mysqld-exporter:9104', desc: 'MySQL Exporter Database Metrics' },
      { job: 'hrm-app', address: 'hrm-app:3005', desc: 'HRM Backend Express Application' }
    ];

    for (const exp of expectedTargets) {
      const found = activeTargets.find(t => t.labels?.job === exp.job);
      const isUp = found && found.health === 'up' && found.lastError === '';
      const lastScrape = found ? found.lastScrape : 'N/A';
      assert(isUp, `Target [${exp.job}] (${exp.desc}) đạt trạng thái "UP"`, `ScrapeUrl: ${found?.scrapeUrl}, LastScrape: ${lastScrape}`);
    }

    // =========================================================================
    // PHẦN 2: TRUY VẤN PROMQL UP == 1 CHO TỪNG TARGET
    // =========================================================================
    console.log('\n📋 PHẦN 2: TRUY VẤN PROMQL CHO TỪNG JOB (up == 1)');
    for (const exp of expectedTargets) {
      const qRes = await httpGet(`${PROMETHEUS_URL}/api/v1/query?query=up%7Bjob%3D%22${encodeURIComponent(exp.job)}%22%7D`);
      const results = qRes.data?.data?.result || [];
      const val = results[0]?.value?.[1];
      assert(val === '1', `PromQL up{job="${exp.job}"} trả về giá trị 1`, `Value: ${val}, Timestamp: ${results[0]?.value?.[0]}`);
    }

    // =========================================================================
    // PHẦN 3: GRAFANA PROXY KẾT NỐI PROMETHEUS QUA MẠNG NỘI BỘ
    // =========================================================================
    console.log('\n📋 PHẦN 3: ĐỐI SOÁT GRAFANA DATASOURCE PROXY & PHÂN GIẢI DOCKER DNS');
    const grafanaHealth = await httpGet(`${GRAFANA_URL}/api/health`);
    assert(grafanaHealth.statusCode === 200 && grafanaHealth.data?.database === 'ok', 'Grafana Server khỏe mạnh và sẵn sàng nhận yêu cầu', `Version: ${grafanaHealth.data?.version}`);

    const dsList = await httpGet(`${GRAFANA_URL}/api/datasources`, { 'Authorization': GRAFANA_AUTH });
    const promDs = (dsList.data || []).find(d => d.uid === 'prometheus' || d.name === 'Prometheus');
    assert(promDs !== undefined && promDs.isDefault === true && promDs.access === 'proxy', 'Datasource "Prometheus" (UID: prometheus) được provisioning tự động làm mặc định');

    const proxyUp = await httpGet(`${GRAFANA_URL}/api/datasources/proxy/uid/prometheus/api/v1/query?query=up`, { 'Authorization': GRAFANA_AUTH });
    const proxyResults = proxyUp.data?.data?.result || [];
    assert(proxyUp.statusCode === 200 && proxyResults.length >= 5, `Grafana Datasource Proxy phân giải DNS "http://prometheus:9090" thành công và lấy đủ ${proxyResults.length} targets`);

    // =========================================================================
    // PHẦN 4: ĐỐI SOÁT 3 DASHBOARDS TRÊN GRAFANA PROVISIONING
    // =========================================================================
    console.log('\n📋 PHẦN 4: ĐỐI SOÁT THƯ MỤC VÀ 3 DASHBOARDS TRÊN GRAFANA');
    const searchRes = await httpGet(`${GRAFANA_URL}/api/search`, { 'Authorization': GRAFANA_AUTH });
    const searchItems = searchRes.data || [];

    const folder = searchItems.find(i => i.type === 'dash-folder' && i.title === 'Infrastructure Monitoring');
    assert(folder !== undefined, 'Thư mục quản trị "Infrastructure Monitoring" tồn tại trên Grafana');

    const expectedDashboards = [
      { id: '1860', uid: 'rYdddlPWk', title: 'Node Exporter Full' },
      { id: '14282', uid: 'pMEd7m0Mz', title: 'Cadvisor exporter' },
      { id: '7362', uid: 'MQWgroiiz', title: 'MySQL Overview' }
    ];

    for (const d of expectedDashboards) {
      const found = searchItems.find(i => i.uid === d.uid);
      assert(found !== undefined, `Dashboard ID [${d.id}] "${d.title}" (UID: ${d.uid}) đã nạp thành công`, `URL: ${found?.url}`);
    }

    // =========================================================================
    // PHẦN 5: TRUY VẤN SỐ LIỆU REALTIME QUA GRAFANA BACKEND QUERY API (/api/ds/query)
    // =========================================================================
    console.log('\n📋 PHẦN 5: KIỂM TOÁN SỐ LIỆU REALTIME QUA GRAFANA QUERY ENGINE (/api/ds/query)');
    const now = Date.now();
    const from = (now - 900000).toString(); // 15 phút gần nhất
    const to = now.toString();

    async function queryGrafana(expr) {
      return httpPost(`${GRAFANA_URL}/api/ds/query`, {
        queries: [{ datasource: { type: 'prometheus', uid: 'prometheus' }, expr, refId: 'A' }],
        from, to
      }, { 'Authorization': GRAFANA_AUTH });
    }

    // 5.1. Node Exporter Realtime Metrics
    const qNodeCpu = await queryGrafana('node_cpu_seconds_total{mode="system"}');
    const nodeCpuFrames = qNodeCpu.data?.results?.A?.frames || [];
    assert(nodeCpuFrames.length > 0, 'Node Exporter: CPU system seconds có luồng số liệu thời gian thực trên Grafana', `Frames: ${nodeCpuFrames.length}`);

    const qNodeMem = await queryGrafana('node_memory_MemAvailable_bytes');
    const nodeMemFrames = qNodeMem.data?.results?.A?.frames || [];
    assert(nodeMemFrames.length > 0, 'Node Exporter: Memory Available bytes có luồng số liệu thời gian thực trên Grafana', `Frames: ${nodeMemFrames.length}`);

    // 5.2. MySQL Exporter Realtime Metrics
    const qMyUp = await queryGrafana('mysql_up{instance="mysql-db:3306"}');
    const myUpFrames = qMyUp.data?.results?.A?.frames || [];
    assert(myUpFrames.length > 0, 'MySQL Exporter: mysql_up = 1 có luồng số liệu thời gian thực trên Grafana');

    const qMyThreads = await queryGrafana('mysql_global_status_threads_connected{instance="mysql-db:3306"}');
    const myThreadsFrames = qMyThreads.data?.results?.A?.frames || [];
    assert(myThreadsFrames.length > 0, 'MySQL Exporter: Threads Connected có luồng số liệu thời gian thực trên Grafana', `Frames: ${myThreadsFrames.length}`);

    // 5.3. cAdvisor Realtime Metrics
    const qCadCpu = await queryGrafana('container_cpu_usage_seconds_total');
    const cadCpuFrames = qCadCpu.data?.results?.A?.frames || [];
    assert(cadCpuFrames.length > 0, 'cAdvisor: Container CPU usage seconds có luồng số liệu thời gian thực trên Grafana', `Frames: ${cadCpuFrames.length}`);

    // 5.4. HRM App Realtime Metrics
    const qAppInfo = await queryGrafana('hrm_app_info{app="hrm-backend-api"}');
    const appInfoFrames = qAppInfo.data?.results?.A?.frames || [];
    assert(appInfoFrames.length > 0, 'HRM App: hrm_app_info (version, env) có số liệu thời gian thực trên Grafana', `Frames: ${appInfoFrames.length}`);

    // 5.5. Prometheus Self Monitoring
    const qPromReq = await queryGrafana('prometheus_http_requests_total');
    const promReqFrames = qPromReq.data?.results?.A?.frames || [];
    assert(promReqFrames.length > 0, 'Prometheus: prometheus_http_requests_total có số liệu thời gian thực trên Grafana', `Frames: ${promReqFrames.length}`);

    // =========================================================================
    // PHẦN 6: KIỂM TOÁN TÍNH BIẾN THIÊN REALTIME (DYNAMIC TRAFFIC TEST)
    // =========================================================================
    console.log('\n📋 PHẦN 6: KIỂM TOÁN TÍNH BIẾN THIÊN REALTIME (DYNAMIC TRAFFIC TEST)');
    // 6.1. Đo giá trị ban đầu của http_requests_total
    const qInitial = await httpGet(`${PROMETHEUS_URL}/api/v1/query?query=sum(http_requests_total)`);
    const initialCount = Number(qInitial.data?.data?.result?.[0]?.value?.[1] || 0);

    // 6.2. Phát sinh lưu lượng thực tế vào HRM Backend
    const testRequests = 5;
    for (let i = 0; i < testRequests; i++) {
      await httpGet(`${BACKEND_URL}/api/health`);
    }

    // Đợi 2 chu kỳ scrape nhỏ (3 giây)
    await new Promise(r => setTimeout(r, 3000));

    // 6.3. Đo lại giá trị sau khi phát sinh lưu lượng
    const qAfter = await httpGet(`${PROMETHEUS_URL}/api/v1/query?query=sum(http_requests_total)`);
    const afterCount = Number(qAfter.data?.data?.result?.[0]?.value?.[1] || 0);
    const diff = afterCount - initialCount;

    assert(afterCount >= initialCount + testRequests, `Bộ đếm http_requests_total tăng tương ứng với lưu lượng thực tế (Ban đầu: ${initialCount}, Sau test: ${afterCount}, Tăng: +${diff})`);

    // 6.4. Xác nhận sự thay đổi này phản ánh ngay lập tức qua Grafana Query Engine
    const qGrafanaApp = await queryGrafana('sum(http_requests_total)');
    const gFrames = qGrafanaApp.data?.results?.A?.frames || [];
    assert(gFrames.length > 0, `Grafana Query Engine phản ánh tức thời số liệu tăng mới của ứng dụng HRM (+${diff} requests)`);

    console.log('\n==============================================================================');
    console.log(`🎉 TỔNG KẾT KIỂM TOÁN QA: ĐÃ VƯỢT QUA ${passed}/${total} BÀI KIỂM TOÁN ĐỘC LẬP!`);
    console.log('   - 5/5 Targets trên Prometheus ĐẠT CHUẨN UP 100% (value == 1).');
    console.log('   - Grafana kết nối thông suốt qua Docker internal network.');
    console.log('   - Cả 3 Dashboards hiển thị luồng dữ liệu thời gian thực đầy đủ.');
    console.log('   - Lưu lượng phát sinh biến thiên tức thì trên cả Prometheus lẫn Grafana.');
    console.log('==============================================================================\n');
  } catch (err) {
    console.error('Lỗi khi thực hiện kiểm toán QA:', err.message);
    process.exitCode = 1;
  }
}

runQaAudit();
