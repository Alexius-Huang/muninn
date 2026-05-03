import { invoke } from '@tauri-apps/api/core';
import type { CfAuth } from './cfAuth';

type D1Row = Record<string, unknown>;

export type D1Client = {
  query(sql: string, params?: unknown[]): Promise<D1Row[]>;
};

export function createD1Client(auth: CfAuth): D1Client {
  return {
    async query(sql, params = []) {
      const json = await invoke<string>('query_d1', {
        accountId: auth.accountId,
        databaseId: auth.d1DatabaseId,
        apiToken: auth.d1ApiToken,
        sql,
        params,
      });
      return JSON.parse(json) as D1Row[];
    },
  };
}
