# Agent Context Protocol (React App)

This document defines the framework-specific rules for the Vite + React frontend (`apps/react-app`). It extends the root monorepo `AGENTS.md`. In case of conflict, this file takes precedence within `apps/react-app`.

## Deep Modules Implementation

This application strictly follows the Deep Modules architecture, mapped to React and Vite.

### Module Boundaries

- **Public Interface:** A module's only allowed export point is `src/modules/<feature>/index.ts`.
- **Internal Logic:** All UI components, state, hooks, mappers, and internal tests specific to a feature must reside in `src/modules/<feature>/internal/`.
- **Strict Isolation:** A module (e.g., Module `A`) must **never** import from the `internal/` directory of another module (e.g., Module `B`). It can only import what Module `B` explicitly exposes through its `index.ts`.

### State Management (Zustand)

State is managed via `zustand` and must be kept encapsulated within modules.

- **Module-Specific State:** Stores that handle feature-specific logic (e.g., `useAuthStore`) must reside within the module's `internal/` directory. Do not export the raw store globally. Instead, expose UI components or tailored, scoped hooks through the module's `index.ts` if other parts of the app need to interact with that state.
- **Global State:** True global state (e.g., theme, global routing state) is rare and should reside in `src/lib/` or a dedicated `src/store/` directory, completely decoupled from specific feature modules.

### Routing & Composition Roots (TanStack Router)

This app uses Vite and `@tanstack/react-router`.

- **Role of Routes:** Files located in `src/routes/` act as thin composition roots.
- **Responsibilities:** They define the route paths, handle loader data, and wire together the public components imported from various feature modules (`src/modules/<feature>/index.ts`).
- **Restrictions:** Route files must not contain complex business logic, complex local state, or direct styling beyond basic layout scaffolding. They are just the glue.

## Testing Strategy

Testing tiers map to the frontend as follows:

### Tier 1: Boundary Tests (Human-Owned, Immutable)
- **Location:** `src/modules/<feature>/test/boundary/*.boundary.test.ts`
- **Role:** Black-box tests verifying the public contract of the module (e.g., using React Testing Library to test an exported component's render output and event handlers). Agents **cannot** touch these.

### Tier 2: Internal Tests (Agent-Owned, Mutable)
Agents are free to create, modify, or delete these tests to ensure their logic works.
- **Unit Tests (`*.unit.test.ts`):** Located in `src/modules/<feature>/internal/test/`. These test internal pure functions, state selectors, or isolated internal UI components.
- **Adapter Tests (`*.adapter.test.ts`):** Located in `src/modules/<feature>/test/adapter/`. These test how the module's public hooks or components interact with external APIs (e.g., testing React Query hooks or fetch wrappers with mocked endpoints).

### Tier 3: Orchestration Tests (Human-Owned, Immutable)
- **Location:** `src/tests/orchestration/*.orchestration.test.ts`
- **Role:** End-to-End (E2E) tests that verify complete user flows across multiple route boundaries. Agents **cannot** touch these.

## Design System

All UI work must adhere strictly to the "Structured Console" design direction detailed in `apps/react-app/DESIGN.md`.
- Read `DESIGN.md` before generating or modifying UI components.
- Rely on Tailwind utility classes and CSS custom properties defined in `src/index.css`.
- Utilize the unstyled, copy-paste headless architecture (shadcn/ui pattern) located in `src/components/ui/`.
