import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { maskCccd, computeCccdHmac } from '../utils/cccdSecurity.js';

/**
 * SCRIPT KHỞI TẠO DỮ LIỆU THỰC TẾ (REALISTIC SEED DATA)
 * Cung cấp đầy đủ dữ liệu thực tế cho hệ thống HRM ICTU:
 * - 5+ Phòng ban chuẩn doanh nghiệp (Kỹ thuật, Nhân sự, Kinh doanh, Kế toán, CSKH...)
 * - 15+ Hồ sơ nhân sự đầy đủ chức danh, mức lương, số CCCD chuẩn mã hóa AES-256 + HMAC-SHA-256
 * - Tài khoản người dùng phân quyền Admin, HR, Employee
 * - Hơn 200 bản ghi chấm công thực tế xuyên suốt tháng 10/2026 (Mon-Fri) cho các mốc "Hôm nay", "7 ngày qua", "Tháng này"
 * 
 * Đảm bảo tính Idempotent: Có thể chạy nhiều lần mà không bị lỗi Duplicate Key.
 */

const WORKDAYS_OCT_2026 = [
  '2026-10-01', '2026-10-02',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
  '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'
];

const DEPARTMENTS = [
  {
    code: 'PB-TECH',
    name: 'Phòng Kỹ thuật & Công nghệ',
    location: 'Tầng 4 - Tòa nhà A',
    phone: '0208-3846-001',
    description: 'Nghiên cứu, phát triển ứng dụng và vận hành hạ tầng công nghệ thông tin',
  },
  {
    code: 'PB-HR',
    name: 'Phòng Nhân sự & Hành chính',
    location: 'Tầng 3 - Tòa nhà A',
    phone: '0208-3846-002',
    description: 'Quản lý tuyển dụng, hồ sơ nhân sự, tiền lương và chế độ phúc lợi nhân viên',
  },
  {
    code: 'PB-BIZ',
    name: 'Phòng Kinh doanh & Marketing',
    location: 'Tầng 2 - Tòa nhà B',
    phone: '0208-3846-003',
    description: 'Phát triển khách hàng doanh nghiệp, đối tác và tiếp thị thương hiệu',
  },
  {
    code: 'PB-FIN',
    name: 'Phòng Tài chính & Kế toán',
    location: 'Tầng 3 - Tòa nhà A',
    phone: '0208-3846-004',
    description: 'Quản lý tài chính doanh nghiệp, kế toán thu chi và kiểm toán nội bộ',
  },
  {
    code: 'PB-OPS',
    name: 'Phòng Vận hành & Dịch vụ Khách hàng',
    location: 'Tầng 2 - Tòa nhà B',
    phone: '0208-3846-005',
    description: 'Vận hành quy trình dịch vụ, chăm sóc khách hàng và hỗ trợ đối tác',
  },
];

const EMPLOYEES = [
  // PB-TECH
  {
    code: 'NV001',
    fullName: 'Đỗ Quang Minh',
    email: 'minh.dq@hrm.local',
    phone: '0987654321',
    gender: 'Male',
    dob: '2004-05-15',
    cccd: '038204001234',
    deptCode: 'PB-TECH',
    position: 'Trưởng phòng Kỹ thuật',
    salary: 25000000,
    hireDate: '2025-01-10',
  },
  {
    code: 'NV003',
    fullName: 'Trần Văn Nam',
    email: 'nam.tv@hrm.local',
    phone: '0965432109',
    gender: 'Male',
    dob: '2003-11-10',
    cccd: '038203009012',
    deptCode: 'PB-TECH',
    position: 'Kỹ sư Phần mềm Senior',
    salary: 18000000,
    hireDate: '2025-03-15',
  },
  {
    code: 'NV005',
    fullName: 'Phạm Quốc Hưng',
    email: 'hung.pq@hrm.local',
    phone: '0943210987',
    gender: 'Male',
    dob: '2002-09-05',
    cccd: '038202007890',
    deptCode: 'PB-TECH',
    position: 'DevOps Engineer',
    salary: 20000000,
    hireDate: '2025-05-10',
  },
  {
    code: 'NV015',
    fullName: 'Vũ Hoàng Long',
    email: 'long.vh@hrm.local',
    phone: '0981234501',
    gender: 'Male',
    dob: '2001-04-12',
    cccd: '038201001111',
    deptCode: 'PB-TECH',
    position: 'Kỹ sư Frontend Vue/React',
    salary: 21000000,
    hireDate: '2025-06-01',
  },
  {
    code: 'NV016',
    fullName: 'Hoàng Văn Thái',
    email: 'thai.hv@hrm.local',
    phone: '0981234502',
    gender: 'Male',
    dob: '2002-07-25',
    cccd: '038202002222',
    deptCode: 'PB-TECH',
    position: 'Kỹ sư Backend Node.js',
    salary: 19500000,
    hireDate: '2025-07-15',
  },

  // PB-HR
  {
    code: 'NV002',
    fullName: 'Nguyễn Thị Thu Hà',
    email: 'ha.ntt@hrm.local',
    phone: '0976543210',
    gender: 'Female',
    dob: '2004-08-20',
    cccd: '038304005678',
    deptCode: 'PB-HR',
    position: 'Trưởng phòng Nhân sự',
    salary: 22000000,
    hireDate: '2025-02-01',
  },
  {
    code: 'NV020',
    fullName: 'Hoàng Minh Anh',
    email: 'anh.hm@hrm.local',
    phone: '0981234503',
    gender: 'Female',
    dob: '2003-09-18',
    cccd: '038303003333',
    deptCode: 'PB-HR',
    position: 'Chuyên viên Tuyển dụng',
    salary: 16000000,
    hireDate: '2025-03-01',
  },
  {
    code: 'NV021',
    fullName: 'Trần Bảo Ngọc',
    email: 'ngoc.tb@hrm.local',
    phone: '0981234504',
    gender: 'Female',
    dob: '2002-12-05',
    cccd: '038302004444',
    deptCode: 'PB-HR',
    position: 'Chuyên viên Tiền lương & Phúc lợi C&B',
    salary: 17500000,
    hireDate: '2025-04-10',
  },
  {
    code: 'NV022',
    fullName: 'Đặng Văn Tuấn',
    email: 'tuan.dv@hrm.local',
    phone: '0981234505',
    gender: 'Male',
    dob: '2000-03-22',
    cccd: '038200005555',
    deptCode: 'PB-HR',
    position: 'Chuyên viên Hành chính Quản trị',
    salary: 14000000,
    hireDate: '2025-05-20',
  },

  // PB-BIZ
  {
    code: 'NV004',
    fullName: 'Lê Thị Mai',
    email: 'mai.lt@hrm.local',
    phone: '0954321098',
    gender: 'Female',
    dob: '2004-02-28',
    cccd: '038304003456',
    deptCode: 'PB-BIZ',
    position: 'Chuyên viên Kinh doanh',
    salary: 15000000,
    hireDate: '2025-04-01',
  },
  {
    code: 'NV023',
    fullName: 'Vũ Đức Trọng',
    email: 'trong.vd@hrm.local',
    phone: '0981234506',
    gender: 'Male',
    dob: '1999-11-14',
    cccd: '038299006666',
    deptCode: 'PB-BIZ',
    position: 'Trưởng nhóm Kinh doanh B2B',
    salary: 23000000,
    hireDate: '2025-02-15',
  },
  {
    code: 'NV024',
    fullName: 'Bùi Phương Thảo',
    email: 'thao.bp@hrm.local',
    phone: '0981234507',
    gender: 'Female',
    dob: '2004-06-30',
    cccd: '038304007777',
    deptCode: 'PB-BIZ',
    position: 'Chuyên viên Digital Marketing',
    salary: 15500000,
    hireDate: '2025-06-01',
  },
  {
    code: 'NV025',
    fullName: 'Ngô Quốc Anh',
    email: 'anh.nq@hrm.local',
    phone: '0981234508',
    gender: 'Male',
    dob: '2001-08-08',
    cccd: '038201008888',
    deptCode: 'PB-BIZ',
    position: 'Chuyên viên Phát triển Thị trường',
    salary: 16500000,
    hireDate: '2025-08-01',
  },

  // PB-FIN
  {
    code: 'NV026',
    fullName: 'Phan Thanh Hương',
    email: 'huong.pt@hrm.local',
    phone: '0981234509',
    gender: 'Female',
    dob: '1998-05-19',
    cccd: '038398009999',
    deptCode: 'PB-FIN',
    position: 'Kế toán trưởng',
    salary: 26000000,
    hireDate: '2025-01-15',
  },
  {
    code: 'NV027',
    fullName: 'Nguyễn Đức Dũng',
    email: 'dung.nd@hrm.local',
    phone: '0981234510',
    gender: 'Male',
    dob: '2003-10-10',
    cccd: '038203001010',
    deptCode: 'PB-FIN',
    position: 'Chuyên viên Kế toán Nội bộ',
    salary: 15000000,
    hireDate: '2025-05-01',
  },

  // PB-OPS
  {
    code: 'NV028',
    fullName: 'Lê Hoàng Yến',
    email: 'yen.lh@hrm.local',
    phone: '0981234511',
    gender: 'Female',
    dob: '2002-02-14',
    cccd: '038302001112',
    deptCode: 'PB-OPS',
    position: 'Trưởng nhóm Chăm sóc Khách hàng',
    salary: 18000000,
    hireDate: '2025-03-15',
  },
  {
    code: 'NV029',
    fullName: 'Đinh Trọng Nghĩa',
    email: 'nghia.dt@hrm.local',
    phone: '0981234512',
    gender: 'Male',
    dob: '2004-01-20',
    cccd: '038204001213',
    deptCode: 'PB-OPS',
    position: 'Chuyên viên Hỗ trợ Khách hàng',
    salary: 13500000,
    hireDate: '2025-07-01',
  },

  // Phong test (PB-PT) nếu có
  {
    code: 'NV030',
    fullName: 'Lương Thu Trang',
    email: 'trang.lt@hrm.local',
    phone: '0981234513',
    gender: 'Female',
    dob: '2003-04-05',
    cccd: '038303001314',
    deptCode: 'PB-PT',
    position: 'QA Lead - Trưởng nhóm Kiểm thử',
    salary: 20000000,
    hireDate: '2025-04-01',
  },
  {
    code: 'NV031',
    fullName: 'Dương Văn Kiên',
    email: 'kien.dv@hrm.local',
    phone: '0981234514',
    gender: 'Male',
    dob: '2001-09-09',
    cccd: '038201001415',
    deptCode: 'PB-PT',
    position: 'Automation Test Engineer',
    salary: 17000000,
    hireDate: '2025-06-15',
  },
];

const USER_ACCOUNTS = [
  // emp2: Vũ Đức Trọng (Trưởng nhóm Kinh doanh B2B)
  {
    empCode: 'NV023',
    username: 'emp2',
    // Emp@123
    passwordHash: '$2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK',
    role: 'Employee',
  },
  // hr1: Hoàng Minh Anh (Chuyên viên Tuyển dụng)
  {
    empCode: 'NV020',
    username: 'hr1',
    // Hr@123
    passwordHash: '$2a$10$hUIaNEqV6dwvmXrkCr.tke78dm3D0nbURY4OL/SoAu7tOvH1Z3NNa',
    role: 'HR',
  },
  // emp3: Phan Thanh Hương (Kế toán trưởng)
  {
    empCode: 'NV026',
    username: 'emp3',
    // Emp@123
    passwordHash: '$2a$10$ECSFWXymvV6Wealo/RtjQ.46s1LymeY2XrEqx6aVn5R2EysV885CK',
    role: 'Employee',
  },
];

async function seed() {
  console.log('=== BẮT ĐẦU KHỞI TẠO DỮ LIỆU THỰC TẾ CHO HRM ICTU ===');

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    timezone: '+07:00',
    charset: 'utf8mb4',
  });

  try {
    // 1. Thêm hoặc cập nhật Phòng ban
    console.log('[1/4] Khởi tạo các Phòng ban doanh nghiệp...');
    for (const d of DEPARTMENTS) {
      await connection.query(
        `INSERT INTO \`departments\` (\`department_code\`, \`department_name\`, \`location\`, \`phone\`, \`description\`, \`is_active\`)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE 
           \`department_name\` = VALUES(\`department_name\`),
           \`location\` = VALUES(\`location\`),
           \`phone\` = VALUES(\`phone\`),
           \`is_active\` = 1`,
        [d.code, d.name, d.location, d.phone, d.description]
      );
    }

    // Lấy mapping department_code -> department_id
    const [deptRows] = await connection.query('SELECT department_id, department_code FROM `departments`');
    const deptMap = {};
    deptRows.forEach((r) => {
      deptMap[r.department_code] = r.department_id;
    });

    // 2. Thêm hoặc cập nhật Nhân sự
    console.log('[2/4] Khởi tạo hồ sơ nhân sự thực tế...');
    for (const emp of EMPLOYEES) {
      const deptId = deptMap[emp.deptCode];
      if (!deptId) continue;

      const maskedCccd = maskCccd(emp.cccd);
      const ssnHash = computeCccdHmac(emp.cccd, env.cccdHmacSecret);

      await connection.query(
        `INSERT INTO \`employees\` (
           \`employee_code\`, \`full_name\`, \`email\`, \`phone\`, \`gender\`,
           \`date_of_birth\`, \`ssn_encrypted\`, \`ssn_masked\`, \`ssn_hash\`,
           \`department_id\`, \`position\`, \`base_salary\`, \`hire_date\`, \`employment_status\`
         ) VALUES (
           ?, ?, ?, ?, ?,
           ?, AES_ENCRYPT(?, ?), ?, ?,
           ?, ?, ?, ?, 'Active'
         )
         ON DUPLICATE KEY UPDATE
           \`full_name\` = VALUES(\`full_name\`),
           \`email\` = VALUES(\`email\`),
           \`phone\` = VALUES(\`phone\`),
           \`gender\` = VALUES(\`gender\`),
           \`date_of_birth\` = VALUES(\`date_of_birth\`),
           \`department_id\` = VALUES(\`department_id\`),
           \`position\` = VALUES(\`position\`),
           \`base_salary\` = VALUES(\`base_salary\`),
           \`employment_status\` = 'Active'`,
        [
          emp.code, emp.fullName, emp.email, emp.phone, emp.gender,
          emp.dob, emp.cccd, env.cccdEncryptionKey, maskedCccd, ssnHash,
          deptId, emp.position, emp.salary, emp.hireDate,
        ]
      );
    }

    // Lấy mapping employee_code -> employee_id
    const [empRows] = await connection.query('SELECT employee_id, employee_code, department_id FROM `employees` WHERE employment_status = "Active"');
    const empMap = {};
    empRows.forEach((r) => {
      empMap[r.employee_code] = r.employee_id;
    });

    // 3. Khởi tạo tài khoản đăng nhập mẫu
    console.log('[3/4] Cập nhật tài khoản người dùng...');
    for (const u of USER_ACCOUNTS) {
      const empId = empMap[u.empCode];
      if (!empId) continue;

      await connection.query(
        `INSERT INTO \`users\` (\`employee_id\`, \`username\`, \`password_hash\`, \`role\`, \`account_status\`)
         VALUES (?, ?, ?, ?, 'Active')
         ON DUPLICATE KEY UPDATE
           \`role\` = VALUES(\`role\`),
           \`account_status\` = 'Active'`,
        [empId, u.username, u.passwordHash, u.role]
      );
    }

    // 4. Khởi tạo bản ghi chấm công thực tế cho từng ngày làm việc tháng 10/2026
    console.log('[4/4] Khởi tạo lịch sử chấm công chi tiết cho tháng 10/2026...');

    let insertedCount = 0;
    for (const date of WORKDAYS_OCT_2026) {
      const isToday = date === '2026-10-23';

      for (const emp of empRows) {
        // Tỷ lệ đi làm: 95% có mặt
        const hashSeed = (emp.employee_id * 17 + new Date(date).getDate() * 31) % 100;
        if (hashSeed > 95 && !isToday) {
          // Nghỉ phép
          continue;
        }

        // Tỷ lệ đúng giờ: 85% OnTime, 12% Late, 3% EarlyLeave
        let status = 'OnTime';
        let checkIn = '08:15:00';
        let checkOut = '17:35:00';
        let note = 'Check-in đúng giờ tiêu chuẩn';

        if (hashSeed < 12) {
          // Đi muộn
          status = 'Late';
          const lateMin = 35 + (hashSeed % 25); // 35 - 59
          checkIn = `08:${String(lateMin).padStart(2, '0')}:00`;
          checkOut = '17:45:00';
          note = 'Đi muộn do tắc đường / thời tiết';
        } else if (hashSeed < 15) {
          // Về sớm
          status = 'EarlyLeave';
          checkIn = '08:10:00';
          checkOut = '16:45:00';
          note = 'Về sớm 45 phút có xin phép quản lý';
        } else {
          // Đúng giờ
          const onTimeMin = 5 + (hashSeed % 24); // 05 - 28
          checkIn = `08:${String(onTimeMin).padStart(2, '0')}:00`;
          checkOut = '17:30:00';
        }

        // Đối với ngày hôm nay: Một số nhân sự đang làm việc (check_out để NULL)
        if (isToday) {
          if (hashSeed % 2 === 0) {
            checkOut = null; // Đang trong giờ làm việc hôm nay
          }
        }

        await connection.query(
          `INSERT INTO \`attendances\` (\`employee_id\`, \`attendance_date\`, \`check_in\`, \`check_out\`, \`attendance_status\`, \`note\`)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             \`check_in\` = VALUES(\`check_in\`),
             \`check_out\` = VALUES(\`check_out\`),
             \`attendance_status\` = VALUES(\`attendance_status\`),
             \`note\` = VALUES(\`note\`)`,
          [emp.employee_id, date, checkIn, checkOut, status, note]
        );
        insertedCount++;
      }
    }

    console.log(`=> Đã tạo/đồng bộ thành công ${insertedCount} bản ghi chấm công thực tế!`);
    console.log('=== KHỞI TẠO DỮ LIỆU THỰC TẾ HOÀN TẤT THÀNH CÔNG ===');
  } catch (err) {
    console.error('Lỗi khi khởi tạo dữ liệu:', err);
    throw err;
  } finally {
    await connection.end();
  }
}

seed().catch(() => process.exit(1));
