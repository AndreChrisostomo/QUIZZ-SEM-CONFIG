const ADMIN_RESET_CONFIRMATION = 'RESETAR BANCO';

export interface AdminResetCredentials {
  username: string;
  password: string;
}

export interface AdminResetResult {
  ok: true;
  resetAt: string;
}

function encodeBasicAuth(value: string) {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(value);
  }

  return Buffer.from(value, 'utf8').toString('base64');
}

export async function resetDatabase(credentials: AdminResetCredentials) {
  const response = await fetch('/api/admin/reset-database', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodeBasicAuth(`${credentials.username}:${credentials.password}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      confirmation: ADMIN_RESET_CONFIRMATION,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to reset database: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<AdminResetResult>;
}
