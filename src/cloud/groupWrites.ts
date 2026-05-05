import type { D1Client } from './d1Client';
import type { Group } from '../curator/groups';

export type PhotoRow = {
  id: string;
  groupId: string;
  name: string;
  capturedAt?: string;
  r2Key: string;
};

const GROUP_INSERT_SQL =
  'INSERT INTO groups (id, name, lat, lng, place_id, location_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
const PHOTO_INSERT_SQL =
  'INSERT OR IGNORE INTO photos (id, group_id, name, captured_at, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const GROUP_DELETE_SQL = 'DELETE FROM groups WHERE id = ?';

export async function insertGroupRow(d1: D1Client, group: Group): Promise<void> {
  const groupCreatedAt = group.createdAt ?? new Date().toISOString();
  await d1.query(GROUP_INSERT_SQL, [
    group.id,
    group.name,
    group.lat,
    group.lng,
    group.placeId ?? null,
    group.locationName ?? null,
    groupCreatedAt,
  ]);
}

export async function insertPhotoRows(d1: D1Client, photos: PhotoRow[]): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all(
    photos.map((p) =>
      d1.query(PHOTO_INSERT_SQL, [
        p.id,
        p.groupId,
        p.name,
        p.capturedAt ?? null,
        p.r2Key,
        now,
      ]),
    ),
  );
}

export async function insertGroupAndPhotos(
  d1: D1Client,
  group: Group,
  photos: PhotoRow[],
): Promise<void> {
  const now = new Date().toISOString();
  const groupCreatedAt = group.createdAt ?? now;
  await d1.query(GROUP_INSERT_SQL, [
    group.id,
    group.name,
    group.lat,
    group.lng,
    group.placeId ?? null,
    group.locationName ?? null,
    groupCreatedAt,
  ]);
  await Promise.all(
    photos.map((p) =>
      d1.query(PHOTO_INSERT_SQL, [
        p.id,
        p.groupId,
        p.name,
        p.capturedAt ?? null,
        p.r2Key,
        now,
      ]),
    ),
  );
}

export async function deleteGroupRowsFromD1(
  d1: D1Client,
  groupId: string,
): Promise<void> {
  await d1.query(GROUP_DELETE_SQL, [groupId]);
}

type GroupJoinRow = {
  group_id: string;
  group_name: string;
  lat: number;
  lng: number;
  place_id: string | null;
  location_name: string | null;
  created_at: string;
  photo_id: string | null;
};

export const SELECT_GROUPS_SQL = `SELECT g.id AS group_id, g.name AS group_name, g.lat AS lat, g.lng AS lng, g.place_id AS place_id, g.location_name AS location_name, g.created_at AS created_at, p.id AS photo_id FROM groups g LEFT JOIN photos p ON p.group_id = g.id ORDER BY g.created_at DESC`;

export async function selectAllGroups(d1: D1Client): Promise<Group[]> {
  const rows = (await d1.query(SELECT_GROUPS_SQL, [])) as GroupJoinRow[];
  const map = new Map<string, Group>();
  for (const row of rows) {
    if (!map.has(row.group_id)) {
      map.set(row.group_id, {
        id: row.group_id,
        name: row.group_name,
        lat: row.lat,
        lng: row.lng,
        placeId: row.place_id ?? undefined,
        locationName: row.location_name ?? undefined,
        createdAt: row.created_at,
        photoIds: [],
      });
    }
    if (row.photo_id !== null) {
      map.get(row.group_id)!.photoIds.push(row.photo_id);
    }
  }
  return Array.from(map.values());
}
