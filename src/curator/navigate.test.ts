import { describe, it, expect } from 'vitest';
import { wrapIndex } from './navigate';

describe('wrapIndex', () => {
  it.each([
    { current: 0, delta: -1 as const, total: 5, expected: 4 },
    { current: 4, delta: 1 as const, total: 5, expected: 0 },
    { current: 2, delta: 1 as const, total: 5, expected: 3 },
    { current: 2, delta: -1 as const, total: 5, expected: 1 },
    { current: 0, delta: 1 as const, total: 1, expected: 0 },
    { current: 0, delta: -1 as const, total: 1, expected: 0 },
  ])(
    'wraps index $current with delta $delta (total $total) to $expected',
    ({ current, delta, total, expected }) => {
      expect(wrapIndex(current, delta, total)).toBe(expected);
    },
  );

  it('returns the current index unchanged when total is 0', () => {
    expect(wrapIndex(0, 1, 0)).toBe(0);
    expect(wrapIndex(0, -1, 0)).toBe(0);
  });
});
