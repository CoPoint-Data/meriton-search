import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create OpCos
  console.log('Creating OpCos...');
  const opco1 = await prisma.opCo.upsert({
    where: { code: 'opco_001' },
    update: {},
    create: {
      code: 'opco_001',
      name: 'HVAC Services Inc',
      description: 'Premier HVAC installation and maintenance in the Northeast',
    },
  });

  const opco2 = await prisma.opCo.upsert({
    where: { code: 'opco_002' },
    update: {},
    create: {
      code: 'opco_002',
      name: 'Cool Air Systems',
      description: 'Commercial refrigeration and climate control specialists',
    },
  });

  const opco3 = await prisma.opCo.upsert({
    where: { code: 'opco_003' },
    update: {},
    create: {
      code: 'opco_003',
      name: 'Climate Control Pro',
      description: 'Residential and light commercial HVAC services',
    },
  });

  console.log(`✅ Created 3 OpCos\n`);

  // Hash password (same for all test users: "password123")
  const passwordHash = await bcrypt.hash('password123', 10);

  // Create Users
  console.log('Creating users...');

  // Admin user (cross-OpCo access)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@opco-platform.com' },
    update: {},
    create: {
      email: 'admin@opco-platform.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: Role.ADMIN,
      opCoId: null, // Admin has no OpCo restriction
    },
  });
  console.log(`  👤 ${admin.email} (${admin.role})`);

  // Finance Manager - OpCo 1
  const fm1 = await prisma.user.upsert({
    where: { email: 'finance@hvacservices.com' },
    update: {},
    create: {
      email: 'finance@hvacservices.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: Role.FINANCE_MANAGER,
      opCoId: opco1.id,
    },
  });
  console.log(`  👤 ${fm1.email} (${fm1.role}) - ${opco1.name}`);

  // Finance Manager - OpCo 2
  const fm2 = await prisma.user.upsert({
    where: { email: 'finance@coolair.com' },
    update: {},
    create: {
      email: 'finance@coolair.com',
      passwordHash,
      firstName: 'Michael',
      lastName: 'Chen',
      role: Role.FINANCE_MANAGER,
      opCoId: opco2.id,
    },
  });
  console.log(`  👤 ${fm2.email} (${fm2.role}) - ${opco2.name}`);

  // Employee - OpCo 1
  const emp1 = await prisma.user.upsert({
    where: { email: 'tech@hvacservices.com' },
    update: {},
    create: {
      email: 'tech@hvacservices.com',
      passwordHash,
      firstName: 'James',
      lastName: 'Rodriguez',
      role: Role.EMPLOYEE,
      opCoId: opco1.id,
    },
  });
  console.log(`  👤 ${emp1.email} (${emp1.role}) - ${opco1.name}`);

  // Employee - OpCo 2
  const emp2 = await prisma.user.upsert({
    where: { email: 'manager@coolair.com' },
    update: {},
    create: {
      email: 'manager@coolair.com',
      passwordHash,
      firstName: 'Emily',
      lastName: 'Davis',
      role: Role.EMPLOYEE,
      opCoId: opco2.id,
    },
  });
  console.log(`  👤 ${emp2.email} (${emp2.role}) - ${opco2.name}`);

  // Employee - OpCo 3
  const emp3 = await prisma.user.upsert({
    where: { email: 'service@climatepro.com' },
    update: {},
    create: {
      email: 'service@climatepro.com',
      passwordHash,
      firstName: 'David',
      lastName: 'Martinez',
      role: Role.EMPLOYEE,
      opCoId: opco3.id,
    },
  });
  console.log(`  👤 ${emp3.email} (${emp3.role}) - ${opco3.name}`);

  // Vendor Portal User
  const vendor = await prisma.user.upsert({
    where: { email: 'portal@hvacsupply.com' },
    update: {},
    create: {
      email: 'portal@hvacsupply.com',
      passwordHash,
      firstName: 'Vendor',
      lastName: 'Portal',
      role: Role.VENDOR_PORTAL,
      opCoId: opco1.id,
      vendorId: 'vnd_101', // HVAC Supply Co
    },
  });
  console.log(`  👤 ${vendor.email} (${vendor.role}) - Vendor: vnd_101`);

  console.log(`\n✅ Created 7 test users\n`);

  console.log('📝 Test Credentials:');
  console.log('  Email: Any of the above');
  console.log('  Password: password123\n');

  console.log('🎯 Sample Logins:');
  console.log('  Admin:           admin@opco-platform.com');
  console.log('  Finance Manager: finance@hvacservices.com');
  console.log('  Employee:        tech@hvacservices.com');
  console.log('  Vendor:          portal@hvacsupply.com\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
