# Fix production now

Your API failed with:

```
Failed to start backend: getaddrinfo ENOTFOUND dpg-d8h47rs8aovs73eok3ug-a
```

The old **Render Postgres** was deleted or expired.

## Permanent fix (free)

Use **Neon Postgres** instead of Render Postgres.

**Full guide:** [NEON_PRODUCTION_SETUP.md](./NEON_PRODUCTION_SETUP.md)

### Quick steps

1. Create free DB at https://neon.tech
2. Copy **Direct connection** string
3. Render → **foodheaven-api** → **Environment** → set `DATABASE_URL` to Neon URL
4. **Manual Deploy**
5. Run `npm run verify:health` or open https://foodheaven-api.onrender.com/health
