import { NextRequest, NextResponse } from 'next/server';
import { createDefaultSession } from '@/lib/default-auth';

/**
 * Auto-login endpoint for POC demo
 * Creates/uses default user and sets session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const { user, token } = await createDefaultSession();

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        opCoCode: user.opCoCode,
      },
    });

    // CORS headers for local development
    response.headers.set('Access-Control-Allow-Origin', 'http://localhost:4000');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    // Set session token as HTTP-only cookie
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Auto-login error:', error);
    return NextResponse.json(
      { error: 'Auto-login failed' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', 'http://localhost:4000');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
