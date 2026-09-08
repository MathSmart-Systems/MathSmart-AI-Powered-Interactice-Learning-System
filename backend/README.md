# Backend Module Boundaries

The FastAPI backend is organized by business capability so contributors can work inside a bounded module.

- `app/` owns application startup, validated environment configuration, and shared request dependencies.
- `modules/<feature>/` owns that feature's router, schemas, service, repository, and tests when implemented.
- `modules/shared/` contains infrastructure helpers without feature-specific policy.
- `middleware/` owns cross-cutting HTTP concerns such as JWT verification, request IDs, and error handling.

Modules communicate through documented service contracts. A feature must not import another module's repository or other private implementation directly. Groq is called only through a server-side adapter, with its credential and selected model loaded from `.env` through validated application configuration.
