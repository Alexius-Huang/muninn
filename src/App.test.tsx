import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { DropboxAuthError, DropboxNetworkError } from './dropbox/client';

const mockGetDropboxToken = vi.fn();
const mockDeleteDropboxToken = vi.fn();
const mockValidateToken = vi.fn();

vi.mock('./auth/keychain', () => ({
  getDropboxToken: (...args: unknown[]) => mockGetDropboxToken(...args),
  deleteDropboxToken: (...args: unknown[]) => mockDeleteDropboxToken(...args),
  setDropboxToken: vi.fn(),
}));

vi.mock('./dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dropbox/client')>();
  return {
    ...actual,
    validateToken: (...args: unknown[]) => mockValidateToken(...args),
  };
});

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc',
  name: { display_name: 'Alice' },
  email: 'alice@example.com',
};

beforeEach(() => {
  mockGetDropboxToken.mockReset();
  mockDeleteDropboxToken.mockReset();
  mockValidateToken.mockReset();
  mockDeleteDropboxToken.mockResolvedValue(undefined);
});

describe('App', () => {
  it('should show the setup screen when no token is stored', async () => {
    mockGetDropboxToken.mockResolvedValue(null);
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/access token/i)).toBeInTheDocument());
  });

  it('should show the connected view when a token is stored and validation succeeds', async () => {
    mockGetDropboxToken.mockResolvedValue('sl.valid-token');
    mockValidateToken.mockResolvedValue(FAKE_ACCOUNT);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  it('should clear the Keychain and show setup when the stored token is rejected by Dropbox', async () => {
    mockGetDropboxToken.mockResolvedValue('sl.expired-token');
    mockValidateToken.mockRejectedValue(new DropboxAuthError('Rejected'));
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/access token/i)).toBeInTheDocument());
    expect(mockDeleteDropboxToken).toHaveBeenCalledOnce();
  });

  it('should show the connected view with a synthetic account when validation throws a network error', async () => {
    mockGetDropboxToken.mockResolvedValue('sl.valid-token');
    mockValidateToken.mockRejectedValue(new DropboxNetworkError('offline'));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Dropbox')).toBeInTheDocument());
  });
});
