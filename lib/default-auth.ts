import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth';

/**
 * Get or create a default demo user for simplified POC authentication
 */
export async function getOrCreateDefaultUser() {
  const defaultEmail = process.env.DEFAULT_USER_EMAIL || 'demo@opco.com';

  // Check if default user exists
  let user = await prisma.user.findUnique({
    where: { email: defaultEmail },
    include: { opCo: true },
  });

  // Update existing user to ADMIN if needed (for demo purposes)
  if (user && user.role !== 'ADMIN') {
    user = await prisma.user.update({
      where: { email: defaultEmail },
      data: { role: 'ADMIN' },
      include: { opCo: true },
    });
  }

  // Create default user if doesn't exist
  if (!user) {
    // Get or create default OpCo
    let opCo = await prisma.opCo.findUnique({
      where: { code: 'OPCO001' },
    });

    if (!opCo) {
      opCo = await prisma.opCo.create({
        data: {
          code: 'OPCO001',
          name: 'Demo OpCo',
          description: 'Default demo operating company',
        },
      });
    }

    // Create default user (ADMIN for full demo access to all data)
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('password123', 10);

    user = await prisma.user.create({
      data: {
        email: defaultEmail,
        passwordHash,
        firstName: 'Demo',
        lastName: 'User',
        role: 'ADMIN',
        opCoId: opCo.id,
      },
      include: { opCo: true },
    });
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    opCoId: user.opCoId,
    opCoCode: user.opCo?.code ?? null,
    vendorId: user.vendorId,
  };
}

/**
 * Create session for default user
 */
export async function createDefaultSession() {
  const user = await getOrCreateDefaultUser();
  const token = await createSession(user.id);
  return { user, token };
}
