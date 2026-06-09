# Codebase Map

## 1. Project Identity

### What this project is

Henkel 150 anos quiz app. This duplicated variant has a single base-selection flow with only `IPÊ & ICJ`, `Paulista`, and `Planta`. These bases collect participant data, run a scored 5-question quiz, save completed attempts to PostgreSQL, and can still export rankings through the backend API, but the visible share/configuration buttons were removed from the quiz start screen.

### App type

Web app: React single-page frontend plus Express API backend.

### Main languages

- TypeScript / TSX
- TypeScript backend
- CSS
- YAML
- SQL

### Main frameworks/libraries

- React 19
- Vite 6
- Tailwind CSS 4 via `@tailwindcss/vite`
- `js-yaml` for quiz data
- `lucide-react` for icons
- `motion/react` for screen transitions
- Express
- `pg`
- Vitest and Supertest

### Package/build system

Node.js project using npm. `package-lock.json` is present, so prefer npm commands.

### Runtime requirements

- Node.js and npm
- Docker Desktop / Docker Compose for the full local stack
- PostgreSQL for persistence and DB integration tests

---

## 2. How To Work With This Project

### Install command

```txt
npm install
```

### Run command

```txt
npm run dev
npm run api:dev
docker compose up -d --build
```

Vite runs on port `3000`; the API runs on port `3001`; Docker exposes the app at `http://localhost` on host port `80`.

### Build command

```txt
npm run build
```

### Test command

```txt
npm run test
npm run test:db
```

DB integration tests require:

```txt
TEST_DATABASE_URL=postgresql://quizz_app:quizz_app_password@localhost:5432/quizz
```

### Lint/typecheck command

```txt
npm run lint
```

### Important environment variables

- `APP_PORT`: host port for Dockerized app, default `80`.
- `PORT`: backend API port, default `3001`.
- `API_PROXY_TARGET`: Vite dev proxy target for `/api`.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`: Docker PostgreSQL settings.
- `DATABASE_URL`: backend PostgreSQL connection string.
- `TEST_DATABASE_URL`: PostgreSQL URL for DB integration tests.
- `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`, `PGADMIN_PORT`: pgAdmin settings.
- `RANKING_EXPORT_URL`: remote upload URL; production should point to the separate listener server such as `http://henkel-totem.novaxd.com.br:8080/rankings/upload`. Local Docker testing can point to `http://host.docker.internal:8080/rankings/upload` when the standalone Desktop listener is running.
- `RANKING_EXPORT_SECRET`: required shared secret for HMAC signing; if missing, `/api/rankings/export` returns 503.
- `RANKING_EXPORT_KEY_ID`: key identifier sent with upload headers.
- `RANKING_EXPORT_TIMEOUT_MS`: remote upload timeout.
- Listener-side variables live in the separate `C:\Users\achri\Desktop\henkel-ranking-listener` project, not in this quiz app. The totem quiz should use `RANKING_EXPORT_KEY_ID=henkel-quiz-totem`; the website copy should use `RANKING_EXPORT_KEY_ID=henkel-quiz-website` so the listener writes to separate folders.
- `GEMINI_API_KEY`: still documented from the original AI Studio template, but current quiz flow does not call Gemini.

### Local development notes

- App URL: `http://localhost`.
- pgAdmin URL: `http://localhost:5050`, login `admin@henkel.com` / `admin`.
- PostgreSQL connection: `postgresql://quizz_app:quizz_app_password@localhost:5432/quizz`.
- API health: `http://localhost/api/health` in Docker or `http://localhost:3001/api/health` in Node dev.
- Standalone ranking receiver lives outside this repo at `C:\Users\achri\Desktop\henkel-ranking-listener` and runs as its own Docker service on port `8080`.
- Docker `app` service must build Docker target `runtime`; otherwise Docker uses the final API stage and nothing listens on container port 80.
- Docker container healthchecks use `127.0.0.1` internally to avoid IPv6 `localhost` resolution issues in Alpine containers.
- SQL files under `db/init` run only when the PostgreSQL Docker volume is first created. For an existing DB, apply changed SQL manually or reset the DB volume intentionally.

---

## 3. Architecture Overview

### High-level architecture

React SPA plus Express API. The frontend owns quiz state, rendering, participant form, scoring, timer behavior, and the export button. The backend owns validation, persistence, ranking CSV generation, and secure remote upload.

### Entry points

- `index.html`: browser shell.
- `src/main.tsx`: React root.
- `src/App.tsx`: main quiz UI/state machine.
- `src/api/attempts.ts`: frontend attempt persistence client.
- `src/api/rankingExport.ts`: frontend export trigger client.
- `src/api/admin.ts`: frontend admin reset client.
- `server/index.ts`: API process entrypoint.
- `server/app.ts`: Express routes.
- `server/admin.ts`: admin Basic Auth helpers and database reset service.
- `server/attemptRepository.ts`: attempt persistence.
- `server/rankingExporter.ts`: ranking CSV generation and signed upload.
- `db/init/001_quizz_schema.sql`: schema and ranking views.

### Main execution flow

1. Browser loads `http://localhost`.
2. React parses `src/questions.yaml`.
3. The app shows base selection for `IPÊ & ICJ`, `Paulista`, and `Planta`.
4. For all available bases, the user enters participant data.
5. After participant data, scored bases show a V2 rules/ready screen with an invisible OK hitbox over the baked OK button.
6. The quiz selects exactly 5 random questions: 1 easy, 2 medium, and 2 hard.
7. Scored bases normalize points so the 5 questions sum to 100.
8. Each question has a 30-second timer. Timeout advances to the next question with zero points for that question.
9. After the final question, scored bases save the attempt to `/api/attempts`.
10. The backend validates, upserts participant by normalized email, inserts attempt, inserts answers, and commits in one transaction.
11. The result screen shows points and elapsed time for scored bases, then returns after 10 seconds of inactivity to the participant form while keeping the selected base.
12. `/api/rankings/export` remains available through the backend, but the visible share button is removed in this duplicated variant.
13. The backend reads `ranking_base_ipe_icj`, `ranking_base_paulista`, and `ranking_base_planta`, creates three CSV files, signs a manifest with HMAC-SHA256, and POSTs to `RANKING_EXPORT_URL`.
14. A separate Dockerized listener project validates upload headers, timestamp freshness, nonce replay, manifest hash, HMAC signature, expected CSV names, and CSV hashes before accepting the multipart payload, then writes accepted CSVs and `manifest.json` to its configured upload directory.
15. `/admin` renders a separate admin page with a return button linking back to `/`. It sends Basic Auth credentials to `/api/admin/reset-database`; the backend compares them with the configured admin credentials (`admin@henkel.com` / `admin`) and requires the body confirmation `RESETAR BANCO` before truncating participant/attempt data.

### Data flow

Question YAML -> React state -> answer history -> `/api/attempts` -> PostgreSQL tables -> ranking views -> `/api/rankings/export` -> three CSV files -> signed POST to the remote upload app. `/admin` can call the backend reset endpoint to clear `quiz_participants`, `quiz_attempts`, and `quiz_attempt_answers` while preserving schema, collections, and views.

### State management

Local React state in `src/App.tsx`. Browser `localStorage` is only a local fallback/history under `henkel-150-ranking`; PostgreSQL is the durable source for analysis.

### Persistence/storage

PostgreSQL tables:

- `quiz_collections`
- `quiz_participants`
- `quiz_attempts`
- `quiz_attempt_answers`

Views:

- `quiz_ranking`
- `quiz_ranking_by_sweatshirt_size`
- `ranking_base_ipe_icj`
- `ranking_base_paulista`
- `ranking_base_planta`

### External integrations

- Remote ranking receiver at `RANKING_EXPORT_URL`.
- Upload authentication uses HMAC headers; secrets are server-side only.
- Separate listener project at `C:\Users\achri\Desktop\henkel-ranking-listener`; it defaults to port `8080` and expects the same HMAC formula as `server/rankingExporter.ts`.

---

## 4. Directory Map

### `src/`

Purpose: React app and quiz data.

Important files:

- `src/App.tsx`: quiz flow, scoring, timer, participant form, base selection, share/export button.
- `src/questions.yaml`: static question bank.
- `src/index.css`: reference-layout CSS and export button styling.
- `src/api/attempts.ts`: POST `/api/attempts`.
- `src/api/rankingExport.ts`: POST `/api/rankings/export`.
- `src/api/admin.ts`: POST `/api/admin/reset-database`.

Common reasons to edit: quiz behavior, UI layout, questions, frontend API payloads, admin page behavior.

### `server/`

Purpose: Express API and PostgreSQL integration.

Important files:

- `server/app.ts`: `/api/health`, `/api/attempts`, `/api/rankings/export`.
- `server/admin.ts`: `/admin` credential validation helpers and PostgreSQL reset service.
- `server/attemptRepository.ts`: transactional attempt persistence.
- `server/rankingExporter.ts`: reads ranking views, builds CSV, signs and uploads multipart request.
- `server/validation.ts`: payload validation.
- `server/db.ts`: PostgreSQL pool config.
- `server/types.ts`: API and service contracts.

### `db/`

Purpose: local PostgreSQL schema and pgAdmin setup.

Important files:

- `db/init/001_quizz_schema.sql`: tables, indexes, general ranking views, and base-specific ranking views.
- `db/pgadmin/servers.json`: pgAdmin preconfigured local server.

### Root files

Important files:

- `Dockerfile`: multi-stage frontend/API build.
- `docker-compose.yml`: app, API, postgres, pgAdmin services.
- `nginx.conf`: frontend static server and `/api` proxy.
- `.env.example`: documented environment variables, including ranking export security.
- `README.md`: setup and operational instructions.

---

## 5. Feature Map

### Feature: Base Selection

User-facing meaning: first screen lets the user choose `IPÊ & ICJ`, `Paulista`, or `Planta`. Visible export and admin/settings shortcuts are removed in this duplicated variant.

Related files:

- `src/App.tsx`
- `src/questions.yaml`
- `src/index.css`

State/data involved:

- `collections`
- `selectableCollections`
- `selectedCollectionId`

Edge cases:

- If a base lacks 1 easy, 2 medium, and 2 hard questions, the app shows an error and does not start.

### Feature: Participant Form

User-facing meaning: collects name, email, Henkel area, gender, and sweatshirt size for `IPÊ & ICJ`, `Paulista`, and `Planta`.

Related files:

- `src/App.tsx`
- `src/index.css`

Notes:

- The visual reference does not show the area field; the app keeps `area` as `Não informado`.
- All visible bases use this form.

### Feature: Question Answering

User-facing meaning: answer 5 timed questions, see feedback, continue to result.

Rules:

- 1 easy, 2 medium, 2 hard.
- Max score is always 100.
- 30 seconds per question.
- Timeout advances with `selectedAnswer: null` and zero points for that question.
- Every visible base uses 1 easy, 2 medium, and 2 hard.

Related files:

- `src/App.tsx`
- `src/questions.yaml`

### Feature: Attempt Persistence

User-facing meaning: completed attempts are stored for later analysis.

Internal meaning:

- Frontend posts `versionId: "standard"`, `versionHash: null`, selected base, participant data, attempt summary, and answer history.
- Backend saves participant, attempt, and answers in one transaction.
- All visible quiz completions call `/api/attempts`.

Related files:

- `src/api/attempts.ts`
- `server/app.ts`
- `server/validation.ts`
- `server/attemptRepository.ts`
- `db/init/001_quizz_schema.sql`

### Feature: Ranking Export

User-facing meaning: small top-left share icon exports rankings.

Internal meaning:

- Frontend posts to `/api/rankings/export`.
- Backend reads three views, generates three CSV files, signs a manifest with `RANKING_EXPORT_SECRET`, and posts multipart form data to `RANKING_EXPORT_URL`.
- The separate Desktop listener project accepts `POST /rankings/upload`, validates the signed upload, and stores accepted CSVs.
- The endpoint does not accept arbitrary file input from the browser; it only uploads CSV files generated from local DB views.

Related files:

- `src/App.tsx`
- `src/api/rankingExport.ts`
- `server/app.ts`
- `server/rankingExporter.ts`
- `.env.example`
- `docker-compose.yml`

Security contract:

- Headers: `X-Henkel-Key-Id`, `X-Henkel-Timestamp`, `X-Henkel-Nonce`, `X-Henkel-Manifest-SHA256`, `X-Henkel-Signature`.
- Signature formula: `HMAC_SHA256(secret, timestamp + "." + nonce + "." + manifest_sha256)`.
- Receiver rejects stale/future timestamps, replayed nonces, invalid signatures, manifest hash mismatches, CSV hashes that do not match the manifest, missing expected CSVs, duplicate files, unsafe file names, and names outside the three ranking CSVs.

### Feature: Admin Database Reset

User-facing meaning: `/admin` lets an operator reset saved quiz data from a browser and return to the quiz start screen.

Internal meaning:

- Frontend collects admin username/password and asks for browser confirmation.
- Frontend posts `Authorization: Basic ...` and `{ confirmation: "RESETAR BANCO" }` to `/api/admin/reset-database`.
- Backend validates credentials against `admin@henkel.com` / `admin`.
- Backend truncates only `quiz_attempt_answers`, `quiz_attempts`, and `quiz_participants` with `RESTART IDENTITY CASCADE`.
- Backend preserves schema, `quiz_collections`, ranking views, and export configuration.

Related files:

- `src/App.tsx`
- `src/api/admin.ts`
- `src/index.css`
- `server/app.ts`
- `server/admin.ts`
- `server/types.ts`

Tests:

- `tests/api/attempts.test.ts`
- `src/api/admin.test.ts`

Known risks:

- This is intentionally destructive for participant/attempt data. Do not call the live endpoint in tests unless the test database is disposable.

---

## 6. Module Map

### Module: React App Component

Related file: `src/App.tsx`

Purpose: main state machine and UI renderer.

Common modification points:

- `BASE_CONFIGS` for base choices, collection composition, participant requirement, scoring, and persistence flags.
- `DEFAULT_ROUND_REQUIREMENTS` for quiz composition.
- `SCORE_TARGET` and `SECONDS_PER_QUESTION` for scoring/timer.
- `FINISHED_RESET_DELAY_MS` for automatic return timing from the final screen.
- `handleRankingExport` for export-button behavior.
- The admin return button links back to `/`; the base-selection settings shortcut is removed in this duplicated variant.

Known risks:

- Most frontend behavior is centralized here; edit narrowly and re-run lint/build.

### Module: Backend API

Related files:

- `server/app.ts`
- `server/validation.ts`
- `server/attemptRepository.ts`
- `server/rankingExporter.ts`

Public API:

- `GET /api/health`
- `POST /api/attempts`
- `POST /api/rankings/export`
- `POST /api/admin/reset-database`

Known risks:

- `POST /api/rankings/export` requires `RANKING_EXPORT_SECRET`; without it, it must fail closed with 503.
- `POST /api/admin/reset-database` requires valid admin credentials and explicit confirmation; it truncates saved participant/attempt data.

- Receiver fails closed when no upload/export shared secret is configured.

### Module: PostgreSQL Schema

Related file: `db/init/001_quizz_schema.sql`

Purpose: create tables, indexes, ranking views, and base-specific export views.

Known risks:

- SQL init scripts do not rerun on existing Docker volumes unless applied manually or the volume is reset.

### Module: Docker Compose Stack

Related files:

- `Dockerfile`
- `docker-compose.yml`
- `nginx.conf`

Purpose: one-command runtime for app, API, PostgreSQL, and pgAdmin.

Known risks:

- `app` build target must remain `runtime`.
- API export env vars are on the `api` service, not the frontend.

---

## 7. Glossary

### Term: Base

Means: quiz question collection chosen on the first screen.

Current bases:

- `ipe-icj` -> `IPÊ & ICJ`
- `fabrica-jundiai` -> `Paulista`
- `fabrica-itapevi` -> `Planta`

### Term: standard

Means: current single quiz flow `versionId` stored in the attempt payload. Old URL-hash versions are removed.

### Term: ranking_base_ipe_icj

Means: PostgreSQL view for IPÊ & ICJ ranking.

### Term: ranking_base_paulista

Means: PostgreSQL view for Paulista ranking.

### Term: ranking_base_planta

Means: PostgreSQL view for Planta ranking.

---

## 8. Commands

### Development

```txt
npm install
npm run dev
npm run api:dev
docker compose up -d --build
```

### Testing

```txt
npm run lint
npm run test
$env:TEST_DATABASE_URL="postgresql://quizz_app:quizz_app_password@localhost:5432/quizz"; npm run test:db
```

### Build

```txt
npm run build
```

### Docker

```txt
docker compose up -d --build
docker compose logs -f app api postgres pgadmin
docker compose down
docker compose down -v
```

### Database

```txt
npm run db:up
npm run db:down
npm run db:logs
npm run db:psql
npm run db:reset
```

---

## 9. Conventions

### API conventions

- Backend routes live under `/api`.
- Frontend API wrappers live under `src/api/`.
- Attempt payloads use `versionId: "standard"` and `versionHash: null`.

### Styling conventions

- Kiosk UI is based on fixed 16:9 reference PNGs.
- Use absolute-positioned hitboxes over reference artwork for desktop.
- The base-selection screen uses `public/reference-layout/collection-v2.png`, copied from `REFERENCIA LAYOUT V2/HENKEL/150 ANOS = 150 MOLETONS!/pngs/6.png`; unlike the older baked reference, the `INICIAR` button is a real visible red button rendered in CSS.
- In this duplicated 3-base variant, `.collection-picker` uses a centered 3-column grid so `IPÊ & ICJ`, `Paulista`, and `Planta` stay centered over the sweatshirt artwork.
- The profile/data-collection screen uses `public/reference-layout/profile-v3.png`, copied from `REFERENCIA LAYOUT V3/2.png`; the privacy footnote is rendered manually because it is not baked into that artwork.
- The saved-base profile OK hitbox is sized to the full baked red OK rectangle in `profile-v3.png`, not just the visible text.
- The post-profile ready screen uses `public/reference-layout/ready-v2.png`, copied from V2 `3.png`, with a transparent `.ready-ok-button` over the baked OK artwork.
- The question screen uses `public/reference-layout/question-v2.png`, copied from V2 `13.png`.
- The result screen uses `public/reference-layout/result-v2.png`, copied from V2 `16.png`, and renders logo/title/score/time to match `REFERENCIA LAYOUT V2/HENKEL/150 ANOS = 150 MOLETONS!/Guia/5.png`.
- `Quiz Geral` assets may still exist in `public/reference-layout`, but the base is not selectable in this duplicated variant.
- The visible export/share and settings buttons are intentionally removed from the base-selection screen in this duplicated variant.

### Security conventions

- Never expose `RANKING_EXPORT_SECRET` to frontend code.
- Remote upload receiver must verify HMAC headers before accepting files.
- Export endpoint generates CSVs from DB views only; it must not accept browser-provided files.
- Admin reset must validate credentials server-side and require explicit confirmation. Current credentials are `admin@henkel.com` / `admin`.

---

## 10. Known Risks And Traps

- `src/App.tsx` is the main behavior hotspot.
- Correct-answer checking is exact string comparison.
- SQL view changes require a fresh DB volume or manual SQL application.
- `RANKING_EXPORT_SECRET` must match the remote receiver; missing secret fails export with 503.
- The remote URL path defaults to `/rankings/upload`; override `RANKING_EXPORT_URL` if the receiving app exposes a different route.
- The remote receiver must enforce timestamp freshness and nonce replay protection.
- Docker app must build target `runtime`.
- Do not put upload secrets in Vite/client env.
- `/admin` reset preserves schema and collections but deletes all saved participants, attempts, and answers.

---

## 11. Map Maintenance Log

### Last updated

Date: 2026-06-09

### What changed

Duplicated the project to `C:\Users\achri\Desktop\QUIZZ-SEM-CONFIG`, removed the visible ranking share button, removed the visible settings/admin shortcut button from the quiz start screen, and removed `Quiz Geral` from selectable bases.

Centered the three base-selection buttons by changing the collection picker from the old 4-column layout to a 3-column centered grid.

Changed `/admin` reset authentication from PostgreSQL credentials to fixed admin credentials: `admin@henkel.com` / `admin`.

Added a return button on `/admin` that links back to `/` and a settings button on the quiz base-selection screen that links to `/admin`.

Added a protected `/admin` page and `POST /api/admin/reset-database` endpoint. The endpoint uses Basic Auth, requires the confirmation token `RESETAR BANCO`, and truncates participant/attempt/answer data while preserving schema and question collections.

Changed the base-selection screen background to the V2 Henkel `6.png` artwork and documented that the start button is rendered visibly in CSS because this artwork has no baked-in start button.

Changed the question screen to V2 `13.png`, the result screen to V2 `16.png`, and added a post-profile ready screen using V2 `3.png` with an invisible OK hitbox.

Changed the profile/data-collection screen to V2 `2.png` and kept the privacy footnote as rendered UI text.

Adjusted the result screen score layout to follow V2 guide `Guia/5.png` and moved the post-profile ready OK hitbox upward to align with the baked OK button.

Changed the saved-base profile background to `REFERENCIA LAYOUT V3/2.png`, added the `Quiz Geral` intro/profile/result visual flow with its V2 Quiz Henkel assets, and documented that `Quiz Geral` remains non-persistent while showing score/time.

Changed `Quiz Geral` profile/ready screens to V3 assets `32.png` and `33.png`, made the intro start button visible, and added a visible OK button on the ready screen.

Aligned `Quiz Geral` profile fields to the V3 `32.png` red field bounds and restricted the ranking export/share button to the base-selection screen.

Removed the rendered `PONTUAÇÃO` title from the `Quiz Geral` result screen because the background artwork already carries the composition.

Expanded the saved-base profile OK button hitbox to match the full baked button rectangle.

Changed the final/result screen automatic return delay to 10 seconds.

Changed `Quiz Geral` final-screen reset to return to its own intro screen instead of the base-selection screen.

Moved the HMAC ranking upload receiver out of the quiz repo into the separate Desktop project `C:\Users\achri\Desktop\henkel-ranking-listener`.

Added `Quiz Geral` as a fourth base that skips participant data, scoring, persistence, rankings, and CSV export while selecting 1 easy, 2 medium, and 2 hard questions randomly across all collections.

### Why the map changed

Ranking export topology changed: this repo is now only the exporter, and the listener is a separate Docker deployment.

Frontend base-selection flow, quiz state behavior, persistence rules, documentation, and terminology changed.
