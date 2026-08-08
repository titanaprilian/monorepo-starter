# Agent Context Protocol (Elysia Backend)

This document defines the Elysia-specific rules of engagement for agents working in `apps/backend`. Read it **in addition to** the root `AGENTS.md`, which covers the generic monorepo "Deep Modules" architecture. When rules conflict, this app-specific document takes precedence within this directory.

## HTTP Layer & Routing

Transport concerns live **inside** each domain module but must never leak out of it. Routes are built as Elysia plugins and composed at a single root. Follow this protocol whenever you add or modify any HTTP surface.

- **Colocated HTTP Adapters (`src/modules/<feature>/http.ts`)**: Every module that exposes an API contains an `http.ts` file that builds and exports an Elysia plugin containing only that feature's routes. Import the feature's domain services from the module's `/internal/` directory, or accept them via the plugin's options object (e.g. `{ db }`, `{ authService }`), so the adapter stays self-contained and testable.
- **Response Helpers (`src/lib/response.ts`)**: All route handlers MUST build responses through the `successResponse` and `errorResponse` helpers. `successResponse<T>(data)` returns the success envelope `{ data: T }`. `errorResponse(set, status, error)` sets `set.status` for you and returns `{ error: { code, message } }`, deriving `code` automatically from the error class name (e.g. `EmailAlreadyRegisteredError` → `EMAIL_ALREADY_REGISTERED`). Manual `set.status` + inline `{ error: ... }` construction is forbidden in route handlers — every success and error branch must go through the helpers.
- **Never Export Adapters Through Public Barrels**: A module's `index.ts` must **never** export `http.ts`, its route builders, or their types. The module's public boundary is strictly protocol-agnostic; background jobs and CLI scripts importing the module must not gain a dependency on Elysia.
- **Composition Root (`src/app.ts`)**: All feature plugins are chained onto a single Elysia instance in `src/app.ts` through a `createApp(deps)` factory. The factory takes dependencies explicitly (e.g. `{ db, auth }`) for dependency injection and testing, applies global plugins and error handling (CORS, `.onError`, etc.) inside the factory, and exports `type App = ReturnType<typeof createApp>`. It must **never** call `.listen()`.
- **Process-Only Entry Point (`src/index.ts`)**: `src/index.ts` is strictly the process boundary. It imports `createApp` from `src/app.ts`, constructs and wires the real dependencies, reads environment variables (e.g. `PORT`), binds the server via `app.listen()`, and handles process lifecycle (e.g. startup logging). Never define routes here.

### Explicitly Forbidden

- Exporting a module's `http.ts` (or any HTTP adapter) from `src/modules/<feature>/index.ts`.
- Registering routes directly in `src/index.ts`, or anywhere other than a module's `http.ts` and the `app.ts` composition root.
- Calling `.listen()` anywhere except the process entry point (`src/index.ts`).
- Bypassing the `createApp` factory by composing feature plugins elsewhere. Feature `http.ts` files are imported by path (e.g. `import { authRoutes } from "./modules/authentication/http"`) only at the composition root.

## Testing

Tests live in `test/` at the app root:

- `test/unit/<feature>/<name>.test.ts` — Unit tests for services and internal logic
- `test/integration/<feature>/<name>.test.ts` — Integration tests for HTTP endpoints against the real `test_db` database
- `test/utils/` — Shared test helpers (fixtures, factories, setup)
- `test/global-setup.ts` — Ensures `test_db` exists, runs Drizzle migrations (runs once before all integration tests)
- `test/setup.ts` — Truncates all tables before each test file

Use Vitest via `packages/config-vitest`. Run `bun test` from this directory for fast feedback, or `bun test` from the monorepo root to run all tests.
