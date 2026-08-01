# Agent Context Protocol (Deep Modules Architecture)

Welcome! This repository uses a **Deep Modules** architecture tailored for AI agents. This document defines the rules of engagement and the precise protocol you must follow when working within this codebase.

## The Three-Step Sequence

When implementing a feature or fixing a bug in a module, you **must** follow this strict execution sequence:

1. **Read Contracts**
   First, locate and read the relevant contracts (usually in `packages/contracts` or the module's public definitions/types) to understand the data structures and the module's public interface. This keeps your context window clean and prevents you from making incorrect assumptions about the interface.

2. **Read Boundary Tests**
   Second, read the TDD-first boundary test located at the module root (`src/modules/<feature>/*.test.ts`). These tests are human-authored and act as the immutable specification for your target feature. Make sure you understand the input/output expectations and assertions.

3. **Modify Internals Only**
   Third, implement the required logic. You must exclusively modify or create files inside the target module's `/internal/` directory (e.g., `src/modules/<feature>/internal/*`). The module's public entry point (`src/modules/<feature>/index.ts`) must only export the concrete implementation satisfying the public contract.

---

## Core Rules & Constraints

- **Strict Isolation**: You are explicitly forbidden from reading or modifying the internal implementation details (`/internal/` directories) of any module unrelated to your current target feature.
- **Import Restrictions**: ESLint/tooling enforces strict boundaries. You must never import from a module's `/internal/` folder from outside that module.
- **Entry Points**: The only allowed export point for a module is `src/modules/<feature>/index.ts`. It must export a concrete implementation adhering to a strict interface.

---

## HTTP Layer & Routing

Transport concerns live **inside** each domain module but must never leak out of it. Routes are built as Elysia plugins and composed at a single root. Follow this protocol whenever you add or modify any HTTP surface.

- **Colocated HTTP Adapters (`src/modules/<feature>/http.ts`)**: Every module that exposes an API contains an `http.ts` file that builds and exports an Elysia plugin containing only that feature's routes. Import the feature's domain services from the module's `/internal/` directory, or accept them via the plugin's options object (e.g. `{ db }`, `{ authService }`), so the adapter stays self-contained and testable.
- **Never Export Adapters Through Public Barrels**: A module's `index.ts` must **never** export `http.ts`, its route builders, or their types. The module's public boundary is strictly protocol-agnostic; background jobs and CLI scripts importing the module must not gain a dependency on Elysia.
- **Composition Root (`src/app.ts`)**: All feature plugins are chained onto a single Elysia instance in `src/app.ts` through a `createApp(deps)` factory. The factory takes dependencies explicitly (e.g. `{ db, auth }`) for dependency injection and testing, applies global plugins and error handling (CORS, `.onError`, etc.) inside the factory, and exports `type App = ReturnType<typeof createApp>`. It must **never** call `.listen()`.
- **Process-Only Entry Point (`src/index.ts`)**: `src/index.ts` is strictly the process boundary. It imports `createApp` from `src/app.ts`, constructs and wires the real dependencies, reads environment variables (e.g. `PORT`), binds the server via `app.listen()`, and handles process lifecycle (e.g. startup logging). Never define routes here.

### Explicitly Forbidden

- Exporting a module's `http.ts` (or any HTTP adapter) from `src/modules/<feature>/index.ts`.
- Registering routes directly in `src/index.ts`, or anywhere other than a module's `http.ts` and the `app.ts` composition root.
- Calling `.listen()` anywhere except the process entry point (`src/index.ts`).
- Bypassing the `createApp` factory by composing feature plugins elsewhere. Feature `http.ts` files are imported by path (e.g. `import { authRoutes } from "./modules/authentication/http"`) only at the composition root.

---

## Testing Tiers & Ownership

### Tier 1: Boundary Tests (`src/modules/<feature>/*.test.ts`)
- **Owner**: Human
- **Rules**: AI agents **cannot** modify or delete these tests. They serve as the source of truth for features.
- **Goal**: Validate public contracts and interfaces (Black-box).

### Tier 2: Internal Tests (`src/modules/<feature>/internal/*.test.ts` and `src/modules/<feature>/http.test.ts`)
- **Owner**: AI Agent (You!)
- **Rules**: You are free to create, modify, or delete internal tests to verify your code's correctness. Humans do not review these tests for style or format, but they must pass before merging.
- **Goal**: White-box checks for complex internal algorithms/logic. HTTP adapter tests (`http.test.ts`) mount the feature's plugin onto a fresh Elysia instance with injected/mocked dependencies and verify schema validation and status-code mappings (e.g. Domain Error -> 400) via `app.handle()`.

### Tier 3: Orchestration Tests (`workflows/*.test.ts` or `src/workflows/*.test.ts`)
- **Owner**: Human
- **Goal**: Verify cross-module interactions and transaction rollbacks at the application root level.
