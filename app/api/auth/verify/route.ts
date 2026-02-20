import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Use env var or fallback - the password is NEVER sent to the client
const ACCESS_PASSWORD = process.env.DASHBOARD_PASSWORD || '270738';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Secret key for signing tokens - generated at startup, rotates on redeploy
const SECRET_KEY = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

function createToken(expiresAt: number): string {
  const payload = `${expiresAt}`;
  const signature = createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifyToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const expectedSignature = createHmac('sha256', SECRET_KEY).update(payload).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    if (!timingSafeEqual(sigBuffer, expectedBuffer)) return false;
  } catch {
    return false;
  }

  const expiresAt = parseInt(payload, 10);
  if (isNaN(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;

  return true;
}

// POST: Verify password and issue session cookie
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { password } = body;

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 });
  }

  // Timing-safe password comparison
  const inputBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(ACCESS_PASSWORD);

  let isValid = false;
  if (inputBuffer.length === expectedBuffer.length) {
    isValid = timingSafeEqual(inputBuffer, expectedBuffer);
  }

  if (!isValid) {
    // Small delay to prevent brute force
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = createToken(expiresAt);

  const response = NextResponse.json({
    success: true,
    expiresAt,
  });

  // Set HTTP-only secure cookie
  response.cookies.set('dashboard_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });

  return response;
}

// GET: Check if current session is valid
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('dashboard_session')?.value;

  if (!sessionCookie || !verifyToken(sessionCookie)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Extract expiration from token
  const expiresAt = parseInt(sessionCookie.split('.')[0], 10);

  return NextResponse.json({
    authenticated: true,
    expiresAt,
    remainingMs: expiresAt - Date.now(),
  });
}
