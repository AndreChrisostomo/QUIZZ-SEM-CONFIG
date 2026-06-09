import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { RankingExportFileSummary, RankingExportResult, RankingExportService } from './types';

const RANKING_EXPORT_VIEWS = [
  {
    viewName: 'ranking_base_ipe_icj',
    fileName: 'ranking_base_ipe_icj.csv',
  },
  {
    viewName: 'ranking_base_paulista',
    fileName: 'ranking_base_paulista.csv',
  },
  {
    viewName: 'ranking_base_planta',
    fileName: 'ranking_base_planta.csv',
  },
] as const;

const CSV_COLUMNS = [
  'ranking_position',
  'collection_id',
  'collection_name',
  'participant_id',
  'full_name',
  'email',
  'henkel_area',
  'gender',
  'sweatshirt_size',
  'score_points',
  'correct_answers',
  'total_questions',
  'attempt_count',
  'duration_seconds',
  'finished_at',
] as const;

interface RankingExportConfig {
  targetUrl: string;
  sharedSecret: string;
  keyId: string;
  timeoutMs: number;
}

interface RankingExportFile extends RankingExportFileSummary {
  content: string;
  bytes: number;
}

interface RankingExportManifest {
  generatedAt: string;
  nonce: string;
  files: Array<RankingExportFileSummary & { bytes: number }>;
}

export class RankingExportConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankingExportConfigurationError';
  }
}

export class RankingExportHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'RankingExportHttpError';
  }
}

export function createRankingExportConfig(env: NodeJS.ProcessEnv = process.env): RankingExportConfig {
  return {
    targetUrl: env.RANKING_EXPORT_URL || 'http://henkel-totem.novaxd.com.br:8080/rankings/upload',
    sharedSecret: env.RANKING_EXPORT_SECRET || '',
    keyId: env.RANKING_EXPORT_KEY_ID || 'henkel-quiz-local',
    timeoutMs: Number(env.RANKING_EXPORT_TIMEOUT_MS || 15000),
  };
}

export class PgRankingExportService implements RankingExportService {
  constructor(
    private readonly pool: Pool,
    private readonly config: RankingExportConfig,
  ) {}

  async exportRankings(): Promise<RankingExportResult> {
    if (!this.config.targetUrl || !this.config.sharedSecret) {
      throw new RankingExportConfigurationError(
        'RANKING_EXPORT_URL and RANKING_EXPORT_SECRET must be configured before exporting rankings.',
      );
    }

    const files = await this.createCsvFiles();
    const generatedAt = new Date().toISOString();
    const nonce = randomUUID();
    const manifest: RankingExportManifest = {
      generatedAt,
      nonce,
      files: files.map(({ content: _content, ...file }) => file),
    };
    const manifestJson = JSON.stringify(manifest);
    const manifestHash = sha256(manifestJson);
    const signature = createHmac('sha256', this.config.sharedSecret)
      .update(`${generatedAt}.${nonce}.${manifestHash}`)
      .digest('hex');

    const formData = new FormData();
    formData.append('manifest', manifestJson);

    for (const file of files) {
      formData.append('files', new Blob([file.content], { type: 'text/csv;charset=utf-8' }), file.fileName);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.targetUrl, {
        method: 'POST',
        headers: {
          'X-Henkel-Key-Id': this.config.keyId,
          'X-Henkel-Timestamp': generatedAt,
          'X-Henkel-Nonce': nonce,
          'X-Henkel-Manifest-SHA256': manifestHash,
          'X-Henkel-Signature': signature,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new RankingExportHttpError(
          `Ranking export destination rejected the upload: ${response.status} ${responseText}`,
          response.status,
        );
      }

      return {
        destination: this.config.targetUrl,
        files: manifest.files,
        remoteStatus: response.status,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async createCsvFiles() {
    const files: RankingExportFile[] = [];

    for (const view of RANKING_EXPORT_VIEWS) {
      const result = await this.pool.query<Record<(typeof CSV_COLUMNS)[number], unknown>>(
        `
          SELECT ${CSV_COLUMNS.join(', ')}
          FROM ${view.viewName}
          ORDER BY ranking_position ASC
        `,
      );
      const content = toCsv(result.rows);

      files.push({
        viewName: view.viewName,
        fileName: view.fileName,
        rowCount: result.rows.length,
        content,
        bytes: Buffer.byteLength(content, 'utf8'),
        sha256: sha256(content),
      });
    }

    return files;
  }
}

function toCsv(rows: Array<Record<(typeof CSV_COLUMNS)[number], unknown>>) {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvEscape(row[column])).join(','));
  return [header, ...lines].join('\n');
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return '';

  const normalized = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\n\r]/.test(normalized)) return normalized;

  return `"${normalized.replace(/"/g, '""')}"`;
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
