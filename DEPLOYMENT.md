# Deployment handoff

Deployment is intentionally not configured in the absence of the user's private GitHub and Vercel accounts. This checkout has no Git remote and the local environment has no `gh` or `vercel` CLI login. To publish privately: create a private repository at https://github.com/new, push this checkout to it, import it at https://vercel.com/new, add the four application environment variables listed in README.md, provision PostgreSQL, run `npx prisma db push`, then set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub Actions secrets.
