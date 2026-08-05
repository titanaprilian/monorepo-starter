# Elysia Backend Service

This is the Elysia backend service.

## Development

To start the development server run:
```bash
bun run dev
```

The server runs on http://localhost:3000/ by default.

## Elysia Eden Client Setup

To consume this backend in a frontend application (such as a Next.js or React app in this monorepo) using typesafe RPC with `@elysiajs/eden`:

### 1. Install Dependencies

In your client application, install `@elysiajs/eden`:

```bash
bun add @elysiajs/eden
```

### 2. Reference the Backend Package

Ensure your client application has a dependency on this backend package (`@repo/backend`) in its `package.json`:

```json
"dependencies": {
  "@repo/backend": "workspace:*"
}
```

### 3. Instantiate the Client

You can initialize the Eden treaty client and import the types-only `App` type without importing server-side dependencies:

```typescript
import { edenTreaty } from "@elysiajs/eden";
import type { App } from "@repo/backend/client";

// Replace with your backend URL
const client = edenTreaty<App>("http://localhost:3000");

// Example usage:
// const { data, error } = await client.auth.login.post({ email, password });
```
