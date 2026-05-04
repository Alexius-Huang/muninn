// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { DropboxAuthError, DropboxNetworkError } from './dropbox/client';

const mockInit = vi.fn();
const mockIsAuthenticated = vi.fn();
const mockOnDisconnect = vi.fn();
const mockValidateToken = vi.fn();

vi.mock('./auth/dropboxAuth', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
  onDisconnect: (...args: unknown[]) => mockOnDisconnect(...args),
}));

vi.mock('./curator/curation', () => ({
  listCuration: vi.fn().mockResolvedValue([]),
  readCuration: vi.fn().mockResolvedValue(null),
  writeCuration: vi.fn().mockResolvedValue(undefined),
  migrateLegacyCurationFile: vi.fn((x: unknown) => x),
}));

vi.mock('./curator/groups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./curator/groups')>();
  return { ...actual, readGroups: vi.fn().mockResolvedValue([]) };
});

vi.mock('./dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dropbox/client')>();
  return {
    ...actual,
    validateToken: (...args: unknown[]) => mockValidateToken(...args),
    listFolderAll: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('./cloud/cfAuth', () => ({
  getCfAuth: vi.fn().mockResolvedValue(null),
}));

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc',
  name: { display_name: 'Alice' },
  email: 'alice@example.com',
};

beforeEach(() => {
  mockInit.mockReset().mockResolvedValue(undefined);
  mockIsAuthenticated.mockReset();
  mockOnDisconnect.mockReset().mockReturnValue(() => {});
  mockValidateToken.mockReset();
});

describe('App', () => {
  it('should show the setup screen when not authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /connect dropbox/i })).toBeInTheDocument()
    );
  });

  it('should show the connected view when authenticated and validation succeeds', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockValidateToken.mockResolvedValue(FAKE_ACCOUNT);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  it('should show the setup screen when validateToken throws DropboxAuthError', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockValidateToken.mockRejectedValue(new DropboxAuthError('Rejected'));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /connect dropbox/i })).toBeInTheDocument()
    );
  });

  it('should show the connected view with a synthetic account when validation throws DropboxNetworkError', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockValidateToken.mockRejectedValue(new DropboxNetworkError('offline'));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
    );
  });

  it('should drop back to setup when onDisconnect fires', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockValidateToken.mockResolvedValue(FAKE_ACCOUNT);
    let capturedCb: (() => void) | null = null;
    mockOnDisconnect.mockImplementation((cb: () => void) => {
      capturedCb = cb;
      return () => {};
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    // fire the disconnect event
    capturedCb!();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /connect dropbox/i })).toBeInTheDocument()
    );
  });
});
