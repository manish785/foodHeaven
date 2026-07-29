# FoodHeaven

Food delivery web app with separate frontend and backend.

## Stack

- **Frontend:** React, Redux Toolkit, React Router, Auth0, Parcel
- **Backend:** Node.js, Express, MySQL

## Project structure

```
foodheaven/
├── src/              # React frontend
├── backend/          # Express API + MySQL
├── docs/             # Roadmap / deployment notes
├── index.html
└── package.json
```

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env
# Update MySQL credentials in .env
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql
npm install
npm run dev
```

API: `http://localhost:5000`

### 2. Frontend

```bash
# from project root
cp .env.example .env
npm install
npm start
```

App: `http://localhost:3000` (or port shown in terminal)

### Local env (dev-token flow)

**Root `.env`:**

```env
REACT_APP_API_BASE_URL=http://localhost:5000/api/v1
REACT_APP_DEV_AUTH_KEY=your-dev-key
```

**`backend/.env`** — use the same value for `DEV_AUTH_KEY`.

For production with Auth0, see [docs/production-deploy.md](docs/production-deploy.md).

**One-time Auth0 setup:** [scripts/setup-auth0-api.md](scripts/setup-auth0-api.md)  
**Verify config:** `npm run verify:env` (backend must be running for health check)

## Main user flow

Home → Restaurant menu → Cart → Checkout → Payment → Order confirmation

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run frontend dev server |
| `npm run build` | Production build |
| `npm test` | Run frontend tests |
| `cd backend && npm run dev` | Run API server |
| `cd backend && docker compose up --build` | Backend + MySQL in Docker |

See [backend/README.md](backend/README.md) for API endpoints.

Config reference (Docker, `.env`, Jest): [docs/PROJECT_CONFIG.md](docs/PROJECT_CONFIG.md).

## Production

**Cheapest permanent setup ($0):** [docs/NEON_PRODUCTION_SETUP.md](docs/NEON_PRODUCTION_SETUP.md) — Neon Postgres + Render API + Vercel frontend.

See [docs/production-deploy.md](docs/production-deploy.md) for Auth0, env vars, and deployment checklist.

## Deploy to Render + Vercel

Step-by-step guide: [docs/DEPLOY_RENDER_VERCEL.md](docs/DEPLOY_RENDER_VERCEL.md)

| Service | Expected URL |
|---------|----------------|
| API (Render) | `https://foodheaven-api.onrender.com` |
| App (Vercel) | `https://twiggy.vercel.app` (or your project URL) |
