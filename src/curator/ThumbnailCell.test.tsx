import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  client_modified: '2026-01-01T00:00:00Z',
};

describe('ThumbnailCell', () => {
  it('should render a loading spinner when state is loading', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} onClick={vi.fn()} />);
    expect(screen.getByTestId('thumbnail-loading')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should render an img with the data URL when state is success', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'success', dataUrl: 'data:image/jpeg;base64,abc' }} onClick={vi.fn()} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,abc');
    expect(img).toHaveAttribute('alt', 'photo.jpg');
  });

  it('should render a broken-image placeholder when state is error', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'error' }} onClick={vi.fn()} />);
    expect(screen.getByTestId('thumbnail-error')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should call onClick when the cell is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('should apply green glow when flag is keep', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} flag="keep" onClick={vi.fn()} />);
    expect(screen.getByTestId('flag-keep')).toBeInTheDocument();
    expect(screen.queryByTestId('flag-discard')).not.toBeInTheDocument();
  });

  it('should apply red glow when flag is discard', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} flag="discard" onClick={vi.fn()} />);
    expect(screen.getByTestId('flag-discard')).toBeInTheDocument();
    expect(screen.queryByTestId('flag-keep')).not.toBeInTheDocument();
  });

  it('should apply no glow when flag is undefined', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} onClick={vi.fn()} />);
    expect(screen.queryByTestId('flag-keep')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flag-discard')).not.toBeInTheDocument();
  });

  it('should render the grouped badge when groupId is set', () => {
    // Given a photo with a groupId (Location Grouping epic)
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} groupId="g1" onClick={vi.fn()} />);
    // Then the badge overlay is present
    expect(screen.getByTestId('grouped')).toBeInTheDocument();
  });

  it('should omit the grouped badge when groupId is undefined', () => {
    // Given a photo with no groupId
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} onClick={vi.fn()} />);
    // Then no grouped badge appears
    expect(screen.queryByTestId('grouped')).not.toBeInTheDocument();
  });

  it('should set aria-current="true" when isActive is true', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} isActive={true} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'photo.jpg' })).toHaveAttribute('aria-current', 'true');
  });

  it('should omit aria-current when isActive is false', () => {
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'photo.jpg' })).not.toHaveAttribute('aria-current');
  });

  it('should call onRetry (not onClick) when the error tile is clicked and onRetry is provided', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onRetry = vi.fn();
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'error' }} onClick={onClick} onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should call onClick normally when the error tile is clicked but no onRetry is provided', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'error' }} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('should call onClick (not onRetry) when a success tile is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onRetry = vi.fn();
    render(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'success', dataUrl: 'data:image/jpeg;base64,abc' }} onClick={onClick} onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'photo.jpg' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should briefly show leaving state then clear it after 200 ms when isActive goes false', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} isActive={true} onClick={vi.fn()} />,
    );

    await act(async () => {
      rerender(<ThumbnailCell file={FAKE_FILE} state={{ tag: 'loading' }} isActive={false} onClick={vi.fn()} />);
    });

    const container = screen.getByRole('button', { name: 'photo.jpg' }).querySelector('div');
    expect(container).toHaveAttribute('data-leaving', 'true');

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(container).not.toHaveAttribute('data-leaving');
    vi.useRealTimers();
  });
});
