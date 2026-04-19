export type DropboxAccount = {
  account_id: string;
  name: { display_name: string };
  email: string;
};

export class DropboxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxAuthError';
  }
}

export class DropboxNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxNetworkError';
  }
}

export async function validateToken(token: string): Promise<DropboxAccount> {
  let resp: Response;
  try {
    resp = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: 'null',
    });
  } catch (e) {
    throw new DropboxNetworkError((e as Error).message);
  }

  if (resp.status === 401) {
    throw new DropboxAuthError('This token was rejected by Dropbox. Double-check it and try again.');
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new DropboxAuthError(body || `Dropbox returned ${resp.status}`);
  }
  return resp.json() as Promise<DropboxAccount>;
}
