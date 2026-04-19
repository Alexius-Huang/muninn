import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Connected } from './Connected';

const mockDeleteDropboxToken = vi.fn();

vi.mock('../auth/keychain', () => ({
  deleteDropboxToken: (...args: unknown[]) => mockDeleteDropboxToken(...args),
}));

const FAKE_ACCOUNT = {
  account_id: 'dbid:abc',
  name: { display_name: 'Alice' },
  email: 'alice@example.com',
};

beforeEach(() => {
  mockDeleteDropboxToken.mockReset();
  mockDeleteDropboxToken.mockResolvedValue(undefined);
});

describe('Connected', () => {
  it("should render the account's display name and email", () => {
    render(<Connected account={FAKE_ACCOUNT} onDisconnect={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('should delete the token and call onDisconnect when Disconnect is clicked', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();

    render(<Connected account={FAKE_ACCOUNT} onDisconnect={onDisconnect} />);

    await user.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(mockDeleteDropboxToken).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
