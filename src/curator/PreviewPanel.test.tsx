// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetPreview = vi.fn();

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
  return { ...actual, getPreview: (...args: unknown[]) => mockGetPreview(...args) };
});

import { PreviewPanel } from './PreviewPanel';
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

const PREVIEW_URL = 'data:image/jpeg;base64,hires';

function defaultProps(overrides?: Partial<Parameters<typeof PreviewPanel>[0]>) {
  return {
    file: FAKE_FILE,
    index: 0,
    total: 3,
    flag: undefined,
    placeholderDataUrl: undefined,
    width: 480,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onFlag: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockGetPreview.mockReset();
  mockGetPreview.mockResolvedValue(PREVIEW_URL);
});

describe('PreviewPanel', () => {
  it('should render the placeholder image while the high-res preview loads', () => {
    mockGetPreview.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PreviewPanel {...defaultProps({ placeholderDataUrl: 'data:image/jpeg;base64,thumb' })} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,thumb');
  });

  it('should swap to the high-res preview once the fetch resolves', async () => {
    render(<PreviewPanel {...defaultProps()} />);
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', PREVIEW_URL);
    });
  });

  it('should call onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PreviewPanel {...defaultProps({ onClose })} />);
    await user.click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PreviewPanel {...defaultProps({ onClose })} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    ['k', 'keep'],
    ['K', 'keep'],
    ['1', 'keep'],
    ['d', 'discard'],
    ['D', 'discard'],
    ['2', 'discard'],
  ] as [string, 'keep' | 'discard'][])(
    "should call onFlag('%s') → '%s' when key '%s' is pressed",
    async (key, expected) => {
      const user = userEvent.setup();
      const onFlag = vi.fn();
      render(<PreviewPanel {...defaultProps({ onFlag })} />);
      await user.keyboard(key);
      expect(onFlag).toHaveBeenCalledWith(expected);
    },
  );

  it('should call onNavigate(-1) when ArrowLeft is pressed', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<PreviewPanel {...defaultProps({ onNavigate })} />);
    await user.keyboard('{ArrowLeft}');
    expect(onNavigate).toHaveBeenCalledWith(-1);
  });

  it('should call onNavigate(1) when ArrowRight is pressed', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<PreviewPanel {...defaultProps({ onNavigate })} />);
    await user.keyboard('{ArrowRight}');
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('should render the Keep button as active when flag is keep', () => {
    render(<PreviewPanel {...defaultProps({ flag: 'keep' })} />);
    const keepBtn = screen.getByRole('button', { name: /keep/i });
    expect(keepBtn.className).toMatch(/bg-nord-14/);
  });

  it('should render the Discard button as active when flag is discard', () => {
    render(<PreviewPanel {...defaultProps({ flag: 'discard' })} />);
    const discardBtn = screen.getByRole('button', { name: /discard/i });
    expect(discardBtn.className).toMatch(/bg-nord-11/);
  });

  it.each([
    [/keep/i, '1'],
    [/discard/i, '2'],
  ] as [RegExp, string][])(
    "should display a <kbd> hint inside the '%s' button",
    (buttonName, hint) => {
      render(<PreviewPanel {...defaultProps()} />);
      const btn = screen.getByRole('button', { name: buttonName });
      const kbd = btn.querySelector('kbd');
      expect(kbd).not.toBeNull();
      expect(kbd?.textContent).toBe(hint);
    },
  );

  it('should render current index and total in the header', () => {
    render(<PreviewPanel {...defaultProps({ index: 1, total: 10 })} />);
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });

  it.each([
    { label: 'first photo', index: 0, total: 3 },
    { label: 'last photo', index: 2, total: 3 },
  ])('should render Prev and Next without disabled at the $label', ({ index, total }) => {
    render(<PreviewPanel {...defaultProps({ index, total })} />);
    expect(screen.getByRole('button', { name: /previous photo/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next photo/i })).not.toBeDisabled();
  });
});
