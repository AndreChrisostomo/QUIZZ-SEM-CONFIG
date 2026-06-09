import express from 'express';

import {
  ADMIN_RESET_CONFIRMATION,
  createAdminCredentials,
  isAuthorizedAdmin,
  PgAdminDatabaseService,
} from './admin';
import { PgQuizAttemptRepository } from './attemptRepository';
import { createPgPool } from './db';
import {
  createRankingExportConfig,
  PgRankingExportService,
  RankingExportConfigurationError,
  RankingExportHttpError,
} from './rankingExporter';
import type { AdminCredentials, AdminDatabaseService, QuizAttemptRepository, RankingExportService } from './types';
import { validateSaveQuizAttemptPayload } from './validation';

export function createApp(
  repository: QuizAttemptRepository,
  rankingExportService?: RankingExportService,
  adminDatabaseService?: AdminDatabaseService,
  adminCredentials?: AdminCredentials,
) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_request, response) => {
    try {
      await repository.healthCheck();
      response.json({ ok: true });
    } catch (error) {
      console.error('Database health check failed:', error);
      response.status(503).json({ ok: false, error: 'database_unavailable' });
    }
  });

  app.post('/api/attempts', async (request, response) => {
    const validation = validateSaveQuizAttemptPayload(request.body);

    if (!validation.data) {
      response.status(400).json({ ok: false, errors: validation.errors });
      return;
    }

    try {
      const result = await repository.saveAttempt(validation.data);
      response.status(201).json({ ok: true, ...result });
    } catch (error) {
      console.error('Failed to save quiz attempt:', error);
      response.status(500).json({ ok: false, error: 'save_attempt_failed' });
    }
  });

  app.post('/api/rankings/export', async (_request, response) => {
    if (!rankingExportService) {
      response.status(503).json({ ok: false, error: 'ranking_export_unavailable' });
      return;
    }

    try {
      const result = await rankingExportService.exportRankings();
      response.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RankingExportConfigurationError) {
        response.status(503).json({ ok: false, error: 'ranking_export_not_configured' });
        return;
      }

      if (error instanceof RankingExportHttpError) {
        response.status(502).json({ ok: false, error: 'ranking_export_rejected', status: error.status });
        return;
      }

      console.error('Failed to export ranking CSVs:', error);
      response.status(500).json({ ok: false, error: 'ranking_export_failed' });
    }
  });

  app.post('/api/admin/reset-database', async (request, response) => {
    if (!adminDatabaseService || !adminCredentials) {
      response.status(503).json({ ok: false, error: 'admin_reset_unavailable' });
      return;
    }

    if (!isAuthorizedAdmin(request.header('authorization'), adminCredentials)) {
      response
        .status(401)
        .set('WWW-Authenticate', 'Basic realm="Henkel Quiz Admin"')
        .json({ ok: false, error: 'unauthorized' });
      return;
    }

    if (request.body?.confirmation !== ADMIN_RESET_CONFIRMATION) {
      response.status(400).json({ ok: false, error: 'confirmation_required' });
      return;
    }

    try {
      const result = await adminDatabaseService.resetDatabase();
      response.json({ ok: true, ...result });
    } catch (error) {
      console.error('Failed to reset database:', error);
      response.status(500).json({ ok: false, error: 'database_reset_failed' });
    }
  });

  return app;
}

export function createDefaultApp() {
  const pool = createPgPool();
  return createApp(
    new PgQuizAttemptRepository(pool),
    new PgRankingExportService(pool, createRankingExportConfig()),
    new PgAdminDatabaseService(pool),
    createAdminCredentials(),
  );
}
