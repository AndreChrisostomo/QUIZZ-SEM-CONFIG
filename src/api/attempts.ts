export type ApiDifficulty = 'facil' | 'medio' | 'dificil';
export type ApiQuizVersionId = 'standard';
export type ApiGender = 'Masculino' | 'Feminino' | 'Outro';
export type ApiSweatshirtSize = 'P' | 'M' | 'G' | 'GG';

export interface SaveAttemptPayload {
  versionId: ApiQuizVersionId;
  versionHash: string | null;
  collectionId: string;
  participant: {
    fullName: string;
    email: string;
    henkelArea: string;
    gender: ApiGender;
    sweatshirtSize: ApiSweatshirtSize;
  };
  attempt: {
    scorePoints: number;
    correctAnswers: number;
    totalQuestions: number;
    durationSeconds: number;
    startedAt: string;
    finishedAt: string;
  };
  answers: Array<{
    questionId: string;
    questionText: string;
    difficulty: ApiDifficulty;
    points: number;
    selectedAnswer: string | null;
    correctAnswer: string;
    isCorrect: boolean;
    answeredAt: string;
  }>;
}

export async function saveQuizAttempt(payload: SaveAttemptPayload) {
  const response = await fetch('/api/attempts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save quiz attempt: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<{
    ok: true;
    participantId: number;
    attemptId: number;
    savedAnswers: number;
  }>;
}
