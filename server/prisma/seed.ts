import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://admin:admin_password@localhost:5432/data_gov_ua?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@example.com' },
  });

  if (existingAdmin) {
    console.log('Admin user already exists, skipping...');
    return;
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash('admin', 10);

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      first_name: 'Admin',
      last_name: 'User',
      provider: 'local',
      role: 'admin',
      is_active: true,
    },
  });

  console.log(`✓ Created admin user: ${adminUser.email}`);
  console.log('  Email: admin');
  console.log('  Password: admin');
  console.log('  Role: admin');
}

main()
  .catch((e) => {
    console.error('Error creating admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
