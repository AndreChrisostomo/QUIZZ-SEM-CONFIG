import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PgRankingExportService, RankingExportConfigurationError } from '../../server/rankingExporter';

function createPool(rows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as Pool;
}

describe('PgRankingExportService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates three CSV files and uploads them with signed headers', async () => {
    const pool = createPool([
      {
        ranking_position: 1,
        collection_id: 'ipe-icj',
        collection_name: 'IPÊ & ICJ',
        participant_id: 10,
        full_name: 'Maria Teste',
        email: 'maria.teste@example.com',
        henkel_area: 'Marketing',
        gender: 'Feminino',
        sweatshirt_size: 'M',
        score_points: 100,
        correct_answers: 5,
        total_questions: 5,
        attempt_count: 1,
        duration_seconds: 70,
        finished_at: new Date('2026-06-08T12:00:00.000Z'),
      },
    ]);
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new PgRankingExportService(pool, {
      targetUrl: 'http://example.com/rankings/upload',
      sharedSecret: 'test-secret',
      keyId: 'test-key',
      timeoutMs: 5000,
    });

    const result = await service.exportRankings();

    expect(result.destination).toBe('http://example.com/rankings/upload');
    expect(result.remoteStatus).toBe(200);
    expect(result.files).toHaveLength(3);
    expect(result.files.map((file) => file.fileName)).toEqual([
      'ranking_base_ipe_icj.csv',
      'ranking_base_paulista.csv',
      'ranking_base_planta.csv',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://example.com/rankings/upload',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Henkel-Key-Id': 'test-key',
          'X-Henkel-Signature': expect.any(String),
          'X-Henkel-Manifest-SHA256': expect.any(String),
          'X-Henkel-Nonce': expect.any(String),
          'X-Henkel-Timestamp': expect.any(String),
        }),
        body: expect.any(FormData),
      }),
    );
  });

  it('requires a shared secret before uploading', async () => {
    const service = new PgRankingExportService(createPool([]), {
      targetUrl: 'http://example.com/rankings/upload',
      sharedSecret: '',
      keyId: 'test-key',
      timeoutMs: 5000,
    });

    await expect(service.exportRankings()).rejects.toBeInstanceOf(RankingExportConfigurationError);
  });
});
