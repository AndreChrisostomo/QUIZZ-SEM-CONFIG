import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../server/app';
import type {
  AdminDatabaseService,
  QuizAttemptRepository,
  RankingExportService,
  SaveQuizAttemptPayload,
} from '../../server/types';

const validPayload: SaveQuizAttemptPayload = {
  versionId: 'standard',
  versionHash: null,
  collectionId: 'ipe-icj',
  participant: {
    fullName: 'Maria Teste',
    email: 'maria.teste@example.com',
    henkelArea: 'Marketing',
    gender: 'Feminino',
    sweatshirtSize: 'M',
  },
  attempt: {
    scorePoints: 80,
    correctAnswers: 4,
    totalQuestions: 5,
    durationSeconds: 75,
    startedAt: '2026-06-03T12:00:00.000Z',
    finishedAt: '2026-06-03T12:01:15.000Z',
  },
  answers: [
    {
      questionId: 'q1',
      questionText: 'Pergunta teste',
      difficulty: 'facil',
      points: 20,
      selectedAnswer: 'Resposta A',
      correctAnswer: 'Resposta A',
      isCorrect: true,
      answeredAt: '2026-06-03T12:00:10.000Z',
    },
  ],
};

function createFakeRepository(): QuizAttemptRepository {
  return {
    healthCheck: vi.fn(async () => undefined),
    saveAttempt: vi.fn(async () => ({
      participantId: 10,
      attemptId: 20,
      savedAnswers: 1,
    })),
  };
}

function createFakeRankingExportService(): RankingExportService {
  return {
    exportRankings: vi.fn(async () => ({
      destination: 'http://example.com/rankings/upload',
      remoteStatus: 200,
      files: [
        {
          viewName: 'ranking_base_ipe_icj',
          fileName: 'ranking_base_ipe_icj.csv',
          rowCount: 2,
          sha256: 'hash',
        },
      ],
    })),
  };
}

function createFakeAdminDatabaseService(): AdminDatabaseService {
  return {
    resetDatabase: vi.fn(async () => ({
      resetAt: '2026-06-09T12:00:00.000Z',
    })),
  };
}

describe('quiz attempts API', () => {
  it('returns health status when the database is available', async () => {
    const repository = createFakeRepository();
    const app = createApp(repository);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(repository.healthCheck).toHaveBeenCalledOnce();
  });

  it('saves a valid quiz attempt', async () => {
    const repository = createFakeRepository();
    const app = createApp(repository);

    const response = await request(app).post('/api/attempts').send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      ok: true,
      participantId: 10,
      attemptId: 20,
      savedAnswers: 1,
    });
    expect(repository.saveAttempt).toHaveBeenCalledWith({
      ...validPayload,
      participant: {
        ...validPayload.participant,
        email: 'maria.teste@example.com',
      },
    });
  });

  it('rejects invalid payloads without writing anything', async () => {
    const repository = createFakeRepository();
    const app = createApp(repository);

    const response = await request(app).post('/api/attempts').send({
      ...validPayload,
      versionId: 'v1',
      participant: {
        ...validPayload.participant,
        email: 'email-invalido',
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.errors).toEqual(expect.arrayContaining(['versionId must be standard.']));
    expect(repository.saveAttempt).not.toHaveBeenCalled();
  });

  it('accepts timeout answers with null selectedAnswer', async () => {
    const repository = createFakeRepository();
    const app = createApp(repository);
    const payload = {
      ...validPayload,
      answers: [
        {
          ...validPayload.answers![0],
          selectedAnswer: null,
          isCorrect: false,
        },
      ],
    };

    const response = await request(app).post('/api/attempts').send(payload);

    expect(response.status).toBe(201);
    expect(repository.saveAttempt).toHaveBeenCalledOnce();
  });

  it('exports ranking CSVs through the configured export service', async () => {
    const repository = createFakeRepository();
    const rankingExportService = createFakeRankingExportService();
    const app = createApp(repository, rankingExportService);

    const response = await request(app).post('/api/rankings/export');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      destination: 'http://example.com/rankings/upload',
      remoteStatus: 200,
      files: [
        {
          viewName: 'ranking_base_ipe_icj',
          fileName: 'ranking_base_ipe_icj.csv',
          rowCount: 2,
          sha256: 'hash',
        },
      ],
    });
    expect(rankingExportService.exportRankings).toHaveBeenCalledOnce();
  });

  it('rejects database reset without admin credentials', async () => {
    const repository = createFakeRepository();
    const adminDatabaseService = createFakeAdminDatabaseService();
    const app = createApp(repository, undefined, adminDatabaseService, {
      username: 'admin@henkel.com',
      password: 'admin',
    });

    const response = await request(app)
      .post('/api/admin/reset-database')
      .send({ confirmation: 'RESETAR BANCO' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, error: 'unauthorized' });
    expect(adminDatabaseService.resetDatabase).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before database reset', async () => {
    const repository = createFakeRepository();
    const adminDatabaseService = createFakeAdminDatabaseService();
    const app = createApp(repository, undefined, adminDatabaseService, {
      username: 'admin@henkel.com',
      password: 'admin',
    });

    const response = await request(app)
      .post('/api/admin/reset-database')
      .auth('admin@henkel.com', 'admin')
      .send({ confirmation: 'apagar' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, error: 'confirmation_required' });
    expect(adminDatabaseService.resetDatabase).not.toHaveBeenCalled();
  });

  it('resets the database with valid admin credentials and confirmation', async () => {
    const repository = createFakeRepository();
    const adminDatabaseService = createFakeAdminDatabaseService();
    const app = createApp(repository, undefined, adminDatabaseService, {
      username: 'admin@henkel.com',
      password: 'admin',
    });

    const response = await request(app)
      .post('/api/admin/reset-database')
      .auth('admin@henkel.com', 'admin')
      .send({ confirmation: 'RESETAR BANCO' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      resetAt: '2026-06-09T12:00:00.000Z',
    });
    expect(adminDatabaseService.resetDatabase).toHaveBeenCalledOnce();
  });
});
