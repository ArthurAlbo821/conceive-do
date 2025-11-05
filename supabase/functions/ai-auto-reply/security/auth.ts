/**
 * Authentication and authorization utilities
 * JWT validation and user_id extraction
 */

import * as jose from 'https://deno.land/x/jose@v5.9.6/index.ts';

/**
 * Validates JWT token and extracts user_id
 * 
 * CRITICAL SECURITY: This function validates the JWT signature and expiration
 * Uses Supabase JWT secret to verify authenticity
 * 
 * @param authHeader - Authorization header value (should start with "Bearer ")
 * @param jwtSecret - Supabase JWT secret from environment
 * @returns Object with isValid flag and user_id if valid
 * 
 * @example
 * const auth = await validateJWT(authHeader, Deno.env.get('SUPABASE_JWT_SECRET'));
 * if (!auth.isValid) {
 *   return new Response('Unauthorized', { status: 401 });
 * }
 * const user_id = auth.user_id;
 */
export async function validateJWT(
  authHeader: string | null,
  jwtSecret: string | undefined
): Promise<{
  isValid: boolean;
  user_id?: string;
  error?: string;
}> {
  // Check if Authorization header exists
  if (!authHeader) {
    console.error('[auth] Missing Authorization header');
    return { isValid: false, error: 'Missing Authorization header' };
  }

  // Check if JWT secret is configured
  if (!jwtSecret) {
    console.error('[auth] SUPABASE_JWT_SECRET not configured');
    return { isValid: false, error: 'JWT secret not configured' };
  }

  // Extract token from "Bearer <token>"
  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify JWT signature and expiration
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);

    // Extract user_id (sub claim)
    const user_id = payload.sub;

    if (!user_id) {
      console.error('[auth] JWT payload missing sub claim');
      return { isValid: false, error: 'Invalid JWT: missing user_id' };
    }

    console.log('[auth] JWT validated for user:', user_id);
    return { isValid: true, user_id };

  } catch (error) {
    console.error('[auth] JWT verification failed:', error);
    return { 
      isValid: false, 
      error: `JWT verification failed: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Extracts user_id from request headers (shorthand)
 * Validates JWT and returns user_id or throws error
 * 
 * @param request - HTTP request
 * @param jwtSecret - JWT secret
 * @returns user_id string
 * @throws Error if authentication fails
 */
export async function extractUserId(
  request: Request,
  jwtSecret: string | undefined
): Promise<string> {
  const authHeader = request.headers.get('Authorization');
  const auth = await validateJWT(authHeader, jwtSecret);

  if (!auth.isValid) {
    throw new Error(auth.error || 'Authentication failed');
  }

  return auth.user_id!;
}

/**
 * Creates an authentication error response
 * 
 * @param error - Error message
 * @returns Response with 401 status
 */
export function authErrorResponse(error: string): Response {
  return new Response(
    JSON.stringify({ error }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
