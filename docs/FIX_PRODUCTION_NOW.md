# Fix production in 2 minutes

Your API is down because the old Postgres database (`dpg-d8h47rs8aovs73eok3ug-a`) was deleted or expired.

## What was changed in the repo

`render.yaml` now:

- Creates a **new** Postgres database (`foodheaven-db`)
- Auto-wires `DATABASE_URL` to `foodheaven-api`
- Sets `CORS_ORIGIN` to `https://foodheaven-five.vercel.app`

## You only need to do this once

1. Open **Render Dashboard**: https://dashboard.render.com
2. Go to **Blueprints** (left sidebar) → open your FoodHeaven / twiggy blueprint  
   - Or: https://dashboard.render.com/blueprints
3. Click **Manual Sync** (or **Sync**)
4. When prompted, approve creating **foodheaven-db** (free Postgres)
5. Wait ~3–5 minutes for deploy to finish

## Verify

Open in browser:

- https://foodheaven-api.onrender.com/health → should show `"db": "up"`
- https://foodheaven-five.vercel.app → restaurants should load

## If you don't use Blueprint

1. **New +** → **PostgreSQL** → name `foodheaven-db` → Create
2. Copy **Internal Database URL**
3. Open **foodheaven-api** → **Environment**
4. Delete the old `DATABASE_URL` value
5. Paste the new **Internal Database URL**
6. Set `CORS_ORIGIN` = `https://foodheaven-five.vercel.app`
7. **Save** → **Manual Deploy**

## Still stuck?

In **foodheaven-api** → **Logs**, you should see:

```
Database connection established
Backend running on http://localhost:5000
```

If not, paste the last 10 log lines and ask for help.
