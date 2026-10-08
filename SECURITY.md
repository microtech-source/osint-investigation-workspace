# Security notes
SESSION_SECRET must be a unique random value with 32+ characters. APP_PASSWORD must not be committed. Set cookies are HTTP-only, Secure in production, SameSite=Strict, and expire after seven days. Middleware protects all non-static pages and API routes. This instance is deliberately single-user.

Limitations to resolve before sensitive production evidence is stored: current login throttling is process-local, database role is a single owner connection, and evidence attachments are metadata and external references (no binary files). Add persistent rate limiting and private object storage when needed. Do not commit `.env` or real case content.
