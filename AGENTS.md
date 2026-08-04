# Agent Context Protocol (Deep Modules Architecture)

> **Read application-specific rules too.** When working inside a specific application directory under `apps/` (e.g. `apps/elysia-template`), you **must** also read the `AGENTS.md` file located in that application's root for framework-specific instructions (routing, HTTP layers, test setups, etc.). If no such file exists, this root document governs. When the two documents conflict, the application-specific document takes precedence within that application's directory.

Welcome! This monorepo uses a **Deep Modules** architecture tailored for AI agents. This document defines the generic rules of engagement shared across all applications in the monorepo. Framework-specific details live in each application's own `AGENTS.md`.

## The Three-Step Sequence

When implementing a feature or fixing a bug in a module, you **must** follow this strict execution sequence:

1. **Read Contracts**
   First, locate and read the relevant contracts (usually in `packages/contracts` or the module's public definitions/types) to understand the data structures and the module's public interface. This keeps your context window clean and prevents you from making incorrect assumptions about the interface.

2. **Read Boundary Tests**
   Second, read the TDD-first boundary test located at `[app_root]/src/modules/<feature>/test/boundary/<operation>.boundary.test.ts`. These tests are human-authored and act as the immutable specification for your target feature. Read **only** the boundary file for your specific target operation (e.g. `test/boundary/register.boundary.test.ts` when implementing `register`) — not all boundary files for the module. Make sure you understand the input/output expectations and assertions.

3. **Modify Internals Only**
   Third, implement the required logic. You must exclusively modify or create files inside the target module's `/internal/` directory (e.g., `[app_root]/src/modules/<feature>/internal/*`). The module's public entry point (`[app_root]/src/modules/<feature>/index.ts`) must only export the concrete implementation satisfying the public contract.

---

## Core Rules & Constraints

- **Strict Isolation**: You are explicitly forbidden from reading or modifying the internal implementation details (`/internal/` directories) of any module unrelated to your current target feature.
- **Import Restrictions**: ESLint/tooling enforces strict boundaries. You must never import from a module's `/internal/` folder from outside that module.
- **Entry Points**: The only allowed export point for a module is `[app_root]/src/modules/<feature>/index.ts`. It must export a concrete implementation adhering to a strict interface.

---

## Testing Tiers & Ownership

Test files are organized into dedicated `test/` subdirectories at each level of the module hierarchy, and every test filename carries a suffix that encodes its tier and ownership. The suffix — not the folder position — is the sole structural signal for ownership, so you can identify a file's role and mutability from its name alone.

**Naming convention:**

| Suffix | Tier | Owner | Location |
| --- | --- | --- | --- |
| `.boundary.test.ts` | Tier 1 | Human (immutable to agents) | `<feature>/test/boundary/` |
| `.adapter.test.ts` | Tier 2 | Agent | `<feature>/test/adapter/` |
| `.unit.test.ts` | Tier 2 | Agent | `<feature>/internal/test/` |
| `.orchestration.test.ts` | Tier 3 | Human (immutable to agents) | `[app_root]/src/tests/orchestration/` (one per module) |

### Tier 1: Boundary Tests (`[app_root]/src/modules/<feature>/test/boundary/*.boundary.test.ts`)
- **Owner**: Human
- **Rules**: AI agents **cannot** modify or delete these tests. They serve as the source of truth for features.
- **Goal**: Validate public contracts and interfaces (Black-box).

### Tier 2: Internal Tests (`[app_root]/src/modules/<feature>/internal/test/*.unit.test.ts` and `[app_root]/src/modules/<feature>/test/adapter/*.adapter.test.ts`)
- **Owner**: AI Agent (You!)
- **Rules**: You are free to create, modify, or delete these tests to verify your code's correctness. Humans do not review these tests for style or format, but they must pass before merging.
- **Goal**: White-box checks for complex internal algorithms/logic. Adapter tests validate the module's external-facing adapter (e.g. HTTP routes, CLI commands, background jobs) by mounting it against injected/mocked dependencies and verifying schema validation and error-to-status mappings.

### Tier 3: Orchestration Tests (`[app_root]/src/tests/orchestration/<module>.orchestration.test.ts`)
- **Owner**: Human
- **Rules**: AI agents **cannot** modify or delete these tests.
- **Goal**: Verify cross-module interactions and transaction rollbacks at the application root level.

---

## Platform Mappings

The Deep Modules architecture maps onto each framework in the monorepo as follows. Consult the application-specific `AGENTS.md` (if present) for authoritative details within that application.

| Environment | Public seam | Internal logic | Routing / adapter | Composition root |
| --- | --- | --- | --- | --- |
| **Elysia (Backend)** | `src/modules/<feature>/index.ts` | `src/modules/<feature>/internal/` | `src/modules/<feature>/http.ts` (Elysia plugin) | `src/app.ts` (`createApp` factory) |
| **Next.js (Frontend)** | `src/modules/<feature>/index.ts` exporting components/hooks | `src/modules/<feature>/internal/` (UI components, local state, mappers) | Page / Layout components | Page / Layout components (thin composition roots) |
