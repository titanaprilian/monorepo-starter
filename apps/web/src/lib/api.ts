import { edenTreaty } from '@elysiajs/eden';
import type { App } from '@repo/backend';

// Create a global eden client
// During development, assume backend runs on localhost:3000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = edenTreaty<App>(API_URL, {
  fetcher: ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init)) as typeof fetch,
});
