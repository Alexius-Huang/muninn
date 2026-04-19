import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupScreen } from './SetupScreen';
import { DropboxAuthError, DropboxNetworkError } from '../dropbox/client';

const mockSetDropboxToken = vi.fn();
const mockValidateToken = vi.fn();

vi.mock('./keychain', () => ({
  setDropboxToken: (...args: unknown[]) => mockSetDropboxToken(...args),
}));

vi.mock('../dropbox/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dropbox/client')>();
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
  mockSetDropboxToken.mockReset();
  mockValidateToken.mockReset();
});

describe('SetupScreen', () => {
  it('should call onConnect after a successful token submission', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    mockValidateToken.mockResolvedValue(FAKE_ACCOUNT);
    mockSetDropboxToken.mockResolvedValue(undefined);

    render(<SetupScreen onConnect={onConnect} />);

    await user.type(screen.getByLabelText(/access token/i), 'sl.valid-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(onConnect).toHaveBeenCalledWith(FAKE_ACCOUNT, 'sl.valid-token'));
    expect(mockSetDropboxToken).toHaveBeenCalledWith('sl.valid-token');
  });

  it('should show an error and not persist when validation rejects with a Dropbox auth error', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    mockValidateToken.mockRejectedValue(
      new DropboxAuthError('This token was rejected by Dropbox. Double-check it and try again.')
    );

    render(<SetupScreen onConnect={onConnect} />);

    await user.type(screen.getByLabelText(/access token/i), 'sl.bad-token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/rejected by Dropbox/i)
    );
    expect(mockSetDropboxToken).not.toHaveBeenCalled();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('should disable the submit button while validating', async () => {
    const user = userEvent.setup();
    let resolveValidate!: (v: unknown) => void;
    mockValidateToken.mockReturnValue(
      new Promise((res) => {
        resolveValidate = res;
      })
    );
    mockSetDropboxToken.mockResolvedValue(undefined);

    render(<SetupScreen onConnect={vi.fn()} />);

    await user.type(screen.getByLabelText(/access token/i), 'sl.token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    resolveValidate(FAKE_ACCOUNT);
  });

  it('should show a network-error message when validateToken throws DropboxNetworkError', async () => {
    const user = userEvent.setup();
    mockValidateToken.mockRejectedValue(new DropboxNetworkError('Failed to fetch'));

    render(<SetupScreen onConnect={vi.fn()} />);

    await user.type(screen.getByLabelText(/access token/i), 'sl.token');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't reach Dropbox/i)
    );
  });
});
