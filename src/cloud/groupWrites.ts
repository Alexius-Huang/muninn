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
  'INSERT INTO photos (id, group_id, name, captured_at, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?)';
const GROUP_DELETE_SQL = 'DELETE FROM groups WHERE id = ?';

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
