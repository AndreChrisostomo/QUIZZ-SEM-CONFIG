import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import yaml from 'js-yaml';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

import { resetDatabase } from './api/admin';
import { saveQuizAttempt, type SaveAttemptPayload } from './api/attempts';
import questionsYaml from './questions.yaml?raw';

type Difficulty = 'facil' | 'medio' | 'dificil';
type GameState = 'collection' | 'generalIntro' | 'profile' | 'ready' | 'playing' | 'finished';

interface RoundRequirement {
  nivel: Difficulty;
  quantidade: number;
}

interface Question {
  id: string;
  pergunta: string;
  nivel: Difficulty;
  pontos: number;
  alternativas: string[];
  resposta_correta: string;
}

interface QuestionCollection {
  id: string;
  nome: string;
  perguntas: Question[];
}

interface RoundQuestion extends Question {
  pontosRodada: number;
}

interface AttemptAnswerRecord {
  questionId: string;
  questionText: string;
  difficulty: Difficulty;
  points: number;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  answeredAt: string;
}

interface QuizData {
  colecoes: QuestionCollection[];
}

interface ParticipantForm {
  nomeCompleto: string;
  email: string;
  area: string;
  genero: string;
  tamanhoMoletom: string;
}

interface RankingEntry extends ParticipantForm {
  id: string;
  collectionId: string;
  collectionName: string;
  pontos: number;
  acertos: number;
  totalPerguntas: number;
  tentativas: number;
  tempoTotal: number;
  createdAt: string;
  updatedAt: string;
}

interface BaseConfig {
  id: string;
  label: string;
  collectionIds: string[];
  combineCollections: boolean;
  requiresParticipant: boolean;
  scoringEnabled: boolean;
  storesResults: boolean;
}

const SCORE_TARGET = 100;
const SECONDS_PER_QUESTION = 30;
const FINISHED_RESET_DELAY_MS = 10000;
const RANKING_STORAGE_KEY = 'henkel-150-ranking';
const SHIRT_SIZES = ['P', 'M', 'G', 'GG'];
const GENERAL_QUIZ_BASE_ID = 'quiz-geral';

const BASE_CONFIGS: BaseConfig[] = [
  {
    id: 'ipe-icj',
    label: 'IPÊ & ICJ',
    collectionIds: ['ipe-icj'],
    combineCollections: false,
    requiresParticipant: true,
    scoringEnabled: true,
    storesResults: true,
  },
  {
    id: 'fabrica-jundiai',
    label: 'Paulista',
    collectionIds: ['fabrica-jundiai'],
    combineCollections: false,
    requiresParticipant: true,
    scoringEnabled: true,
    storesResults: true,
  },
  {
    id: 'fabrica-itapevi',
    label: 'Planta',
    collectionIds: ['fabrica-itapevi'],
    combineCollections: false,
    requiresParticipant: true,
    scoringEnabled: true,
    storesResults: true,
  },
];

const DEFAULT_ROUND_REQUIREMENTS: RoundRequirement[] = [
  { nivel: 'facil', quantidade: 1 },
  { nivel: 'medio', quantidade: 2 },
  { nivel: 'dificil', quantidade: 2 },
];

const EMPTY_PARTICIPANT: ParticipantForm = {
  nomeCompleto: '',
  email: '',
  area: 'Não informado',
  genero: '',
  tamanhoMoletom: '',
};

const DIFFICULTY_META: Record<Difficulty, { label: string; weight: number }> = {
  facil: { label: 'Fácil', weight: 5 },
  medio: { label: 'Média', weight: 10 },
  dificil: { label: 'Difícil', weight: 15 },
};

const GENDER_OPTIONS = [
  { value: 'Feminino', label: 'Feminino' },
  { value: 'Masculino', label: 'Masculino' },
  { value: 'Outro', label: 'Outros' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getQuestionPoints(question: RoundQuestion) {
  return question.pontosRodada;
}

function isBetterResult(candidate: RankingEntry, current: RankingEntry) {
  if (candidate.pontos !== current.pontos) return candidate.pontos > current.pontos;
  if (candidate.tempoTotal !== current.tempoTotal) return candidate.tempoTotal < current.tempoTotal;
  return candidate.acertos > current.acertos;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getDifficultySummary(collection: QuestionCollection) {
  return collection.perguntas.reduce(
    (summary, question) => {
      summary[question.nivel] += 1;
      return summary;
    },
    { facil: 0, medio: 0, dificil: 0 } as Record<Difficulty, number>,
  );
}

function getQuestionShortage(collection: QuestionCollection, requirements: RoundRequirement[]) {
  return requirements.filter(({ nivel, quantidade }) => {
    return collection.perguntas.filter((question) => question.nivel === nivel).length < quantidade;
  });
}

function assignRoundPoints(questions: Question[], scoringEnabled: boolean): RoundQuestion[] {
  if (!scoringEnabled) {
    return questions.map((question) => ({
      ...question,
      pontosRodada: 0,
    }));
  }

  const weights = questions.map((question) => DIFFICULTY_META[question.nivel]?.weight || question.pontos || 1);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const rawPoints = weights.map((weight) => (weight / totalWeight) * SCORE_TARGET);
  const roundedPoints = rawPoints.map(Math.floor);
  let remainingPoints = SCORE_TARGET - roundedPoints.reduce((total, points) => total + points, 0);

  const remainderOrder = rawPoints
    .map((points, index) => ({ index, remainder: points - Math.floor(points), weight: weights[index] }))
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      return right.weight - left.weight;
    });

  for (const item of remainderOrder) {
    if (remainingPoints <= 0) break;
    roundedPoints[item.index] += 1;
    remainingPoints -= 1;
  }

  return questions.map((question, index) => ({
    ...question,
    pontosRodada: roundedPoints[index],
  }));
}

function selectRoundQuestions(
  collection: QuestionCollection,
  requirements: RoundRequirement[],
  scoringEnabled: boolean,
) {
  const selectedQuestions = requirements.flatMap(({ nivel, quantidade }) => {
    return shuffle<Question>(collection.perguntas.filter((question) => question.nivel === nivel)).slice(
      0,
      quantidade,
    );
  });

  return assignRoundPoints(selectedQuestions, scoringEnabled).map((question): RoundQuestion => ({
    ...question,
    alternativas: shuffle<string>(question.alternativas),
  }));
}

function getSelectableCollections(collections: QuestionCollection[]): QuestionCollection[] {
  return BASE_CONFIGS.map((base) => {
    const sourceCollections = base.collectionIds
      .map((collectionId) => collections.find((collection) => collection.id === collectionId))
      .filter((collection): collection is QuestionCollection => Boolean(collection));

    if (sourceCollections.length !== base.collectionIds.length) return null;

    return {
      id: base.id,
      nome: base.label,
      perguntas: base.combineCollections
        ? sourceCollections.flatMap((collection) => collection.perguntas)
        : sourceCollections[0].perguntas,
    };
  }).filter((collection): collection is QuestionCollection => Boolean(collection));
}

function getCollectionLabel(collectionName: string) {
  return collectionName.replace(/^FÁBRICA\s+/i, '');
}

function getAnswerSizeClass(answer: string) {
  if (answer.length >= 58) return 'is-very-long';
  if (answer.length >= 38) return 'is-long';
  return '';
}

function Screen({
  background,
  children,
  className = '',
  screenKey,
}: {
  background: string;
  children: ReactNode;
  className?: string;
  screenKey: string;
}) {
  return (
    <motion.section
      key={screenKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className={`quiz-stage ${className}`}
    >
      <img className="reference-bg" src={background} alt="" draggable={false} />
      <div className="screen-layer">{children}</div>
    </motion.section>
  );
}

function AdminPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const confirmed = window.confirm(
      'Tem certeza que deseja resetar o banco? Isso apagará participantes, tentativas e respostas salvas.',
    );

    if (!confirmed) return;

    setIsResetting(true);

    try {
      const result = await resetDatabase({ username, password });
      setMessageTone('success');
      setMessage(`Banco resetado com sucesso em ${new Date(result.resetAt).toLocaleString('pt-BR')}.`);
    } catch (error) {
      console.error('Error resetting database:', error);
      setMessageTone('error');
      setMessage('Não foi possível resetar o banco. Confira usuário, senha e conexão com a API.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="admin-shell">
      <section className="admin-panel" aria-labelledby="admin-title">
        <a href="/" className="admin-return-button" aria-label="Retornar para o quiz">
          <ArrowLeft aria-hidden="true" />
          <span>RETORNAR</span>
        </a>
        <p className="admin-kicker">Henkel Quiz</p>
        <h1 id="admin-title">Admin</h1>
        <p className="admin-description">
          Use o usuário admin para resetar participantes, tentativas e respostas.
        </p>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label>
            Usuário admin
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Senha admin
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" disabled={isResetting}>
            {isResetting ? 'RESETANDO...' : 'RESETAR BANCO DE DADOS'}
          </button>
        </form>

        {message && (
          <p className={`admin-message is-${messageTone}`} role="status" aria-live="polite">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

export default function App() {
  if (window.location.pathname === '/admin') {
    return <AdminPage />;
  }

  const [gameState, setGameState] = useState<GameState>('collection');
  const [collections, setCollections] = useState<QuestionCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [participant, setParticipant] = useState<ParticipantForm>(EMPTY_PARTICIPANT);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [currentQuizQuestions, setCurrentQuizQuestions] = useState<RoundQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedAnswerRef = useRef<string | null>(null);
  const isAnswerCheckedRef = useRef(false);
  const answerHistoryRef = useRef<AttemptAnswerRecord[]>([]);
  const roundStartedAtRef = useRef<number>(Date.now());
  const timeoutRef = useRef<number | null>(null);

  const selectableCollections = useMemo(() => getSelectableCollections(collections), [collections]);
  const selectedCollection = selectableCollections.find((collection) => collection.id === selectedCollectionId);
  const selectedBase = BASE_CONFIGS.find((base) => base.id === selectedCollectionId);
  const isGeneralQuiz = selectedBase?.id === GENERAL_QUIZ_BASE_ID;
  const currentQuestion = currentQuizQuestions[currentQuestionIndex];
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - roundStartedAtRef.current) / 1000));
  const progressPercentage = currentQuizQuestions.length
    ? ((currentQuestionIndex + 1) / currentQuizQuestions.length) * 100
    : 0;
  const isParticipantValid =
    Boolean(selectedBase) &&
    (!selectedBase?.requiresParticipant ||
      (isGeneralQuiz
        ? participant.nomeCompleto.trim().length > 2 && EMAIL_PATTERN.test(participant.email.trim())
        : participant.nomeCompleto.trim().length > 2 &&
          EMAIL_PATTERN.test(participant.email.trim()) &&
          participant.area.trim().length > 1 &&
          Boolean(participant.genero) &&
          Boolean(participant.tamanhoMoletom)));
  useEffect(() => {
    try {
      const data = yaml.load(questionsYaml) as QuizData;
      if (!data?.colecoes?.length) {
        setLoadError('Nenhuma coleção foi encontrada no arquivo de perguntas.');
        return;
      }
      setCollections(data.colecoes);
    } catch (error) {
      setLoadError('Não foi possível carregar o arquivo de perguntas.');
      console.error('Error loading YAML:', error);
    }
  }, []);

  useEffect(() => {
    try {
      const storedRanking = window.localStorage.getItem(RANKING_STORAGE_KEY);
      if (storedRanking) {
        setRanking(JSON.parse(storedRanking) as RankingEntry[]);
      }
    } catch (error) {
      console.error('Error loading ranking:', error);
    }
  }, []);

  const resetRoundState = () => {
    selectedAnswerRef.current = null;
    isAnswerCheckedRef.current = false;
    answerHistoryRef.current = [];
    setCurrentQuizQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setCorrectAnswers(0);
    setSelectedAnswer(null);
    setIsAnswerChecked(false);
    setTimeLeft(SECONDS_PER_QUESTION);
  };

  const resetToProfile = (clearParticipant = false) => {
    resetRoundState();
    if (clearParticipant) {
      setParticipant(EMPTY_PARTICIPANT);
    }
    setGameState('profile');
  };

  const resetAfterFinished = () => {
    if (isGeneralQuiz) {
      resetRoundState();
      setParticipant(EMPTY_PARTICIPANT);
      setGameState('generalIntro');
      return;
    }

    if (!selectedBase?.requiresParticipant) {
      resetRoundState();
      setSelectedCollectionId(null);
      setParticipant(EMPTY_PARTICIPANT);
      setGameState('collection');
      return;
    }

    resetToProfile(true);
  };

  useEffect(() => {
    if (gameState !== 'finished') return undefined;

    const resetTimer = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(resetAfterFinished, FINISHED_RESET_DELAY_MS);
    };

    resetTimer();

    const handleInteraction = () => resetTimer();
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [gameState]);

  const handleCollectionSelect = (collectionId: string) => {
    setLoadError(null);
    setSelectedCollectionId(collectionId);
    if (collectionId === GENERAL_QUIZ_BASE_ID) {
      setParticipant(EMPTY_PARTICIPANT);
      setGameState('generalIntro');
    }
  };

  const continueToProfile = () => {
    if (!selectedCollection || !selectedBase) return;
    if (isGeneralQuiz) {
      setGameState('generalIntro');
      return;
    }

    setGameState('profile');
  };

  const handleParticipantChange = (field: keyof ParticipantForm, value: string) => {
    setParticipant((current) => ({ ...current, [field]: value }));
  };

  const startQuiz = () => {
    if (!selectedCollection || !selectedBase || !isParticipantValid) return;
    setLoadError(null);

    const missingQuestionGroups = getQuestionShortage(selectedCollection, DEFAULT_ROUND_REQUIREMENTS);
    if (missingQuestionGroups.length > 0) {
      setLoadError('A coleção selecionada não tem perguntas suficientes para formar a rodada.');
      return;
    }

    const questions = shuffle<RoundQuestion>(
      selectRoundQuestions(selectedCollection, DEFAULT_ROUND_REQUIREMENTS, selectedBase.scoringEnabled),
    );

    selectedAnswerRef.current = null;
    isAnswerCheckedRef.current = false;
    answerHistoryRef.current = [];
    roundStartedAtRef.current = Date.now();
    setCurrentQuizQuestions(questions);
    setCurrentQuestionIndex(0);
    setScore(0);
    setCorrectAnswers(0);
    setSelectedAnswer(null);
    setIsAnswerChecked(false);
    setTimeLeft(SECONDS_PER_QUESTION);
    setGameState('playing');
  };

  const recordQuestionResult = (question: RoundQuestion, answer: string | null) => {
    const isCorrect = answer === question.resposta_correta;
    answerHistoryRef.current = [
      ...answerHistoryRef.current,
      {
        questionId: question.id,
        questionText: question.pergunta,
        difficulty: question.nivel,
        points: getQuestionPoints(question),
        selectedAnswer: answer,
        correctAnswer: question.resposta_correta,
        isCorrect,
        answeredAt: new Date().toISOString(),
      },
    ];

    return isCorrect;
  };

  const finalizeAnswer = (answer: string | null) => {
    if (isAnswerCheckedRef.current || !currentQuestion) return;

    isAnswerCheckedRef.current = true;
    setIsAnswerChecked(true);

    if (recordQuestionResult(currentQuestion, answer)) {
      setScore((current) => current + getQuestionPoints(currentQuestion));
      setCorrectAnswers((current) => current + 1);
    }
  };

  const advanceAfterTimeout = () => {
    if (!isAnswerCheckedRef.current && currentQuestion) {
      recordQuestionResult(currentQuestion, null);
    }

    selectedAnswerRef.current = null;
    isAnswerCheckedRef.current = false;
    setSelectedAnswer(null);
    setIsAnswerChecked(false);

    if (currentQuestionIndex < currentQuizQuestions.length - 1) {
      setCurrentQuestionIndex((current) => current + 1);
      setTimeLeft(SECONDS_PER_QUESTION);
      return;
    }

    finishQuiz();
  };

  useEffect(() => {
    if (gameState !== 'playing' || isAnswerChecked || !currentQuestion) return undefined;

    setTimeLeft(SECONDS_PER_QUESTION);
    const intervalId = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          window.setTimeout(advanceAfterTimeout, 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [gameState, currentQuestionIndex, isAnswerChecked, currentQuestion]);

  const handleAnswerSelect = (answer: string) => {
    if (isAnswerCheckedRef.current) return;
    selectedAnswerRef.current = answer;
    setSelectedAnswer(answer);
    finalizeAnswer(answer);
  };

  const getFinalAttemptStats = () => {
    return answerHistoryRef.current.reduce(
      (stats, answer) => {
        if (!answer.isCorrect) return stats;
        return {
          score: stats.score + answer.points,
          correctAnswers: stats.correctAnswers + 1,
        };
      },
      { score: 0, correctAnswers: 0 },
    );
  };

  const persistAttemptToBackend = async (
    durationSeconds: number,
    finishedAt: string,
    finalScore: number,
    finalCorrectAnswers: number,
  ) => {
    if (!selectedCollection || !selectedBase?.storesResults) return;

    const payload: SaveAttemptPayload = {
      versionId: 'standard',
      versionHash: null,
      collectionId: selectedCollection.id,
      participant: {
        fullName: participant.nomeCompleto,
        email: participant.email,
        henkelArea: participant.area,
        gender: participant.genero as SaveAttemptPayload['participant']['gender'],
        sweatshirtSize: participant.tamanhoMoletom as SaveAttemptPayload['participant']['sweatshirtSize'],
      },
      attempt: {
        scorePoints: finalScore,
        correctAnswers: finalCorrectAnswers,
        totalQuestions: currentQuizQuestions.length,
        durationSeconds,
        startedAt: new Date(roundStartedAtRef.current).toISOString(),
        finishedAt,
      },
      answers: answerHistoryRef.current,
    };

    try {
      await saveQuizAttempt(payload);
    } catch (error) {
      console.error('Error saving quiz attempt to API:', error);
    }
  };

  const finishQuiz = () => {
    if (!selectedCollection) return;

    const now = new Date().toISOString();
    const finalElapsedSeconds = Math.max(1, Math.round((Date.now() - roundStartedAtRef.current) / 1000));
    const finalStats = getFinalAttemptStats();
    if (!selectedBase?.storesResults) {
      setGameState('finished');
      return;
    }

    void persistAttemptToBackend(finalElapsedSeconds, now, finalStats.score, finalStats.correctAnswers);
    const entryId = `${selectedCollection.id}:${normalizeEmail(participant.email)}`;
    const previousEntry = ranking.find((entry) => entry.id === entryId);
    const attemptNumber = (previousEntry?.tentativas || 0) + 1;
    const candidate: RankingEntry = {
      ...participant,
      id: entryId,
      collectionId: selectedCollection.id,
      collectionName: selectedCollection.nome,
      pontos: finalStats.score,
      acertos: finalStats.correctAnswers,
      totalPerguntas: currentQuizQuestions.length,
      tentativas: attemptNumber,
      tempoTotal: finalElapsedSeconds,
      createdAt: previousEntry?.createdAt || now,
      updatedAt: now,
    };
    const nextRanking = previousEntry
      ? ranking.map((entry) => {
          if (entry.id !== entryId) return entry;
          if (isBetterResult(candidate, entry)) return candidate;
          return {
            ...entry,
            ...participant,
            tentativas: attemptNumber,
            updatedAt: now,
          };
        })
      : [...ranking, candidate];

    setRanking(nextRanking);
    window.localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(nextRanking));
    setGameState('finished');
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < currentQuizQuestions.length - 1) {
      selectedAnswerRef.current = null;
      isAnswerCheckedRef.current = false;
      setCurrentQuestionIndex((current) => current + 1);
      setSelectedAnswer(null);
      setIsAnswerChecked(false);
      setTimeLeft(SECONDS_PER_QUESTION);
      return;
    }

    finishQuiz();
  };

  const handleProfileSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isParticipantValid) return;
    if (isGeneralQuiz) {
      setGameState('ready');
      return;
    }
    setGameState('ready');
  };

  return (
    <main className="quiz-shell">
      <AnimatePresence mode="wait">
        {gameState === 'collection' && (
          <Screen background="/reference-layout/collection-v2.png" screenKey="collection" className="collection-screen">
            <>
              <div className="collection-picker" aria-label="Escolha a coleção de perguntas">
                {selectableCollections.map((collection) => {
                  const summary = getDifficultySummary(collection);
                  const selected = selectedCollectionId === collection.id;

                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => handleCollectionSelect(collection.id)}
                      className={`collection-choice ${selected ? 'is-selected' : ''}`}
                    >
                      <span>{getCollectionLabel(collection.nome)}</span>
                      <small>
                        {summary.facil}/{summary.medio}/{summary.dificil}
                      </small>
                    </button>
                  );
                })}
              </div>
            </>

            {loadError && <p className="layout-error collection-error">{loadError}</p>}

            <button
              type="button"
              onClick={continueToProfile}
              disabled={!selectedCollection}
              className="landing-start"
              aria-label="Iniciar quiz"
            >
              INICIAR
            </button>
          </Screen>
        )}

        {gameState === 'generalIntro' && selectedCollection && isGeneralQuiz && (
          <Screen background="/reference-layout/general-intro.png" screenKey="general-intro" className="general-intro-screen">
            <button
              type="button"
              onClick={() => setGameState('profile')}
              className="general-intro-start"
              aria-label="Iniciar quiz"
            >
              INICIAR
            </button>
          </Screen>
        )}

        {gameState === 'profile' && selectedCollection && selectedBase?.requiresParticipant && (
          <Screen
            background={isGeneralQuiz ? '/reference-layout/general-profile-v3.png' : '/reference-layout/profile-v3.png'}
            screenKey="profile"
            className={`profile-screen ${isGeneralQuiz ? 'general-profile-screen' : ''}`}
          >
            <form onSubmit={handleProfileSubmit} className="profile-form">
              <input
                value={participant.nomeCompleto}
                onChange={(event) => handleParticipantChange('nomeCompleto', event.target.value)}
                className="profile-input name-input"
                aria-label="Nome completo"
                autoComplete="name"
                required
              />

              <input
                type="email"
                value={participant.email}
                onChange={(event) => handleParticipantChange('email', event.target.value)}
                className="profile-input email-input"
                aria-label="E-mail"
                autoComplete="email"
                required
              />

              <div className="gender-options" role="radiogroup" aria-label="Gênero">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={participant.genero === option.value}
                    onClick={() => handleParticipantChange('genero', option.value)}
                    className={`segmented-control ${participant.genero === option.value ? 'is-selected' : ''}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="size-options" role="radiogroup" aria-label="Tamanho do moletom">
                {SHIRT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={participant.tamanhoMoletom === size}
                    onClick={() => handleParticipantChange('tamanhoMoletom', size)}
                    className={`segmented-control ${participant.tamanhoMoletom === size ? 'is-selected' : ''}`}
                  >
                    {size}
                  </button>
                ))}
              </div>

              <p className="privacy-note">Seus dados serão usados apenas para viabilizar sua participação no game.</p>

              {loadError && <p className="layout-error profile-error">{loadError}</p>}

              <button type="submit" disabled={!isParticipantValid} className="ok-button">
                OK
              </button>
            </form>
          </Screen>
        )}

        {gameState === 'ready' && selectedCollection && selectedBase?.requiresParticipant && (
          <Screen
            background={isGeneralQuiz ? '/reference-layout/general-ready-v3.png' : '/reference-layout/ready-v2.png'}
            screenKey="ready"
            className={`ready-screen ${isGeneralQuiz ? 'general-ready-screen' : ''}`}
          >
            <button type="button" onClick={startQuiz} className="ready-ok-button" aria-label="Começar quiz">
              OK
            </button>
          </Screen>
        )}

        {gameState === 'playing' && currentQuestion && (
          <Screen
            background="/reference-layout/question-v2.png"
            screenKey={`question-${currentQuestion.id}`}
            className="question-screen"
          >
            <div className="question-progress" aria-hidden="true">
              <span style={{ width: `${progressPercentage}%` }} />
            </div>
            <div className="question-meta">
              <span>{DIFFICULTY_META[currentQuestion.nivel].label}</span>
              {selectedBase?.scoringEnabled && <span>{getQuestionPoints(currentQuestion)} pts</span>}
              <span>{timeLeft}s</span>
            </div>

            <h1 className="question-count">Pergunta #{currentQuestionIndex + 1}</h1>
            <div className="question-timer" aria-label={`Tempo restante: ${timeLeft} segundos`}>
              {timeLeft}s
            </div>
            <p className="question-copy">{currentQuestion.pergunta}</p>

            <div className="answer-grid">
              {currentQuestion.alternativas.map((alternative) => {
                const isSelected = selectedAnswer === alternative;
                const isCorrect = alternative === currentQuestion.resposta_correta;
                const checkedClass = isAnswerChecked
                  ? isCorrect
                    ? 'is-correct'
                    : isSelected
                      ? 'is-wrong'
                      : 'is-muted'
                  : '';

                return (
                  <button
                    key={`${currentQuestion.id}-${alternative}`}
                    type="button"
                    onClick={() => handleAnswerSelect(alternative)}
                    disabled={isAnswerChecked}
                    className={`answer-button ${checkedClass} ${getAnswerSizeClass(alternative)}`}
                  >
                    {alternative}
                  </button>
                );
              })}
            </div>

            {isAnswerChecked && (
              <>
                <p className="answer-feedback">
                  {selectedAnswer
                    ? `Resposta correta: ${currentQuestion.resposta_correta}`
                    : `Tempo esgotado. Resposta correta: ${currentQuestion.resposta_correta}`}
                </p>
                <button type="button" onClick={nextQuestion} className="next-button">
                  {currentQuestionIndex < currentQuizQuestions.length - 1 ? 'PRÓXIMA' : 'RESULTADO'}
                </button>
              </>
            )}
          </Screen>
        )}

        {gameState === 'finished' && selectedCollection && (
          <Screen
            background={isGeneralQuiz ? '/reference-layout/general-result.png' : '/reference-layout/result-v2.png'}
            screenKey="finished"
            className={`result-screen ${isGeneralQuiz ? 'general-result-screen' : ''}`}
          >
            {!isGeneralQuiz && (
              <div className="result-logo" aria-hidden="true">
                <span>150 ANOS =</span>
                <strong>150 MOLETONS!</strong>
              </div>
            )}
            {!isGeneralQuiz && <h1 className="result-title">PONTUAÇÃO</h1>}
            {selectedBase?.scoringEnabled ? (
              <>
                <div className="score-bar">{score} Pontos</div>
                <div className="time-bar">Tempo: {formatClock(elapsedSeconds)}</div>
              </>
            ) : (
              <div className="score-bar">Quiz finalizado</div>
            )}
          </Screen>
        )}
      </AnimatePresence>
    </main>
  );
}
