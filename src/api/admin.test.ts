import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from './admin';

describe('resetDatabase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts admin reset credentials and confirmation to the backend API', async () => {
    const responseBody = {
      ok: true,
      resetAt: '2026-06-09T12:00:00.000Z',
    };
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await resetDatabase({
      username: 'admin@henkel.com',
      password: 'admin',
    });

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/reset-database', {
      method: 'POST',
      headers: {
        Authorization: 'Basic YWRtaW5AaGVua2VsLmNvbTphZG1pbg==',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirmation: 'RESETAR BANCO',
      }),
    });
  });

  it('throws when the backend rejects the reset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );

    await expect(
      resetDatabase({
        username: 'admin@henkel.com',
        password: 'wrong',
      }),
    ).rejects.toThrow('Failed to reset database: 401 unauthorized');
  });
});
