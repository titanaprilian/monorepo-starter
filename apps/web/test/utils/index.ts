import '@testing-library/jest-dom';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

/**
 * Custom render function that wraps components with shared application providers.
 * Extend this helper as global providers (e.g. QueryClientProvider, router mocks) are added.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return {
    user: userEvent.setup(),
    ...render(ui, { ...options }),
  };
}

export * from '@testing-library/react';
export { userEvent };
