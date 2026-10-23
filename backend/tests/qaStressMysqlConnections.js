import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3309', 10),
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD || 'AppUser@Pass2026',
  database: process.env.DB_NAME || 'hrm_db'
};

const TARGET_CONNECTIONS = 85;
const DURATION_SECONDS = 150; // 2.5 minutes (to exceed for: 2m threshold)

async function runStressTest() {
  console.log(`[QA Stress Test] Starting MySQL connection surge test...`);
  console.log(`[QA Stress Test] Connecting to ${DB_CONFIG.host}:${DB_CONFIG.port} with user '${DB_CONFIG.user}'`);
  console.log(`[QA Stress Test] Target: ${TARGET_CONNECTIONS} active connections to exceed threshold (> 80)`);

  const connections = [];

  try {
    for (let i = 1; i <= TARGET_CONNECTIONS; i++) {
      const conn = await mysql.createConnection(DB_CONFIG);
      connections.push(conn);
      if (i % 20 === 0 || i === TARGET_CONNECTIONS) {
        console.log(`[QA Stress Test] Opened ${i}/${TARGET_CONNECTIONS} connections...`);
      }
    }

    console.log(`[QA Stress Test] Successfully established ${connections.length} active connections!`);
    console.log(`[QA Stress Test] Holding connections for ${DURATION_SECONDS}s to trigger Prometheus 'for: 2m' rule...`);

    const startTime = Date.now();
    const interval = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[QA Stress Test] Elapsed: ${elapsed}s / ${DURATION_SECONDS}s - Connections maintained: ${connections.length}`);
      
      for (const conn of connections) {
        try {
          await conn.query('SELECT 1');
        } catch (_) {}
      }
    }, 15000);

    await new Promise(resolve => setTimeout(resolve, DURATION_SECONDS * 1000));
    clearInterval(interval);

    console.log(`[QA Stress Test] Holding duration finished. Gracefully closing all ${connections.length} connections...`);
  } catch (err) {
    console.error(`[QA Stress Test] Error during connection stress:`, err.message);
  } finally {
    for (const conn of connections) {
      try {
        await conn.end();
      } catch (_) {}
    }
    console.log(`[QA Stress Test] All connections closed. System returning to normal.`);
  }
}

runStressTest();
