import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportRankingViews } from './rankingExport';

describe('exportRankingViews', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests ranking CSV export from the backend API', async () => {
    const responseBody = {
      ok: true,
      destination: 'http://example.com/rankings/upload',
      files: [
        {
          viewName: 'ranking_base_ipe_icj',
          fileName: 'ranking_base_ipe_icj.csv',
          rowCount: 1,
          sha256: 'hash',
        },
      ],
    };
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await exportRankingViews();

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith('/api/rankings/export', {
      method: 'POST',
    });
  });

  it('throws when the backend rejects the export', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not configured', { status: 503 })),
    );

    await expect(exportRankingViews()).rejects.toThrow('Failed to export rankings: 503 not configured');
  });
});
