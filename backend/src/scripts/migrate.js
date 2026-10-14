import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn tới thư mục database/migrations
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

/**
 * Tạo kết nối MySQL có bật `multipleStatements` để thực thi file script SQL
 */
async function createMigrationConnection() {
  return await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    multipleStatements: true,
    timezone: '+07:00',
    charset: 'utf8mb4',
  });
}

/**
 * Đảm bảo bảng lưu lịch sử migration tồn tại
 */
async function ensureMigrationsTable(conn) {
  const sql = `
    CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`migration_name\` VARCHAR(255) NOT NULL UNIQUE,
      \`batch\` INT NOT NULL,
      \`executed_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  await conn.query(sql);
}

/**
 * Lấy số batch kế tiếp
 */
async function getNextBatchNumber(conn) {
  const [rows] = await conn.query('SELECT MAX(`batch`) as max_batch FROM `schema_migrations`');
  return (rows[0]?.max_batch || 0) + 1;
}

/**
 * Chạy các migration mới chưa áp dụng (UP)
 */
export async function runMigrationsUp() {
  console.log('[Migrate] Đang kiểm tra thư mục migrations:', MIGRATIONS_DIR);

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn('[Migrate] Thư mục migrations không tồn tại. Bỏ qua.');
    return;
  }

  const allFiles = fs.readdirSync(MIGRATIONS_DIR);
  const upFiles = allFiles
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
    .sort();

  if (upFiles.length === 0) {
    console.log('[Migrate] Không tìm thấy tệp migration (.sql) nào.');
    return;
  }

  let conn;
  try {
    conn = await createMigrationConnection();
    await ensureMigrationsTable(conn);

    const [appliedRows] = await conn.query('SELECT `migration_name` FROM `schema_migrations`');
    const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

    const pendingFiles = upFiles.filter((f) => !appliedSet.has(f));

    if (pendingFiles.length === 0) {
      console.log('✅ [Migrate] Cơ sở dữ liệu đã ở trạng thái mới nhất. Không có migration tồn đọng.');
      return;
    }

    const nextBatch = await getNextBatchNumber(conn);
    console.log(`[Migrate] Bắt đầu thực thi Batch ${nextBatch} (${pendingFiles.length} file)...`);

    for (const file of pendingFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      console.log(`  ⏳ Đang chạy migration: ${file}...`);
      await conn.query(sqlContent);
      await conn.query(
        'INSERT INTO `schema_migrations` (`migration_name`, `batch`) VALUES (?, ?)',
        [file, nextBatch]
      );
      console.log(`  ✅ Hoàn tất migration: ${file}`);
    }

    console.log(`\n🎉 [Migrate] Chạy migration thành công! Tổng cộng: ${pendingFiles.length} file.`);
  } catch (error) {
    console.error(`❌ [Migrate Error]: ${error.message}`);
    throw error;
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * Hoàn tác batch migration gần nhất (ROLLBACK)
 */
export async function runMigrationsRollback() {
  console.log('[Migrate Rollback] Đang chuẩn bị hoàn tác batch gần nhất...');

  let conn;
  try {
    conn = await createMigrationConnection();
    await ensureMigrationsTable(conn);

    const [latestBatchRows] = await conn.query(
      'SELECT MAX(`batch`) as max_batch FROM `schema_migrations`'
    );
    const latestBatch = latestBatchRows[0]?.max_batch;

    if (!latestBatch || latestBatch === 0) {
      console.log('ℹ️ [Migrate Rollback] Chưa có migration nào được áp dụng để hoàn tác.');
      return;
    }

    const [rows] = await conn.query(
      'SELECT `migration_name` FROM `schema_migrations` WHERE `batch` = ? ORDER BY `id` DESC',
      [latestBatch]
    );

    console.log(`[Migrate Rollback] Đang hoàn tác Batch ${latestBatch} (${rows.length} file)...`);

    for (const record of rows) {
      const originalFile = record.migration_name;
      const baseName = originalFile.replace(/\.sql$/, '');
      const rollbackFile = `${baseName}_rollback.sql`;
      const rollbackPath = path.join(MIGRATIONS_DIR, rollbackFile);

      if (fs.existsSync(rollbackPath)) {
        console.log(`  ⏳ Đang thực thi kịch bản hoàn tác: ${rollbackFile}...`);
        const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
        await conn.query(rollbackSql);
        console.log(`  ✅ Đã thực thi xong rollback: ${rollbackFile}`);
      } else {
        console.warn(`  ⚠️ Cảnh báo: Không tìm thấy file rollback tương ứng (${rollbackFile}). Bỏ qua bước SQL hoàn tác.`);
      }

      await conn.query('DELETE FROM `schema_migrations` WHERE `migration_name` = ?', [originalFile]);
    }

    console.log(`\n🎉 [Migrate Rollback] Đã hoàn tác thành công Batch ${latestBatch}.`);
  } catch (error) {
    console.error(`❌ [Migrate Rollback Error]: ${error.message}`);
    throw error;
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * Hiển thị trạng thái các migrations
 */
export async function showMigrationStatus() {
  let conn;
  try {
    conn = await createMigrationConnection();
    await ensureMigrationsTable(conn);

    const [rows] = await conn.query(
      'SELECT `id`, `migration_name`, `batch`, `executed_at` FROM `schema_migrations` ORDER BY `id` ASC'
    );

    console.log('\n============================================================');
    console.log('📋 LỊCH SỬ MIGRATION CƠ SỞ DỮ LIỆU (schema_migrations)');
    console.log('============================================================');
    if (rows.length === 0) {
      console.log('Chưa có migration nào được ghi nhận.');
    } else {
      console.table(rows);
    }
  } catch (error) {
    console.error(`❌ [Migrate Status Error]: ${error.message}`);
  } finally {
    if (conn) await conn.end();
  }
}

// Xử lý CLI invocation
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  const action = process.argv[2] || 'up';
  if (action === 'rollback' || action === 'down') {
    runMigrationsRollback().catch(() => process.exit(1));
  } else if (action === 'status') {
    showMigrationStatus().catch(() => process.exit(1));
  } else {
    runMigrationsUp().catch(() => process.exit(1));
  }
}

export default {
  runMigrationsUp,
  runMigrationsRollback,
  showMigrationStatus,
};
