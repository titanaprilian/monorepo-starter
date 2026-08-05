# Monorepo Starter

A high-performance monorepo starter using [Bun](https://bun.sh) and [Elysia](https://elysiajs.com), designed with a **Deep Modules** architecture optimized for AI agents.

## Repository Structure

- `apps/` — Application entrypoints and deployment targets.
  - `apps/backend` — Elysia server template.
  - `apps/react-app` — React application template.
- `packages/` — Shared libraries, databases, and schemas.
- `AGENTS.md` — The Agent Context Protocol specifying the development flow for AI agents.

## AI Agent Context Protocol

This repository is strictly structured around a **Deep Modules** architecture to keep context boundaries clean and prevent tight coupling. All AI agents must follow the three-step sequence defined in [AGENTS.md](./AGENTS.md):

1. **Read Contracts** (interfaces and data structures).
2. **Read Boundary Tests** (immutable specifications).
3. **Modify Internals Only** (exclusively within `/internal/` directories).

For complete rules and constraints, please review [AGENTS.md](./AGENTS.md).

## Getting Started

### Prerequisites

You need [Bun](https://bun.sh) installed on your machine.

### Installation

Install workspace dependencies:

```bash
bun install
```

### Running Development Server

Start the development server for the Elysia application:

```bash
bun run dev
```

### Running Tests

Execute the test suites:

```bash
bun run test
```
