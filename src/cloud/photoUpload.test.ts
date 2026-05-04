// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadPhotoToR2 } from './photoUpload';
import type { R2Client } from './r2Client';

const { mockDownloadFile } = vi.hoisted(() => ({ mockDownloadFile: vi.fn() }));
vi.mock('../dropbox/client', () => ({ downloadFile: mockDownloadFile }));

function makeR2(): R2Client {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('uploadPhotoToR2', () => {
  it('should compute r2Key as photos/<photoId>', async () => {
    const r2 = makeR2();
    const blob = new Blob(['x']);
    const download = vi.fn().mockResolvedValue(blob);

    const result = await uploadPhotoToR2(r2, { photoId: 'abc-123', pathDisplay: '/p.jpg' }, download);

    expect(result.r2Key).toBe('photos/abc-123');
  });

  it('should call download before putObject', async () => {
    const r2 = makeR2();
    const order: string[] = [];
    const download = vi.fn().mockImplementation(() => {
      order.push('download');
      return Promise.resolve(new Blob(['x']));
    });
    (r2.putObject as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('put');
      return Promise.resolve();
    });

    await uploadPhotoToR2(r2, { photoId: 'p1', pathDisplay: '/img.jpg' }, download);

    expect(order).toEqual(['download', 'put']);
  });

  it('should pass the downloaded blob and derived content type to putObject', async () => {
    const r2 = makeR2();
    const blob = new Blob(['photo-bytes']);
    const download = vi.fn().mockResolvedValue(blob);

    await uploadPhotoToR2(r2, { photoId: 'p1', pathDisplay: '/img.jpg' }, download);

    expect(r2.putObject).toHaveBeenCalledWith('photos/p1', blob, 'image/jpeg');
  });

  it.each([
    ['/photo.jpg', 'image/jpeg'],
    ['/photo.jpeg', 'image/jpeg'],
    ['/photo.png', 'image/png'],
    ['/photo.heic', 'image/heic'],
    ['/photo.heif', 'image/heic'],
    ['/photo.gif', 'image/gif'],
    ['/photo.webp', 'image/webp'],
    ['/photo.unknown', 'application/octet-stream'],
  ])('should derive content type from extension: %s → %s', async (pathDisplay, expectedType) => {
    const r2 = makeR2();
    const blob = new Blob(['x']);
    const download = vi.fn().mockResolvedValue(blob);

    await uploadPhotoToR2(r2, { photoId: 'p1', pathDisplay }, download);

    expect(r2.putObject).toHaveBeenCalledWith('photos/p1', blob, expectedType);
  });

  it('should propagate errors from download', async () => {
    const r2 = makeR2();
    const err = new Error('network failure');
    const download = vi.fn().mockRejectedValue(err);

    await expect(uploadPhotoToR2(r2, { photoId: 'p1', pathDisplay: '/img.jpg' }, download)).rejects.toThrow(err);
    expect(r2.putObject).not.toHaveBeenCalled();
  });

  it('should propagate errors from putObject', async () => {
    const r2 = makeR2();
    const err = new Error('R2 PUT 503');
    const download = vi.fn().mockResolvedValue(new Blob(['x']));
    (r2.putObject as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    await expect(uploadPhotoToR2(r2, { photoId: 'p1', pathDisplay: '/img.jpg' }, download)).rejects.toThrow(err);
  });

  it('should default download to downloadFile when omitted', async () => {
    const r2 = makeR2();
    mockDownloadFile.mockResolvedValue(new Blob(['x']));

    await uploadPhotoToR2(r2, { photoId: 'p1', pathDisplay: '/img.jpg' });

    expect(mockDownloadFile).toHaveBeenCalledWith('/img.jpg');
  });
});
