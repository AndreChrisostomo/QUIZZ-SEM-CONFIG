export type Difficulty = 'facil' | 'medio' | 'dificil';
export type QuizVersionId = 'standard';
export type Gender = 'Masculino' | 'Feminino' | 'Outro';
export type SweatshirtSize = 'P' | 'M' | 'G' | 'GG';

export interface QuizParticipantPayload {
  fullName: string;
  email: string;
  henkelArea: string;
  gender: Gender;
  sweatshirtSize: SweatshirtSize;
}

export interface QuizAttemptSummaryPayload {
  scorePoints: number;
  correctAnswers: number;
  totalQuestions: number;
  durationSeconds: number;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface QuizAttemptAnswerPayload {
  questionId: string;
  questionText: string;
  difficulty: Difficulty;
  points: number;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  answeredAt?: string | null;
}

export interface SaveQuizAttemptPayload {
  versionId: QuizVersionId;
  versionHash?: string | null;
  collectionId: string;
  participant: QuizParticipantPayload;
  attempt: QuizAttemptSummaryPayload;
  answers?: QuizAttemptAnswerPayload[];
}

export interface SaveQuizAttemptResult {
  participantId: number;
  attemptId: number;
  savedAnswers: number;
}

export interface RankingExportFileSummary {
  viewName: string;
  fileName: string;
  rowCount: number;
  sha256: string;
}

export interface RankingExportResult {
  destination: string;
  files: RankingExportFileSummary[];
  remoteStatus: number;
}

export interface AdminCredentials {
  username: string;
  password: string;
}

export interface AdminResetResult {
  resetAt: string;
}

export interface QuizAttemptRepository {
  healthCheck(): Promise<void>;
  saveAttempt(payload: SaveQuizAttemptPayload): Promise<SaveQuizAttemptResult>;
}

export interface RankingExportService {
  exportRankings(): Promise<RankingExportResult>;
}

export interface AdminDatabaseService {
  resetDatabase(): Promise<AdminResetResult>;
}
