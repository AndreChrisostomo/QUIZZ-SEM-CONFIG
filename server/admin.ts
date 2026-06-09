import type { Pool } from 'pg';

import type { AdminCredentials, AdminDatabaseService, AdminResetResult } from './types';

export const ADMIN_RESET_CONFIRMATION = 'RESETAR BANCO';
export const DEFAULT_ADMIN_CREDENTIALS: AdminCredentials = {
  username: 'admin@henkel.com',
  password: 'admin',
};

export function createAdminCredentials(): AdminCredentials {
  return DEFAULT_ADMIN_CREDENTIALS;
}

export function parseBasicAuthHeader(header: string | undefined): AdminCredentials | null {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function isAuthorizedAdmin(header: string | undefined, expectedCredentials: AdminCredentials) {
  const credentials = parseBasicAuthHeader(header);
  if (!credentials) return false;

  return (
    credentials.username === expectedCredentials.username &&
    credentials.password === expectedCredentials.password
  );
}

export class PgAdminDatabaseService implements AdminDatabaseService {
  constructor(private readonly pool: Pool) {}

  async resetDatabase(): Promise<AdminResetResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        'TRUNCATE TABLE quiz_attempt_answers, quiz_attempts, quiz_participants RESTART IDENTITY CASCADE',
      );
      await client.query('COMMIT');

      return {
        resetAt: new Date().toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
