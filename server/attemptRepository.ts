import type { Pool, PoolClient } from 'pg';

import type { QuizAttemptRepository, SaveQuizAttemptPayload, SaveQuizAttemptResult } from './types';

export class PgQuizAttemptRepository implements QuizAttemptRepository {
  constructor(private readonly pool: Pool) {}

  async healthCheck() {
    await this.pool.query('SELECT 1');
  }

  async saveAttempt(payload: SaveQuizAttemptPayload): Promise<SaveQuizAttemptResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const participantId = await upsertParticipant(client, payload);
      const attemptId = await insertAttempt(client, payload, participantId);
      const savedAnswers = await insertAnswers(client, payload, attemptId);

      await client.query('COMMIT');

      return {
        participantId,
        attemptId,
        savedAnswers,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function upsertParticipant(client: PoolClient, payload: SaveQuizAttemptPayload) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz_participants (
        full_name,
        email,
        henkel_area,
        gender,
        sweatshirt_size
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        henkel_area = EXCLUDED.henkel_area,
        gender = EXCLUDED.gender,
        sweatshirt_size = EXCLUDED.sweatshirt_size,
        updated_at = now()
      RETURNING id
    `,
    [
      payload.participant.fullName,
      payload.participant.email,
      payload.participant.henkelArea,
      payload.participant.gender,
      payload.participant.sweatshirtSize,
    ],
  );

  return Number(result.rows[0].id);
}

async function insertAttempt(client: PoolClient, payload: SaveQuizAttemptPayload, participantId: number) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO quiz_attempts (
        participant_id,
        collection_id,
        score_points,
        correct_answers,
        total_questions,
        duration_seconds,
        started_at,
        finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()))
      RETURNING id
    `,
    [
      participantId,
      payload.collectionId,
      payload.attempt.scorePoints,
      payload.attempt.correctAnswers,
      payload.attempt.totalQuestions,
      payload.attempt.durationSeconds,
      payload.attempt.startedAt,
      payload.attempt.finishedAt,
    ],
  );

  return Number(result.rows[0].id);
}

async function insertAnswers(client: PoolClient, payload: SaveQuizAttemptPayload, attemptId: number) {
  const answers = payload.answers || [];

  for (const answer of answers) {
    await client.query(
      `
        INSERT INTO quiz_attempt_answers (
          attempt_id,
          question_id,
          question_text,
          difficulty,
          points,
          selected_answer,
          correct_answer,
          is_correct,
          answered_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
      `,
      [
        attemptId,
        answer.questionId,
        answer.questionText,
        answer.difficulty,
        answer.points,
        answer.selectedAnswer,
        answer.correctAnswer,
        answer.isCorrect,
        answer.answeredAt,
      ],
    );
  }

  return answers.length;
}
