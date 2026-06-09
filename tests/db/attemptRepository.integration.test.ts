import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PgQuizAttemptRepository } from '../../server/attemptRepository';
import type { SaveQuizAttemptPayload } from '../../server/types';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('PgQuizAttemptRepository', () => {
  let pool: Pool;
  let repository: PgQuizAttemptRepository;
  const email = `db-test-${Date.now()}@example.com`;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    repository = new PgQuizAttemptRepository(pool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM quiz_participants WHERE email = $1', [email]);
      await pool.end();
    }
  });

  it('saves participant, attempt, answers, and ranking rows', async () => {
    const firstAttempt = createPayload(email, 60, 80);
    const secondAttempt = createPayload(email, 100, 70);

    const firstResult = await repository.saveAttempt(firstAttempt);
    const secondResult = await repository.saveAttempt(secondAttempt);

    expect(firstResult.participantId).toBe(secondResult.participantId);
    expect(firstResult.savedAnswers).toBe(2);
    expect(secondResult.savedAnswers).toBe(2);

    const participantRows = await pool.query('SELECT * FROM quiz_participants WHERE email = $1', [email]);
    expect(participantRows.rowCount).toBe(1);

    const attempts = await pool.query(
      `
        SELECT score_points, duration_seconds
        FROM quiz_attempts
        WHERE participant_id = $1
        ORDER BY score_points ASC
      `,
      [firstResult.participantId],
    );
    expect(attempts.rows).toEqual([
      expect.objectContaining({ score_points: 60, duration_seconds: 80 }),
      expect.objectContaining({ score_points: 100, duration_seconds: 70 }),
    ]);

    const answers = await pool.query(
      `
        SELECT selected_answer, is_correct
        FROM quiz_attempt_answers
        WHERE attempt_id = $1
        ORDER BY id ASC
      `,
      [secondResult.attemptId],
    );
    expect(answers.rows).toEqual([
      expect.objectContaining({ selected_answer: 'Resposta correta', is_correct: true }),
      expect.objectContaining({ selected_answer: null, is_correct: false }),
    ]);

    const ranking = await pool.query(
      `
        SELECT score_points, duration_seconds, sweatshirt_size
        FROM quiz_ranking
        WHERE email = $1 AND collection_id = $2
      `,
      [email, 'ipe-icj'],
    );
    expect(ranking.rows).toEqual([
      expect.objectContaining({
        score_points: 100,
        duration_seconds: 70,
        sweatshirt_size: 'M',
      }),
    ]);

    const baseRanking = await pool.query(
      `
        SELECT ranking_position, score_points, duration_seconds
        FROM ranking_base_ipe_icj
        WHERE email = $1
      `,
      [email],
    );
    expect(baseRanking.rows).toEqual([
      expect.objectContaining({
        ranking_position: '1',
        score_points: 100,
        duration_seconds: 70,
      }),
    ]);
  });
});

function createPayload(email: string, scorePoints: number, durationSeconds: number): SaveQuizAttemptPayload {
  return {
    versionId: 'standard',
    versionHash: null,
    collectionId: 'ipe-icj',
    participant: {
      fullName: 'Participante DB',
      email,
      henkelArea: 'TI',
      gender: 'Outro',
      sweatshirtSize: 'M',
    },
    attempt: {
      scorePoints,
      correctAnswers: scorePoints === 100 ? 5 : 3,
      totalQuestions: 5,
      durationSeconds,
      startedAt: '2026-06-03T12:00:00.000Z',
      finishedAt: '2026-06-03T12:01:00.000Z',
    },
    answers: [
      {
        questionId: `db-${scorePoints}-1`,
        questionText: 'Pergunta correta',
        difficulty: 'facil',
        points: 20,
        selectedAnswer: 'Resposta correta',
        correctAnswer: 'Resposta correta',
        isCorrect: true,
        answeredAt: '2026-06-03T12:00:10.000Z',
      },
      {
        questionId: `db-${scorePoints}-2`,
        questionText: 'Pergunta timeout',
        difficulty: 'medio',
        points: 20,
        selectedAnswer: null,
        correctAnswer: 'Resposta correta',
        isCorrect: false,
        answeredAt: '2026-06-03T12:00:30.000Z',
      },
    ],
  };
}
