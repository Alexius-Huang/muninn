export function wrapIndex(currentIndex: number, delta: -1 | 1, total: number): number {
  if (total <= 0) return currentIndex;
  return (currentIndex + delta + total) % total;
}
