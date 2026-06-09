<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/18fc74e4-e3b4-46cd-866a-bae2d64ba742

## Run Everything With Docker

**Prerequisites:** Docker Desktop

1. From this project folder, start the full stack:
   `docker compose up -d --build`
2. Open the quiz:
   `http://localhost`
3. Open the database web interface:
   `http://localhost:5050`
4. Log in to pgAdmin:
   - Email: `admin@henkel.com`
   - Password: `admin`
5. Open the preconfigured server `QUIZZ PostgreSQL local`.
   If pgAdmin asks for the database password, use `quizz_app_password`.

Default services:

```txt
Quiz app: http://localhost
API: http://localhost/api/health
pgAdmin: http://localhost:5050
PostgreSQL: localhost:5432
Database: quizz
User: quizz_app
Password: quizz_app_password
```

Quiz bases:

- `IPÊ & ICJ`, `Paulista`, and `Planta`: collect participant data, run a scored 5-question quiz, and save completed attempts to PostgreSQL.
- `Quiz Geral`: skips participant data, does not score or save results, and selects 5 random questions across all collections with 1 easy, 2 medium, and 2 hard questions.

Useful Docker commands:

```txt
docker compose up -d --build
docker compose logs -f app api postgres pgadmin
docker compose down
docker compose down -v
```

Use `docker compose down -v` only when you want to erase the local database volume and recreate the schema from `db/init/001_quizz_schema.sql`.

You can copy `.env.example` to `.env` if you need to change ports, credentials, or ranking export settings. The quiz/database defaults work without creating a `.env` file. Ranking export requires a separate listener service; the standalone Docker listener lives at `C:\Users\achri\Desktop\henkel-ranking-listener`.

## Run Locally With Node

**Prerequisites:** Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

In Node dev mode, open `http://localhost:3000`.

## Local PostgreSQL Only

**Prerequisites:** Docker Desktop

1. Start PostgreSQL and pgAdmin:
   `npm run db:up`
2. Open the database web interface:
   `http://localhost:5050`
3. Log in to pgAdmin:
   - Email: `admin@henkel.com`
   - Password: `admin`
4. Open the preconfigured server `QUIZZ PostgreSQL local`.
   If pgAdmin asks for the database password, use `quizz_app_password`.

Default database connection:

```txt
Host: localhost
Port: 5432
Database: quizz
User: quizz_app
Password: quizz_app_password
```

Useful commands:

```txt
npm run docker:up
npm run docker:down
npm run docker:logs
npm run api:dev
npm run test
npm run test:db
npm run test:all
npm run db:up
npm run db:down
npm run db:logs
npm run db:psql
npm run db:reset
```

The initial schema is in `db/init/001_quizz_schema.sql`. It creates tables for quiz collections, participants, attempts, attempt answers, the general `quiz_ranking` views, and three base-specific views:

```sql
SELECT * FROM ranking_base_ipe_icj;
SELECT * FROM ranking_base_paulista;
SELECT * FROM ranking_base_planta;
```

## Backend API

The frontend sends completed scored attempts to:

```txt
POST /api/attempts
```

The API upserts the participant by normalized email, inserts one attempt, and inserts the answer details in a single database transaction.

Ranking export:

```txt
POST /api/rankings/export
```

This endpoint reads the three base-specific ranking views, generates three CSV files, and uploads them as multipart form data to `RANKING_EXPORT_URL` through a server-to-server POST. The browser never receives the shared secret.

Required protection for the emitter and receiver:

```txt
RANKING_EXPORT_SECRET=<same long random secret configured on the receiving app>
RANKING_EXPORT_KEY_ID=henkel-quiz-totem
```

On the cloud quiz server, point the exporter to the separate listener server:

```txt
RANKING_EXPORT_URL=http://henkel-totem.novaxd.com.br:8080/rankings/upload
```

For local testing against the separate listener container on this machine, use:

```txt
RANKING_EXPORT_URL=http://host.docker.internal:8080/rankings/upload
RANKING_EXPORT_KEY_ID=henkel-quiz-totem
```

For the website copy running against the same listener, use the same URL/secret but:

```txt
RANKING_EXPORT_KEY_ID=henkel-quiz-website
```

The upload includes `manifest` as a form field and three files named `ranking_base_ipe_icj.csv`, `ranking_base_paulista.csv`, and `ranking_base_planta.csv`. The receiving app must verify these headers before accepting the upload:

```txt
X-Henkel-Key-Id
X-Henkel-Timestamp
X-Henkel-Nonce
X-Henkel-Manifest-SHA256
X-Henkel-Signature
```

Signature formula:

```txt
HMAC_SHA256(secret, timestamp + "." + nonce + "." + manifest_sha256)
```

The separate listener rejects stale timestamps and replayed nonces, then compares each CSV SHA-256 with the hashes listed in the manifest.

Health check:

```txt
GET /api/health
```

In Docker, Nginx proxies `/api/*` to the `api` service. In Node dev mode, Vite proxies `/api/*` to `http://localhost:3001`.

Run the API locally:

```txt
npm run api:dev
```

Run the separate ranking listener from its own Desktop folder:

```powershell
cd C:\Users\achri\Desktop\henkel-ranking-listener
docker compose up -d --build
```

For local export testing with Node, keep the API export settings aligned with the receiver:

```powershell
$env:RANKING_EXPORT_URL="http://localhost:8080/rankings/upload"
$env:RANKING_EXPORT_SECRET="CHANGE_ME_TO_A_LONG_RANDOM_SECRET"
$env:RANKING_EXPORT_KEY_ID="henkel-quiz-totem"
npm run api:dev
```

Run tests:

```txt
npm run test
npm run test:all
```

Database integration tests require a live PostgreSQL with the schema loaded:

```powershell
$env:TEST_DATABASE_URL="postgresql://quizz_app:quizz_app_password@localhost:5432/quizz"
npm run test:db
```
