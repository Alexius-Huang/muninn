// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileList } from './FileList';
import type { DropboxEntry } from '../dropbox/client';

function makeFile(name: string, path: string): DropboxEntry {
  return {
    '.tag': 'file',
    name,
    path_display: path,
    path_lower: path.toLowerCase(),
    id: `id-${name}`,
    size: 1024,
    server_modified: '2026-01-01T00:00:00Z',
  };
}

function makeFolder(name: string, path: string): DropboxEntry {
  return { '.tag': 'folder', name, path_display: path, path_lower: path.toLowerCase() };
}

describe('FileList', () => {
  it('should render the file count and folder path in the header', () => {
    const entries = [makeFile('a.jpg', '/Lyon/a.jpg'), makeFile('b.jpg', '/Lyon/b.jpg')];
    render(<FileList path="/Lyon" entries={entries} onChange={() => {}} />);
    expect(screen.getByText(/2 files in \/Lyon/)).toBeInTheDocument();
  });

  it('should render a list item for each file entry, sorted alphabetically', () => {
    const entries = [makeFile('zebra.jpg', '/z.jpg'), makeFile('apple.jpg', '/a.jpg')];
    render(<FileList path="/Lyon" entries={entries} onChange={() => {}} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('apple.jpg');
    expect(items[1]).toHaveTextContent('zebra.jpg');
  });

  it('should ignore folder entries in the count and list', () => {
    const entries = [
      makeFile('img.jpg', '/Lyon/img.jpg'),
      makeFolder('Subfolder', '/Lyon/Subfolder'),
    ];
    render(<FileList path="/Lyon" entries={entries} onChange={() => {}} />);
    expect(screen.getByText(/1 files in/)).toBeInTheDocument();
    expect(screen.queryByText('Subfolder')).not.toBeInTheDocument();
  });

  it('should call onChange when the "Change folder" button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FileList path="/Lyon" entries={[]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Change folder' }));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
