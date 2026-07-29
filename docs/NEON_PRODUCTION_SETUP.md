# Cheapest permanent production setup (Neon + Render + Vercel)

**Cost: $0/month** — Neon free Postgres does not expire like Render free Postgres.

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | https://foodheaven-five.vercel.app |
| API | Render (free web service) | https://foodheaven-api.onrender.com |
| Database | **Neon** (free Postgres) | External — set as `DATABASE_URL` on Render |

---

## Step 1 — Create Neon database (5 min, one-time)

1. Sign up at https://neon.tech (GitHub login works)
2. **New Project**
   - Name: `foodheaven`
   - Region: pick one close to your Render region (e.g. `US West` if API is Oregon)
3. On the project **Dashboard**, open **Connect**
4. Copy the connection string:
   - Use **Direct connection** (not pooled — Render runs a long-lived Node process)
   - Example shape:
     ```
     postgresql://neondb_owner:xxxxx@ep-cool-name-12345678.us-west-2.aws.neon.tech/neondb?sslmode=require
     ```
5. Keep this string safe — you paste it once on Render.

Neon auto-creates an empty database. FoodHeaven runs schema + seed on first API boot.

---

## Step 2 — Set env on Render (2 min, one-time)

1. Open https://dashboard.render.com → **foodheaven-api**
2. **Environment** tab
3. Set or update:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Paste your **Neon** connection string from Step 1 |
| `CORS_ORIGIN` | `https://foodheaven-five.vercel.app` |
| `JWT_SECRET` | Any long random string (16+ chars) if not already set |

4. **Delete** any old `DATABASE_URL` pointing at `dpg-...onrender.com` or `dpg-...-a`
5. **Save Changes** → **Manual Deploy**

Wait until status is **Live**.

---

## Step 3 — Verify (1 min)

### API health

```bash
npm run verify:health
```

Or open in browser:

https://foodheaven-api.onrender.com/health

Expected:

```json
{
  "success": true,
  "status": "healthy",
  "db": "up"
}
```

### Restaurants

https://foodheaven-api.onrender.com/api/v1/restaurants

Should return a JSON list of restaurants.

### Frontend

https://foodheaven-five.vercel.app

Restaurants should load (first API hit after sleep may take 30–60s on Render free tier).

---

## Render logs — success looks like

```
Database connection established
Backend running on http://localhost:5000
```

## Render logs — failure

| Error | Fix |
|-------|-----|
| `ENOTFOUND dpg-...` | Old Render Postgres URL still set — replace with Neon URL |
| `password authentication failed` | Re-copy connection string from Neon dashboard |
| `SSL connection` error | Ensure URL ends with `?sslmode=require` |

---

## Why this is permanent

| Before (breaks) | After (stable) |
|-----------------|----------------|
| Render free Postgres expires ~30 days | Neon free tier does not auto-delete |
| Manual stale `DATABASE_URL` | One Neon URL, documented in this guide |
| API crash loop on bad DB | Health check + `npm run verify:health` |

---

## Optional: local test with Neon

```bash
# backend/.env
DATABASE_URL=postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require

cd backend && npm run dev
```

Then open http://localhost:5000/health

---

## Monthly cost summary

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | $0 |
| Render API | Free | $0 (cold starts after 15 min idle) |
| Neon Postgres | Free | $0 (0.5 GB storage) |
| **Total** | | **$0** |

Upgrade later only if you need: no cold starts (Render paid), more DB storage (Neon paid).
