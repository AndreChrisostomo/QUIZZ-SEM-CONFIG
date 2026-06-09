import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveQuizAttempt, type SaveAttemptPayload } from './attempts';

const payload: SaveAttemptPayload = {
  versionId: 'standard',
  versionHash: null,
  collectionId: 'fabrica-itapevi',
  participant: {
    fullName: 'Joao Teste',
    email: 'joao.teste@example.com',
    henkelArea: 'Operacoes',
    gender: 'Masculino',
    sweatshirtSize: 'G',
  },
  attempt: {
    scorePoints: 100,
    correctAnswers: 5,
    totalQuestions: 5,
    durationSeconds: 55,
    startedAt: '2026-06-03T12:00:00.000Z',
    finishedAt: '2026-06-03T12:00:55.000Z',
  },
  answers: [],
};

describe('saveQuizAttempt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts attempts to the backend API', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          participantId: 1,
          attemptId: 2,
          savedAnswers: 0,
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveQuizAttempt(payload);

    expect(result).toEqual({
      ok: true,
      participantId: 1,
      attemptId: 2,
      savedAnswers: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/attempts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  });

  it('throws when the backend rejects the attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad payload', { status: 400 })),
    );

    await expect(saveQuizAttempt(payload)).rejects.toThrow('Failed to save quiz attempt: 400 bad payload');
  });
});
