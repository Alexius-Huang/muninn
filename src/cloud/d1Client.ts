import type { CfAuth } from './cfAuth';

type D1Row = Record<string, unknown>;

type D1Response = {
  result: Array<{
    results: D1Row[];
    success: boolean;
    meta: Record<string, unknown>;
  }>;
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
};

export type D1Client = {
  query(sql: string, params?: unknown[]): Promise<D1Row[]>;
};

export function createD1Client(auth: CfAuth): D1Client {
  const url = `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/d1/database/${auth.d1DatabaseId}/query`;

  return {
    async query(sql, params = []) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.d1ApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      });

      if (!res.ok) {
        throw new Error(`D1 HTTP ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as D1Response;
      if (!data.success) {
        const msg = data.errors[0]?.message ?? 'Unknown D1 error';
        throw new Error(`D1 error: ${msg}`);
      }

      return data.result[0]?.results ?? [];
    },
  };
}
