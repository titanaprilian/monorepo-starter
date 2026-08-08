# Agent Context Protocol (Deep Modules Architecture)

> **Read application-specific rules too.** When working inside a specific application directory under `apps/` (e.g. `apps/backend`), you **must** also read the `AGENTS.md` file located in that application's root for framework-specific instructions (routing, HTTP layers, test setups, etc.). If no such file exists, this root document governs. When the two documents conflict, the application-specific document takes precedence within that application's directory.

Welcome! This monorepo uses a **Deep Modules** architecture tailored for AI agents. This document defines the generic rules of engagement shared across all applications in the monorepo. Framework-specific details live in each application's own `AGENTS.md`.

## Feature Delivery Pipeline

When implementing a feature or fixing a bug, follow this strict execution sequence:

1. **grill-me** → Establish shared understanding of requirements
2. **to-spec** → Create a specification document
3. **to-tickets** → Break into tickets (test-writing tickets are priority #1, unblocked first)
4. **implement** → Agents pick up tickets, write tests first (TDD), then implement
5. **code-review** → Orchestrator reviews each completed ticket
6. **push-to-github** → Orchestrator pushes when all tickets are complete

---

## Core Rules & Constraints

- **Strict Isolation**: You are explicitly forbidden from reading or modifying the internal implementation details (`/internal/` directories) of any module unrelated to your current target feature.
- **Import Restrictions**: ESLint/tooling enforces strict boundaries. You must never import from a module's `/internal/` folder from outside that module.
- **Entry Points**: The only allowed export point for a module is `[app_root]/src/modules/<feature>/index.ts`. It must export a concrete implementation adhering to a strict interface.

---

## Testing Conventions

Tests use a conventional folder-based structure with Vitest as the test runner via `packages/config-vitest/`.

**Test locations:**

- `test/unit/<feature>/<name>.test.ts` — Unit tests for a single module/function in isolation
- `test/integration/<feature>/<name>.test.ts` — Integration tests (backend only, HTTP layer against real database)
- `test/utils/` — Per-app shared test helpers
- `test/global-setup.ts` — One-time setup per target (e.g., ensure test DB exists, run migrations)
- `test/setup.ts` — Per-file setup (e.g., truncate database tables)

**Naming:**

- Plain `.test.ts` suffix — no tier suffixes, no human/agent ownership restrictions
- Tests are organized by feature, mirroring the module structure without the `modules/` prefix

**Agent permissions:**

- AI agents have full permission to create, modify, and delete all test files
- All tests are code subject to the same review process as source code

**TDD-first workflow:**

- Write tests before implementing features
- Run `bun test` from the target's directory for fast feedback
- Run `bun test` from the monorepo root to execute all tests

---

## Platform Mappings

The Deep Modules architecture maps onto each framework in the monorepo as follows. Consult the application-specific `AGENTS.md` (if present) for authoritative details within that application.

| Environment | Public seam | Internal logic | Routing / adapter | Composition root |
| --- | --- | --- | --- | --- |
| **Elysia (Backend)** | `src/modules/<feature>/index.ts` | `src/modules/<feature>/internal/` | `src/modules/<feature>/http.ts` (Elysia plugin) | `src/app.ts` (`createApp` factory) |
| **Next.js (Frontend)** | `src/modules/<feature>/index.ts` exporting components/hooks | `src/modules/<feature>/internal/` (UI components, local state, mappers) | Page / Layout components | Page / Layout components (thin composition roots) |
