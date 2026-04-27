import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockListCuration = vi.fn();
vi.mock('./curation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./curation')>();
  return { ...actual, listCuration: () => mockListCuration() };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { useGroupedRecords } from './useGroupedRecords';
import type { CurationFile } from './curation';

function makeFile(folderPath: string, records: CurationFile['records']): CurationFile {
  return { folderPath, records };
}

beforeEach(() => mockListCuration.mockReset());

describe('useGroupedRecords', () => {
  it('should return empty map when no curation files exist', async () => {
    mockListCuration.mockResolvedValue([]);
    const { result } = renderHook(() => useGroupedRecords());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recordsByGroupId.size).toBe(0);
  });

  it('should ignore records without groupId', async () => {
    const file = makeFile('/Photos/Lyon', {
      'id:a': { photoId: 'id:a', pathLower: '/a.jpg', pathDisplay: '/A.jpg', name: 'a.jpg', flag: 'keep' },
    });
    mockListCuration.mockResolvedValue([file]);
    const { result } = renderHook(() => useGroupedRecords());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recordsByGroupId.size).toBe(0);
  });

  it('should load and group records by groupId', async () => {
    const file = makeFile('/Photos/Lyon', {
      'id:a': { photoId: 'id:a', pathLower: '/a.jpg', pathDisplay: '/A.jpg', name: 'a.jpg', groupId: 'g1' },
      'id:b': { photoId: 'id:b', pathLower: '/b.jpg', pathDisplay: '/B.jpg', name: 'b.jpg', groupId: 'g2' },
      'id:c': { photoId: 'id:c', pathLower: '/c.jpg', pathDisplay: '/C.jpg', name: 'c.jpg', groupId: 'g1' },
    });
    mockListCuration.mockResolvedValue([file]);
    const { result } = renderHook(() => useGroupedRecords());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recordsByGroupId.size).toBe(2);
    expect(result.current.recordsByGroupId.get('g1')).toHaveLength(2);
    expect(result.current.recordsByGroupId.get('g2')).toHaveLength(1);
  });

  it('should sort records inside each bucket by name', async () => {
    const file = makeFile('/Photos/Lyon', {
      'id:z': { photoId: 'id:z', pathLower: '/z.jpg', pathDisplay: '/Z.jpg', name: 'z.jpg', groupId: 'g1' },
      'id:a': { photoId: 'id:a', pathLower: '/a.jpg', pathDisplay: '/A.jpg', name: 'a.jpg', groupId: 'g1' },
      'id:m': { photoId: 'id:m', pathLower: '/m.jpg', pathDisplay: '/M.jpg', name: 'm.jpg', groupId: 'g1' },
    });
    mockListCuration.mockResolvedValue([file]);
    const { result } = renderHook(() => useGroupedRecords());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const bucket = result.current.recordsByGroupId.get('g1')!;
    expect(bucket.map((r) => r.record.name)).toEqual(['a.jpg', 'm.jpg', 'z.jpg']);
  });

  it('should aggregate records across multiple curation files into the same bucket', async () => {
    const file1 = makeFile('/Photos/Lyon', {
      'id:a': { photoId: 'id:a', pathLower: '/a.jpg', pathDisplay: '/A.jpg', name: 'a.jpg', groupId: 'g1' },
    });
    const file2 = makeFile('/Photos/Paris', {
      'id:b': { photoId: 'id:b', pathLower: '/b.jpg', pathDisplay: '/B.jpg', name: 'b.jpg', groupId: 'g1' },
    });
    mockListCuration.mockResolvedValue([file1, file2]);
    const { result } = renderHook(() => useGroupedRecords());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recordsByGroupId.get('g1')).toHaveLength(2);
  });
});
