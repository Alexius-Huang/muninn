import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigurationPanel } from './ConfigurationPanel';

const { mockGetCfAuth, mockSetCfAuth, mockDeleteCfAuth } = vi.hoisted(() => ({
  mockGetCfAuth: vi.fn(),
  mockSetCfAuth: vi.fn(),
  mockDeleteCfAuth: vi.fn(),
}));

vi.mock('./cfAuth', () => ({
  getCfAuth: mockGetCfAuth,
  setCfAuth: mockSetCfAuth,
  deleteCfAuth: mockDeleteCfAuth,
}));

const { mockD1Query } = vi.hoisted(() => ({ mockD1Query: vi.fn() }));
vi.mock('./d1Client', () => ({
  createD1Client: () => ({ query: mockD1Query }),
}));

const { mockPutObject, mockGetObject } = vi.hoisted(() => ({
  mockPutObject: vi.fn(),
  mockGetObject: vi.fn(),
}));
vi.mock('./r2Client', () => ({
  createR2Client: () => ({ putObject: mockPutObject, getObject: mockGetObject }),
}));

vi.mock('../curator/store', () => ({
  useAppStore: {
    getState: vi.fn(() => ({ loadCfAuth: vi.fn().mockResolvedValue(undefined) })),
  },
}));

import type { CfAuth } from './cfAuth';

const STORED_AUTH: CfAuth = {
  accountId: 'acct-1',
  d1ApiToken: 'tok',
  d1DatabaseId: 'db-1',
  r2AccessKeyId: 'key',
  r2SecretAccessKey: 'secret',
  r2Bucket: 'muninn-photos',
};

beforeEach(() => {
  mockGetCfAuth.mockReset();
  mockSetCfAuth.mockReset();
  mockDeleteCfAuth.mockReset();
  mockD1Query.mockReset();
  mockPutObject.mockReset();
  mockGetObject.mockReset();
});

describe('ConfigurationPanel', () => {
  it('renders setup form when no credentials are stored', async () => {
    mockGetCfAuth.mockResolvedValue(null);
    render(<ConfigurationPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText('Account ID')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('D1 API Token')).toBeInTheDocument();
    expect(screen.getByLabelText('R2 Access Key ID')).toBeInTheDocument();
  });

  it('calls setCfAuth with the filled form values on Save', async () => {
    mockGetCfAuth.mockResolvedValueOnce(null).mockResolvedValueOnce(STORED_AUTH);
    mockSetCfAuth.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ConfigurationPanel />);
    await waitFor(() => screen.getByLabelText('Account ID'));

    await user.clear(screen.getByLabelText('Account ID'));
    await user.type(screen.getByLabelText('Account ID'), 'acct-1');
    await user.clear(screen.getByLabelText('D1 API Token'));
    await user.type(screen.getByLabelText('D1 API Token'), 'tok');
    await user.clear(screen.getByLabelText('D1 Database ID'));
    await user.type(screen.getByLabelText('D1 Database ID'), 'db-1');
    await user.clear(screen.getByLabelText('R2 Access Key ID'));
    await user.type(screen.getByLabelText('R2 Access Key ID'), 'key');
    await user.clear(screen.getByLabelText('R2 Secret Access Key'));
    await user.type(screen.getByLabelText('R2 Secret Access Key'), 'secret');

    await user.click(screen.getByRole('button', { name: /save credentials/i }));

    await waitFor(() => {
      expect(mockSetCfAuth).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acct-1', d1ApiToken: 'tok' }),
      );
    });
  });

  it('shows "Credentials present" and ping buttons when credentials are stored', async () => {
    mockGetCfAuth.mockResolvedValue(STORED_AUTH);
    render(<ConfigurationPanel />);
    await waitFor(() => {
      expect(screen.getByText(/credentials present/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /ping d1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ping r2/i })).toBeInTheDocument();
  });

  it('Ping D1 calls d1Client.query and shows the result row', async () => {
    mockGetCfAuth.mockResolvedValue(STORED_AUTH);
    mockD1Query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: 'debug-123', name: 'ping', lat: 0, lng: 0 }]);
    const user = userEvent.setup();

    render(<ConfigurationPanel />);
    await waitFor(() => screen.getByRole('button', { name: /ping d1/i }));

    await user.click(screen.getByRole('button', { name: /ping d1/i }));

    await waitFor(() => {
      expect(screen.getByText(/debug-123/)).toBeInTheDocument();
    });
  });

  it('Ping R2 calls putObject + getObject and shows byte count', async () => {
    mockGetCfAuth.mockResolvedValue(STORED_AUTH);
    mockPutObject.mockResolvedValue(undefined);
    mockGetObject.mockResolvedValue(new Blob(['\x00']));
    const user = userEvent.setup();

    render(<ConfigurationPanel />);
    await waitFor(() => screen.getByRole('button', { name: /ping r2/i }));

    await user.click(screen.getByRole('button', { name: /ping r2/i }));

    await waitFor(() => {
      expect(screen.getByText(/OK · 1 byte/)).toBeInTheDocument();
    });
  });

  it('shows error banner when Ping D1 throws', async () => {
    mockGetCfAuth.mockResolvedValue(STORED_AUTH);
    mockD1Query.mockRejectedValue(new Error('D1 error: table not found'));
    const user = userEvent.setup();

    render(<ConfigurationPanel />);
    await waitFor(() => screen.getByRole('button', { name: /ping d1/i }));

    await user.click(screen.getByRole('button', { name: /ping d1/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('D1 error: table not found');
    });
  });
});
