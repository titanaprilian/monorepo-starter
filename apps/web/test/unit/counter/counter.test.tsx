import { Counter } from '@/modules/counter';
import { renderWithProviders, screen } from '../../utils';
import { describe, expect, it } from 'vitest';

describe('Counter component', () => {
  it('renders counter component and handles user interaction', async () => {
    const { user } = renderWithProviders(<Counter />);

    expect(screen.getByText('Zustand Counter Demo')).toBeInTheDocument();

    const incrementButton = screen.getByRole('button', { name: '+' });
    await user.click(incrementButton);

    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
