import { AwsClient } from 'aws4fetch';
import type { CfAuth } from './cfAuth';

export type R2Client = {
  putObject(key: string, blob: Blob): Promise<void>;
  getObject(key: string): Promise<Blob | null>;
};

export function createR2Client(auth: CfAuth): R2Client {
  const client = new AwsClient({
    accessKeyId: auth.r2AccessKeyId,
    secretAccessKey: auth.r2SecretAccessKey,
    region: 'auto',
    service: 's3',
  });

  const base = `https://${auth.accountId}.r2.cloudflarestorage.com/${auth.r2Bucket}`;

  return {
    async putObject(key, blob) {
      const res = await client.fetch(`${base}/${key}`, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      });
      if (!res.ok) {
        throw new Error(`R2 PUT ${res.status}: ${await res.text()}`);
      }
    },

    async getObject(key) {
      const res = await client.fetch(`${base}/${key}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`R2 GET ${res.status}: ${await res.text()}`);
      }
      return await res.blob();
    },
  };
}
