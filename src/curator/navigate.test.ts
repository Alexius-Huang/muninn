import { describe, it, expect } from 'vitest';
import { wrapIndex, jumpRow } from './navigate';

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

describe('jumpRow', () => {
  it.each([
    // 4 cols × 3 rows, total 12 (full grid)
    { current: 1,  dir:  1 as const, total: 12, cols: 4, expected: 5  },
    { current: 5,  dir: -1 as const, total: 12, cols: 4, expected: 1  },
    { current: 9,  dir:  1 as const, total: 12, cols: 4, expected: 1  },
    { current: 2,  dir: -1 as const, total: 12, cols: 4, expected: 10 },
    // 4 cols, total 10 (last row partial: [8,9])
    { current: 7,  dir:  1 as const, total: 10, cols: 4, expected: 9  },
    { current: 3,  dir: -1 as const, total: 10, cols: 4, expected: 9  },
    // edge cases
    { current: 0,  dir:  1 as const, total: 0,  cols: 4, expected: 0  },
    { current: 0,  dir:  1 as const, total: 12, cols: 0, expected: 0  },
  ])(
    'jumpRow($current, $dir, total=$total, cols=$cols) → $expected',
    ({ current, dir, total, cols, expected }) => {
      expect(jumpRow(current, dir, total, cols)).toBe(expected);
    },
  );
});
