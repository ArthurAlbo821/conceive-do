/**
 * Environment variable validation
 * Validates all required environment variables at startup with clear error messages
 */

import { z } from 'npm:zod@3.22.4';

/**
 * Environment variable schema
 * Defines strict validation rules for all required and optional env vars
 */
const envSchema = z.object({
  // Supabase configuration
  SUPABASE_URL: z
    .string()
    .url('SUPABASE_URL must be a valid URL')
    .min(1, 'SUPABASE_URL is required'),

  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required')
    .startsWith('ey', 'SUPABASE_SERVICE_ROLE_KEY must be a valid JWT token (starts with "ey")'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long')
    .min(1, 'JWT_SECRET is required'),

  // OpenAI configuration
  OPENAI_API_KEY: z
    .string()
    .min(1, 'OPENAI_API_KEY is required')
    .startsWith('sk-', 'OPENAI_API_KEY must start with "sk-"'),

  // Optional Supermemory configuration
  SUPERMEMORY_API_KEY: z
    .string()
    .startsWith('sm_', 'SUPERMEMORY_API_KEY must start with "sm_"')
    .optional(),

  SUPERMEMORY_WORKSPACE_ID: z
    .string()
    .startsWith('workspace_', 'SUPERMEMORY_WORKSPACE_ID must start with "workspace_"')
    .optional(),

  SUPERMEMORY_API_URL: z
    .string()
    .url('SUPERMEMORY_API_URL must be a valid URL if provided')
    .optional(),

  // Optional: Duckling API for temporal parsing
  DUCKLING_API_URL: z
    .string()
    .url('DUCKLING_API_URL must be a valid URL if provided')
    .optional()
});

/**
 * Validated environment variables
 * Type-safe access to environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables at startup
 * Exits the process with clear error messages if validation fails
 *
 * @returns Validated environment variables (type-safe)
 *
 * @example
 * // At the top of your main file:
 * const env = validateEnv();
 * console.log(`Using OpenAI key: ${env.OPENAI_API_KEY.substring(0, 10)}...`);
 */
export function validateEnv(): Env {
  try {
    // Parse and validate environment variables
    const env = envSchema.parse({
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      JWT_SECRET: Deno.env.get('JWT_SECRET'),
      OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
      SUPERMEMORY_API_KEY: Deno.env.get('SUPERMEMORY_API_KEY'),
      SUPERMEMORY_WORKSPACE_ID: Deno.env.get('SUPERMEMORY_WORKSPACE_ID'),
      SUPERMEMORY_API_URL: Deno.env.get('SUPERMEMORY_API_URL'),
      DUCKLING_API_URL: Deno.env.get('DUCKLING_API_URL'),
    });

    console.log('[env] ✅ Environment variables validated successfully');
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[env] ❌ Environment variable validation failed:');
      console.error('');

      // Print each validation error with clear formatting
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        console.error(`  • ${field}: ${err.message}`);
      });

      console.error('');
      console.error('[env] 💡 Please check your environment variables and try again.');
      console.error('[env] 📝 Required variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, OPENAI_API_KEY');
      console.error('[env] 📝 Optional variables: DUCKLING_API_URL, SUPERMEMORY_API_KEY, SUPERMEMORY_WORKSPACE_ID, SUPERMEMORY_API_URL');

      // Throw error to let caller handle it
      throw new Error('Environment variable validation failed. See console output above for details.');
    }

    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Gets a validated environment variable value
 * Use this after calling validateEnv() to access env vars in a type-safe way
 *
 * @param env - Validated environment object
 * @param key - Environment variable key
 * @returns Environment variable value
 *
 * @example
 * const env = validateEnv();
 * const apiKey = env.OPENAI_API_KEY; // Type-safe!
 */
export function getEnvVar(env: Env, key: keyof Env): string | undefined {
  return env[key];
}
