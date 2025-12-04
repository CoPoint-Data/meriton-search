import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { UserRole } from '@/lib/types';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  opCoId: string | null;
  opCoCode: string | null;
  vendorId: string | null;
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { opCo: true },
  });

  if (!user || !user.active) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

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
 * Create session for authenticated user
 */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Validate session token and return user
 */
export async function validateSession(token: string): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
  });

  if (!session || session.expiresAt < new Date()) {
    // Clean up expired session
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { opCo: true },
  });

  if (!user || !user.active) {
    return null;
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
 * Delete session (logout)
 */
export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({
    where: { token },
  }).catch(() => {
    // Ignore if session doesn't exist
  });
}

/**
 * Generate random token
 */
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Map Prisma Role enum to legacy role string
 */
export function roleToString(role: Role): UserRole {
  const mapping: Record<Role, UserRole> = {
    ADMIN: 'admin',
    FINANCE_MANAGER: 'finance_manager',
    EMPLOYEE: 'employee',
    VENDOR_PORTAL: 'vendor_portal',
  };
  return mapping[role];
}

/**
 * Get allowed OpCo codes for a user
 * Admin sees all, others see only their OpCo
 */
export function getAllowedOpCoCodes(user: AuthUser): string[] | null {
  if (user.role === 'ADMIN') {
    return null; // null means all OpCos
  }
  return user.opCoCode ? [user.opCoCode] : [];
}

/**
 * Clean up expired sessions (run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
  return result.count;
}
