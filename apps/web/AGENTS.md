# Agent Context Protocol (React App)

This document defines the framework-specific rules for the Vite + React frontend (`apps/web`). It extends the root monorepo `AGENTS.md`. In case of conflict, this file takes precedence within `apps/web`.

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

## Testing

Tests live in `test/` at the app root:

- `test/unit/<feature>/<name>.test.ts` — Unit tests for React components, hooks, and stores
- `test/utils/` — Shared test helpers

Use Vitest with the React preset (jsdom) via `packages/config-vitest`. Run `turbo run test --filter=@repo/web` for fast feedback, or `turbo run test` from the monorepo root to run unit tests.

## Design System

All UI work must adhere strictly to the "Structured Console" design direction detailed in `apps/web/DESIGN.md`.

- Read `DESIGN.md` before generating or modifying UI components.
- Rely on Tailwind utility classes and CSS custom properties defined in `src/index.css`.
- Utilize the unstyled, copy-paste headless architecture (shadcn/ui pattern) located in `src/components/ui/`.
