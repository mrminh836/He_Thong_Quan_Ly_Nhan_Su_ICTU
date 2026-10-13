/**
 * CLI Utility: Sinh chuỗi băm mật khẩu Bcrypt an toàn
 * Sử dụng: node src/scripts/hashGenerator.js [password] [saltRounds]
 * Ví dụ:   node src/scripts/hashGenerator.js "Admin@Pass2026" 10
 */

import { hashPassword } from '../utils/password.js';

const passwordInput = process.argv[2] || 'Admin@Pass2026';
const saltRoundsInput = Number(process.argv[3]) || 10;

async function run() {
  console.log('--- CÔNG CỤ SINH BCRYPT HASH AN TOÀN (HRM ICTU) ---');
  console.log(`- Mật khẩu đầu vào: "${passwordInput}"`);
  console.log(`- Salt Rounds:      ${saltRoundsInput}`);

  const start = Date.now();
  const hash = await hashPassword(passwordInput, saltRoundsInput);
  const duration = Date.now() - start;

  console.log(`- Thời gian băm:    ${duration}ms`);
  console.log(`- Chuỗi Bcrypt Hash:`);
  console.log(`  ${hash}`);
  console.log('----------------------------------------------------');
  console.log('👉 Bạn có thể dùng chuỗi này trong câu lệnh INSERT/UPDATE SQL:');
  console.log(`   UPDATE users SET password_hash = '${hash}' WHERE username = 'admin';\n`);
}

run().catch((err) => {
  console.error('Lỗi khi băm mật khẩu:', err.message);
  process.exit(1);
});
