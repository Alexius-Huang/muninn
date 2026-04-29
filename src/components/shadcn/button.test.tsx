import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders with default variant classes', () => {
    render(<Button>Test</Button>);
    const btn = screen.getByRole('button', { name: 'Test' });
    expect(btn.className).toContain('bg-nord-8');
    expect(btn.className).toContain('text-white');
  });

  it.each([
    ['default', 'bg-nord-8'],
    ['destructive', 'bg-nord-11'],
    ['secondary', 'bg-nord-3'],
    ['ghost', 'text-nord-4'],
  ] as const)('applies variant %s class', (variant, expectedClass) => {
    render(<Button variant={variant}>Btn</Button>);
    const btn = screen.getByRole('button', { name: 'Btn' });
    expect(btn.className).toContain(expectedClass);
  });

  it.each([
    ['default', 'px-4'],
    ['sm', 'px-3'],
  ] as const)('applies size %s class', (size, expectedClass) => {
    render(<Button size={size}>Sz</Button>);
    const btn = screen.getByRole('button', { name: 'Sz' });
    expect(btn.className).toContain(expectedClass);
  });

  it('forwards disabled to the underlying button', () => {
    render(<Button disabled>X</Button>);
    expect(screen.getByRole('button', { name: 'X' })).toBeDisabled();
  });

  it('renders as a different element via asChild', () => {
    render(
      <Button asChild>
        <a href="/x">go</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'go' });
    expect(link).toBeInTheDocument();
    expect(link.className).toContain('bg-nord-8');
  });
});
