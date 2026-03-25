# Deploying Workout Tracker on Railway

This guide will walk you through deploying your Workout Tracker project on Railway step by step.

## Prerequisites

Before you begin, make sure you have:

- A Railway account ([sign up here](https://railway.app/))
- Your project code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
- A credit card added to your Railway account (required for PostgreSQL database)

---

## Step 1: Prepare Your Repository

1. **Push your code to a Git provider** (GitHub, GitLab, or Bitbucket)

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Ensure your `.gitignore` includes sensitive files**:
   ```gitignore
   .env
   node_modules/
   *.db
   ```

---

## Step 2: Create a New Railway Project

1. Go to [railway.app](https://railway.app/) and log in
2. Click **New Project** (or **+** button)
3. Select **Deploy from GitHub repo** (or your Git provider)
4. Select your `workout_tracker` repository
5. Click **Deploy Now**

---

## Step 3: Add PostgreSQL Database

1. In your Railway project, click **+ New Service**
2. Select **Database** → **PostgreSQL**
3. Railway will automatically create a PostgreSQL database

---

## Step 4: Configure Your API Service

1. Click on your API service (should be named after your repo)
2. Go to the **Settings** tab

### Add Environment Variables

Click on **Variables** and add the following:

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Auto-linked database |
| `PORT` | `3000` | Port for the API |
| `MASTER_PASSWORD` | `your_secure_password` | Password for app authentication |
| `JWT_SECRET` | `random_long_secret_string` | JWT signing secret |
| `GEMINI_API_KEY` | `your_gemini_api_key` | Optional: for AI features |

> **Note**: Railway automatically references the database with `${{Postgres.DATABASE_URL}}` if your database service is named "Postgres". Adjust if yours has a different name.

---

## Step 5: Configure Build Settings

### Option A: Use Railway's Bun Builder (Recommended)

Your `railway.toml` is already configured to use Bun:

```toml
[build]
builder = "bun"
watchPatterns = ["backend/**/*.ts"]
```

### Option B: Use Docker (Alternative)

Your project includes a `Dockerfile`. To use it instead:

1. Go to your service **Settings**
2. Under **Build**, select **Dockerfile**
3. The Dockerfile will be used to build your service

---

## Step 6: Run Database Migrations

Railway doesn't automatically run Drizzle migrations. You have two options:

### Option A: Run Migrations via Railway Console (Quick)

1. Go to your API service
2. Click **Console** tab
3. Select **"New REPL session"**
4. Run the following commands:

   ```bash
   cd backend
   bunx drizzle-kit generate
   bunx drizzle-kit migrate
   ```

### Option B: Add Migration Script (Recommended for Production)

1. Create a `migrate.ts` file in `backend/src/`:

   ```typescript
   import { migrate } from "drizzle-orm/postgres-js/migrator";
   import { db } from "./db";

   await migrate(db, { migrationsFolder: "./drizzle" });
   console.log("Migrations completed!");
   process.exit(0);
   ```

2. Update your `railway.toml` to run migrations on deploy:

   ```toml
   [deploy]
   startCommand = "bun run src/migrate.ts && bun run src/index.ts"
   ```

---

## Step 7: Deploy and Verify

1. **Click the **Deploy** button** (or Railway will auto-deploy on push)
2. **Wait for the build to complete** (check the **Logs** tab)
3. **Get your deployed URL** from the service overview page

Your app should now be live at `https://your-app-name.up.railway.app`

---

## Step 8: Set Up Custom Domain (Optional)

1. Go to your service **Settings** → **Networking**
2. Click **Generate Domain** or add your own custom domain
3. Follow Railway's DNS instructions if using a custom domain

---

## Troubleshooting

### Build Failures

**Issue**: Build fails with "module not found"
- **Fix**: Check that all dependencies are in `backend/package.json` and `frontend/package.json`

**Issue**: Port binding errors
- **Fix**: Ensure `PORT` environment variable is set to `3000`

### Database Connection Issues

**Issue**: "DATABASE_URL not set" error
- **Fix**: Verify the database service is linked and `DATABASE_URL` references the correct service variable

### Migration Issues

**Issue**: Tables not created
- **Fix**: Run migrations manually via the Railway Console as described in Step 6

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ Yes | - | PostgreSQL connection string |
| `PORT` | No | `3000` | Port the server listens on |
| `MASTER_PASSWORD` | No | (empty) | Password for authentication |
| `JWT_SECRET` | No | `frictionless-tracker-secret-change-me` | JWT signing secret (change in production!) |
| `GEMINI_API_KEY` | No | - | Google Gemini API key for AI features |

---

## Cost Estimate (as of 2025)

| Service | Plan | Approx. Cost |
|---------|-------|--------------|
| PostgreSQL | Basic | ~$5/month |
| API Service | Basic | ~$5/month (free tier may apply) |

> **Note**: Railway offers a free trial with credits. Check [railway.app/pricing](https://railway.app/pricing) for current pricing.

---

## Useful Commands

### View logs in real-time:
```bash
railway logs
```

### Open your app in browser:
```bash
railway open
```

### Access database console:
```bash
railway connect postgres
```

---

## Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord](https://discord.gg/railway)
- [Drizzle ORM + Railway Guide](https://docs.railway.app/guides/drizzle)
- [Bun on Railway](https://docs.railway.app/faq/bun-support)

---

## Post-Deployment Checklist

- [ ] Verify the app loads at the deployed URL
- [ ] Test authentication (if `MASTER_PASSWORD` is set)
- [ ] Verify database tables were created
- [ ] Test creating a workout
- [ ] Set up monitoring/logs alerts (optional)
- [ ] Configure a custom domain (optional)
