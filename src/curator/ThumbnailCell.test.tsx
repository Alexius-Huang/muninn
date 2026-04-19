import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThumbnailCell } from './ThumbnailCell';
import type { DropboxFile } from '../dropbox/client';

const FAKE_FILE: DropboxFile = {
  '.tag': 'file',
  name: 'photo.jpg',
  path_display: '/Photos/photo.jpg',
  path_lower: '/photos/photo.jpg',
  id: 'abc',
  size: 1024,
  server_modified: '2026-01-01T00:00:00Z',
};

describe('ThumbnailCell', () => {
  it('should render a skeleton placeholder when state is loading', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} />);
    expect(screen.getByTestId('thumbnail-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should render an img with the data URL when state is success', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'success', dataUrl: 'data:image/jpeg;base64,abc' }} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,abc');
    expect(img).toHaveAttribute('alt', 'photo.jpg');
  });

  it('should render a broken-image placeholder when state is error', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'error' }} />);
    expect(screen.getByTestId('thumbnail-error')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should apply consistent wrapper class across all three states', () => {
    const { rerender, container } = render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} />);
    const wrapperClass = container.firstElementChild?.className;

    rerender(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'success', dataUrl: 'data:image/jpeg;base64,x' }} />);
    expect(container.firstElementChild?.className).toBe(wrapperClass);

    rerender(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'error' }} />);
    expect(container.firstElementChild?.className).toBe(wrapperClass);
  });
});
