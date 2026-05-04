import { invoke } from '@tauri-apps/api/core';
import { listCuration, writeCuration, clearGroupRefs } from './curation';

export type Group = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
  locationName?: string;
  photoIds: string[];
  createdAt?: string;
};

export type GroupSort = 'newest' | 'oldest' | 'count' | 'location';

// Pure CRUD — no I/O, return new arrays/objects

export function createGroup(args: {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
  locationName?: string;
  photoIds?: string[];
}): Group {
  const group: Group = {
    id: crypto.randomUUID(),
    name: args.name,
    lat: args.lat,
    lng: args.lng,
    photoIds: args.photoIds ?? [],
    createdAt: new Date().toISOString(),
  };
  if (args.placeId !== undefined) group.placeId = args.placeId;
  if (args.locationName !== undefined) group.locationName = args.locationName;
  return group;
}

export function sortGroups(groups: Group[], sort: GroupSort): Group[] {
  const sorted = [...groups];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    case 'oldest':
      return sorted.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return a.createdAt.localeCompare(b.createdAt);
      });
    case 'count':
      return sorted.sort((a, b) => {
        const diff = b.photoIds.length - a.photoIds.length;
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
    case 'location': {
      const label = (g: Group) => g.locationName ?? `${g.lat},${g.lng}`;
      return sorted.sort((a, b) => label(a).localeCompare(label(b)));
    }
  }
}

export function updateGroup(
  groups: Group[],
  id: string,
  patch: Partial<Omit<Group, 'id'>>,
): Group[] {
  return groups.map((g) => (g.id === id ? { ...g, ...patch, id } : g));
}

export function deleteGroup(groups: Group[], id: string): Group[] {
  return groups.filter((g) => g.id !== id);
}

export function getGroup(groups: Group[], id: string): Group | undefined {
  return groups.find((g) => g.id === id);
}

export function listGroups(groups: Group[]): Group[] {
  return groups;
}

// IPC primitives

export async function readGroups(): Promise<Group[]> {
  const raw = await invoke<string | null>('read_groups');
  if (raw === null) return [];
  return JSON.parse(raw) as Group[];
}

export async function writeGroups(groups: Group[]): Promise<void> {
  await invoke('write_groups', { contents: JSON.stringify(groups, null, 2) });
}

// Orchestrators — async I/O operations that compose the pure helpers above

export async function persistGroup(group: Group): Promise<void> {
  const existing = await readGroups();
  await writeGroups([...existing, group]);
}

export async function createGroupAndPersist(args: {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
  locationName?: string;
  photoIds: string[];
}): Promise<Group> {
  const group = createGroup(args);
  await persistGroup(group);
  return group;
}

// Cascade orchestrator — removes the group and clears groupId from member photos

export async function deleteGroupAndCascade(id: string): Promise<void> {
  const groups = await readGroups();
  await writeGroups(deleteGroup(groups, id));

  const files = await listCuration();
  await Promise.all(
    files.map(async (file) => {
      const { records, changed } = clearGroupRefs(file.records, id);
      if (changed) {
        await writeCuration({ ...file, records });
      }
    }),
  );
}
