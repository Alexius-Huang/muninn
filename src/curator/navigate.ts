export function wrapIndex(currentIndex: number, delta: -1 | 1, total: number): number {
  if (total <= 0) return currentIndex;
  return (currentIndex + delta + total) % total;
}

export function jumpRow(
  currentIndex: number,
  direction: -1 | 1,
  total: number,
  columns: number,
): number {
  if (total <= 0 || columns <= 0) return currentIndex;
  const col = currentIndex % columns;
  const row = Math.floor(currentIndex / columns);
  const rowCount = Math.ceil(total / columns);
  const nextRow = direction === 1
    ? (row + 1) % rowCount
    : (row - 1 + rowCount) % rowCount;
  const target = nextRow * columns + col;
  return target >= total ? total - 1 : target;
}
