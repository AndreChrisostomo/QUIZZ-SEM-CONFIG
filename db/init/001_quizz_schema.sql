CREATE TABLE IF NOT EXISTS quiz_collections (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO quiz_collections (id, name)
VALUES
  ('ipe-icj', 'IPÊ & ICJ'),
  ('fabrica-jundiai', 'FÁBRICA JUNDIAÍ'),
  ('fabrica-itapevi', 'FÁBRICA ITAPEVI')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name;

CREATE TABLE IF NOT EXISTS quiz_participants (
  id bigserial PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  henkel_area text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('Masculino', 'Feminino', 'Outro')),
  sweatshirt_size text NOT NULL CHECK (sweatshirt_size IN ('P', 'M', 'G', 'GG')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id bigserial PRIMARY KEY,
  participant_id bigint NOT NULL REFERENCES quiz_participants(id) ON DELETE CASCADE,
  collection_id text NOT NULL REFERENCES quiz_collections(id),
  score_points integer NOT NULL CHECK (score_points >= 0),
  correct_answers integer NOT NULL CHECK (correct_answers >= 0),
  total_questions integer NOT NULL CHECK (total_questions > 0),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  started_at timestamptz,
  finished_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id bigserial PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  question_text text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('facil', 'medio', 'dificil')),
  points integer NOT NULL CHECK (points > 0),
  selected_answer text,
  correct_answer text NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_attempts_ranking_idx
  ON quiz_attempts (collection_id, score_points DESC, duration_seconds ASC);

CREATE INDEX IF NOT EXISTS quiz_attempts_participant_idx
  ON quiz_attempts (participant_id, finished_at DESC);

CREATE OR REPLACE VIEW quiz_ranking AS
SELECT
  best.collection_id,
  best.collection_name,
  best.participant_id,
  best.full_name,
  best.email,
  best.henkel_area,
  best.gender,
  best.sweatshirt_size,
  best.score_points,
  best.correct_answers,
  best.total_questions,
  best.attempt_count,
  best.duration_seconds,
  best.finished_at
FROM (
  SELECT
    attempts.collection_id,
    collections.name AS collection_name,
    participants.id AS participant_id,
    participants.full_name,
    participants.email,
    participants.henkel_area,
    participants.gender,
    participants.sweatshirt_size,
    attempts.score_points,
    attempts.correct_answers,
    attempts.total_questions,
    count(*) OVER (PARTITION BY attempts.participant_id, attempts.collection_id) AS attempt_count,
    attempts.duration_seconds,
    attempts.finished_at,
    row_number() OVER (
      PARTITION BY attempts.participant_id, attempts.collection_id
      ORDER BY
        attempts.score_points DESC,
        attempts.duration_seconds ASC,
        attempts.correct_answers DESC,
        attempts.finished_at ASC
    ) AS rank_position
  FROM quiz_attempts attempts
  INNER JOIN quiz_participants participants ON participants.id = attempts.participant_id
  INNER JOIN quiz_collections collections ON collections.id = attempts.collection_id
) best
WHERE best.rank_position = 1
ORDER BY
  best.collection_id,
  best.score_points DESC,
  best.duration_seconds ASC,
  best.correct_answers DESC;

CREATE OR REPLACE VIEW quiz_ranking_by_sweatshirt_size AS
SELECT
  row_number() OVER (
    PARTITION BY collection_id, sweatshirt_size
    ORDER BY score_points DESC, duration_seconds ASC, correct_answers DESC, finished_at ASC
  ) AS ranking_position,
  collection_id,
  collection_name,
  sweatshirt_size,
  participant_id,
  full_name,
  email,
  henkel_area,
  gender,
  score_points,
  correct_answers,
  total_questions,
  attempt_count,
  duration_seconds,
  finished_at
FROM quiz_ranking
ORDER BY
  collection_id,
  sweatshirt_size,
  ranking_position;

CREATE OR REPLACE VIEW ranking_base_ipe_icj AS
SELECT
  row_number() OVER (
    ORDER BY score_points DESC, duration_seconds ASC, correct_answers DESC, finished_at ASC
  ) AS ranking_position,
  collection_id,
  collection_name,
  participant_id,
  full_name,
  email,
  henkel_area,
  gender,
  sweatshirt_size,
  score_points,
  correct_answers,
  total_questions,
  attempt_count,
  duration_seconds,
  finished_at
FROM quiz_ranking
WHERE collection_id = 'ipe-icj'
ORDER BY ranking_position;

CREATE OR REPLACE VIEW ranking_base_paulista AS
SELECT
  row_number() OVER (
    ORDER BY score_points DESC, duration_seconds ASC, correct_answers DESC, finished_at ASC
  ) AS ranking_position,
  collection_id,
  collection_name,
  participant_id,
  full_name,
  email,
  henkel_area,
  gender,
  sweatshirt_size,
  score_points,
  correct_answers,
  total_questions,
  attempt_count,
  duration_seconds,
  finished_at
FROM quiz_ranking
WHERE collection_id = 'fabrica-jundiai'
ORDER BY ranking_position;

CREATE OR REPLACE VIEW ranking_base_planta AS
SELECT
  row_number() OVER (
    ORDER BY score_points DESC, duration_seconds ASC, correct_answers DESC, finished_at ASC
  ) AS ranking_position,
  collection_id,
  collection_name,
  participant_id,
  full_name,
  email,
  henkel_area,
  gender,
  sweatshirt_size,
  score_points,
  correct_answers,
  total_questions,
  attempt_count,
  duration_seconds,
  finished_at
FROM quiz_ranking
WHERE collection_id = 'fabrica-itapevi'
ORDER BY ranking_position;
