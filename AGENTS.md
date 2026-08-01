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

## Testing Tiers & Ownership

### Tier 1: Boundary Tests (`src/modules/<feature>/*.test.ts`)
- **Owner**: Human
- **Rules**: AI agents **cannot** modify or delete these tests. They serve as the source of truth for features.
- **Goal**: Validate public contracts and interfaces (Black-box).

### Tier 2: Internal Tests (`src/modules/<feature>/internal/*.test.ts`)
- **Owner**: AI Agent (You!)
- **Rules**: You are free to create, modify, or delete internal tests to verify your code's correctness. Humans do not review these tests for style or format, but they must pass before merging.
- **Goal**: White-box checks for complex internal algorithms/logic.

### Tier 3: Orchestration Tests (`workflows/*.test.ts` or `src/workflows/*.test.ts`)
- **Owner**: Human
- **Goal**: Verify cross-module interactions and transaction rollbacks at the application root level.
