import { Pool } from 'pg';

export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const database = process.env.POSTGRES_DB || 'quizz';
  const user = process.env.POSTGRES_USER || 'quizz_app';
  const password = process.env.POSTGRES_PASSWORD || 'quizz_app_password';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function createPgPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
  });
}
