# Fieldnotes · Private OSINT Workspace

A single-user, authentication-protected research workspace built around the catalog in [rawfilejson/awesome-osint-arsenal](https://github.com/rawfilejson/awesome-osint-arsenal). The upstream `tools.json` file is the source of truth; the build script emits normalized JSON and categories for fast local search.

## Features

- Signed seven-day HTTP-only session cookie; middleware protects all pages and APIs. Configure one owner with `APP_USERNAME` and `APP_PASSWORD`.
- Searchable 753-tool catalog, instant client filtering, category routes, tags and copyable official links/install commands.
- Case records with target, description, Markdown notes, status, evidence references, timeline entries, archival field and JSON report export.
- Prisma/PostgreSQL schema includes cases, evidence, audit logs, timeline, saved searches and favorites.
- Scheduled GitHub Actions refresh the catalog daily and deploy when Vercel secrets are configured.

## Local setup

1. Install Node.js 22+ and PostgreSQL 15+.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, a unique `APP_USERNAME`, a strong `APP_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters.
3. Run `npm install`, `npm run db:push`, `npm run catalog:build`, and `npm run dev`.
4. Open `http://localhost:3000/login`.

## Deploy to Vercel

Import this repository into Vercel, add the four environment variables from `.env.example` to the Production environment, and provision a PostgreSQL database (for example Vercel Marketplace Postgres/Neon) for `DATABASE_URL`. Run `npx prisma db push` against that database once. Vercel builds run `prisma generate && prisma migrate deploy && next build` using the checked-in initial migration.

For catalog auto-deploy, add repository Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. The scheduled workflow rebuilds normalized catalog data and deploys production. Pushes to the tracked upstream files also trigger the workflow; for true upstream change mirroring, configure a repository dispatch/webhook or point the scheduled action at the upstream source before deploy.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_USERNAME` | Single owner username |
| `APP_PASSWORD` | Single owner password |
| `SESSION_SECRET` | Random HMAC signing secret, minimum 32 characters |
| `VERCEL_TOKEN` | GitHub Actions production deployment token |
| `VERCEL_ORG_ID` | Vercel organization/team identifier |
| `VERCEL_PROJECT_ID` | Vercel project identifier |

## Operations and security

Rotate credentials by updating Vercel environment variables and redeploying; rotating `SESSION_SECRET` invalidates existing sessions. Keep database credentials private. Evidence entries currently store links and text metadata in PostgreSQL, not binary uploads; add private object storage before using screenshot/document uploads. The built-in login limiter is process-local; place a persistent rate limiter (e.g. managed Redis) in front of a publicly hosted endpoint if exposure risk requires it. CSRF relies on strict SameSite cookies; add explicit Origin checks if integrating cross-site clients.

The catalog includes security testing utilities. Use listed resources only for lawful research and systems you are authorized to investigate.

## Architecture

``mermaid
flowchart LR
  Browser --> Middleware[Signed cookie authentication]
  Middleware --> Next[Next.js 15 app router]
  Next --> Catalog[Generated JSON catalog]
  Next --> Prisma[Prisma ORM]
  Prisma --> Postgres[PostgreSQL]
  GitHub[Upstream GitHub repository] --> Actions[Scheduled catalog sync]
  Actions --> Catalog
  Actions --> Vercel[Optional Vercel deployment]
``

