import { createContext, useContext, useEffect, useReducer } from 'react';
import type { Dispatch } from 'react';
import { Folder, FolderOpen, ArrowRight } from 'lucide-react';
import { listFolderAll } from '../dropbox/client';
import type { DropboxEntry, DropboxFolder } from '../dropbox/client';

type NodeState = {
  entries: DropboxEntry[] | null;
  expanded: boolean;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: 'REQUEST'; path: string }
  | { type: 'SUCCESS'; path: string; entries: DropboxEntry[] }
  | { type: 'ERROR'; path: string; error: string }
  | { type: 'TOGGLE'; path: string };

function nodeKey(path: string): string {
  return path.toLowerCase();
}

function reducer(state: Map<string, NodeState>, action: Action): Map<string, NodeState> {
  const next = new Map(state);
  const k = nodeKey(action.path);
  switch (action.type) {
    case 'REQUEST': {
      const prev = next.get(k) ?? { entries: null, expanded: false, loading: false, error: null };
      next.set(k, { ...prev, loading: true, error: null });
      return next;
    }
    case 'SUCCESS': {
      const prev = next.get(k);
      if (prev) {
        next.set(k, { ...prev, entries: action.entries, loading: false, error: null });
      } else {
        next.set(k, { entries: action.entries, expanded: false, loading: false, error: null });
      }
      return next;
    }
    case 'ERROR': {
      const prev = next.get(k) ?? { entries: null, expanded: false, loading: false, error: null };
      next.set(k, { ...prev, loading: false, error: action.error, expanded: false });
      return next;
    }
    case 'TOGGLE': {
      const prev = next.get(k);
      if (!prev) return state;
      next.set(k, { ...prev, expanded: !prev.expanded });
      return next;
    }
  }
}

async function fetchNode(path: string, token: string, dispatch: Dispatch<Action>) {
  dispatch({ type: 'REQUEST', path });
  try {
    const entries = await listFolderAll(path, token);
    dispatch({ type: 'SUCCESS', path, entries });
  } catch (e) {
    dispatch({ type: 'ERROR', path, error: (e as Error).message });
  }
}

type TreeCtx = {
  state: Map<string, NodeState>;
  dispatch: Dispatch<Action>;
  token: string;
  activePath: string | null;
  onOpen: (path: string, entries: DropboxEntry[]) => void;
};

const TreeContext = createContext<TreeCtx | null>(null);

function useTree(): TreeCtx {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('FolderTreeNode must be inside FolderTree');
  return ctx;
}

type NodeProps = {
  path: string;
  name: string;
  depth: number;
};

function FolderTreeNode({ path, name, depth }: NodeProps) {
  const { state, dispatch, token, activePath, onOpen } = useTree();
  const k = nodeKey(path);
  const nodeState = state.get(k) ?? { entries: null, expanded: false, loading: false, error: null };
  const isActive = activePath !== null && k === nodeKey(activePath);

  const childFolders: DropboxFolder[] = (nodeState.entries ?? [])
    .filter((e): e is DropboxFolder => e['.tag'] === 'folder')
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  function handleToggle() {
    if (nodeState.entries === null && !nodeState.loading) {
      fetchNode(path, token, dispatch);
    }
    dispatch({ type: 'TOGGLE', path });
  }

  async function handleOpen() {
    if (nodeState.entries !== null) {
      onOpen(path, nodeState.entries);
      return;
    }
    dispatch({ type: 'REQUEST', path });
    try {
      const entries = await listFolderAll(path, token);
      dispatch({ type: 'SUCCESS', path, entries });
      onOpen(path, entries);
    } catch (e) {
      dispatch({ type: 'ERROR', path, error: (e as Error).message });
    }
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded cursor-default select-none text-sm ${
          isActive ? 'bg-nord-2 text-nord-6' : 'text-nord-5 hover:bg-nord-2'
        }`}
        style={{ paddingLeft: depth * 12 + 4, paddingRight: 4, paddingTop: 6, paddingBottom: 6 }}
      >
        <button
          onClick={handleToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          aria-label={`${nodeState.expanded ? 'Collapse' : 'Expand'} ${name}`}
        >
          <span className={`shrink-0 ${nodeState.loading ? 'opacity-40' : ''} text-nord-4`}>
            {nodeState.expanded
              ? <FolderOpen size={15} />
              : <Folder size={15} />}
          </span>
          <span className="truncate">{name}</span>
        </button>
        <button
          onClick={handleOpen}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-nord-8 hover:text-nord-7 px-1 rounded"
          aria-label={`Open ${name}`}
        >
          <ArrowRight size={13} />
        </button>
      </div>

      {nodeState.error && (
        <p
          role="alert"
          className="text-nord-11 text-xs py-1"
          style={{ paddingLeft: depth * 12 + 20 }}
        >
          {nodeState.error}
        </p>
      )}

      {nodeState.expanded &&
        childFolders.map((folder) => (
          <FolderTreeNode
            key={folder.path_lower}
            path={folder.path_display}
            name={folder.name}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

type Props = {
  token: string;
  activePath: string | null;
  onOpen: (path: string, entries: DropboxEntry[]) => void;
};

export function FolderTree({ token, activePath, onOpen }: Props) {
  const [state, dispatch] = useReducer(
    reducer,
    null,
    () => new Map<string, NodeState>([['', { entries: null, expanded: true, loading: false, error: null }]]),
  );

  useEffect(() => {
    fetchNode('', token, dispatch);
  }, [token]);

  const rootState = state.get('');
  const rootFolders: DropboxFolder[] = (rootState?.entries ?? [])
    .filter((e): e is DropboxFolder => e['.tag'] === 'folder')
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return (
    <TreeContext.Provider value={{ state, dispatch, token, activePath, onOpen }}>
      <div className="py-2 px-1">
        {rootState?.loading && (
          <p className="text-nord-4 text-sm px-2 py-1">Loading…</p>
        )}
        {rootState?.error && (
          <p role="alert" className="text-nord-11 text-sm px-2 py-1">
            {rootState.error}
          </p>
        )}
        {!rootState?.loading && !rootState?.error && rootFolders.length === 0 && rootState?.entries !== null && (
          <p className="text-nord-4 text-sm px-2 py-1">No folders</p>
        )}
        {rootFolders.map((folder) => (
          <FolderTreeNode
            key={folder.path_lower}
            path={folder.path_display}
            name={folder.name}
            depth={0}
          />
        ))}
      </div>
    </TreeContext.Provider>
  );
}
