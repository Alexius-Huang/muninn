// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runCreateGroupTransaction,
  R2_UPLOAD_CONCURRENCY,
  D1PhotoInsertError,
  type OrchestratorDeps,
  type PhotoRowWithSource,
} from './createGroupOrchestrator';
import type { Group } from '../curator/groups';
import type { D1Client } from './d1Client';
import type { R2Client } from './r2Client';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    name: 'Lyon Trip',
    lat: 45.75,
    lng: 4.83,
    placeId: 'place-abc',
    locationName: 'Lyon, France',
    photoIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePhoto(overrides: Partial<PhotoRowWithSource> = {}): PhotoRowWithSource {
  return {
    id: 'p1',
    groupId: 'group-1',
    name: 'IMG_001.jpg',
    capturedAt: '2026-01-01T12:00:00.000Z',
    r2Key: 'photos/p1',
    dropboxPath: '/Photos/IMG_001.jpg',
    ...overrides,
  };
}

function makeR2(): R2Client {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

function makeD1(): D1Client {
  return { query: vi.fn().mockResolvedValue([]) };
}

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    d1: makeD1(),
    r2: makeR2(),
    uploadPhotoToR2: vi.fn().mockResolvedValue({ r2Key: 'photos/p1' }),
    insertGroupRow: vi.fn().mockResolvedValue(undefined),
    insertPhotoRows: vi.fn().mockResolvedValue(undefined),
    persistLocal: vi.fn().mockResolvedValue(undefined),
    rollbackLocal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('happy path', () => {
  it('should call uploadPhotoToR2 once per photo', async () => {
    const photos = [
      makePhoto({ id: 'p1', dropboxPath: '/a.jpg' }),
      makePhoto({ id: 'p2', dropboxPath: '/b.jpg' }),
      makePhoto({ id: 'p3', dropboxPath: '/c.jpg' }),
    ];
    const deps = makeDeps();
    await runCreateGroupTransaction(makeGroup(), photos, deps);

    expect(deps.uploadPhotoToR2).toHaveBeenCalledTimes(3);
    expect(deps.uploadPhotoToR2).toHaveBeenCalledWith(deps.r2, { photoId: 'p1', pathDisplay: '/a.jpg' });
    expect(deps.uploadPhotoToR2).toHaveBeenCalledWith(deps.r2, { photoId: 'p2', pathDisplay: '/b.jpg' });
    expect(deps.uploadPhotoToR2).toHaveBeenCalledWith(deps.r2, { photoId: 'p3', pathDisplay: '/c.jpg' });
  });

  it('should insert D1 group row before any R2 upload', async () => {
    const callOrder: string[] = [];
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const deps = makeDeps({
      persistLocal: vi.fn().mockImplementation(() => { callOrder.push('persist-local'); return Promise.resolve(); }),
      insertGroupRow: vi.fn().mockImplementation(() => { callOrder.push('d1-group-insert'); return Promise.resolve(); }),
      uploadPhotoToR2: vi.fn().mockImplementation(() => { callOrder.push('upload'); return Promise.resolve({ r2Key: 'photos/px' }); }),
      insertPhotoRows: vi.fn().mockImplementation(() => { callOrder.push('d1-photo-insert'); return Promise.resolve(); }),
    });

    await runCreateGroupTransaction(makeGroup(), photos, deps);

    expect(callOrder[0]).toBe('persist-local');
    expect(callOrder[1]).toBe('d1-group-insert');
    // uploads follow (may appear multiple times)
    const uploadIdx = callOrder.indexOf('upload');
    const groupInsertIdx = callOrder.indexOf('d1-group-insert');
    expect(uploadIdx).toBeGreaterThan(groupInsertIdx);
  });

  it('should call insertGroupRow once with the group', async () => {
    const group = makeGroup();
    const deps = makeDeps();
    await runCreateGroupTransaction(group, [makePhoto()], deps);

    expect(deps.insertGroupRow).toHaveBeenCalledOnce();
    expect(deps.insertGroupRow).toHaveBeenCalledWith(deps.d1, group);
  });

  it('should only insert D1 photo rows for succeeded R2 uploads', async () => {
    const photos = [
      makePhoto({ id: 'p1', dropboxPath: '/a.jpg' }),
      makePhoto({ id: 'p2', dropboxPath: '/b.jpg' }),
      makePhoto({ id: 'p3', dropboxPath: '/c.jpg' }),
    ];
    const uploadPhotoToR2 = vi.fn()
      .mockResolvedValueOnce({ r2Key: 'photos/p1' })
      .mockRejectedValueOnce(new Error('upload p2 failed'))
      .mockResolvedValueOnce({ r2Key: 'photos/p3' });
    const deps = makeDeps({ uploadPhotoToR2 });

    await runCreateGroupTransaction(makeGroup(), photos, deps);

    expect(deps.insertPhotoRows).toHaveBeenCalledOnce();
    const [, calledPhotos] = (deps.insertPhotoRows as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, PhotoRowWithSource[]];
    expect(calledPhotos.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('should not call any rollback when all phases succeed', async () => {
    const deps = makeDeps();
    await runCreateGroupTransaction(makeGroup(), [makePhoto()], deps);

    expect(deps.r2.deleteObject).not.toHaveBeenCalled();
    expect(deps.rollbackLocal).not.toHaveBeenCalled();
  });

  it('should resolve with { succeeded, failed } where all succeeded on full success', async () => {
    const photos = [
      makePhoto({ id: 'p1' }),
      makePhoto({ id: 'p2' }),
      makePhoto({ id: 'p3' }),
    ];
    const deps = makeDeps();
    const result = await runCreateGroupTransaction(makeGroup(), photos, deps);

    expect(result).toEqual({ succeeded: ['p1', 'p2', 'p3'], failed: [] });
  });

  it('should resolve with empty succeeded/failed when photos array is empty', async () => {
    const deps = makeDeps();
    const result = await runCreateGroupTransaction(makeGroup(), [], deps);

    expect(result).toEqual({ succeeded: [], failed: [] });
    expect(deps.uploadPhotoToR2).not.toHaveBeenCalled();
    expect(deps.insertPhotoRows).not.toHaveBeenCalled();
  });
});

describe('phase 1 — local persist failure', () => {
  it('should throw without calling insertGroupRow when persistLocal fails', async () => {
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('disk full')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.insertGroupRow).not.toHaveBeenCalled();
  });

  it('should throw without calling uploadPhotoToR2 when persistLocal fails', async () => {
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('disk full')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.uploadPhotoToR2).not.toHaveBeenCalled();
  });

  it('should throw an error mentioning local persistence', async () => {
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('no space left')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to persist group locally:/);
  });
});

describe('phase 2 — D1 group insert failure', () => {
  it('should call rollbackLocal when D1 group insert fails', async () => {
    const deps = makeDeps({
      insertGroupRow: vi.fn().mockRejectedValue(new Error('D1 error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.rollbackLocal).toHaveBeenCalledOnce();
  });

  it('should not call uploadPhotoToR2 when D1 group insert fails', async () => {
    const deps = makeDeps({
      insertGroupRow: vi.fn().mockRejectedValue(new Error('D1 error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.uploadPhotoToR2).not.toHaveBeenCalled();
  });

  it('should throw an error mentioning D1', async () => {
    const deps = makeDeps({
      insertGroupRow: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to write group metadata to D1: boom/);
  });

  it('should still throw the originating error when rollbackLocal also fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      insertGroupRow: vi.fn().mockRejectedValue(new Error('D1 boom')),
      rollbackLocal: vi.fn().mockRejectedValue(new Error('rollback also failed')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to write group metadata to D1: D1 boom/);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('phase 3 — R2 partial failure (best-effort)', () => {
  it.each([
    ['first photo fails', [false, true, true], ['p2', 'p3'], ['p1']],
    ['last photo fails', [true, true, false], ['p1', 'p2'], ['p3']],
    ['multiple fail in middle', [true, false, true, false, true], ['p1', 'p3', 'p5'], ['p2', 'p4']],
    ['all fail', [false, false, false], [], ['p1', 'p2', 'p3']],
  ] as const)(
    'should partition succeeded/failed correctly when %s',
    async (_label, succeedFlags, expectedSucceeded, expectedFailed) => {
      const photos = succeedFlags.map((_, i) =>
        makePhoto({ id: `p${i + 1}`, dropboxPath: `/p${i + 1}.jpg` }),
      );
      const uploadPhotoToR2 = vi.fn().mockImplementation((_r2: R2Client, input: { photoId: string }) => {
        const idx = photos.findIndex((p) => p.id === input.photoId);
        return succeedFlags[idx]
          ? Promise.resolve({ r2Key: `photos/${input.photoId}` })
          : Promise.reject(new Error(`upload ${input.photoId} failed`));
      });
      const deps = makeDeps({ uploadPhotoToR2 });

      const result = await runCreateGroupTransaction(makeGroup(), photos, deps);

      expect(result.succeeded).toEqual(expect.arrayContaining(expectedSucceeded));
      expect(result.succeeded).toHaveLength(expectedSucceeded.length);
      expect(result.failed).toEqual(expect.arrayContaining(expectedFailed));
      expect(result.failed).toHaveLength(expectedFailed.length);
    },
  );

  it('should not roll back local persist on R2 partial failure', async () => {
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const uploadPhotoToR2 = vi.fn()
      .mockResolvedValueOnce({ r2Key: 'photos/p1' })
      .mockRejectedValueOnce(new Error('upload p2 failed'));
    const deps = makeDeps({ uploadPhotoToR2 });

    await runCreateGroupTransaction(makeGroup(), photos, deps);

    expect(deps.rollbackLocal).not.toHaveBeenCalled();
    expect(deps.r2.deleteObject).not.toHaveBeenCalled();
  });

  it('should not throw when some R2 uploads fail', async () => {
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const uploadPhotoToR2 = vi.fn()
      .mockResolvedValueOnce({ r2Key: 'photos/p1' })
      .mockRejectedValueOnce(new Error('upload p2 failed'));
    const deps = makeDeps({ uploadPhotoToR2 });

    await expect(runCreateGroupTransaction(makeGroup(), photos, deps)).resolves.toBeDefined();
  });

  it('should not call insertPhotoRows when all R2 uploads fail', async () => {
    const deps = makeDeps({
      uploadPhotoToR2: vi.fn().mockRejectedValue(new Error('R2 error')),
    });

    await runCreateGroupTransaction(makeGroup(), [makePhoto()], deps);
    expect(deps.insertPhotoRows).not.toHaveBeenCalled();
  });
});

describe('phase 4 — D1 photo insert retry', () => {
  it('should retry D1 batch photo insert up to 3 times with exponential backoff', async () => {
    vi.useFakeTimers();
    const insertPhotoRows = vi.fn().mockRejectedValue(new Error('D1 transient'));
    const deps = makeDeps({ insertPhotoRows });

    const txPromise = runCreateGroupTransaction(makeGroup(), [makePhoto()], deps).catch(() => {});
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 1);

    await txPromise;
    // 1 initial attempt + 3 retries = 4 total calls
    expect(insertPhotoRows).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('should throw with succeeded R2 photo IDs when D1 batch insert exhausts retries', async () => {
    vi.useFakeTimers();
    const photos = [
      makePhoto({ id: 'p1', dropboxPath: '/a.jpg' }),
      makePhoto({ id: 'p2', dropboxPath: '/b.jpg' }),
      makePhoto({ id: 'p3', dropboxPath: '/c.jpg' }),
    ];
    const uploadPhotoToR2 = vi.fn()
      .mockResolvedValueOnce({ r2Key: 'photos/p1' })
      .mockRejectedValueOnce(new Error('upload p2 failed'))
      .mockResolvedValueOnce({ r2Key: 'photos/p3' });
    const insertPhotoRows = vi.fn().mockRejectedValue(new Error('D1 down'));
    const deps = makeDeps({ uploadPhotoToR2, insertPhotoRows });

    // Attach catch immediately to prevent unhandled-rejection warnings
    let caughtError: unknown;
    const txPromise = runCreateGroupTransaction(makeGroup(), photos, deps).catch(e => { caughtError = e; });
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 1);
    await txPromise;

    expect(caughtError).toBeInstanceOf(D1PhotoInsertError);
    expect((caughtError as D1PhotoInsertError).succeededR2PhotoIds).toEqual(['p1', 'p3']);
    vi.useRealTimers();
  });

  it('should resolve successfully when D1 photo insert succeeds on a retry', async () => {
    vi.useFakeTimers();
    const insertPhotoRows = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    const deps = makeDeps({ insertPhotoRows });

    const txPromise = runCreateGroupTransaction(makeGroup(), [makePhoto()], deps);
    await vi.advanceTimersByTimeAsync(500 + 1);

    const result = await txPromise;
    expect(result).toEqual({ succeeded: ['p1'], failed: [] });
    expect(insertPhotoRows).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('concurrency cap', () => {
  it('should run at most R2_UPLOAD_CONCURRENCY uploads concurrently', async () => {
    const N = R2_UPLOAD_CONCURRENCY + 5;
    const photos = Array.from({ length: N }, (_, i) =>
      makePhoto({ id: `p${i + 1}`, dropboxPath: `/p${i + 1}.jpg` }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    const pendingResolvers: Array<() => void> = [];

    const uploadPhotoToR2 = vi.fn().mockImplementation(() => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      return new Promise<{ r2Key: string }>((resolve) => {
        pendingResolvers.push(() => {
          inFlight--;
          resolve({ r2Key: 'photos/px' });
        });
      });
    });

    const deps = makeDeps({ uploadPhotoToR2 });
    const txPromise = runCreateGroupTransaction(makeGroup(), photos, deps);

    // Drain persistLocal and insertGroupRow microtasks before uploads start
    await Promise.resolve();
    await Promise.resolve();

    // Workers have now started — exactly R2_UPLOAD_CONCURRENCY are in-flight
    expect(pendingResolvers.length).toBe(R2_UPLOAD_CONCURRENCY);
    expect(maxInFlight).toBe(R2_UPLOAD_CONCURRENCY);

    // Drain all uploads one at a time; each resolve lets a worker pick up the next task
    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    await txPromise;

    expect(uploadPhotoToR2).toHaveBeenCalledTimes(N);
    expect(maxInFlight).toBe(R2_UPLOAD_CONCURRENCY);
  });
});

describe('rollback robustness', () => {
  it('should warn but not throw when rollbackLocal fails during D1 group insert failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      insertGroupRow: vi.fn().mockRejectedValue(new Error('D1 group error')),
      rollbackLocal: vi.fn().mockRejectedValue(new Error('rollback failed')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to write group metadata to D1: D1 group error/);
    expect(console.warn).toHaveBeenCalled();
  });
});
