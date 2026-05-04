// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runCreateGroupTransaction,
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
    insertGroupAndPhotos: vi.fn().mockResolvedValue(undefined),
    deleteGroupRowsFromD1: vi.fn().mockResolvedValue(undefined),
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

  it('should call insertGroupAndPhotos with the group and photos', async () => {
    const group = makeGroup();
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const deps = makeDeps();
    await runCreateGroupTransaction(group, photos, deps);

    expect(deps.insertGroupAndPhotos).toHaveBeenCalledOnce();
    expect(deps.insertGroupAndPhotos).toHaveBeenCalledWith(deps.d1, group, photos);
  });

  it('should call persistLocal after CF writes succeed', async () => {
    const callOrder: string[] = [];
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const deps = makeDeps({
      uploadPhotoToR2: vi.fn().mockImplementation(() => {
        callOrder.push('upload');
        return Promise.resolve({ r2Key: 'photos/p1' });
      }),
      insertGroupAndPhotos: vi.fn().mockImplementation(() => {
        callOrder.push('d1-insert');
        return Promise.resolve();
      }),
      persistLocal: vi.fn().mockImplementation(() => {
        callOrder.push('persist-local');
        return Promise.resolve();
      }),
    });

    await runCreateGroupTransaction(makeGroup(), photos, deps);

    expect(callOrder).toEqual(['upload', 'upload', 'd1-insert', 'persist-local']);
  });

  it('should not call any rollback when all phases succeed', async () => {
    const deps = makeDeps();
    await runCreateGroupTransaction(makeGroup(), [makePhoto()], deps);

    expect(deps.r2.deleteObject).not.toHaveBeenCalled();
    expect(deps.deleteGroupRowsFromD1).not.toHaveBeenCalled();
    expect(deps.rollbackLocal).not.toHaveBeenCalled();
  });

  it('should resolve to undefined on the happy path', async () => {
    const deps = makeDeps();
    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).resolves.toBeUndefined();
  });

  it('should still call insertGroupAndPhotos when photos array is empty', async () => {
    const group = makeGroup();
    const deps = makeDeps();
    await runCreateGroupTransaction(group, [], deps);

    expect(deps.uploadPhotoToR2).not.toHaveBeenCalled();
    expect(deps.insertGroupAndPhotos).toHaveBeenCalledWith(deps.d1, group, []);
  });
});

describe('phase 1 — R2 upload failure', () => {
  it.each([
    ['first photo fails', [false, true, true], ['p2', 'p3']],
    ['last photo fails', [true, true, false], ['p1', 'p2']],
    ['multiple fail in middle', [true, false, true, false, true], ['p1', 'p3', 'p5']],
    ['all fail', [false, false, false], []],
  ] as const)(
    'should delete only the fulfilled R2 objects when %s',
    async (_label, succeedFlags, expectedDeletedIds) => {
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

      await expect(runCreateGroupTransaction(makeGroup(), photos, deps)).rejects.toThrow();

      expect(deps.r2.deleteObject).toHaveBeenCalledTimes(expectedDeletedIds.length);
      for (const id of expectedDeletedIds) {
        expect(deps.r2.deleteObject).toHaveBeenCalledWith(`photos/${id}`);
      }
    },
  );

  it('should not call insertGroupAndPhotos when R2 fails', async () => {
    const deps = makeDeps({
      uploadPhotoToR2: vi.fn().mockRejectedValue(new Error('R2 error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.insertGroupAndPhotos).not.toHaveBeenCalled();
  });

  it('should not call persistLocal when R2 fails', async () => {
    const deps = makeDeps({
      uploadPhotoToR2: vi.fn().mockRejectedValue(new Error('R2 error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.persistLocal).not.toHaveBeenCalled();
  });

  it('should throw an error mentioning the count of failed uploads', async () => {
    const photos = Array.from({ length: 5 }, (_, i) =>
      makePhoto({ id: `p${i + 1}`, dropboxPath: `/p${i + 1}.jpg` }),
    );
    let callCount = 0;
    const uploadPhotoToR2 = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount <= 2
        ? Promise.resolve({ r2Key: 'photos/px' })
        : Promise.reject(new Error('upload failed'));
    });
    const deps = makeDeps({ uploadPhotoToR2 });

    await expect(
      runCreateGroupTransaction(makeGroup(), photos, deps),
    ).rejects.toThrow(/Failed to upload 3 of 5 photos to R2:/);
  });

  it('should include the first rejection reason in the error message', async () => {
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const uploadPhotoToR2 = vi.fn().mockRejectedValue(new Error('R2 503'));
    const deps = makeDeps({ uploadPhotoToR2 });

    await expect(
      runCreateGroupTransaction(makeGroup(), photos, deps),
    ).rejects.toThrow(/R2 503/);
  });
});

describe('phase 2 — D1 insert failure', () => {
  it('should delete all R2 objects when D1 insert fails', async () => {
    const photos = [
      makePhoto({ id: 'p1' }),
      makePhoto({ id: 'p2' }),
      makePhoto({ id: 'p3' }),
    ];
    const deps = makeDeps({
      insertGroupAndPhotos: vi.fn().mockRejectedValue(new Error('D1 error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), photos, deps)).rejects.toThrow();

    expect(deps.r2.deleteObject).toHaveBeenCalledWith('photos/p1');
    expect(deps.r2.deleteObject).toHaveBeenCalledWith('photos/p2');
    expect(deps.r2.deleteObject).toHaveBeenCalledWith('photos/p3');
  });

  it('should delete the group row when D1 insert fails', async () => {
    const group = makeGroup({ id: 'grp-42' });
    const deps = makeDeps({
      insertGroupAndPhotos: vi.fn().mockRejectedValue(new Error('D1 error')),
    });

    await expect(runCreateGroupTransaction(group, [makePhoto()], deps)).rejects.toThrow();

    expect(deps.deleteGroupRowsFromD1).toHaveBeenCalledWith(deps.d1, 'grp-42');
  });

  it('should not call persistLocal when D1 fails', async () => {
    const deps = makeDeps({
      insertGroupAndPhotos: vi.fn().mockRejectedValue(new Error('D1 error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.persistLocal).not.toHaveBeenCalled();
  });

  it('should throw an error mentioning D1', async () => {
    const deps = makeDeps({
      insertGroupAndPhotos: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to write group metadata to D1: boom/);
  });
});

describe('phase 3 — local persistence failure', () => {
  it('should run cloud rollback (R2 + D1) when persistLocal throws', async () => {
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    const group = makeGroup({ id: 'grp-1' });
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('local error')),
    });

    await expect(runCreateGroupTransaction(group, photos, deps)).rejects.toThrow();

    expect(deps.r2.deleteObject).toHaveBeenCalledWith('photos/p1');
    expect(deps.r2.deleteObject).toHaveBeenCalledWith('photos/p2');
    expect(deps.deleteGroupRowsFromD1).toHaveBeenCalledWith(deps.d1, 'grp-1');
  });

  it('should call rollbackLocal when persistLocal throws', async () => {
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('local error')),
    });

    await expect(runCreateGroupTransaction(makeGroup(), [makePhoto()], deps)).rejects.toThrow();
    expect(deps.rollbackLocal).toHaveBeenCalledOnce();
  });

  it('should throw an error mentioning local persistence', async () => {
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('disk full')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to persist group locally:/);
  });
});

describe('rollback robustness', () => {
  it('should still throw the originating error when an R2 rollback DELETE fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const photos = [
      makePhoto({ id: 'p1' }),
      makePhoto({ id: 'p2' }),
      makePhoto({ id: 'p3' }),
    ];
    const uploadPhotoToR2 = vi.fn()
      .mockResolvedValueOnce({ r2Key: 'photos/p1' })
      .mockResolvedValueOnce({ r2Key: 'photos/p2' })
      .mockRejectedValueOnce(new Error('upload p3 failed'));
    const r2 = makeR2();
    (r2.deleteObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('delete failed'));
    const deps = makeDeps({ uploadPhotoToR2, r2 });

    await expect(
      runCreateGroupTransaction(makeGroup(), photos, deps),
    ).rejects.toThrow(/Failed to upload 1 of 3 photos to R2:/);
    expect(console.warn).toHaveBeenCalled();
  });

  it('should still throw the originating error when the D1 rollback DELETE fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      insertGroupAndPhotos: vi.fn().mockRejectedValue(new Error('D1 boom')),
      deleteGroupRowsFromD1: vi.fn().mockRejectedValue(new Error('delete row failed')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to write group metadata to D1: D1 boom/);
    expect(console.warn).toHaveBeenCalled();
  });

  it('should still throw the originating error when rollbackLocal throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      persistLocal: vi.fn().mockRejectedValue(new Error('local fail')),
      rollbackLocal: vi.fn().mockRejectedValue(new Error('rollback also failed')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to persist group locally: local fail/);
    expect(console.warn).toHaveBeenCalled();
  });

  it('should not throw the rollback failure even if multiple rollback steps fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r2 = makeR2();
    (r2.deleteObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('r2 delete fail'));
    const deps = makeDeps({
      r2,
      persistLocal: vi.fn().mockRejectedValue(new Error('local fail')),
      deleteGroupRowsFromD1: vi.fn().mockRejectedValue(new Error('d1 delete fail')),
      rollbackLocal: vi.fn().mockRejectedValue(new Error('rollbackLocal fail')),
    });

    await expect(
      runCreateGroupTransaction(makeGroup(), [makePhoto()], deps),
    ).rejects.toThrow(/Failed to persist group locally: local fail/);
  });
});
