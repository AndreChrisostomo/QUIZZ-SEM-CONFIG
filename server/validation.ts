import type {
  Difficulty,
  Gender,
  QuizVersionId,
  SaveQuizAttemptPayload,
  SweatshirtSize,
} from './types';

const VERSION_IDS = new Set<QuizVersionId>(['standard']);
const COLLECTION_IDS = new Set(['ipe-icj', 'fabrica-jundiai', 'fabrica-itapevi']);
const DIFFICULTIES = new Set<Difficulty>(['facil', 'medio', 'dificil']);
const GENDERS = new Set<Gender>(['Masculino', 'Feminino', 'Outro']);
const SWEATSHIRT_SIZES = new Set<SweatshirtSize>(['P', 'M', 'G', 'GG']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult<T> {
  data: T | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalIsoString(value: unknown, fieldName: string, errors: string[]) {
  if (value === undefined || value === null || value === '') return null;
  const stringValue = readString(value);
  if (!stringValue || Number.isNaN(Date.parse(stringValue))) {
    errors.push(`${fieldName} must be a valid ISO datetime when provided.`);
    return null;
  }
  return stringValue;
}

function readInteger(value: unknown, fieldName: string, errors: string[], minimum: number) {
  if (!Number.isInteger(value) || Number(value) < minimum) {
    errors.push(`${fieldName} must be an integer greater than or equal to ${minimum}.`);
    return 0;
  }
  return Number(value);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateSaveQuizAttemptPayload(input: unknown): ValidationResult<SaveQuizAttemptPayload> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { data: null, errors: ['Payload must be an object.'] };
  }

  const versionId = readString(input.versionId) as QuizVersionId;
  if (!VERSION_IDS.has(versionId)) {
    errors.push('versionId must be standard.');
  }

  const versionHash = input.versionHash === undefined || input.versionHash === null ? null : readString(input.versionHash);
  const collectionId = readString(input.collectionId);
  if (!COLLECTION_IDS.has(collectionId)) {
    errors.push('collectionId is invalid.');
  }

  if (!isRecord(input.participant)) {
    errors.push('participant is required.');
  }

  const participantInput = isRecord(input.participant) ? input.participant : {};
  const fullName = readString(participantInput.fullName);
  const email = normalizeEmail(readString(participantInput.email));
  const henkelArea = readString(participantInput.henkelArea);
  const gender = readString(participantInput.gender) as Gender;
  const sweatshirtSize = readString(participantInput.sweatshirtSize) as SweatshirtSize;

  if (fullName.length < 3) errors.push('participant.fullName must have at least 3 characters.');
  if (!EMAIL_PATTERN.test(email)) errors.push('participant.email must be valid.');
  if (!henkelArea) errors.push('participant.henkelArea is required.');
  if (!GENDERS.has(gender)) errors.push('participant.gender is invalid.');
  if (!SWEATSHIRT_SIZES.has(sweatshirtSize)) errors.push('participant.sweatshirtSize is invalid.');

  if (!isRecord(input.attempt)) {
    errors.push('attempt is required.');
  }

  const attemptInput = isRecord(input.attempt) ? input.attempt : {};
  const scorePoints = readInteger(attemptInput.scorePoints, 'attempt.scorePoints', errors, 0);
  const correctAnswers = readInteger(attemptInput.correctAnswers, 'attempt.correctAnswers', errors, 0);
  const totalQuestions = readInteger(attemptInput.totalQuestions, 'attempt.totalQuestions', errors, 1);
  const durationSeconds = readInteger(attemptInput.durationSeconds, 'attempt.durationSeconds', errors, 1);
  const startedAt = readOptionalIsoString(attemptInput.startedAt, 'attempt.startedAt', errors);
  const finishedAt = readOptionalIsoString(attemptInput.finishedAt, 'attempt.finishedAt', errors);

  if (correctAnswers > totalQuestions) {
    errors.push('attempt.correctAnswers cannot be greater than attempt.totalQuestions.');
  }

  const answersInput = input.answers;
  const answers = Array.isArray(answersInput)
    ? answersInput.map((answerInput, index) => {
        if (!isRecord(answerInput)) {
          errors.push(`answers.${index} must be an object.`);
          return null;
        }

        const questionId = readString(answerInput.questionId);
        const questionText = readString(answerInput.questionText);
        const difficulty = readString(answerInput.difficulty) as Difficulty;
        const points = readInteger(answerInput.points, `answers.${index}.points`, errors, 1);
        const selectedAnswer =
          answerInput.selectedAnswer === null || answerInput.selectedAnswer === undefined
            ? null
            : readString(answerInput.selectedAnswer);
        const correctAnswer = readString(answerInput.correctAnswer);
        const isCorrect = answerInput.isCorrect;
        const answeredAt = readOptionalIsoString(answerInput.answeredAt, `answers.${index}.answeredAt`, errors);

        if (!questionId) errors.push(`answers.${index}.questionId is required.`);
        if (!questionText) errors.push(`answers.${index}.questionText is required.`);
        if (!DIFFICULTIES.has(difficulty)) errors.push(`answers.${index}.difficulty is invalid.`);
        if (!correctAnswer) errors.push(`answers.${index}.correctAnswer is required.`);
        if (typeof isCorrect !== 'boolean') errors.push(`answers.${index}.isCorrect must be boolean.`);

        return {
          questionId,
          questionText,
          difficulty,
          points,
          selectedAnswer,
          correctAnswer,
          isCorrect: Boolean(isCorrect),
          answeredAt,
        };
      })
    : [];

  if (answers.length > totalQuestions) {
    errors.push('answers cannot contain more items than attempt.totalQuestions.');
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return {
    data: {
      versionId,
      versionHash,
      collectionId,
      participant: {
        fullName,
        email,
        henkelArea,
        gender,
        sweatshirtSize,
      },
      attempt: {
        scorePoints,
        correctAnswers,
        totalQuestions,
        durationSeconds,
        startedAt,
        finishedAt,
      },
      answers: answers.filter((answer): answer is NonNullable<typeof answer> => Boolean(answer)),
    },
    errors: [],
  };
}
