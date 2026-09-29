import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Manually load .env from the project root (tsx/node -E do not do this for us).
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = value;
    }
  }
}

const isProduction = process.env.NODE_ENV === 'production';

// Fail fast rather than silently booting with a guessable signing key or no database.
if (isProduction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
    throw new Error(
      'JWT_SECRET must be set to a long random string (16+ chars) when NODE_ENV=production.'
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set when NODE_ENV=production.');
  }
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'smartproc-dev-secret-change-me',
  databaseUrl: process.env.DATABASE_URL ?? '',
  isProduction,
  // Comma-separated list of allowed origins, or '*' (mobile clients send no Origin).
  corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
};
