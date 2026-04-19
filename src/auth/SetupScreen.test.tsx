import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupScreen } from './SetupScreen';
import { DropboxAuthError, DropboxNetworkError } from '../dropbox/client';

const mockConnect = vi.fn();
const mockValidateToken = vi.fn();

vi.mock('./dropboxAuth', () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
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
  mockConnect.mockReset();
  mockValidateToken.mockReset();
});

describe('SetupScreen', () => {
  it('should render a Connect Dropbox button', () => {
    render(<SetupScreen onConnect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /connect dropbox/i })).toBeInTheDocument();
  });

  it('should not render a token input field', () => {
    render(<SetupScreen onConnect={vi.fn()} />);
    expect(screen.queryByLabelText(/access token/i)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('should call onConnect after a successful authorization', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();
    mockConnect.mockResolvedValue(undefined);
    mockValidateToken.mockResolvedValue(FAKE_ACCOUNT);

    render(<SetupScreen onConnect={onConnect} />);
    await user.click(screen.getByRole('button', { name: /connect dropbox/i }));

    await waitFor(() => expect(onConnect).toHaveBeenCalledWith(FAKE_ACCOUNT));
  });

  it('should show Connecting… while the promise is pending', async () => {
    const user = userEvent.setup();
    let resolveConnect!: () => void;
    mockConnect.mockReturnValue(new Promise<void>((res) => { resolveConnect = res; }));
    mockValidateToken.mockResolvedValue(FAKE_ACCOUNT);

    render(<SetupScreen onConnect={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /connect dropbox/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent(/connecting…/i);

    resolveConnect();
  });

  it('should surface a user-friendly error if connect rejects with a generic error', async () => {
    const user = userEvent.setup();
    mockConnect.mockRejectedValue(new Error('Authorization timed out'));

    render(<SetupScreen onConnect={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /connect dropbox/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Authorization timed out/i)
    );
  });

  it('should surface a DropboxAuthError message', async () => {
    const user = userEvent.setup();
    mockConnect.mockResolvedValue(undefined);
    mockValidateToken.mockRejectedValue(
      new DropboxAuthError('Session expired — please reconnect.')
    );

    render(<SetupScreen onConnect={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /connect dropbox/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Session expired/i)
    );
  });

  it('should surface a network message on DropboxNetworkError', async () => {
    const user = userEvent.setup();
    mockConnect.mockResolvedValue(undefined);
    mockValidateToken.mockRejectedValue(new DropboxNetworkError('fetch failed'));

    render(<SetupScreen onConnect={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /connect dropbox/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't reach Dropbox/i)
    );
  });
});
