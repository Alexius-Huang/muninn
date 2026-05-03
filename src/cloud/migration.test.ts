// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const initSqlJs = require('sql.js');

const SQL_PATH = resolve(import.meta.dirname, '../../migrations/0001_init.sql');

type SqlJsDatabase = {
  run(sql: string): void;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
};

let db: SqlJsDatabase;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const SQL = await initSqlJs();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  db = new SQL.Database();
  const sql = readFileSync(SQL_PATH, 'utf-8');
  db.run(sql);
});

describe('migrations/0001_init.sql', () => {
  it('creates both tables', () => {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = result[0].values.map((row) => row[0] as string);
    expect(names).toContain('groups');
    expect(names).toContain('photos');
  });

  it('groups table has expected columns', () => {
    const result = db.exec('PRAGMA table_info(groups)');
    const cols = result[0].values.map((row) => row[1] as string);
    expect(cols).toEqual(expect.arrayContaining(['id', 'name', 'lat', 'lng', 'place_id', 'location_name', 'created_at']));
  });

  it('groups.id is the primary key', () => {
    const result = db.exec('PRAGMA table_info(groups)');
    const idRow = result[0].values.find((row) => row[1] === 'id');
    expect(idRow).toBeDefined();
    expect(idRow![5]).toBe(1);
  });

  it('photos table has expected columns', () => {
    const result = db.exec('PRAGMA table_info(photos)');
    const cols = result[0].values.map((row) => row[1] as string);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'group_id', 'name', 'captured_at', 'r2_key', 'created_at']),
    );
  });

  it('photos.group_id has a FK to groups(id)', () => {
    const result = db.exec('PRAGMA foreign_key_list(photos)');
    expect(result.length).toBeGreaterThan(0);
    const fkRow = result[0].values[0];
    expect(fkRow[2]).toBe('groups');
    expect(fkRow[4]).toBe('id');
  });
});
