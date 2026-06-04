# ITU Project Setup and Database Migrations

Welcome! This guide outlines how to set up the project locally and manage database migrations using Supabase CLI helper scripts.

---

## 🛠️ Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18 or higher recommended)
- **pnpm** (or npm/yarn, though pnpm is preferred for this repository)
- A running PostgreSQL or local Supabase instance (configured in your `.env` file)

---

## 🚀 Local Development Setup

### 1. Install Dependencies
Run the following command at the root of the project to install all required packages and platform-specific binaries (e.g., Supabase CLI):
```bash
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the database configuration. Make sure to define:
- `DATABASE_URL`: Connection string to your local/development PostgreSQL database (e.g., `postgresql://postgres:password@localhost:54322/postgres`).
- `DIRECT_URL`: Connection string to the remote database pooler or direct connection (used for deploying migrations to staging/production).

---

## 💾 Running Database Migrations

Whenever you pull changes from the repository, new database migrations may be present under `supabase/migrations/`. Use the following commands to apply them:

### Local Database Migrations
To apply pending migrations to your local development database:
```bash
pnpm db:migrate
```
*Note: This script automatically handles SSL connection parameters (e.g. `sslmode=disable` for localhost).*

### Remote Database Migrations (Staging / Production)
To push migrations to the remote database (defined by `DIRECT_URL` in your `.env` file):

1. **Dry-Run Check**: Verify which migrations will be applied without pushing them:
   ```bash
   pnpm db:deploy --dry-run
   ```

2. **Apply Migrations**: Push migrations to the database:
   ```bash
   pnpm db:deploy
   ```

---

## ➕ Creating New Migrations

If you need to make changes to the database schema, do not run SQL queries directly on the DB. Instead, generate a migration:

1. Create a new migration file:
   ```bash
   pnpm exec supabase migration new <your_migration_name>
   ```
   This creates a file under `supabase/migrations/<timestamp>_<your_migration_name>.sql`.

2. Write your schema modification SQL (e.g., `ALTER TABLE ...`, `CREATE TABLE ...`) inside that file.

3. Run `pnpm db:migrate` to apply the changes to your local database.
